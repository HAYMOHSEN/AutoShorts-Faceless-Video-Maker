// AutoShorts Pro dialog: what Pro adds, Store prices, purchase and restore.

import { h, icon, modal, toast } from './ui.js';
import { license, PRODUCTS, purchase, refreshLicense, priceOf, FREE_EXPORTS_PER_WEEK } from './license.js';
import { VOICES } from './tts.js';
import { LOOKS } from './visuals.js';
import { CAPTION_STYLES } from './captions.js';
import { MOODS } from './music.js';
import { t, N_ } from './i18n.js';

// After the app is live, replace with its Store link (Partner Center → Product identity → Store ID).
export const STORE_URL = 'https://apps.microsoft.com/search?query=AutoShorts';

const REASONS = {
  hd: N_('Full HD exports are part of Pro.'),
  export: N_('You’ve used this week’s free exports.'),
  voices: N_('This voice is part of Pro.'),
  looks: N_('This look is part of Pro.'),
  captions: N_('This caption style is part of Pro.'),
  music: N_('This music mood is part of Pro.'),
};

export function openPro(reason = '') {
  const count = (list) => list.filter((x) => x.free).length;
  const rows = [
    [t('Exports'), t('{n} a week', { n: FREE_EXPORTS_PER_WEEK }), t('Unlimited')],
    [t('Resolution'), '720p', t('1080p Full HD')],
    [t('Watermark'), t('Small mark'), t('None')],
    [t('AI voices'), String(count(VOICES)), String(VOICES.length)],
    [t('Looks'), String(count(LOOKS)), String(LOOKS.length)],
    [t('Caption styles'), String(count(CAPTION_STYLES)), String(CAPTION_STYLES.length)],
    [t('Music moods'), String(count(MOODS)), String(MOODS.length)],
    [t('Your media and stock footage'), '✓', '✓'],
    [t('Made on your PC, nothing uploaded'), '✓', '✓'],
  ];
  const table = h(
    'table',
    { class: 'compare' },
    h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: t('Free') }), h('th', { text: t('Pro') }))),
    h('tbody', {}, ...rows.map(([a, b, c]) => h('tr', {}, h('td', { text: a }), h('td', { text: b }), h('td', { class: 'yes', text: c }))))
  );
  const plans = h('div', { class: 'plans' });
  const status = h('p', { class: 'hint' });
  const body = h('div', { style: { display: 'grid', gap: '18px' } }, reason && REASONS[reason] ? h('p', { class: 'lead', text: t(REASONS[reason]) }) : null, table, plans, status);

  const dlg = modal({
    title: license.pro ? t('You have AutoShorts Pro') : 'AutoShorts Pro',
    body,
    actions: [
      {
        label: t('Restore purchases'),
        icon: 'refresh',
        onClick: async () => {
          status.textContent = t('Checking your purchases…');
          await refreshLicense();
          status.textContent = license.pro ? t('Pro is active on this PC.') : license.storeAvailable ? t('No Pro purchase found for this Microsoft account.') : t('Purchases are checked in the Microsoft Store version of the app.');
          renderPlans();
        },
      },
      { label: t('Close'), onClick: (c) => c() },
    ],
  });

  function renderPlans() {
    plans.replaceChildren();
    if (license.pro) {
      plans.append(h('div', { class: 'note' }, h('strong', { text: t('Pro is active') }), h('span', { text: t('Thanks for supporting AutoShorts. Unlimited HD exports with no watermark.') })));
      return;
    }
    if (!license.storeAvailable) {
      plans.append(
        h('div', { class: 'note' }, h('strong', { text: t('Get Pro from the Microsoft Store') }), h('span', { text: t('Pro is bought inside the Microsoft Store version of AutoShorts, with your Microsoft account.') }), h('div', { class: 'row' }, h('a', { class: 'btn primary small', href: STORE_URL, target: '_blank', rel: 'noopener' }, icon('external', 14), t('Open the Microsoft Store'))))
      );
      return;
    }
    const available = PRODUCTS.filter((p) => license.details.some((d) => d.itemId === p.id));
    if (!available.length) {
      plans.append(h('p', { class: 'hint', text: t('Pro options are loading from the Microsoft Store. Try again in a moment.') }));
      return;
    }
    for (const p of available) {
      const d = license.details.find((x) => x.itemId === p.id);
      const b = h('button', { class: 'plan' }, h('b', { text: d.title || t(p.label) }), h('span', { class: 'price', text: priceOf(p.id) }), h('small', { text: t(p.note) }));
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const ok = await purchase(p.id);
          if (ok) {
            toast(t('Welcome to AutoShorts Pro'));
            dlg.close();
          } else status.textContent = t('The purchase did not complete.');
        } catch (e) {
          if (e && e.name !== 'AbortError') status.textContent = e.message || t('The purchase did not complete.');
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
