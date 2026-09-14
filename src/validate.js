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
  // Offered only to sites that list it in their `lines` (see sites.js). Every
  // other site keeps boat inside the Personal "Toys" product, unchanged.
  { id: 'marine', label: 'Boat & Marine' },
];

// What a site shows when it does not name its own list. This is the original
// five, in the original order, so adding a line to the registry above cannot
// change any existing form by itself.
export const DEFAULT_LINE_IDS = ['commercial', 'employee-benefits', 'personal', 'medicare', 'life-health'];

// The lines a given site offers, as objects, in the site's order. Unknown ids
// in a site's list are dropped rather than rendered as blank checkboxes.
export function linesForSite(site) {
  const ids = Array.isArray(site?.lines) && site.lines.length ? site.lines : DEFAULT_LINE_IDS;
  return ids.map((id) => LINES_OF_BUSINESS.find((l) => l.id === id)).filter(Boolean);
}

// Home lakes for the marine line. Rendered as a select, so a producer never
// has to guess whether "RC" meant Richland Chambers or Ray Roberts.
export const LAKES = [
  { id: 'texoma', label: 'Lake Texoma' },
  { id: 'possum-kingdom', label: 'Possum Kingdom Lake' },
  { id: 'cedar-creek', label: 'Cedar Creek Lake' },
  { id: 'richland-chambers', label: 'Richland Chambers Reservoir' },
  { id: 'ray-roberts', label: 'Lake Ray Roberts' },
  { id: 'ray-hubbard', label: 'Lake Ray Hubbard' },
  { id: 'lewisville', label: 'Lewisville Lake / Lake Dallas' },
  { id: 'other', label: 'Other / not sure yet' },
];
const LAKE_IDS = new Set(LAKES.map((l) => l.id));
const LAKE_LABELS = new Map(LAKES.map((l) => [l.id, l.label]));
export function lakeLabelFor(id) {
  return LAKE_LABELS.get(id) || id;
}

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



// Personal lines products. The Toys label names what it covers, because a
// bare "Toys" leaves a boat owner guessing and leaves a producer unable to
// tell what was actually meant without calling to ask.
export const PERSONAL_PRODUCTS = [
  { id: 'home', label: 'Home' },
  { id: 'auto', label: 'Auto' },
  { id: 'motorcycle', label: 'Motorcycle' },
  { id: 'flood', label: 'Flood' },
  { id: 'renters', label: 'Renters' },
  { id: 'toys', label: 'Toys (boat, ATV/UTV, snowmobile)' },
  { id: 'rv', label: 'RV' },
];

const PRODUCT_IDS = new Set(PERSONAL_PRODUCTS.map((p) => p.id));
const PRODUCT_LABELS = new Map(PERSONAL_PRODUCTS.map((p) => [p.id, p.label]));

