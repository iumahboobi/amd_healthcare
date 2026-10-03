'use strict';

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PROFESSIONS = new Set([
  'doctor', 'nurse', 'anesthetic', 'anesthesia',
  'radiology', 'laboratory', 'lab',
  'biomedical', 'biomed',
  'pharmacist', 'pharmacy',
  'admin',
  'public-health', 'publichealth', 'public_health',
  'other'
]);
const CONTRIBUTIONS = new Set([
  'clinical', 'clinicalRotation', 'clinical-rotation',
  'shorter', 'shorterMission', 'shorter-mission',
  'teaching', 'training',
  'mentorship', 'remote',
  'equipment',
  'organisation', 'organisationAndFundraising', 'organisation-fundraising',
  'info', 'information', 'moreInformation', 'more-info'
]);
function normalizeProfessionValue(v) {
  if (!v) return '';
  const s = String(v).toLowerCase();
  // Map legacy / long names to canonical single tokens expected everywhere else
  if (s.includes('anest')) return 'anesthesia';
  if (s.includes('lab') || s.includes('pathol')) return 'lab';
  if (s.includes('biomed')) return 'biomed';
  if (s.includes('pharm')) return 'pharmacy';
  if (s.includes('public') || s.includes('dentist') || s.includes('allied')) return 'public-health';
  if (s === 'doctor') return 'doctor';
  if (s === 'nurse') return 'nurse';
  if (s === 'radiology') return 'radiology';
  if (s === 'admin') return 'admin';
  if (s === 'other') return 'other';
  return s; // keep canonical single-token label for DB
}
function normalizeContributionValue(v) {
  if (!v) return '';
  const s = String(v).toLowerCase();
  if (s.includes('clinical')) return 'clinical';
  if (s.includes('shorter') || s.includes('mission')) return 'shorter';
  if (s.includes('teach') || s.includes('training') || s.includes('train')) return 'teaching';
  if (s.includes('mentor') || s.includes('remote')) return 'mentorship';
  if (s.includes('equipment')) return 'equipment';
  if (s.includes('organ') || s.includes('fundrais') || s.includes('admin')) return 'organisation';
  if (s.includes('info') || s.includes('more')) return 'info';
  return s;
}
const AVAILABILITIES = new Set(['yearly', 'few', 'occasionally', 'unsure']);
const LOCATIONS = new Set(['kandahar', 'kabul', 'herat', 'mazar', 'jalalabad', 'other']);
const YEARS = new Set([
  '', 'Prefer not to say', 'Fewer than 5 years', '5–10 years', '11–20 years', 'More than 20 years'
]);

const MAX_TEXT = 10000;
const MAX_SHORT = 250;
const MAX_LONG = 2000;

/* ========================================================
   Helpers
   ======================================================== */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function toTrimmedStringOrNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}
function toArrayOfStrings(v) {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.map(x => toTrimmedStringOrNull(x)).filter(Boolean);
  }
  const s = toTrimmedStringOrNull(v);
  if (!s) return [];
  // allow comma-separated fallbacks from URL-encoded bodies
  return s.split(',').map(x => x.trim()).filter(Boolean);
}
function toBoolCheckbox(v) {
  if (v === true || v === false) return v;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}
function capLen(s, n) {
  if (s == null) return null;
  return String(s).slice(0, n);
}

/* ========================================================
   Join form validation
   ======================================================== */
