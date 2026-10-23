// Consent text shown above the submit button and stamped into every Slack
// message.
//
// PLACEHOLDER. This wording has NOT been reviewed by compliance and must not
// go live as written. It exists so the mechanism can be built and tested; the
// approved language replaces `text` below and `version` is bumped at the same
// time.
//
// Why the exact text is copied into the Slack message rather than a boolean:
// with no database, the Slack message is the only record that a given person
// consented. "consent: true" six months from now proves nothing, because
// nobody will remember what the checkbox said in August. The literal string
// plus a version identifier is the difference between a record and a rumour.
//
// Two separate compliance questions feed this file, and they are not the same:
//   1. TCPA-style consent to be contacted by phone or SMS.
//   2. CMS disclaimer requirements specific to Medicare lead generation, which
//      may apply whenever the Medicare checkbox is selected.
// Ask about both. Item 2 may require its own text shown conditionally.

export const CONSENT = {
  version: 'interim-2026-10',
  // Still false: this is interim wording, not compliance-approved. The boot
  // warning stays on deliberately until someone signs this off.
  approved: false,
  text:
    'By submitting this form I agree that a licensed advisor may contact me ' +
    'about my request by phone, text message, or email at the contact ' +
    'information I provided, including by automated means. Consent is not a ' +
    'condition of purchase. Message and data rates may apply, and I can reply ' +
    'STOP at any time to stop texts.',
};
