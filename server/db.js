'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DB_CLIENT = (process.env.DB_CLIENT || 'node-sqlite').toLowerCase();
const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const FAIL_DIR = path.join(DATA_DIR, 'email-failures');
if (!fs.existsSync(FAIL_DIR)) fs.mkdirSync(FAIL_DIR, { recursive: true });

let db;
let driverLabel = DB_CLIENT;

function ensureDataDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

/* ======================================================================
   1. Connect
   ====================================================================== */
async function connect() {
  if (db) return db;

  if (DB_CLIENT === 'node-sqlite' || DB_CLIENT === 'sqlite' || DB_CLIENT === 'better-sqlite3') {
    const { DatabaseSync } = require('node:sqlite');
    const filename = process.env.DB_FILENAME || path.join(DATA_DIR, 'app.db');
    ensureDataDir(path.dirname(filename));
    const raw = new DatabaseSync(filename);
    raw.exec('PRAGMA journal_mode = WAL;');
    raw.exec('PRAGMA foreign_keys = ON;');
    db = wrapNodeSqlite(raw);
    driverLabel = 'node-sqlite (' + path.basename(filename) + ')';
    return db;
  }

  if (DB_CLIENT === 'pg') {
    const { Pool } = require('pg');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DB_CLIENT=pg but DATABASE_URL is not set in .env');
    }
    const pool = new Pool({ connectionString });
    db = wrapPg(pool);
    driverLabel = 'PostgreSQL (pg pool)';
    return db;
  }

  if (DB_CLIENT === 'mysql' || DB_CLIENT === 'mysql2') {
    const mysql = require('mysql2/promise');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DB_CLIENT=mysql2 but DATABASE_URL is not set in .env');
    }
    const pool = mysql.createPool(connectionString);
    db = wrapMysql(pool);
    driverLabel = 'MySQL/MariaDB (mysql2 pool)';
    return db;
  }

  throw new Error('Unknown DB_CLIENT in .env: ' + DB_CLIENT + ' (expected: node-sqlite / pg / mysql2)');
}

function getDriverLabel() {
  return driverLabel;
}

/* ======================================================================
   2. Unified wrapper interface: async run(sql, params), all(sql, params),
      get(sql, params) — same shape for all 3 drivers.
   ====================================================================== */
function wrapNodeSqlite(raw) {
  return {
    dialect: 'sqlite',
    async exec(sql) {
      raw.exec(sql);
    },
    async run(sql, params = []) {
      const stmt = raw.prepare(sql);
      const info = stmt.run(...coerceParams(params, 'sqlite'));
      return { lastID: info.lastInsertRowid, changes: info.changes };
    },
    async all(sql, params = []) {
      const stmt = raw.prepare(sql);
      return stmt.all(...coerceParams(params, 'sqlite'));
    },
    async get(sql, params = []) {
      const stmt = raw.prepare(sql);
      const rows = stmt.all(...coerceParams(params, 'sqlite'));
      return rows && rows[0] ? rows[0] : null;
    },
    async close() {
      raw.close();
    }
  };
}

function wrapPg(pool) {
  function placeholders(sql) {
    // convert '?' -> $1, $2, $3
    let i = 0;
    return sql.replace(/\?/g, () => '$' + (++i));
  }
  return {
    dialect: 'pg',
    async exec(sql) {
      await pool.query(sql);
    },
    async run(sql, params = []) {
      const ph = placeholders(sql);
      const result = await pool.query(ph, coerceParams(params, 'pg'));
      let lastID = null;
      if (result.rows && result.rows[0] && result.rows[0].id != null) {
        lastID = result.rows[0].id;
      } else if (typeof result.insertId !== 'undefined') {
        lastID = result.insertId;
      }
      const changes = typeof result.rowCount === 'number' ? result.rowCount :
        (result.rows ? result.rows.length : 0);
      return { lastID, changes };
    },
    async all(sql, params = []) {
      const ph = placeholders(sql);
      const r = await pool.query(ph, coerceParams(params, 'pg'));
      return r.rows;
    },
    async get(sql, params = []) {
      const rows = await this.all(sql, params);
      return rows && rows[0] ? rows[0] : null;
    },
    async close() {
      await pool.end();
    }
  };
}

function wrapMysql(pool) {
  return {
    dialect: 'mysql',
    async exec(sql) {
      // split ; statements that don't contain ';' inside strings (good enough for simple migrations)
      const parts = sql.split(/;\s*\n/).filter(s => s.trim().length);
      for (const p of parts) await pool.query(p + ';');
    },
    async run(sql, params = []) {
      const [result] = await pool.execute(sql, coerceParams(params, 'mysql'));
      return {
        lastID: typeof result.insertId !== 'undefined' ? Number(result.insertId) : null,
        changes: typeof result.affectedRows === 'number' ? result.affectedRows : 0
      };
    },
    async all(sql, params = []) {
      const [rows] = await pool.execute(sql, coerceParams(params, 'mysql'));
      return rows;
    },
    async get(sql, params = []) {
      const rows = await this.all(sql, params);
      return rows && rows[0] ? rows[0] : null;
    },
    async close() {
      await pool.end();
    }
  };
}

