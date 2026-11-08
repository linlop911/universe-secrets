(() => {
  const qualityFactors = { low: 0.35, medium: 0.65, high: 1 };
  let quality = 'high';
  try { quality = localStorage.getItem('cosmos-quality') || 'high'; } catch { /* local storage is optional */ }
  if (!(quality in qualityFactors)) quality = 'high';
  window.cosmosParticleFactor = qualityFactors[quality];
  // Subtract hidden time from the animation clock so resuming does not skip an epoch.
  let hiddenSince = document.hidden ? performance.now() : null;
  let hiddenDuration = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenSince = performance.now();
    else if (hiddenSince !== null) { hiddenDuration += performance.now() - hiddenSince; hiddenSince = null; }
  });
  window.cosmosAnimationTime = now => now - hiddenDuration - (hiddenSince === null ? 0 : now - hiddenSince);
  function showError(message) {
    let box = document.getElementById('render-error');
    if (!box) {
      box = document.createElement('div'); box.id = 'render-error'; box.setAttribute('role', 'alert');
      document.body.appendChild(box);
    }
    box.textContent = message;
  }
  window.addEventListener('error', event => {
    if (/WebGL|shader|program/i.test(event.message)) showError('渲染初始化失败：' + event.message);
  });
  document.addEventListener('DOMContentLoaded', () => {
    const bottom = document.querySelector('.bottom-bar');
    if (bottom && /(?:bigbang|cosmicweb|stellar|heatdeath)\.html$/.test(location.pathname)) {
      const label = document.createElement('label');
      label.className = 'quality-control'; label.textContent = '粒子质量 ';
      const select = document.createElement('select');
      select.setAttribute('aria-label', '粒子质量，修改后刷新页面');
      for (const [value, text] of [['low', '低'], ['medium', '中'], ['high', '高']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = text; select.appendChild(option);
      }
      select.value = quality; label.appendChild(select); bottom.appendChild(label);
      select.addEventListener('change', () => {
        try { localStorage.setItem('cosmos-quality', select.value); location.reload(); }
        catch { showError('浏览器未允许保存设置，无法切换粒子质量。'); }
      });
    }
    const canvas = document.getElementById('glcanvas');
    const chapter = location.pathname.split('/').pop();
    if (chapter === 'cosmicweb.html' || chapter === 'wormhole.html') {
      // These chapters have mouse handlers; translate direct canvas touch into the same drag path.
      canvas.style.touchAction = 'none';
      let pointerId = null;
      canvas.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse') return;
        pointerId = event.pointerId; canvas.setPointerCapture(pointerId);
        canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: event.clientX, clientY: event.clientY, bubbles: true }));
        event.preventDefault();
      });
      canvas.addEventListener('pointermove', event => {
        if (event.pointerId === pointerId) canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: event.clientX, clientY: event.clientY, bubbles: true }));
      });
      const stop = event => {
        if (event.pointerId !== pointerId) return;
        pointerId = null; canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      };
      canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
    }
    canvas?.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      const state = { path: location.pathname, values: {}, active: [] };
      document.querySelectorAll('input[type=range][id]').forEach(input => { state.values[input.id] = input.value; });
      document.querySelectorAll('button.active[id]').forEach(button => { if (button.id !== 'btn-audio') state.active.push(button.id); });
      try { sessionStorage.setItem('cosmos-restore', JSON.stringify(state)); } catch { /* best effort */ }
      showError('图形上下文已丢失，正在等待浏览器恢复。');
    });
    canvas?.addEventListener('webglcontextrestored', () => location.reload());
    try {
      const saved = JSON.parse(sessionStorage.getItem('cosmos-restore') || 'null');
      if (saved && saved.path === location.pathname) {
        sessionStorage.removeItem('cosmos-restore');
        for (const [id, value] of Object.entries(saved.values)) {
          const input = document.getElementById(id);
          if (input) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        for (const id of saved.active) {
          const button = document.getElementById(id);
          if (button && !button.classList.contains('active')) button.click();
        }
      }
    } catch { /* Session storage can be disabled. */ }
    const hud = document.getElementById('hud-layer');
    const restore = document.createElement('button');
    restore.id = 'restore-hud'; restore.textContent = '恢复控制界面'; restore.hidden = true;
    document.body.appendChild(restore);
    const sync = () => { restore.hidden = !hud.classList.contains('hud-hidden'); };
    new MutationObserver(sync).observe(hud, { attributes: true, attributeFilter: ['class'] });
    restore.addEventListener('click', () => { hud.classList.remove('hud-hidden'); document.getElementById('btn-toggle-hud')?.focus(); });
    document.querySelectorAll('input[type=range]').forEach(input => {
      const title = input.closest('.control-item')?.querySelector('.control-label span');
      if (title && !input.hasAttribute('aria-label')) input.setAttribute('aria-label', title.textContent.trim());
    });
    const modal = document.getElementById('modal-box');
    const open = document.getElementById('btn-modal');
    const close = document.getElementById('btn-close-modal');
    if (modal && open && close) {
      const notice = document.createElement('p');
      notice.textContent = '本页为观测与理论启发的程序化艺术演示：图像、数值与声音并非观测数据重建或严格数值求解。详细来源和模型范围见 README。';
      notice.style.cssText = 'padding:10px;margin:8px 0;color:#fff2c4;background:#594216;border-radius:6px';
      modal.querySelector('.modal-box')?.prepend(notice);
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', '科学资料');
      open.addEventListener('click', () => close.focus());
      close.addEventListener('click', () => open.focus());
      modal.addEventListener('click', event => { if (event.target === modal) open.focus(); });
      document.addEventListener('keydown', event => {
        if (!modal.classList.contains('open')) return;
        if (event.key === 'Escape') { close.click(); event.preventDefault(); }
        if (event.key === 'Tab') {
          const focusable = [...modal.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
          if (!focusable.length) return;
          if (event.shiftKey && document.activeElement === focusable[0]) { focusable.at(-1).focus(); event.preventDefault(); }
          else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { focusable[0].focus(); event.preventDefault(); }
        }
      });
    }
  });
})();
