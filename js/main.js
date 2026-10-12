// App shell: service worker, app bar, routing between the Hub and the Editor.

import { h, icon, toast, clear } from './ui.js';
import { requestPersistence, kvGet, kvSet } from './db.js';
import { cleanupStorage } from './project.js';
import { initLicense, license, quota } from './license.js';
import { renderHub } from './hub.js';
import { renderEditor } from './editor.js';
import { openSettings } from './settings.js';
import { openPro } from './pro.js';
import { loadFonts } from './fonts.js';
import { initI18n, t, tx } from './i18n.js';

const view = document.getElementById('view');
const bar = document.getElementById('appbar');
let disposeView = null;
let routeToken = 0;

// ---------------------------------------------------------------- service worker
// The worker caches the app for offline use and adds cross-origin isolation headers, which lets the
// on-device voice engine use several CPU threads. On the very first visit we reload once so the
// page runs under the worker.
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    if (!reg) return;
    if (!navigator.serviceWorker.controller) {
      const reloaded = sessionStorage.getItem('as-sw-reload');
      const worker = reg.installing || reg.waiting || reg.active;
      const reload = () => {
        if (!reloaded) {
          sessionStorage.setItem('as-sw-reload', '1');
          location.reload();
        }
      };
      if (worker && worker.state === 'activated') reload();
      else if (worker) worker.addEventListener('statechange', () => worker.state === 'activated' && reload());
    }
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw &&
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast(t('A new version of AutoShorts is ready.'), { action: t('Restart'), onAction: () => location.reload(), timeout: 12000 });
          }
        });
    });
  } catch (e) {
    console.warn('Service worker registration failed', e);
  }
}

// ---------------------------------------------------------------- app bar
function renderBar() {
  clear(bar);
  const brand = h('button', { class: 'brand', 'aria-label': t('AutoShorts home'), on: { click: () => navigate('#/') } }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), 'AutoShorts');
  const q = h('span', { class: 'quota' });
  const proBtn = license.pro
    ? h('button', { class: 'btn small pro', on: { click: () => openPro() } }, icon('crown', 14), t('Pro'))
    : h('button', { class: 'btn small pro', on: { click: () => openPro() } }, icon('crown', 14), t('Get Pro'));
  const settings = h('button', { class: 'btn icon ghost', 'aria-label': t('Settings'), title: t('Settings'), on: { click: () => openSettings() } }, icon('settings', 19));
  bar.append(brand, h('span', { class: 'spacer' }), q, proBtn, settings);
  if (!license.pro) {
    quota().then((x) => {
      q.replaceChildren(...tx('{left} of {limit} free exports left this week', { left: h('b', { text: String(x.left) }), limit: x.limit, n: x.limit }));
    });
  } else q.textContent = t('Unlimited HD exports');
}

// ---------------------------------------------------------------- routing
export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  const token = ++routeToken;
  if (disposeView) {
    try {
      disposeView();
    } catch (e) {
      console.warn(e);
    }
    disposeView = null;
  }
  // each route renders into its own container, so a slow page that finishes after the user has
  // already moved on can't add itself next to the current one
  const host = h('div', { class: 'route' });
  view.replaceChildren(host);
  const m = location.hash.match(/^#\/edit\/([\w-]+)/);
  const ctx = { navigate, openPro };
  let dispose;
  try {
    if (m) {
      document.title = `AutoShorts — ${t('Editor')}`;
      dispose = await renderEditor(host, m[1], ctx);
    } else {
      document.title = `AutoShorts – ${t('Faceless Video Maker')}`;
      dispose = await renderHub(host, ctx);
    }
  } catch (e) {
    console.error(e);
    if (token === routeToken) {
      host.replaceChildren(
        h('div', { class: 'hub' }, h('div', { class: 'empty' }, h('strong', { text: t('This page could not be opened') }), h('span', { text: t(e.message || String(e)) }), h('button', { class: 'btn', on: { click: () => navigate('#/') } }, t('Back to my videos'))))
      );
    }
    return;
  }
  if (token !== routeToken) {
    dispose && dispose();
    host.remove();
    return;
  }
  disposeView = dispose;
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- housekeeping
// Once a day, shortly after start, remove voice lines that no video uses any more.
function scheduleCleanup() {
  setTimeout(async () => {
    try {
      const last = (await kvGet('lastCleanup', 0)) || 0;
      if (Date.now() - last < 20 * 3600 * 1000) return;
      await kvSet('lastCleanup', Date.now());
      const r = await cleanupStorage();
      if (r.removed) console.info(`AutoShorts: removed ${r.removed} unused voice lines and tracks`);
    } catch (e) {
      console.warn('Storage cleanup failed', e);
    }
  }, 20000);
}

// ---------------------------------------------------------------- boot
async function boot() {
  registerSW();
  requestPersistence();
  await initI18n();
  await loadFonts();
  await initLicense();
  renderBar();
  license.on(renderBar);
  document.addEventListener('open-settings', (e) => openSettings(e.detail || ''));
  document.addEventListener('quota-changed', renderBar);
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => toast(t('Back online')));
  window.addEventListener('offline', () => toast(t('You’re offline. Everything already downloaded keeps working.')));
  await route();
  document.body.classList.add('ready');
  scheduleCleanup();
}

boot().catch((e) => {
  console.error(e);
  view.replaceChildren(h('div', { class: 'hub' }, h('div', { class: 'empty' }, h('strong', { text: t('AutoShorts could not start') }), h('span', { text: e.message || String(e) }))));
});
