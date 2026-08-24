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

// Boundaries do not overlap. Ranges like "1-10" and "10-30" would leave a
// company with exactly 10 employees able to pick either one, which quietly
// makes the field unusable for segmentation.
export const EMPLOYEE_RANGES = [
  { id: '1-10', label: '1-10' },
  { id: '11-30', label: '11-30' },
  { id: '31-50', label: '31-50' },
  { id: '51-100', label: '51-100' },
  { id: '100+', label: '100+' },
];

const RANGE_IDS = new Set(EMPLOYEE_RANGES.map((r) => r.id));

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

  // Business phone, email and ZIP were deliberately removed: the contact block
  // above already collects all three, and asking twice cost conversion while
  // producing two values with no rule for which one wins. The columns remain in
  // the schema, nullable and unused, so restoring any of them is a form change
  // rather than a migration.
  const commercial = { name: null, phone: null, email: null, zip: null, range: null, ebOk: null };

  if (lines.includes('commercial')) {
    commercial.name = str(body?.businessName, 160);
    if (!commercial.name) errors.businessName = 'Business name is required.';

    commercial.range = str(body?.employeeRange, 20);
    if (!RANGE_IDS.has(commercial.range)) errors.employeeRange = 'Choose a number of employees.';

    // Strict boolean. An absent value means the question was skipped, which is
    // different from answering no, and must not be silently coerced to false.
    if (typeof body?.ebContactOk !== 'boolean') {
      errors.ebContactOk = 'Please choose yes or no.';
    } else {
      commercial.ebOk = body.ebContactOk;
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { lines, firstName, lastName, phone, email, zip, commercial },
  };
}
