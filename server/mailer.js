'use strict';

const nodemailer = require('nodemailer');
const { queueFailedEmail, FAIL_DIR } = require('./db');

let transport;
let transportError = null;
let transportConfig = null;

const SEND_SUBMITTER = process.env.SEND_SUBMITTER_CONFIRMATION !== 'false';
const SEND_ORG = process.env.SEND_ORG_NOTIFICATION !== 'false';

const ORG_EMAIL = process.env.ORG_NOTIFY_EMAIL || '';
const ORG_CC = process.env.ORG_NOTIFY_CC || '';
const FROM_NAME = process.env.MAIL_FROM_NAME || 'Afghan Medical Diaspora';
const FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS || (process.env.SMTP_USER || 'join@afghanmedicaldiaspora.org');
const REPLY_TO = process.env.MAIL_REPLY_TO || FROM_ADDRESS;

/* =====================================================================
   Transport setup & startup verify
   ===================================================================== */
function buildTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = String(process.env.SMTP_SECURE) !== 'false';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    transportError = new Error(
      'SMTP not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env'
    );
    transportConfig = null;
    return null;
  }
  transportConfig = {
    host,
    port,
    secure: port === 465 ? true : (secure && port !== 587),
    requireTLS: port === 587,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 15 * 1000,
    greetingTimeout: 10 * 1000,
    socketTimeout: 30 * 1000
  };
  try {
    transport = nodemailer.createTransport(transportConfig);
  } catch (e) {
    transportError = e;
    transport = null;
  }
  return transport;
}

async function verifyTransport() {
  const t = buildTransport();
  if (!t) {
    console.warn('WARN SMTP: ' + (transportError && transportError.message || 'no transport'));
    console.warn('Submissions will be saved to DB but emails will be queued at: ' + FAIL_DIR);
    return { ok: false, error: transportError };
  }
  try {
    const ok = await t.verify();
    return { ok: !!ok };
  } catch (e) {
    transportError = e;
    console.warn('WARN SMTP verify failed: ' + e.message);
    console.warn('Submissions will be saved to DB but emails will be queued at: ' + FAIL_DIR);
    return { ok: false, error: e };
  }
}

function isConfigured() {
  buildTransport();
  return transport != null;
}

function getTransportError() {
  return transportError;
}

/* =====================================================================
   Low-level send helper with queue fallback
   ===================================================================== */
async function send(mailOptions, meta) {
  buildTransport();
  if (!transport) {
    queueFailedEmail(meta.kind, meta.id,
      transportError || new Error('SMTP not configured'), mailOptions);
    return { ok: false, queued: true, error: transportError };
  }
  try {
    const info = await transport.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
      replyTo: REPLY_TO,
      ...mailOptions
    });
    return { ok: true, info };
  } catch (e) {
    queueFailedEmail(meta.kind, meta.id, e, mailOptions);
    return { ok: false, queued: true, error: e };
  }
}

/* =====================================================================
   Branding & helpers
   ===================================================================== */
const PRIMARY = '#0f766e';
const PRIMARY_DARK = '#115e59';
const ACCENT = '#be123c';
const GOLD = '#b45309';
const MUTED = '#475569';
const BORDER = '#ccfbf1';
const WHITE = '#ffffff';
const BGALT = '#f0fdfa';

