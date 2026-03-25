// Workaround for "Cannot set property fetch of #<Window> which has only a getter"
// This happens when some polyfills (like formdata-polyfill) try to overwrite window.fetch
// in an environment where it's read-only (like some iframes).
try {
  Object.defineProperty(window, 'fetch', {
    value: window.fetch,
    writable: true,
    configurable: true
  });
} catch (e) {
  console.warn('Could not make window.fetch writable', e);
}