function validateJoin(body) {
  const raw = body || {};
  const errors = {};

  // Honeypot — bots fill this. If filled, silently succeed (save nothing, send nothing).
  if (raw.website && String(raw.website).trim() !== '') {
    return { ok: true, honeypot: true, value: null };
  }

  const v = {};
  v.firstName = toTrimmedStringOrNull(raw.firstName);
  v.lastName = toTrimmedStringOrNull(raw.lastName);
  v.countryResidence = toTrimmedStringOrNull(raw.countryResidence);
  v.city = capLen(toTrimmedStringOrNull(raw.city), MAX_SHORT);
  v.email = toTrimmedStringOrNull(raw.email);
  v.phone = capLen(toTrimmedStringOrNull(raw.phone), MAX_SHORT);

  const professionRaw = toTrimmedStringOrNull(raw.profession);
  const professionCanon = professionRaw ? normalizeProfessionValue(professionRaw) : '';
  v.profession = PROFESSIONS.has(professionCanon) ? professionCanon : null;
  v.otherSpecify = v.profession === 'other' ? capLen(toTrimmedStringOrNull(raw.otherSpecify), MAX_SHORT) : null;

  v.specialty = capLen(toTrimmedStringOrNull(raw.specialty), MAX_SHORT);
  v.subspecialty = capLen(toTrimmedStringOrNull(raw.subspecialty), MAX_SHORT);

  const yearsRaw = toTrimmedStringOrNull(raw.years) || '';
  v.years = YEARS.has(yearsRaw) ? yearsRaw : '';
  v.position = capLen(toTrimmedStringOrNull(raw.position), MAX_SHORT);
  v.qualificationCountry = capLen(toTrimmedStringOrNull(raw.qualificationCountry), MAX_SHORT);
  v.practiceCountry = capLen(toTrimmedStringOrNull(raw.practiceCountry), MAX_SHORT);
  v.languages = capLen(toTrimmedStringOrNull(raw.languages), MAX_LONG);

  // Multi-value fields — normalize to canonical tokens, then filter to allowed values only
  const allowedContrib = new Set(['clinical','shorter','teaching','mentorship','equipment','organisation','info']);
  v.contribution = toArrayOfStrings(raw.contribution)
    .map(c => normalizeContributionValue(c))
    .filter(c => allowedContrib.has(c));
  const allowedAvail = new Set(['yearly','few','occasionally','unsure']);
  v.availability = toArrayOfStrings(raw.availability).map(a => String(a).toLowerCase()).filter(a => allowedAvail.has(a));
  const allowedLoc = new Set(['kandahar','kabul','herat','mazar','jalalabad','other']);
  v.locations = toArrayOfStrings(raw.locations).map(l => String(l).toLowerCase()).filter(l => allowedLoc.has(l));

  v.notes = capLen(toTrimmedStringOrNull(raw.notes), MAX_TEXT);
  v.consentStore = toBoolCheckbox(raw.consentStore);
  v.consentContact = toBoolCheckbox(raw.consentContact);

  if (!v.firstName) errors.firstName = 'First name is required';
  else if (v.firstName.length > MAX_SHORT) errors.firstName = 'First name is too long';

  if (!v.lastName) errors.lastName = 'Last name is required';
  else if (v.lastName.length > MAX_SHORT) errors.lastName = 'Last name is too long';

  if (!v.countryResidence) errors.countryResidence = 'Country of residence is required';
  else if (v.countryResidence.length > MAX_SHORT) errors.countryResidence = 'Too long';

  if (!v.email) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(v.email)) errors.email = 'Please enter a valid email address';
  else if (v.email.length > 254) errors.email = 'Email is too long';

  if (!v.profession) errors.profession = 'Please select your profession';
  if (v.profession === 'other' && !v.otherSpecify) {
    errors.otherSpecify = 'Please specify your role';
  }

  if (!v.consentStore) errors.consentStore = 'You must consent to data storage to submit';

  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  return { ok: true, value: v };
}

/* ========================================================
   Contact form validation
   ======================================================== */
const TOPICS = new Set([
  'Hospital / institution partnership',
  'Supporting the initiative / fundraising',
  'Press or media enquiry',
  'General question',
  'Other'
]);

function validateContact(body) {
  const raw = body || {};
  const errors = {};

  if (raw.website && String(raw.website).trim() !== '') {
    return { ok: true, honeypot: true, value: null };
  }

  const v = {};
  v.firstName = toTrimmedStringOrNull(raw.firstName);
  v.lastName = toTrimmedStringOrNull(raw.lastName);
  v.email = toTrimmedStringOrNull(raw.email);
  v.organisation = capLen(toTrimmedStringOrNull(raw.organisation), MAX_SHORT);

  const topicRaw = toTrimmedStringOrNull(raw.topic);
  v.topic = TOPICS.has(topicRaw) ? topicRaw : null;
  v.message = capLen(toTrimmedStringOrNull(raw.message), MAX_TEXT);
  v.consent = toBoolCheckbox(raw.consent);

  if (!v.firstName) errors.firstName = 'First name is required';
  else if (v.firstName.length > MAX_SHORT) errors.firstName = 'Too long';

  if (!v.lastName) errors.lastName = 'Last name is required';
  else if (v.lastName.length > MAX_SHORT) errors.lastName = 'Too long';

  if (!v.email) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(v.email)) errors.email = 'Please enter a valid email address';
  else if (v.email.length > 254) errors.email = 'Email is too long';

  if (!v.topic) errors.topic = 'Please select a topic';
  if (!v.message) errors.message = 'Please enter your message';
  else if (v.message.length < 5) errors.message = 'Your message is too short';
  if (!v.consent) errors.consent = 'You must consent to being contacted';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: v };
}

module.exports = {
  validateJoin,
  validateContact
};