function htmlShell(title, inner) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style type="text/css">
 body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;margin:0;padding:0;background:${BGALT};color:#0f172a;}
 .wrap{max-width:640px;margin:0 auto;padding:32px 20px;}
 .card{background:${WHITE};border:1px solid ${BORDER};border-radius:10px;padding:32px;}
 .brand{display:flex;align-items:center;gap:12px;margin-bottom:24px;}
 .brand-mark{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,${PRIMARY} 0%,${PRIMARY_DARK} 100%);color:${WHITE};font-weight:800;display:flex;align-items:center;justify-content:center;font-size:18px;letter-spacing:0.3px;}
 .brand-title{font-size:18px;font-weight:700;color:#0f172a;}
 h1{color:${PRIMARY_DARK};margin:0 0 12px;font-size:22px;}
 p{font-size:15px;line-height:1.6;color:#1e293b;margin:12px 0;}
 .muted{color:${MUTED};font-size:13px;}
 .tag{display:inline-block;padding:4px 10px;border-radius:999px;background:${BGALT};color:${PRIMARY_DARK};font-weight:600;font-size:12px;border:1px solid ${BORDER};margin-right:6px;margin-bottom:6px;}
 table.kv{width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;}
 table.kv th,table.kv td{text-align:left;padding:8px 10px;border-bottom:1px solid ${BORDER};vertical-align:top;}
 table.kv th{width:34%;background:${BGALT};color:${PRIMARY_DARK};font-weight:600;}
 ul.fields{margin:8px 0 8px 20px;padding:0;font-size:14px;line-height:1.6;}
 .cta{display:inline-block;padding:11px 22px;border-radius:8px;background:linear-gradient(135deg,${PRIMARY} 0%,#14b8a6 100%);color:${WHITE};text-decoration:none;font-weight:600;font-size:14px;}
 .footer{margin-top:28px;padding-top:20px;border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;line-height:1.7;}
 .footer a{color:${PRIMARY_DARK};}
 .accent{color:${ACCENT};}
 .gold{color:${GOLD};}
 .flagrow{display:flex;height:6px;border-radius:999px;overflow:hidden;margin:8px 0 20px;}
 .flagrow i{display:block;}
 .flagrow i.a{flex:1;background:#111827;}
 .flagrow i.b{flex:1;background:${ACCENT};}
 .flagrow i.c{flex:1;background:#15803d;}
 .note{background:#fff8ea;border-left:3px solid ${GOLD};color:#713f12;padding:14px 16px;border-radius:6px;font-size:13px;margin:16px 0;line-height:1.6;}
 .internal{background:#fff1f2;border-left:3px solid ${ACCENT};color:#881337;padding:14px 16px;border-radius:6px;font-size:13px;margin:16px 0;line-height:1.6;}
 pre.msg{background:${BGALT};border:1px solid ${BORDER};border-radius:6px;padding:14px 16px;white-space:pre-wrap;font-size:14px;line-height:1.6;font-family:inherit;color:#0f172a;margin:12px 0;}
</style>
</head><body><div class="wrap"><div class="card">
<div class="brand">
  <div class="brand-mark">AM</div>
  <div>
    <div class="brand-title">Afghan Medical Diaspora</div>
    <div class="muted">Healthcare network</div>
  </div>
</div>
${inner}
<div class="footer">
  Afghan Medical Diaspora &mdash; development &amp; network-building phase.<br/>
  Contact: <a href="mailto:${escapeHtml(REPLY_TO)}">${escapeHtml(REPLY_TO)}</a>
  ${ORG_EMAIL ? ' &middot; Org inbox: <a href="mailto:'+escapeHtml(ORG_EMAIL)+'">'+escapeHtml(ORG_EMAIL)+'</a>' : ''}
</div>
</div></div></body></html>`;
}

function joinTags(p) {
  const tags = [];
  if (p.profession) tags.push(professionLabel(p.profession));
  if (p.countryResidence) tags.push('📍 ' + p.countryResidence);
  if (p.years) tags.push('⏱ ' + p.years);
  (p.contribution || []).slice(0, 3).forEach(c => tags.push(contributionLabel(c)));
  return tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
}

function professionLabel(v) {
  switch (String(v || '').toLowerCase()) {
    case 'doctor': return '🩺 Doctor';
    case 'nurse': return '💉 Nurse';
    case 'anesthesia': return '🫁 Anesthesia';
    case 'radiology': return '🩻 Radiology';
    case 'lab': return '🧪 Lab scientist';
    case 'biomed': return '⚙️ Biomedical';
    case 'pharmacy': return '💊 Pharmacy';
    case 'admin': return '📋 Admin / management';
    case 'other': return '👥 Other role';
    default: return v || 'Professional';
  }
}
function contributionLabel(v) {
  switch (String(v || '').toLowerCase()) {
    case 'clinical': return 'Clinical rotation';
    case 'shorter': return 'Shorter mission';
    case 'teaching': return 'Teaching & training';
    case 'mentorship': return 'Remote mentorship';
    case 'equipment': return 'Equipment help';
    case 'organisation': return 'Organisation & fundraising';
    case 'info': return 'Info only';
    default: return String(v || '');
  }
}
function locationLabel(v) {
  switch (String(v || '').toLowerCase()) {
    case 'kandahar': return 'Kandahar (initial)';
    case 'kabul': return 'Kabul';
    case 'herat': return 'Herat';
    case 'mazar': return 'Mazar-i-Sharif';
    case 'jalalabad': return 'Jalalabad';
    case 'other': return 'Other / TBD';
    default: return String(v || '');
  }
}
function availabilityLabel(v) {
  switch (String(v || '').toLowerCase()) {
    case 'yearly': return 'Once a year';
    case 'few': return 'Every 2–3 years';
    case 'occasionally': return 'Occasionally';
    case 'unsure': return 'Not sure yet';
    default: return String(v || '');
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function kv(th, td) {
  return `<tr><th>${escapeHtml(th)}</th><td>${td == null || td === '' ? '<span class="muted">—</span>' : escapeHtml(String(td))}</td></tr>`;
}
function kvList(th, items, labelFn) {
  if (!items || (Array.isArray(items) && items.length === 0)) return kv(th, '');
  const arr = Array.isArray(items) ? items : [items];
  const rendered = arr.map(x => `<li>${labelFn ? escapeHtml(labelFn(x)) : escapeHtml(x)}</li>`).join('');
  return `<tr><th>${escapeHtml(th)}</th><td><ul class="fields">${rendered}</ul></td></tr>`;
}

function toPlainTextFromHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

/* =====================================================================
   JOIN — Confirmation (to the new member)
   ===================================================================== */
async function sendJoinConfirmation(submission, id) {
  if (!SEND_SUBMITTER) return { ok: false, skipped: true, reason: 'SEND_SUBMITTER_CONFIRMATION=false' };
  const p = submission;
  const subject = 'Thank you — your Afghan Medical Diaspora registration was received';
  const inner = `
<div class="flagrow"><i class="a"></i><i class="b"></i><i class="c"></i></div>
<h1>Hello ${escapeHtml(p.firstName)},</h1>
<p>Thanks for joining the <strong>Afghan Medical Diaspora</strong> network &mdash; we have your profile
on record (internal ID <strong>#${id}</strong>). This email confirms that your submission was received
and will be reviewed as the program develops.</p>

<div>${joinTags(p)}</div>

<div class="note">
  <strong>What happens next:</strong>
  <ul style="margin:8px 0 0 18px;padding:0;line-height:1.7;">
    <li>Your profile is stored securely and used only for this initiative.</li>
    <li>When network-wide surveys or partnership announcements go out, we'll reach out to the email you provided (you can opt out at any time).</li>
    <li>We are in the <strong>network-building &amp; co-design phase</strong> &mdash; this registration does not commit you to any travel or clinical work.</li>
    <li>When real pilot rotations are identified, we will match profiles and follow up with a separate, explicit invitation.</li>
  </ul>
</div>

<p>If you have any questions in the meantime, reply to this email at any time.</p>
<p style="margin-top:24px;">
  <a class="cta" href="mailto:${escapeHtml(REPLY_TO)}?subject=Re%3A%20Registration%20%23${id}">Reply to the network team</a>
</p>
<p class="muted" style="margin-top:24px;">
  If you did not submit this form or want to change or remove your details at any time,
  reply to this email and we will update or delete your record without delay.
</p>`;
  const html = htmlShell(subject, inner);
  const txt = toPlainTextFromHtml(inner);
  return await send({
    to: `${p.firstName} ${p.lastName} <${p.email}>`,
    subject,
    text: txt,
    html
  }, { kind: 'join-confirmation', id });
}

/* =====================================================================
   JOIN — Notification (to your organisation inbox + CC)
   ===================================================================== */
async function sendJoinNotification(submission, id) {
  if (!SEND_ORG) return { ok: false, skipped: true, reason: 'SEND_ORG_NOTIFICATION=false' };
  if (!ORG_EMAIL) return { ok: false, skipped: true, reason: 'ORG_NOTIFY_EMAIL not set' };
  const p = submission;
  const subject = `[New registration #${id}] ${p.firstName} ${p.lastName} — ${professionLabel(p.profession)}`;
  const inner = `
<div class="flagrow"><i class="a"></i><i class="b"></i><i class="c"></i></div>
<h1>New network registration &mdash; #${id}</h1>
<p>A new person has joined the <strong>Afghan Medical Diaspora</strong> network.
Please review the submission below &mdash; this is the full database record.</p>

<div class="internal">
  <strong>Internal note:</strong> this submission was stored in the <code>join_submissions</code> table with
  ID <strong>${id}</strong>. Timestamp: ${new Date().toISOString()}. Reply to the candidate only from the
  approved organisational mailbox. Do not forward sensitive details externally.
</div>

<div>${joinTags(p)}</div>

<table class="kv">
  ${kv('Candidate', `<strong>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</strong>${p.profession_other_specify ? ` (${escapeHtml(p.profession_other_specify)})` : ''}`)}
  ${kv('Email', `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>`)}
  ${kv('Phone / WhatsApp', p.phone)}
  ${kv('Profession', professionLabel(p.profession))}
  ${kv('Residence', (p.countryResidence ? p.countryResidence : '') + (p.city ? ', ' + p.city : ''))}
  ${kv('Specialty', p.specialty ? p.specialty + (p.subspecialty ? ' &mdash; ' + p.subspecialty : '') : '')}
  ${kv('Current position', p.position)}
  ${kv('Years of experience', p.years)}
  ${kv('Qualification country', p.qualificationCountry)}
  ${kv('Currently practicing in', p.practiceCountry)}
  ${kv('Languages (clinical/teaching)', p.languages)}
  ${kvList('Contribution interest', p.contribution, contributionLabel)}
  ${kvList('Availability', p.availability, availabilityLabel)}
  ${kvList('Potential locations in Afghanistan', p.locations, locationLabel)}
  ${kvList('Consent & preferences', [
    p.consentStore ? '✅ Data storage consent (required)' : '❌ Data storage consent — missing (server validation should have prevented this)',
    p.consentContact ? '✅ Opted in to occasional network updates' : 'ℹ️ Did not opt in to news updates'
  ])}
  ${p.notes ? `<tr><th>Anything else / notes</th><td><pre class="msg">${escapeHtml(p.notes)}</pre></td></tr>` : ''}
</table>

<p style="margin-top:20px;">
  <a class="cta" href="mailto:${escapeHtml(p.email)}?subject=Re%3A%20Your%20Afghan%20Medical%20Diaspora%20registration%20%23${id}">Reply to ${escapeHtml(p.firstName)}</a>
</p>
`;
  const html = htmlShell(subject, inner);
  const txt = toPlainTextFromHtml(inner);
  const opts = { to: ORG_EMAIL, subject, text: txt, html };
  if (ORG_CC && String(ORG_CC).trim().length) opts.cc = ORG_CC;
  return await send(opts, { kind: 'join-notification', id });
}

/* =====================================================================
   CONTACT — Confirmation (to sender)
   ===================================================================== */
async function sendContactConfirmation(msg, id) {
  if (!SEND_SUBMITTER) return { ok: false, skipped: true, reason: 'SEND_SUBMITTER_CONFIRMATION=false' };
  const subject = 'Thanks — your Afghan Medical Diaspora message was received';
  const inner = `
<div class="flagrow"><i class="a"></i><i class="b"></i><i class="c"></i></div>
<h1>Hi ${escapeHtml(msg.firstName)},</h1>
<p>We received your message and will reply to <strong><a href="mailto:${escapeHtml(msg.email)}">${escapeHtml(msg.email)}</a></strong>
within a few working days. Reference number for this enquiry is <strong>#${id}</strong>.</p>

<p><span class="tag">${escapeHtml(topicLabel(msg.topic))}</span></p>

<div class="note">
  If you have any additional documents or context to share, reply to this email directly
  with the attachments and include <strong>[#${id}]</strong> in the subject line so the team can
  match your follow-up to this enquiry.
</div>

<p>Thank you for reaching out to the Afghan Medical Diaspora team.</p>`;
  const html = htmlShell(subject, inner);
  const txt = toPlainTextFromHtml(inner);
  return await send({
    to: `${msg.firstName} ${msg.lastName} <${msg.email}>`,
    subject, text: txt, html
  }, { kind: 'contact-confirmation', id });
}

/* =====================================================================
   CONTACT — Notification (to organisation inbox + CC)
   ===================================================================== */
async function sendContactNotification(msg, id) {
  if (!SEND_ORG) return { ok: false, skipped: true, reason: 'SEND_ORG_NOTIFICATION=false' };
  if (!ORG_EMAIL) return { ok: false, skipped: true, reason: 'ORG_NOTIFY_EMAIL not set' };
  const subject = `[Contact #${id}] ${msg.topic} — ${msg.firstName} ${msg.lastName}`;
  const inner = `
<div class="flagrow"><i class="a"></i><i class="b"></i><i class="c"></i></div>
<h1>New contact message &mdash; #${id}</h1>
<p>The following enquiry was received on the <strong>Contact Us</strong> form:</p>

<table class="kv">
  ${kv('From', `<strong>${escapeHtml(msg.firstName)} ${escapeHtml(msg.lastName)}</strong>`)}
  ${kv('Email', `<a href="mailto:${escapeHtml(msg.email)}">${escapeHtml(msg.email)}</a>`)}
  ${kv('Organisation', msg.organisation)}
  ${kv('Topic', `<span class="tag">${escapeHtml(topicLabel(msg.topic))}</span>`)}
  ${kv('Consent to contact back', msg.consent ? '✅ Given (required checkbox)' : '❌ Not given (server validation prevented this from being empty)')}
</table>

<h3 style="color:${PRIMARY_DARK};margin:22px 0 8px;font-size:16px;">Message</h3>
<pre class="msg">${escapeHtml(msg.message || '')}</pre>

<p style="margin-top:20px;">
  <a class="cta" href="mailto:${escapeHtml(msg.email)}?subject=Re%3A%20${encodeURIComponent(msg.topic || '')}%20%23${id}">Reply to ${escapeHtml(msg.firstName)}</a>
</p>
`;
  const html = htmlShell(subject, inner);
  const txt = toPlainTextFromHtml(inner);
  const opts = { to: ORG_EMAIL, subject, text: txt, html };
  if (ORG_CC && String(ORG_CC).trim().length) opts.cc = ORG_CC;
  return await send(opts, { kind: 'contact-notification', id });
}

function topicLabel(v) {
  const s = String(v || 'General question');
  return s;
}

module.exports = {
  buildTransport,
  verifyTransport,
  isConfigured,
  getTransportError,
  sendJoinConfirmation,
  sendJoinNotification,
  sendContactConfirmation,
  sendContactNotification,
  FROM_ADDRESS,
  FROM_NAME,
  REPLY_TO,
  ORG_EMAIL,
  ORG_CC
};
