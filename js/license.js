// AutoShorts Pro and the free weekly export allowance.
// Pro is sold as Microsoft Store add-ons through the Digital Goods API (Store-installed app only).
// Product IDs below must match the add-on "Product ID" (InAppOfferToken) created in Partner Center.

import { kvGet, kvSet } from './db.js';
import { isoWeekKey, nextMonday } from './util.js';
import { N_, t, uiLocale } from './i18n.js';

export const PRODUCTS = [
  { id: 'autoshorts_pro_lifetime', label: N_('Pro forever'), note: N_('One-time purchase') },
  { id: 'autoshorts_pro_yearly', label: N_('Pro yearly'), note: N_('Renews every year') },
  { id: 'autoshorts_pro_monthly', label: N_('Pro monthly'), note: N_('Renews every month') },
];
export const FREE_EXPORTS_PER_WEEK = 3;
const STORE_BILLING = 'https://store.microsoft.com/billing';
const listeners = new Set();

const state = {
  pro: false,
  source: 'none', // none | store | cache | dev
  storeAvailable: false,
  details: [],
  checkedAt: 0,
  graceUntil: 0,
};

export const license = {
  get pro() {
    return state.pro;
  },
  get storeAvailable() {
    return state.storeAvailable;
  },
  get details() {
    return state.details;
  },
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function emit() {
  for (const fn of listeners) fn({ ...state });
}

async function service() {
  if (!('getDigitalGoodsService' in window)) return null;
  try {
    return await withTimeout(window.getDigitalGoodsService(STORE_BILLING), 8000);
  } catch {
    return null;
  }
}

export async function initLicense() {
  // developer override for local testing only
  const local = /^(localhost|127\.0\.0\.1|192\.0\.2\.\d+)$/.test(location.hostname);
  if (local && new URLSearchParams(location.search).get('pro') === '1') {
    state.pro = true;
    state.source = 'dev';
    emit();
    return;
  }
  const cached = await kvGet('license', null);
  if (cached && cached.pro) {
    state.pro = true;
    state.source = 'cache';
  }
  emit();
  // check the Store in the background so a slow or offline Store never delays start-up
  refreshLicense();
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

export async function refreshLicense() {
  const svc = await service();
  state.storeAvailable = !!svc;
  if (!svc) {
    emit();
    return state;
  }
  const ids = PRODUCTS.map((p) => p.id);
  try {
    state.details = (await withTimeout(svc.getDetails(ids), 10000)) || [];
  } catch {
    /* prices unavailable right now */
  }
  try {
    const purchases = await withTimeout(svc.listPurchases(), 10000);
    const owned = (purchases || []).some((p) => ids.includes(p.itemId));
    // right after a purchase the Store can take a moment to list it: don't take Pro away then
    if (owned || Date.now() > state.graceUntil) {
      state.pro = owned;
      state.source = owned ? 'store' : 'none';
      state.checkedAt = Date.now();
      await kvSet('license', { pro: owned, at: state.checkedAt });
    }
  } catch (e) {
    // offline or Store busy: keep the last known state
    console.warn('License check failed', e);
  }
  emit();
  return state;
}

export async function purchase(itemId) {
  const svc = await service();
  if (!svc) throw new Error(t('Purchases are available in the Microsoft Store version of AutoShorts.'));
  const methods = [{ supportedMethods: STORE_BILLING, data: { sku: itemId } }];
  let request;
  try {
    request = new PaymentRequest(methods);
  } catch {
    request = new PaymentRequest(methods, { total: { label: 'AutoShorts Pro', amount: { currency: 'USD', value: '0' } } });
  }
  const response = await request.show();
  try {
    await response.complete('success');
  } catch {
    /* some hosts complete automatically */
  }
  // the payment went through: unlock now and confirm with the Store in the background
  state.pro = true;
  state.source = 'store';
  state.graceUntil = Date.now() + 15 * 60 * 1000;
  await kvSet('license', { pro: true, at: Date.now() });
  emit();
  refreshLicense();
  return true;
}

export function priceOf(itemId) {
  const d = state.details.find((x) => x.itemId === itemId);
  if (!d || !d.price) return '';
  try {
    return new Intl.NumberFormat(uiLocale(), { style: 'currency', currency: d.price.currency }).format(Number(d.price.value));
  } catch {
    return `${d.price.value} ${d.price.currency}`;
  }
}

// ---------------------------------------------------------------- weekly allowance

export async function quota() {
  const week = isoWeekKey();
  const rec = (await kvGet('exportQuota', null)) || { week, used: 0 };
  const used = rec.week === week ? rec.used : 0;
  return { used, limit: FREE_EXPORTS_PER_WEEK, left: Math.max(0, FREE_EXPORTS_PER_WEEK - used), resets: nextMonday() };
}

export async function recordExport() {
  if (state.pro) return;
  const week = isoWeekKey();
  const rec = (await kvGet('exportQuota', null)) || { week, used: 0 };
  const used = rec.week === week ? rec.used + 1 : 1;
  await kvSet('exportQuota', { week, used });
  emit();
}

export function resetText(date) {
  const days = Math.max(1, Math.round((date - new Date()) / 86400000));
  return days <= 1 ? t('Resets tomorrow') : t('Resets in {n} days', { n: days });
}

/** Free items are always usable; everything else needs Pro. */
export const allowed = (item) => !!(item && (item.free || state.pro));
