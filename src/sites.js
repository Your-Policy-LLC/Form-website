// One entry per website that embeds the form. The key is the slug that appears
// in the embed snippet and in every Slack message; the label is what a human
// reads in #pc-referral.
//
// Adding a site is a code change and a deploy. That is deliberate. There are
// 24 locations rolling out slowly, so an admin UI would be more machinery than
// the problem needs, and keeping the list in git means every change to who can
// embed the form is reviewed and attributable.
//
// allowedOrigins is a security boundary, not a convenience list. It becomes the
// CSP frame-ancestors directive, which is what tells a browser the form may be
// displayed inside that page. An origin is scheme + host + port: apex and www
// are NOT the same origin, and a missing entry means the form renders blank on
// that site rather than failing loudly. List every hostname the site will ever
// be previewed or served on, and add the live domain BEFORE a cutover, not
// after.

// Default palette, taken from the quote form on your-policy.com. Sites inherit
// it unless they override, because the form will sit inside 24 different brands
// and a hardcoded Your Policy panel would read as a third-party widget on a
// site that isn't Your Policy.
//
// These hex values were matched by eye from a screenshot, not read from the
// stylesheet, so they are close rather than exact. Replace with the real brand
// values when you have them.
export const DEFAULT_THEME = {
  bg: '#33475b',
  field: '#3d5266',
  border: '#546b80',
  text: '#ffffff',
  muted: '#b8c6d3',
  accent: '#e8b024',
  accentText: '#1f2d3d',
  error: '#ffb4ab',
};

export const SITES = {
  // The bare domain serves this rather than a real agency, so a test run at the
  // preview URL is never mistaken for a lead from a client's website. Its label
  // is deliberately unmissable in Slack. allowedOrigins is empty, which makes
  // frame-ancestors 'none': this slug renders for a human visiting directly and
  // refuses to embed anywhere.
  preview: {
    label: 'PREVIEW — test submission, not a real lead',
    allowedOrigins: [],
  },
  'larsen-flynn': {
    // TODO(confirm): label inferred from the WP Engine install name. This is
    // what producers read at the top of every lead from this site, so correct
    // it if the agency goes by something else.
    label: 'Larsen Flynn',
    allowedOrigins: [
      'https://larsenflynn.wpenginepowered.com',
      // TODO: add the live domain and its www variant BEFORE the site goes
      // live. A domain missing from this list renders the form blank, and the
      // cutover is exactly when nobody is watching.
    ],
  },
  'insure-mt': {
    // Slug retained until the domain cutover; update it then. Label reflects the
    // agency name as it should read in #pc-referral.
    label: 'Gallatin Insurance',
    allowedOrigins: [
      'https://galinsurance.wpenginepowered.com',
      'https://insuremt.com',
      'https://www.insuremt.com',
    ],
  },
};

export function getSite(slug) {
  if (!slug || !Object.prototype.hasOwnProperty.call(SITES, slug)) return null;
  const site = SITES[slug];
  // Per-site overrides merge over the default, so a site can change one colour
  // without restating the whole palette.
  return { slug, ...site, theme: { ...DEFAULT_THEME, ...(site.theme || {}) } };
}

// Emits the theme as CSS custom properties for injection into the form's
// stylesheet. Values are filtered to hex colours: this string goes inside a
// <style> block, so anything else would be an injection point.
export function themeCss(theme) {
  return Object.entries(theme)
    .filter(([, v]) => /^#[0-9a-fA-F]{3,8}$/.test(v))
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ');
}

// 'none' is the correct default for a slug we do not recognise: an unknown site
// should not be embeddable anywhere. Combined with the 404 in the route, a
// typo'd slug fails visibly during setup instead of quietly working in testing
// and breaking in production.
export function frameAncestorsFor(site) {
  if (!site || !site.allowedOrigins.length) return "frame-ancestors 'none'";
  return `frame-ancestors ${site.allowedOrigins.join(' ')}`;
}
