// Android draws the page edge to edge, under transparent system bars.
//
// - The shell passes the bar sizes as CSS variables. Android WebView does not
//   yet fill env(safe-area-inset-*), so the page cannot read them itself.
// - The page is padded by those sizes, and the fixed app bar grows under the
//   status bar so its colour shows through it.
// - Every theme-color change is reported back, so the bar icons switch between
//   light and dark together with the page.
// - Until the web app applies its theme (data-theme on <html>), the page is
//   painted in its last colour, so a dark theme doesn't start with a white
//   frame and the bars aren't set from the static light theme-color tag.
// - The page's data-theme is reported, so the text selection handles take
//   its accent colour; the selection highlight takes it through CSS.
// - The first frame is reported too, so the splash screen hands over to the
//   page's own loader instead of to an empty screen.
(function () {
  var bridge = window.OrganizedShell;

  var CSS =
    'html{box-sizing:border-box;' +
    'padding:var(--organized-inset-top,0px) var(--organized-inset-right,0px)' +
    ' var(--organized-inset-bottom,0px) var(--organized-inset-left,0px)}' +
    'html:not([data-theme]){background:var(--organized-last-color,#f8f9ff)}' +
    '::selection{background:rgba(var(--accent-main-base),0.3)}' +
    '.MuiAppBar-positionFixed{' +
    'padding-top:var(--organized-inset-top,0px);' +
    'padding-left:var(--organized-inset-left,0px);' +
    'padding-right:var(--organized-inset-right,0px)}' +
    // side panels (My assignments, notifications) start below the app bar,
    // which is taller by the status bar
    '.MuiDrawer-paper{padding-top:var(--organized-inset-top,0px)}' +
    '.MuiDialog-paperFullScreen{' +
    'padding-top:var(--organized-inset-top,0px);' +
    'padding-bottom:var(--organized-inset-bottom,0px)}' +
    // the bottom actions menu and snackbars sit above the navigation bar;
    // the site's env(safe-area-inset-bottom) is 0 in the WebView
    '.mui-fixed:has(> nav),.MuiSnackbar-root{' +
    'margin-bottom:var(--organized-inset-bottom,0px)}' +
    '.mui-fixed:has(+ .mui-fixed > nav){' +
    'height:calc(120px + var(--organized-inset-bottom,0px)) !important}';

  // An iPhone's WKWebView fills env(safe-area-inset-*) itself (the page asks
  // for viewport-fit=cover), so the same padding comes from there.
  if (!bridge) {
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
    var style = document.createElement('style');
    style.textContent =
      ':root{--organized-inset-top:env(safe-area-inset-top);' +
      '--organized-inset-right:env(safe-area-inset-right);' +
      '--organized-inset-bottom:env(safe-area-inset-bottom);' +
      '--organized-inset-left:env(safe-area-inset-left)}' +
      // no grey flash on a tap and no link menu on a long press, as in an app
      'html{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}' +
      CSS;
    (document.head || document.documentElement).appendChild(style);
    edgeSwipeBack();
    return;
  }

  // An iPhone app goes back with a swipe from the left edge; the page
  // follows the finger and goes back when let go far enough.
  function edgeSwipeBack() {
    var start = null;
    var root = document.documentElement;
    function reset(animate) {
      root.style.transition = animate ? 'transform 0.2s ease-out' : '';
      root.style.transform = '';
      start = null;
    }
    document.addEventListener(
      'touchstart',
      function (event) {
        var touch = event.touches[0];
        var home = (location.hash.replace(/^#/, '') || '/').split('?')[0] === '/';
        start =
          event.touches.length === 1 && touch.clientX < 24 && !home
            ? { x: touch.clientX, y: touch.clientY, moved: 0 }
            : null;
      },
      { passive: true }
    );
    document.addEventListener(
      'touchmove',
      function (event) {
        if (!start) return;
        var touch = event.touches[0];
        var dx = touch.clientX - start.x;
        if (Math.abs(touch.clientY - start.y) > 60 && dx < 40) return reset(true);
        start.moved = Math.max(0, dx);
        root.style.transition = '';
        root.style.transform = 'translateX(' + start.moved * 0.5 + 'px)';
      },
      { passive: true }
    );
    document.addEventListener('touchend', function () {
      if (!start) return;
      var back = start.moved > window.innerWidth * 0.3;
      reset(true);
      if (back) {
        if (window.OrganizedHaptics) window.OrganizedHaptics.perform('tap');
        history.back();
      }
    });
  }

  // The page saves files by clicking an <a download> with a blob URL, which a
  // web view drops on the floor. Every such click is caught here and the file
  // is handed to the shell, which saves, shares or opens it.
  function handoff(url, name) {
    fetch(url)
      .then(function (response) {
        return response.blob();
      })
      .then(function (blob) {
        var reader = new FileReader();
        reader.onload = function () {
          var data = String(reader.result);
          window.OrganizedFiles.save(
            name,
            blob.type || 'application/octet-stream',
            data.slice(data.indexOf(',') + 1)
          );
        };
        reader.readAsDataURL(blob);
      })
      .catch(function () {});
  }

  function catchDownloads() {
    if (!window.OrganizedFiles) return;
    var click = HTMLAnchorElement.prototype.click;
    var dispatch = HTMLAnchorElement.prototype.dispatchEvent;

    function taken(anchor) {
      var name = anchor.getAttribute('download');
      if (name === null) return false;
      var url = anchor.href;
      if (!/^(blob:|data:)/.test(url)) return false;
      handoff(url, name || 'file');
      return true;
    }

    HTMLAnchorElement.prototype.click = function () {
      if (taken(this)) return;
      return click.apply(this, arguments);
    };
    HTMLAnchorElement.prototype.dispatchEvent = function (event) {
      if (event && event.type === 'click' && taken(this)) return true;
      return dispatch.apply(this, arguments);
    };
  }

  // called by the shell whenever the bar sizes change (rotation, cutout)
  window.__organizedInsets = function (top, right, bottom, left) {
    var style = document.documentElement.style;
    style.setProperty('--organized-inset-top', top + 'px');
    style.setProperty('--organized-inset-right', right + 'px');
    style.setProperty('--organized-inset-bottom', bottom + 'px');
    style.setProperty('--organized-inset-left', left + 'px');
  };

  var last = null;
  var lastTheme = null;
  var lastBack = null;

  // whether back would close something in the page or leave the app, so the
  // shell can preview leaving as Android's predictive back does
  function backState() {
    if (typeof bridge.setBack !== 'function') return;
    var route = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    var handled =
      !!document.querySelector('.MuiModal-root:not(.MuiModal-hidden)') ||
      (route !== '/' && route !== '');
    if (handled === lastBack) return;
    lastBack = handled;
    bridge.setBack(handled);
  }
  function report() {
    var theme = document.documentElement.getAttribute('data-theme');
    if (!theme) return;
    // the bar colour first, so the icons flip even if the rest fails
    var meta = document.querySelector('meta[name="theme-color"]');
    var color = meta && meta.content ? meta.content.trim() : '';
    if (color && color !== last) {
      last = color;
      bridge.setColor(color);
    }
    if (theme !== lastTheme && typeof bridge.setAccent === 'function') {
      lastTheme = theme;
      bridge.setAccent(theme);
    }
  }

  // only the head (where the meta tag lives) and the theme attribute on
  // <html> are watched, not the whole React tree
  var observer = new MutationObserver(report);
  function start() {
    var sheet = document.createElement('style');
    sheet.textContent = CSS;
    document.head.appendChild(sheet);

    var lastColor = bridge.lastColor();
    if (/^#[0-9a-f]{6}$/i.test(lastColor)) {
      document.documentElement.style.setProperty(
        '--organized-last-color',
        lastColor
      );
    }

    catchDownloads();

    var insets = JSON.parse(bridge.insets());
    window.__organizedInsets(insets[0], insets[1], insets[2], insets[3]);

    observer.observe(document.head, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['content'],
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    report();

    // dialogs are portalled to <body>; routes live in the hash
    new MutationObserver(function () {
      requestAnimationFrame(backState);
    }).observe(document.body, { childList: true });
    addEventListener('hashchange', backState);
    addEventListener('popstate', backState);
    backState();
  }

  // the first frame with content in <body> (the web app's static loader),
  // once its images have loaded
  function shown() {
    var body = document.body;
    var pending =
      !body ||
      !body.firstElementChild ||
      Array.prototype.some.call(body.getElementsByTagName('img'), function (img) {
        return !img.complete;
      });
    if (pending) {
      requestAnimationFrame(shown);
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        bridge.ready();
      });
    });
  }
  shown();

  if (document.head && document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
