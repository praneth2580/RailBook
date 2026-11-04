// Prepended to the packaged launcher by scripts/package-desktop.mjs, ahead of everything else in the bundle.
// pkg's Node runtime is built without the inspector. Playwright, which WRAITH drives, requires it when it loads but only
// uses it for page.pause(), so hand it a stand-in when the real one is missing.
;(() => {
  const Module = require('node:module')
  const stub = {
    url: () => undefined,
    open() {},
    close() {},
    waitForDebugger() {},
    Session: class {
      connect() {}
      post() {}
      disconnect() {}
    },
  }
  const load = Module._load
  Module._load = function (request, ...rest) {
    if (request !== 'inspector' && request !== 'node:inspector') return load.call(this, request, ...rest)
    try {
      return load.call(this, request, ...rest)
    } catch {
      return stub
    }
  }
})()
