'use strict';

const express = require('express');
const router = express.Router();
const { validateJoin } = require('../services/submission');
const { insertJoinSubmission } = require('../db');
const { sendJoinConfirmation, sendJoinNotification } = require('../mailer');

function getMeta(req) {
  return {
    ipAddress: (
      req.ip ||
      (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0]) ||
      (req.socket && req.socket.remoteAddress) ||
      null
    ),
    userAgent: (req.headers && req.headers['user-agent']) ? String(req.headers['user-agent']).slice(0, 512) : null
  };
}

router.post('/', async function(req, res) {
  const validated = validateJoin(req.body);
  if (!validated.ok) {
    return res.status(400).json({
      ok: false,
      error: 'validation_failed',
      errors: validated.errors
    });
  }
  if (validated.honeypot) {
    // bot answered hidden field — pretend everything is great, do nothing.
    return res.status(200).json({
      ok: true,
      honeypot: true,
      submissionSaved: false,
      emailSent: false
    });
  }

  const submission = validated.value;
  const meta = getMeta(req);

  let id = null;
  let submissionSaved = false;
  try {
    id = await insertJoinSubmission(submission, meta);
    submissionSaved = true;
  } catch (e) {
    console.error('JOIN DB INSERT FAILED', e);
    return res.status(500).json({
      ok: false,
      error: 'database_error',
      message: 'Could not save your submission right now. Please try again in a few minutes, or email us directly.',
      submissionSaved: false,
      emailSent: false
    });
  }

  // After DB save — try emails in parallel; never throw; log instead
  const emailResults = { confirmation: null, notification: null };
  let anyEmailSent = false;
  try {
    const [a, b] = await Promise.allSettled([
      sendJoinConfirmation(submission, id),
      sendJoinNotification(submission, id)
    ]);
    emailResults.confirmation = summarizeSettled(a);
    emailResults.notification = summarizeSettled(b);
    anyEmailSent = (emailResults.confirmation && emailResults.confirmation.ok === true) ||
                   (emailResults.notification && emailResults.notification.ok === true);
  } catch (e) {
    console.error('JOIN email wrapper exception (should not happen)', e);
  }

  return res.status(200).json({
    ok: true,
    id,
    submissionSaved,
    emailSent: anyEmailSent,
    emails: emailResults
  });
});

function summarizeSettled(s) {
  if (!s) return null;
  if (s.status === 'rejected') {
    return { ok: false, error: String(s.reason && s.reason.message || s.reason).slice(0, 200) };
  }
  const v = s.value;
  if (!v) return { ok: false };
  return {
    ok: v.ok === true,
    skipped: v.skipped === true,
    queued: v.queued === true,
    reason: v.reason || null,
    error: v.error ? String(v.error && v.error.message || v.error).slice(0, 200) : null
  };
}

module.exports = router;
