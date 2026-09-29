// Shared JSOM (SP.ClientContext) bootstrap for setup operations that the REST
// API cannot perform.
//
// Why JSOM at all: SharePoint's list.DefaultNewFormUrl / DefaultEditFormUrl are
// read-only via REST (400 on write) and, even via CSOM, only accept a URL that
// is already one of the list's own SPForms -- so they cannot redirect to the
// app page. The writable redirect knob is ContentType.NewFormUrl /
// EditFormUrl, which requires CSOM/JSOM. See client-tests/formRedirect.test.js
// for the probe that established this.

let _jsomReady = null;

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

// Ensure SP.ClientContext is available. Cached after first success so repeated
// calls (e.g. redirecting forms on many lists) don't reload the runtime.
export function loadJSOM() {
  if (window.SP && window.SP.ClientContext) return Promise.resolve(true);
  if (_jsomReady) return _jsomReady;

  _jsomReady = (async () => {
    // Preferred: script-on-demand when the SP runtime is partially present.
    if (window.SP && window.SP.SOD && typeof SP.SOD.executeFunc === 'function') {
      await new Promise((res) => SP.SOD.executeFunc('sp.js', 'SP.ClientContext', res));
      if (window.SP && SP.ClientContext) return true;
    }
    // Fallback: load the JSOM runtime from _layouts in dependency order.
    const base = location.origin + '/_layouts/15/';
    await _loadScript(base + 'init.js');
    await _loadScript(base + 'sp.runtime.js');
    await _loadScript(base + 'sp.js');
    if (window.SP && SP.ClientContext) return true;
    throw new Error('JSOM runtime loaded but SP.ClientContext is undefined (environment may block JSOM).');
  })();

  // Do not cache a rejection -- allow a later retry.
  _jsomReady.catch(() => { _jsomReady = null; });
  return _jsomReady;
}

// Promisified executeQueryAsync.
export function execQuery(ctx) {
  return new Promise((resolve, reject) => {
    ctx.executeQueryAsync(
      () => resolve(),
      (_sender, args) => reject(new Error(args?.get_message?.() || 'executeQueryAsync failed'))
    );
  });
}