function coerceParams(params, dialect) {
  // node-sqlite (Sync) runs with JS primitives, no coercion needed beyond JSON strings for arrays/objs
  return (params || []).map(v => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return dialect === 'pg' ? v : JSON.stringify(v);
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

/* ======================================================================
   3. Migrations — run on connect(). Written as simple SQL strings per
      dialect so we don't need an ORM.
   ====================================================================== */
async function migrate() {
  await connect();
  if (db.dialect === 'sqlite') await migrateSqlite();
  else if (db.dialect === 'pg') await migratePg();
  else if (db.dialect === 'mysql') await migrateMysql();
}

async function ensureMigrationsTable(createTableSql, createIdFunc) {
  try {
    await db.exec(createTableSql);
  } catch (e) {
    // table already exists is ok
    if (!/already exists|Table.*exists|42P07|ER_TABLE_EXISTS_ERROR/i.test(e.message || '')) throw e;
  }
  const row = await db.get("SELECT COUNT(*) AS c FROM schema_migrations");
  if (createIdFunc && (!row || row.c === 0)) {
    try { await db.exec(createIdFunc); } catch (e) { /* ignore */ }
  }
}

async function runMigration(name, fn) {
  const exists = await db.get('SELECT name FROM schema_migrations WHERE name = ?', [name]);
  if (exists) return;
  await fn();
  if (db.dialect === 'pg') {
    await db.exec(`INSERT INTO schema_migrations (name) VALUES ('${escapeSql(name)}');`);
  } else {
    await db.run('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
  }
}

function escapeSql(s) {
  return String(s).replace(/'/g, "''");
}

/* ---- Dialect-specific migrations ---- */

async function migrateSqlite() {
  await ensureMigrationsTable(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await runMigration('20261003000000_create_join_table', async () => {
    await db.exec(`
      CREATE TABLE join_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        country_residence TEXT NOT NULL,
        city TEXT,
        email TEXT NOT NULL,
        phone TEXT,
        profession TEXT NOT NULL,
        profession_other_specify TEXT,
        specialty TEXT,
        subspecialty TEXT,
        years_experience TEXT,
        current_position TEXT,
        qualification_country TEXT,
        practice_country TEXT,
        languages TEXT,
        contribution TEXT,
        availability TEXT,
        locations TEXT,
        notes TEXT,
        consent_store INTEGER NOT NULL DEFAULT 0,
        consent_contact INTEGER NOT NULL DEFAULT 0,
        user_agent TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_join_email ON join_submissions(email);
      CREATE INDEX IF NOT EXISTS idx_join_profession ON join_submissions(profession);
      CREATE INDEX IF NOT EXISTS idx_join_created ON join_submissions(created_at);
    `);
  });

  await runMigration('20261003000001_create_contact_table', async () => {
    await db.exec(`
      CREATE TABLE contact_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        organisation TEXT,
        topic TEXT NOT NULL,
        message TEXT NOT NULL,
        consent INTEGER NOT NULL DEFAULT 0,
        user_agent TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_contact_email ON contact_messages(email);
      CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_messages(created_at);
    `);
  });
}

async function migratePg() {
  await ensureMigrationsTable(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await runMigration('20261003000000_create_join_table', async () => {
    await db.exec(`
      CREATE TABLE join_submissions (
        id BIGSERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        country_residence TEXT NOT NULL,
        city TEXT,
        email TEXT NOT NULL,
        phone TEXT,
        profession TEXT NOT NULL,
        profession_other_specify TEXT,
        specialty TEXT,
        subspecialty TEXT,
        years_experience TEXT,
        current_position TEXT,
        qualification_country TEXT,
        practice_country TEXT,
        languages TEXT,
        contribution TEXT,
        availability TEXT,
        locations TEXT,
        notes TEXT,
        consent_store BOOLEAN NOT NULL DEFAULT FALSE,
        consent_contact BOOLEAN NOT NULL DEFAULT FALSE,
        user_agent TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_join_email ON join_submissions(email);
      CREATE INDEX IF NOT EXISTS idx_join_profession ON join_submissions(profession);
      CREATE INDEX IF NOT EXISTS idx_join_created ON join_submissions(created_at);
    `);
  });

  await runMigration('20261003000001_create_contact_table', async () => {
    await db.exec(`
      CREATE TABLE contact_messages (
        id BIGSERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        organisation TEXT,
        topic TEXT NOT NULL,
        message TEXT NOT NULL,
        consent BOOLEAN NOT NULL DEFAULT FALSE,
        user_agent TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_contact_email ON contact_messages(email);
      CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_messages(created_at);
    `);
  });
}

async function migrateMysql() {
  await ensureMigrationsTable(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await runMigration('20261003000000_create_join_table', async () => {
    await db.exec(`
      CREATE TABLE join_submissions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(200) NOT NULL,
        last_name VARCHAR(200) NOT NULL,
        country_residence VARCHAR(200) NOT NULL,
        city VARCHAR(200),
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(100),
        profession VARCHAR(100) NOT NULL,
        profession_other_specify VARCHAR(200),
        specialty VARCHAR(200),
        subspecialty VARCHAR(200),
        years_experience VARCHAR(100),
        current_position VARCHAR(255),
        qualification_country VARCHAR(200),
        practice_country VARCHAR(200),
        languages TEXT,
        contribution TEXT,
        availability TEXT,
        locations TEXT,
        notes TEXT,
        consent_store TINYINT(1) NOT NULL DEFAULT 0,
        consent_contact TINYINT(1) NOT NULL DEFAULT 0,
        user_agent TEXT,
        ip_address VARCHAR(64),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_join_email (email),
        INDEX idx_join_profession (profession),
        INDEX idx_join_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  });

  await runMigration('20261003000001_create_contact_table', async () => {
    await db.exec(`
      CREATE TABLE contact_messages (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(200) NOT NULL,
        last_name VARCHAR(200) NOT NULL,
        email VARCHAR(255) NOT NULL,
        organisation VARCHAR(255),
        topic VARCHAR(200) NOT NULL,
        message MEDIUMTEXT NOT NULL,
        consent TINYINT(1) NOT NULL DEFAULT 0,
        user_agent TEXT,
        ip_address VARCHAR(64),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_contact_email (email),
        INDEX idx_contact_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  });
}

/* ======================================================================
   4. Insert helpers (typed so each caller doesn't have to memorize cols)
   ====================================================================== */
function toBit(b) {
  if (db.dialect === 'pg') return Boolean(b);
  return b ? 1 : 0;
}

async function insertJoinSubmission(payload, meta = {}) {
  await connect();
  const col = db.dialect === 'pg' ? 'RETURNING id' : '';
  const sql = `
    INSERT INTO join_submissions (
      first_name, last_name, country_residence, city, email, phone,
      profession, profession_other_specify, specialty, subspecialty,
      years_experience, current_position, qualification_country, practice_country,
      languages, contribution, availability, locations, notes,
      consent_store, consent_contact, user_agent, ip_address
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ${col};
  `;
  const params = [
    payload.firstName, payload.lastName, payload.countryResidence, payload.city || null,
    payload.email, payload.phone || null,
    payload.profession, payload.otherSpecify || null, payload.specialty || null,
    payload.subspecialty || null, payload.years || null, payload.position || null,
    payload.qualificationCountry || null, payload.practiceCountry || null,
    csv(payload.languages), csv(payload.contribution), csv(payload.availability),
    csv(payload.locations), payload.notes || null,
    toBit(payload.consentStore), toBit(payload.consentContact),
    meta.userAgent || null, meta.ipAddress || null
  ];
  const info = await db.run(sql, params);
  return info.lastID;
}

async function insertContactMessage(payload, meta = {}) {
  await connect();
  const col = db.dialect === 'pg' ? 'RETURNING id' : '';
  const sql = `
    INSERT INTO contact_messages (
      first_name, last_name, email, organisation, topic, message,
      consent, user_agent, ip_address
    ) VALUES (?,?,?,?,?,?,?,?,?) ${col};
  `;
  const params = [
    payload.firstName, payload.lastName, payload.email, payload.organisation || null,
    payload.topic, payload.message, toBit(payload.consent),
    meta.userAgent || null, meta.ipAddress || null
  ];
  const info = await db.run(sql, params);
  return info.lastID;
}

async function latestJoin(n = 10) {
  await connect();
  return await db.all(
    'SELECT * FROM join_submissions ORDER BY id DESC LIMIT ?',
    [Number(n) || 10]
  );
}

async function latestContact(n = 10) {
  await connect();
  return await db.all(
    'SELECT * FROM contact_messages ORDER BY id DESC LIMIT ?',
    [Number(n) || 10]
  );
}

/* ======================================================================
   5. Utilities
   ====================================================================== */
function csv(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.filter(x => x != null && x !== '').join(',');
  return String(v);
}

function queueFailedEmail(kind, id, error, payload) {
  const ts = Date.now();
  const filename = `${ts}-${kind}-${id}.json`;
  const body = {
    kind, submission_id: id, at: new Date().toISOString(),
    error: String(error && error.message ? error.message : error),
    payload
  };
  try {
    fs.writeFileSync(path.join(FAIL_DIR, filename), JSON.stringify(body, null, 2), 'utf8');
  } catch (e) {
    console.error('Could not queue failed email file: ' + filename, e);
  }
}

module.exports = {
  connect,
  migrate,
  getDriverLabel,
  insertJoinSubmission,
  insertContactMessage,
  latestJoin,
  latestContact,
  queueFailedEmail,
  FAIL_DIR
};
