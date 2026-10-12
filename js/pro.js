// AutoShorts Pro dialog: what Pro adds, Store prices, purchase and restore.

import { h, icon, modal, toast } from './ui.js';
import { license, PRODUCTS, purchase, refreshLicense, priceOf, FREE_EXPORTS_PER_WEEK } from './license.js';
import { VOICES } from './tts.js';
import { LOOKS } from './visuals.js';
import { CAPTION_STYLES } from './captions.js';
import { MOODS } from './music.js';

// After the app is live, replace with its Store link (Partner Center → Product identity → Store ID).
export const STORE_URL = 'https://apps.microsoft.com/search?query=AutoShorts';

const REASONS = {
  hd: 'Full HD exports are part of Pro.',
  export: 'You’ve used this week’s free exports.',
  voices: 'This voice is part of Pro.',
  looks: 'This look is part of Pro.',
  captions: 'This caption style is part of Pro.',
  music: 'This music mood is part of Pro.',
};

export function openPro(reason = '') {
  const count = (list) => list.filter((x) => x.free).length;
  const rows = [
    ['Exports', `${FREE_EXPORTS_PER_WEEK} a week`, 'Unlimited'],
    ['Resolution', '720p', '1080p Full HD'],
    ['Watermark', 'Small mark', 'None'],
    ['AI voices', String(count(VOICES)), String(VOICES.length)],
    ['Looks', String(count(LOOKS)), String(LOOKS.length)],
    ['Caption styles', String(count(CAPTION_STYLES)), String(CAPTION_STYLES.length)],
    ['Music moods', String(count(MOODS)), String(MOODS.length)],
    ['Your media and stock footage', '✓', '✓'],
    ['Made on your PC, nothing uploaded', '✓', '✓'],
  ];
  const table = h(
    'table',
    { class: 'compare' },
    h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: 'Free' }), h('th', { text: 'Pro' }))),
    h('tbody', {}, ...rows.map(([a, b, c]) => h('tr', {}, h('td', { text: a }), h('td', { text: b }), h('td', { class: 'yes', text: c }))))
  );
  const plans = h('div', { class: 'plans' });
  const status = h('p', { class: 'hint' });
  const body = h('div', { style: { display: 'grid', gap: '18px' } }, reason && REASONS[reason] ? h('p', { class: 'lead', text: REASONS[reason] }) : null, table, plans, status);

  const dlg = modal({
    title: license.pro ? 'You have AutoShorts Pro' : 'AutoShorts Pro',
    body,
    actions: [
      {
        label: 'Restore purchases',
        icon: 'refresh',
        onClick: async () => {
          status.textContent = 'Checking your purchases…';
          await refreshLicense();
          status.textContent = license.pro ? 'Pro is active on this PC.' : license.storeAvailable ? 'No Pro purchase found for this Microsoft account.' : 'Purchases are checked in the Microsoft Store version of the app.';
          renderPlans();
        },
      },
      { label: 'Close', onClick: (c) => c() },
    ],
  });

  function renderPlans() {
    plans.replaceChildren();
    if (license.pro) {
      plans.append(h('div', { class: 'note' }, h('strong', { text: 'Pro is active' }), h('span', { text: 'Thanks for supporting AutoShorts. Unlimited HD exports with no watermark.' })));
      return;
    }
    if (!license.storeAvailable) {
      plans.append(
        h('div', { class: 'note' }, h('strong', { text: 'Get Pro from the Microsoft Store' }), h('span', { text: 'Pro is bought inside the Microsoft Store version of AutoShorts, with your Microsoft account.' }), h('div', { class: 'row' }, h('a', { class: 'btn primary small', href: STORE_URL, target: '_blank', rel: 'noopener' }, icon('external', 14), 'Open the Microsoft Store')))
      );
      return;
    }
    const available = PRODUCTS.filter((p) => license.details.some((d) => d.itemId === p.id));
    if (!available.length) {
      plans.append(h('p', { class: 'hint', text: 'Pro options are loading from the Microsoft Store. Try again in a moment.' }));
      return;
    }
    for (const p of available) {
      const d = license.details.find((x) => x.itemId === p.id);
      const b = h('button', { class: 'plan' }, h('b', { text: d.title || p.label }), h('span', { class: 'price', text: priceOf(p.id) }), h('small', { text: p.note }));
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const ok = await purchase(p.id);
          if (ok) {
            toast('Welcome to AutoShorts Pro');
            dlg.close();
          } else status.textContent = 'The purchase did not complete.';
        } catch (e) {
          if (e && e.name !== 'AbortError') status.textContent = e.message || 'The purchase did not complete.';
        }
        b.disabled = false;
      });
      plans.append(b);
    }
  }
  renderPlans();
  refreshLicense().then(renderPlans);
  return dlg;
}
