// The objects the Android shell gives the page (TerritoryNearby,
// OrganizedHaptics), for the iPhone plugin (plugins/nearby). This runs before
// the page's own code; what the page sends before the plugin is ready waits.
(function () {
  var queue = [];
  function post(name, body) {
    var handlers = window.webkit && window.webkit.messageHandlers;
    if (handlers && handlers[name]) {
      handlers[name].postMessage(body);
      return;
    }
    queue.push([name, body]);
    if (queue.length === 1) setTimeout(flush, 100);
  }
  function flush() {
    var waiting = queue;
    queue = [];
    waiting.forEach(function (item) {
      post(item[0], item[1]);
    });
  }
  window.TerritoryNearby = {
    command: function (name, args) {
      post('territoryNearby', { name: name, args: args });
    },
  };
  window.OrganizedHaptics = {
    perform: function (intent) {
      post('territoryHaptics', intent);
      return true;
    },
  };
  // a notification's page or an opened file waits for this
  function ready() {
    window.TerritoryNearby.command('pageReady', '{}');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else ready();
  addEventListener('pagehide', function () {
    window.TerritoryNearby.command('pageGone', '{}');
  });
})();
