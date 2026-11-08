// Node.js 22+ (built-in WebSocket); browser override: EDGE_PATH or CHROME_PATH.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const http = require('node:http');

const pages = ['index.html', 'bigbang.html', 'cosmicweb.html', 'stellar.html', 'wormhole.html', 'heatdeath.html'];
const browser = process.env.EDGE_PATH || process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const timeoutMs = Number(process.env.TEST_TIMEOUT_MS || 30000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(fn, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function run() {
  if (typeof WebSocket !== 'function') throw new Error('Node.js 22 or newer is required (built-in WebSocket).');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmos-audit-'));
  let proc, ws, server, baseUrl;
  const results = [];
  try {
    if (process.env.TEST_USE_HTTP === '1') {
      server = http.createServer((req, res) => {
        const filename = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
        if (!pages.concat(['common.js', 'common.css']).includes(filename)) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
        fs.createReadStream(path.join(__dirname, filename)).pipe(res);
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}/`;
    }
    const pageUrl = name => baseUrl ? new URL(name, baseUrl).href : pathToFileURL(path.join(__dirname, name)).href;
    proc = spawn(browser, ['--headless=new', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
    let launchError;
    proc.on('error', err => { launchError = err; });
    const port = await waitFor(() => {
      if (launchError) throw launchError;
      if (proc.exitCode !== null) throw new Error(`Browser exited with code ${proc.exitCode}`);
      try { return fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { return null; }
    }, 'browser debugging port');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const target = targets.find(t => t.type === 'page');
    if (!target) throw new Error('No browser page target');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('WebSocket connection failed')); });
    let id = 0;
    const pending = new Map();
    let pageErrors = [];
    let externalRequests = [];
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails.text);
      if (msg.method === 'Network.requestWillBeSent' && /^https?:/i.test(msg.params.request.url) && !(baseUrl && msg.params.request.url.startsWith(baseUrl))) externalRequests.push(msg.params.request.url);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, timer } = pending.get(msg.id);
        clearTimeout(timer); pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
    ws.onclose = () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Browser debugging connection closed')); } pending.clear(); };
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const current = ++id;
        const timer = setTimeout(() => { pending.delete(current); reject(new Error(`Timed out: ${method}`)); }, timeoutMs);
        pending.set(current, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: current, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    }
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 640, deviceScaleFactor: 1, mobile: false });
    for (const name of pages) {
      try {
        pageErrors = [];
        externalRequests = [];
        await send('Page.navigate', { url: pageUrl(name) });
        await waitFor(async () => {
          try { return await evaluate(`document.readyState === "complete" && decodeURIComponent(location.pathname).endsWith(${JSON.stringify('/' + name)}) && !!document.getElementById("glcanvas") && document.getElementById("glcanvas").width > 0`); } catch { return false; }
        }, `${name} readiness`);
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        const data = await evaluate(`(() => {
          const canvas = document.getElementById('glcanvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          const links = [...document.querySelectorAll('.nav-tab')].map(a => a.getAttribute('href'));
          const errors = [];
          if (!gl) errors.push('WebGL unavailable');
          if (!canvas.width || !canvas.height) errors.push('Canvas has zero dimensions');
          for (const p of ${JSON.stringify(pages)}) if (!links.includes(p)) errors.push('Missing navigation: ' + p);
          if (!document.getElementById('btn-audio')) errors.push('Missing audio button');
          if (!document.getElementById('audio-canvas')) errors.push('Missing audio canvas');
          const modal = document.getElementById('modal-box');
          document.getElementById('btn-modal')?.click();
          if (!modal?.classList.contains('open')) errors.push('Modal did not open');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          if (modal?.classList.contains('open')) errors.push('Modal did not close');
          document.getElementById('btn-toggle-hud')?.click();
          if (!document.getElementById('hud-layer')?.classList.contains('hud-hidden')) errors.push('HUD did not hide');
          document.getElementById('restore-hud')?.click();
          if (document.getElementById('hud-layer')?.classList.contains('hud-hidden')) errors.push('HUD did not restore');
          for (const input of document.querySelectorAll('input[type=range]')) {
            if (!input.getAttribute('aria-label') && !input.labels?.length) errors.push('Unlabelled slider: ' + input.id);
          }
          if (${JSON.stringify(name)} === 'heatdeath.html') {
            const slider = document.getElementById('param-w');
            slider.value = '-0.8'; slider.dispatchEvent(new Event('input', { bubbles: true }));
            if (!document.getElementById('val-w').textContent.includes('主导：加速')) errors.push('w=-0.8 classification failed');
          }
          const glError = gl ? gl.getError() : null;
          if (glError) errors.push('WebGL error: ' + glError);
          return { width: canvas.width, height: canvas.height, glError, errors, audio: 'UI elements checked; audio output not tested' };
        })()`);
        data.frameTimes = await evaluate(`new Promise(resolve => { const times = []; let last; function sample(now) { if (last !== undefined) times.push(now-last); last=now; if (times.length < 12) requestAnimationFrame(sample); else resolve(times); } requestAnimationFrame(sample); })`);
        data.audioGraph = await evaluate(`(async () => {
          const button = document.getElementById('btn-audio');
          button.click(); await new Promise(resolve => setTimeout(resolve, 120));
          const first = masterGain;
          const ctxState = audioCtx?.state || 'missing';
          const hasAnalyser = !!analyser;
          button.click(); button.click();
          const reused = masterGain === first;
          button.click();
          return { ctxState, hasAnalyser, reused };
        })()`);
        if (data.audioGraph.ctxState !== 'running' || !data.audioGraph.hasAnalyser || !data.audioGraph.reused) data.errors.push('Audio graph start or reuse failed');
        data.viewportChecks = [];
        for (const [width, height] of [[360,800], [390,844], [768,1024], [1920,1080]]) {
          await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
          const layout = await evaluate(`(() => { const button = document.getElementById('btn-modal').getBoundingClientRect(); const nav = document.querySelector('.nav-tab').getBoundingClientRect(); return { button: {x: button.x, y: button.y, width: button.width, height: button.height}, nav: {x: nav.x, y: nav.y, width: nav.width, height: nav.height}, scrollWidth: document.documentElement.scrollWidth }; })()`);
          const visible = rect => rect.width > 0 && rect.height > 0 && rect.x < width && rect.x + rect.width > 0 && rect.y < height && rect.y + rect.height > 0;
          const passed = visible(layout.button) && visible(layout.nav) && layout.scrollWidth <= width;
          data.viewportChecks.push({ width, height, passed });
          if (!passed) data.errors.push(`Viewport ${width}x${height}: navigation or modal trigger outside viewport`);
        }
        await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 640, deviceScaleFactor: 1, mobile: false });
        if (name === 'cosmicweb.html' || name === 'wormhole.html') {
          await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
          const before = await evaluate('camPhi');
          await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 480, y: 300 }] });
          await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 540, y: 320 }] });
          await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          const after = await evaluate('camPhi');
          await send('Emulation.setTouchEmulationEnabled', { enabled: false });
          data.touchDrag = { before, after };
          if (Math.abs(after - before) < 0.05) data.errors.push('Emulated touch drag did not rotate camera');
        }
        if (externalRequests.length) data.errors.push('Unexpected network requests: ' + externalRequests.join(', '));
        data.errors.push(...pageErrors.map(e => `Uncaught exception: ${e}`));
        results.push({ name, passed: data.errors.length === 0, ...data });
      } catch (error) { results.push({ name, passed: false, errors: [error.message] }); }
      console.log(`${results.at(-1).passed ? 'PASS' : 'FAIL'} ${name}`, results.at(-1).errors.join('; '));
    }
    // Inject failures before page scripts execute, then verify that initialization stops with a visible diagnostic.
    for (const probe of [
      { name: 'injected-webgl-unavailable', source: `const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /^(experimental-)?webgl/.test(type) ? null : get.call(this, type, ...args); };`, expected: 'WebGL unavailable' },
      { name: 'injected-shader-error', source: `const source = WebGLRenderingContext.prototype.shaderSource; WebGLRenderingContext.prototype.shaderSource = function(shader, code) { return source.call(this, shader, 'invalid shader syntax'); };`, expected: 'Shader compile' }
    ]) {
      try {
        const script = await send('Page.addScriptToEvaluateOnNewDocument', { source: probe.source });
        await send('Page.navigate', { url: pageUrl('index.html') });
        const message = await waitFor(async () => {
          try { return await evaluate(`document.getElementById('render-error')?.textContent || ''`); } catch { return ''; }
        }, probe.name);
        await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier });
        const passed = message.includes(probe.expected);
        results.push({ name: probe.name, passed, errors: passed ? [] : [message] });
      } catch (error) { results.push({ name: probe.name, passed: false, errors: [error.message] }); }
      console.log(`${results.at(-1).passed ? 'PASS' : 'FAIL'} ${probe.name}`, results.at(-1).errors.join('; '));
    }
    try {
      await send('Page.navigate', { url: pageUrl('index.html') });
      await waitFor(async () => { try { return await evaluate(`document.readyState === 'complete' && !!document.getElementById('param-mass') && !document.getElementById('render-error')`); } catch { return false; } }, 'context recovery setup');
      const supported = await evaluate(`(() => {
        const input = document.getElementById('param-mass'); input.value = '63'; input.dispatchEvent(new Event('input', { bubbles: true }));
        const ext = document.getElementById('glcanvas').getContext('webgl').getExtension('WEBGL_lose_context');
        if (!ext) return false;
        ext.loseContext(); setTimeout(() => ext.restoreContext(), 300); return true;
      })()`);
      if (!supported) throw new Error('WEBGL_lose_context unavailable');
      await waitFor(async () => { try { return await evaluate(`!!document.getElementById('render-error') && !!sessionStorage.getItem('cosmos-restore')`); } catch { return false; } }, 'context loss');
      await waitFor(async () => { try { return await evaluate(`document.getElementById('param-mass')?.value === '63' && !sessionStorage.getItem('cosmos-restore') && !document.getElementById('render-error')`); } catch { return false; } }, 'context restoration and state recovery');
      results.push({ name: 'context-restoration', passed: true, errors: [] });
    } catch (error) { results.push({ name: 'context-restoration', passed: false, errors: [error.message] }); }
    console.log(`${results.at(-1).passed ? 'PASS' : 'FAIL'} context-restoration`, results.at(-1).errors.join('; '));
  } finally {
    if (ws) ws.close();
    if (proc && proc.exitCode === null) {
      proc.kill();
      await Promise.race([new Promise(resolve => proc.once('exit', resolve)), delay(5000)]);
    }
    if (server) await new Promise(resolve => server.close(resolve));
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await delay(250); }
    }
  }
  const report = { timestamp: new Date().toISOString(), browser, mode: baseUrl ? 'http' : 'file', results, skipped: ['Pixel baseline and scientific accuracy', 'Audible output', 'Physical-device touch', 'GPU performance baseline'] };
  fs.writeFileSync(path.join(__dirname, baseUrl ? 'test-results-http.json' : 'test-results.json'), JSON.stringify(report, null, 2) + '\n');
  if (results.length !== pages.length + 3 || results.some(r => !r.passed)) process.exitCode = 1;
}
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
