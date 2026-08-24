// Server-side validation. The client validates too, for the sake of the person
// filling out the form, but this is the copy that matters: /api/submit is a
// public endpoint and nothing arriving at it can be trusted.

// Single source of truth for the lines of business. The form renders its
// checkboxes from this list rather than hardcoding them in HTML, so the two
// cannot drift apart.
export const LINES_OF_BUSINESS = [
  { id: 'commercial', label: 'Commercial' },
  { id: 'employee-benefits', label: 'Employee Benefits' },
  { id: 'personal', label: 'Personal Insurance' },
  { id: 'medicare', label: 'Medicare' },
  { id: 'life-health', label: 'Individual Life & Health' },
];

const LOB_IDS = new Set(LINES_OF_BUSINESS.map((l) => l.id));
const LOB_LABELS = new Map(LINES_OF_BUSINESS.map((l) => [l.id, l.label]));

export function labelFor(id) {
  return LOB_LABELS.get(id) || id;
}

function str(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

// Deliberately permissive. The job here is to catch typos and junk, not to
// decide what a valid address looks like: the only real test of an email is
// sending to it, and an over-strict pattern rejects real people.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// North American numbers only, which matches where the agency is licensed.
// Returns a normalised 10-digit string, or null.
export function normalisePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}

export function formatPhone(tenDigits) {
  if (!tenDigits || tenDigits.length !== 10) return tenDigits || '';
  return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}

// Returns { ok, errors, value }. `errors` is keyed by field so the form can put
// each message next to the input it belongs to.
export function validateSubmission(body) {
  const errors = {};

  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  const lines = [...new Set(rawLines.filter((l) => LOB_IDS.has(l)))];
  if (!lines.length) errors.lines = 'Choose at least one type of insurance.';

  const firstName = str(body?.firstName, 80);
  const lastName = str(body?.lastName, 80);
  if (!firstName) errors.firstName = 'First name is required.';
  if (!lastName) errors.lastName = 'Last name is required.';

  const rawPhone = str(body?.phone, 40);
  const rawEmail = str(body?.email, 254).toLowerCase();
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null;

  if (rawPhone && !phone) errors.phone = 'Enter a 10-digit phone number.';
  if (rawEmail && !email) errors.email = 'Enter a valid email address.';
  if (!rawPhone && !rawEmail) {
    // Attached to both fields so the message appears wherever they are looking.
    errors.phone = 'Enter a phone number or an email address.';
    errors.email = 'Enter a phone number or an email address.';
  }

  const zip = str(body?.zip, 10);
  if (!/^\d{5}$/.test(zip)) errors.zip = 'Enter a 5-digit ZIP code.';

  if (body?.consent !== true) {
    errors.consent = 'Please agree before submitting.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { lines, firstName, lastName, phone, email, zip },
  };
}
