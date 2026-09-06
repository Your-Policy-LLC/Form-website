// The embed loader. This is the only file a client site ever references, which
// is why it is a loader and not the form itself: the iframe's contents can be
// rewritten freely without asking 24 websites to update a snippet.
//
// Paste on the host page:
//   <script src="https://forms.your-policy.com/embed.js" data-slug="insure-mt"></script>
(function () {
  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute('data-slug');
  if (!slug) {
    // Loud on purpose. A missing slug during setup should be obvious in the
    // console rather than producing anonymous leads for months.
    console.error('[yp-form] missing data-slug attribute on embed script');
    return;
  }

  var origin = new URL(script.src, window.location.href).origin;
  var src = origin + '/f/' + encodeURIComponent(slug) + '?page=' +
    encodeURIComponent(window.location.href.slice(0, 500)) +
    '&q=' + encodeURIComponent(window.location.search.slice(1, 500));

  var iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = 'Insurance quote request';
  iframe.loading = 'lazy';
  iframe.setAttribute('scrolling', 'no');
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  // Starting height covers the form before the first resize message arrives, so
  // the page does not visibly jump on load.
  iframe.style.height = '720px';

  script.parentNode.insertBefore(iframe, script);

  // A blocked frame renders nothing and reports nothing, which is how a broken
  // embed sits unnoticed on a live site. The form posts 'yp-form-ready' once it
  // renders; if that never arrives, something stopped it and we say so rather
  // than leaving blank space.
  var ready = false;

  function showFailure() {
    if (ready) return;
    var host = window.location.origin;
    console.error(
      '[yp-form] the quote form did not load.\n' +
      'slug: ' + slug + '\n' +
      'this page origin: ' + host + '\n' +
      'Most likely: this origin is not in the allowed list for this slug, so the ' +
      'browser refused to display it. The origin must match exactly, including ' +
      'http vs https and the www prefix. Send the origin above to whoever ' +
      'maintains the form and it can be added.'
    );
    iframe.style.display = 'none';
    var box = document.createElement('div');
    box.setAttribute('data-yp-form-error', slug);
    box.style.cssText =
      'padding:16px;border:1px solid #d4a0a0;border-radius:6px;background:#fdf3f3;' +
      'color:#7a2d2d;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    box.textContent =
      'The quote form could not be displayed on this page. ' +
      'If you manage this site, open the browser console for details.';
    iframe.parentNode.insertBefore(box, iframe);
  }

  setTimeout(showFailure, 5000);

  window.addEventListener('message', function (event) {
    // Two guards. The origin check rejects messages from any other site; the
    // source check rejects messages from other iframes on this same page, which
    // matters if a site embeds the form twice.
    if (event.origin !== origin) return;
    if (event.source !== iframe.contentWindow) return;

    var data = event.data;
    if (!data) return;

    if (data.type === 'yp-form-ready') {
      ready = true;
      return;
    }

    if (data.type !== 'yp-form-height') return;

    var height = Number(data.height);
    if (height > 0 && height < 5000) iframe.style.height = height + 'px';
  });
})();
