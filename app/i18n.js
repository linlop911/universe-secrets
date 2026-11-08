/* Runtime language layer: zh / en / ja. Static copy is translated by text and attribute lookup; new nodes are translated as they appear. */
(() => {
  'use strict';
  const LANGS = ['zh', 'en', 'ja'];
  const params = new URLSearchParams(location.search);
  const query = params.get('lang');
  const preferred = String(navigator.language || '').toLowerCase();
  const lang = LANGS.includes(query) ? query : preferred.startsWith('ja') ? 'ja' : preferred.startsWith('en') ? 'en' : 'zh';
  const ui = window.CosmicContent.ui[lang];
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);

  function text(source) {
    return ui.text[source] || source;
  }

  function applyNode(node) {
    if (node.parentElement && skip.has(node.parentElement.tagName)) return;
    const value = node.nodeValue;
    const trimmed = value.trim();
    if (!trimmed) return;
    const translated = ui.text[trimmed];
    if (translated === undefined || translated === trimmed) return;
    node.nodeValue = value.replace(trimmed, translated);
  }

  function applyAttributes() {
    for (const element of document.querySelectorAll('[aria-label],[title],[alt],[placeholder]')) {
      for (const attribute of ['aria-label', 'title', 'alt', 'placeholder']) {
        const value = element.getAttribute(attribute);
        if (value && ui.text[value.trim()] !== undefined) element.setAttribute(attribute, ui.text[value.trim()]);
      }
    }
  }

  function apply() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement && skip.has(node.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) applyNode(node);
    applyAttributes();
  }

  function withLang(code) {
    const url = new URL(location.href);
    url.searchParams.set('lang', code);
    return url.href;
  }

  function buildSwitcher() {
    const bar = document.querySelector('.system-controls');
    if (!bar) return;
    const nav = document.createElement('nav');
    nav.className = 'language-switch interactive';
    nav.setAttribute('aria-label', lang === 'zh' ? '语言' : lang === 'ja' ? '言語' : 'Language');
    for (const code of LANGS) {
      const link = document.createElement('a');
      link.href = withLang(code);
      link.textContent = code === 'zh' ? '中' : code === 'en' ? 'EN' : '日';
      link.hreflang = code === 'zh' ? 'zh-CN' : code;
      if (code === lang) link.className = 'active';
      nav.append(link);
    }
    bar.append(nav);
    for (const link of document.querySelectorAll('a.nav-tab')) link.href = withLang(lang);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    buildSwitcher();
    if (lang === 'zh') return;
    document.title = text(document.title);
    queueMicrotask(apply);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') applyNode(record.target);
        else for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) applyNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) applyNode(walker.currentNode);
          }
        }
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
})();
