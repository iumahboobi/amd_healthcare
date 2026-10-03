'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { connect, migrate, getDriverLabel } = require('./db');
const { buildTransport, verifyTransport, getTransportError, ORG_EMAIL, FROM_ADDRESS } = require('./mailer');
const joinRouter = require('./routes/join');
const contactRouter = require('./routes/contact');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || ('http://localhost:' + PORT);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';

const app = express();

/* ===========================================================
   Security middleware
   =========================================================== */
app.set('trust proxy', true);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'object-src': ["'none'"]
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
}));

app.use(cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true); // allow same-origin requests with no origin header (curl etc.)
    if (CORS_ORIGIN) {
      const allowed = CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'), false);
    }
    // by default allow only the same host we're listening on
    const hostUrl = new URL(PUBLIC_ORIGIN).origin;
    if (origin === hostUrl) return cb(null, true);
    // local dev: allow localhost + file:// fallback implicitly (browser uses no origin)
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    return cb(null, true); // lenient default — lock it down with CORS_ORIGIN env in prod
  },
  credentials: false,
  maxAge: 600
}));

app.use(bodyParser.json({ limit: '256kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '256kb' }));

/* ===========================================================
   Rate limit on API endpoints
   =========================================================== */
const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 90,                 // ~1.5/min per IP — plenty for real humans
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'rate_limited',
    message: 'Too many submissions from this IP. Please try again later.'
  },
  keyGenerator: (req) => req.ip
});

app.use('/api/', apiLimiter);

/* ===========================================================
   Simple health check endpoint
   =========================================================== */
app.get('/api/health', async function(req, res) {
  try {
    await connect();
    const ok = getDriverLabel() ? true : false;
    return res.status(200).json({
      ok,
      status: 'ok',
      db: ok ? getDriverLabel() : null,
      smtp: {
        configured: buildTransport() ? true : false,
        error: getTransportError() ? String(getTransportError().message || getTransportError()) : null
      },
      notify_inbox: ORG_EMAIL || '(not configured)',
      from_address: FROM_ADDRESS || '(not configured)'
    });
  } catch (e) {
    return res.status(500).json({ ok: false, status: 'error', message: String(e.message || e) });
  }
});

/* ===========================================================
   Mount form API routes
   =========================================================== */
app.use('/api/join', joinRouter);
app.use('/api/contact', contactRouter);

/* ===========================================================
   Static hosting of the whole project root (the 9 HTML files,
   css, js, img folder)
   =========================================================== */
const ROOT_DIR = path.resolve(__dirname, '..');
app.use(express.static(ROOT_DIR, {
  index: ['index.html'],
  dotfiles: 'ignore',
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

/* SPA-ish 404 fallback — serve 404.html for unknown GET paths */
app.use(function(req, res, next) {
  if (req.method === 'GET' && req.accepts && req.accepts('html')) {
    res.status(404).sendFile(path.join(ROOT_DIR, '404.html'), { dotfiles: 'ignore' }, err => {
      if (err) next(err);
    });
    return;
  }
  // /api/* unknown path → JSON 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  next();
});

/* Error handler */
app.use(function(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err && /CORS/.test(err.message)) {
    return res.status(403).json({ ok: false, error: 'cors', message: 'Origin not allowed' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'payload_too_large' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: 'server_error', message: process.env.NODE_ENV === 'production' ? 'Internal error' : String(err && err.message || err) });
});

/* ===========================================================
   Boot: connect DB + run migrations + verify SMTP, then listen
   =========================================================== */
async function boot() {
  try {
    await connect();
    console.log('✔ Database connected — ' + getDriverLabel());
  } catch (e) {
    console.error('✗ FAILED to connect to database: ' + (e && e.message || e));
    console.error('Set DB_CLIENT / DATABASE_URL / DB_FILENAME correctly in .env. See .env.example.');
    process.exit(1);
  }

  try {
    await migrate();
    console.log('✔ Database migrations applied.');
  } catch (e) {
    console.error('✗ FAILED to apply database migrations: ' + (e && e.message || e));
    console.error(e);
    process.exit(1);
  }

  buildTransport();
  const smtp = await verifyTransport();
  if (smtp.ok) {
    console.log('✔ SMTP verified — emails will be delivered via ' + process.env.SMTP_HOST);
  } else {
    console.warn('⚠ SMTP could NOT be verified (submissions still saved to DB; failed emails queued locally).');
    if (smtp.error) console.warn('  SMTP error: ' + (smtp.error && smtp.error.message || smtp.error));
  }

  app.listen(PORT, function() {
    console.log('');
    console.log('🌐 Afghan Medical Diaspora server running.');
    console.log('   Site:    ' + PUBLIC_ORIGIN);
    console.log('   Health:  ' + PUBLIC_ORIGIN + '/api/health');
    console.log('   Join:    POST ' + PUBLIC_ORIGIN + '/api/join');
    console.log('   Contact: POST ' + PUBLIC_ORIGIN + '/api/contact');
    console.log('');
  });
}

boot().catch(err => {
  console.error('Boot failed:', err);
  process.exit(1);
});
