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

export const SITES = {
  'insure-mt': {
    // TODO(confirm): "Insure MT" is inferred from the live domain insuremt.com.
    // The WP Engine install is named galinsurance, so the agency may go by a
    // different name in conversation. This string is what producers see.
    label: 'Insure MT',
    allowedOrigins: [
      'https://galinsurance.wpenginepowered.com',
      'https://insuremt.com',
      'https://www.insuremt.com',
    ],
  },
};

export function getSite(slug) {
  if (!slug || !Object.prototype.hasOwnProperty.call(SITES, slug)) return null;
  return { slug, ...SITES[slug] };
}

// 'none' is the correct default for a slug we do not recognise: an unknown site
// should not be embeddable anywhere. Combined with the 404 in the route, a
// typo'd slug fails visibly during setup instead of quietly working in testing
// and breaking in production.
export function frameAncestorsFor(site) {
  if (!site || !site.allowedOrigins.length) return "frame-ancestors 'none'";
  return `frame-ancestors ${site.allowedOrigins.join(' ')}`;
}
