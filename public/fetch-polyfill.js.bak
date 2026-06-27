// Workaround for "Cannot set property fetch of #<Window> which has only a getter"
// This happens when some polyfills (like formdata-polyfill) try to overwrite window.fetch
// in an environment where it's read-only (like some iframes).
(function() {
  var originalFetch = window.fetch.bind(window);
  function polyfill(obj) {
    if (!obj) return;
    try {
      var desc = Object.getOwnPropertyDescriptor(obj, 'fetch');
      if (desc && !desc.configurable) return;
      Object.defineProperty(obj, 'fetch', {
        get: function() { return originalFetch; },
        set: function(v) { originalFetch = v; },
        configurable: true,
        enumerable: true
      });
    } catch (e) {}
  }
  polyfill(window);
  polyfill(self);
  if (typeof globalThis !== 'undefined') polyfill(globalThis);
  if (typeof Window !== 'undefined' && Window.prototype) polyfill(Window.prototype);
})();