export function productLabelFor(id) {
  return PRODUCT_LABELS.get(id) || id;
}

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
export function validateSubmission(body, site) {
  const errors = {};

  // A line has to be both a real line and one this site actually offers. A
  // request naming a line the site never rendered is not a user mistake, so it
  // is dropped silently and the "choose at least one" check does the rest.
  const offered = new Set(linesForSite(site).map((l) => l.id));
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  const lines = [...new Set(rawLines.filter((l) => LOB_IDS.has(l) && offered.has(l)))];
  if (!lines.length) errors.lines = 'Choose at least one type of insurance.';

  const firstName = str(body?.firstName, 80);
  const lastName = str(body?.lastName, 80);
  if (!firstName) errors.firstName = 'First name is required.';
  if (!lastName) errors.lastName = 'Last name is required.';

  const rawPhone = str(body?.phone, 40);
  const rawEmail = str(body?.email, 254).toLowerCase();
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null;

  // Both required, matching the existing form on your-policy.com. Previously
  // either would do, which is why the labels carried a "phone or email" hint.
  if (!rawPhone) errors.phone = 'Phone number is required.';
  else if (!phone) errors.phone = 'Enter a 10-digit phone number.';

  if (!rawEmail) errors.email = 'Email address is required.';
  else if (!email) errors.email = 'Enter a valid email address.';

  const zip = str(body?.zip, 10);
  if (!/^\d{5}$/.test(zip)) errors.zip = 'Enter a 5-digit ZIP code.';

  // Business phone, email and ZIP were deliberately removed: the contact block
  // above already collects all three, and asking twice cost conversion while
  // producing two values with no rule for which one wins. The columns remain in
  // the schema, nullable and unused, so restoring any of them is a form change
  // rather than a migration.
  const commercial = { name: null, count: null, ebOk: null, commercialOk: null };
  const wantsCommercial = lines.includes('commercial');
  const wantsBenefits = lines.includes('employee-benefits');

  // Business details belong to both lines, asked once when either is selected.
  if (wantsCommercial || wantsBenefits) {
    commercial.name = str(body?.businessName, 160);
    if (!commercial.name) errors.businessName = 'Business name is required.';

    // A precise headcount rather than a bucket. Parsed strictly: "about 40" and
    // "40-50" are rejected rather than stored as text nobody can aggregate.
    const rawCount = str(body?.employeeCount, 12);
    if (!rawCount) {
      errors.employeeCount = 'Number of employees is required.';
    } else if (!/^\d{1,7}$/.test(rawCount) || Number(rawCount) < 1) {
      errors.employeeCount = 'Enter a whole number, for example 42.';
    } else {
      commercial.count = Number(rawCount);
    }
  }

  // Each line implies interest in itself, and each is offered the other. When
  // both are selected there is nothing left to cross-sell, so neither question
  // is asked and both are recorded true.
  if (wantsCommercial) commercial.commercialOk = true;
  if (wantsBenefits) commercial.ebOk = true;

  if (wantsCommercial && !wantsBenefits) {
    // Strict boolean. An absent value means the question was skipped, which is
    // different from answering no, and must not be silently coerced to false.
    if (typeof body?.ebContactOk !== 'boolean') {
      errors.ebContactOk = 'Please choose yes or no.';
    } else {
      commercial.ebOk = body.ebContactOk;
    }
  }

  if (wantsBenefits && !wantsCommercial) {
    if (typeof body?.commercialQuoteOk !== 'boolean') {
      errors.commercialQuoteOk = 'Please choose yes or no.';
    } else {
      commercial.commercialOk = body.commercialQuoteOk;
    }
  }

  // Personal lines products. Null rather than empty when the line is not
  // selected, so "did not ask" stays distinct from "asked and chose nothing",
  // which validation does not allow anyway.
  let personalProducts = null;
  if (lines.includes('personal')) {
    const raw = Array.isArray(body?.personalProducts) ? body.personalProducts : [];
    personalProducts = [...new Set(raw.filter((p) => PRODUCT_IDS.has(p)))];
    if (!personalProducts.length) {
      errors.personalProducts = 'Please choose at least one line of insurance so we can help.';
    }
  }

  // Marine details. Null when the line is not selected, for the same reason as
  // personalProducts. Year is bounded loosely: old enough for a restored
  // classic, one year ahead for a boat on order.
  let marine = null;
  if (lines.includes('marine')) {
    marine = { year: null, makeModel: null, lake: null };
    const rawYear = str(body?.boatYear, 4);
    const thisYear = new Date().getFullYear();
    if (!rawYear) errors.boatYear = 'Boat year is required.';
    else if (!/^\d{4}$/.test(rawYear) || Number(rawYear) < 1950 || Number(rawYear) > thisYear + 1) {
      errors.boatYear = 'Enter a 4-digit year.';
    } else marine.year = Number(rawYear);

    marine.makeModel = str(body?.boatMakeModel, 120);
    if (!marine.makeModel) errors.boatMakeModel = 'Make and model are required.';

    const rawLake = str(body?.homeLake, 40);
    if (!rawLake) errors.homeLake = 'Choose the lake where you keep or use the boat.';
    else if (!LAKE_IDS.has(rawLake)) errors.homeLake = 'Choose a lake from the list.';
    else marine.lake = rawLake;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { lines, firstName, lastName, phone, email, zip, commercial, personalProducts, marine },
  };
}
