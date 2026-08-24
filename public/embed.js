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

  window.addEventListener('message', function (event) {
    // Two guards. The origin check rejects messages from any other site; the
    // source check rejects messages from other iframes on this same page, which
    // matters if a site embeds the form twice.
    if (event.origin !== origin) return;
    if (event.source !== iframe.contentWindow) return;

    var data = event.data;
    if (!data || data.type !== 'yp-form-height') return;

    var height = Number(data.height);
    if (height > 0 && height < 5000) iframe.style.height = height + 'px';
  });
})();
