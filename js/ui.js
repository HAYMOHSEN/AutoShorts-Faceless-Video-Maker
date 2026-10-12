// Tiny DOM helpers, icons, dialogs and toasts.

import { t } from './i18n.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ---------------------------------------------------------------- icons (24px stroke icons)

const ICONS = {
  play: '<path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 011-1h10"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  voice: '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  wand: '<path d="M4 20L15 9M14 4v3M18 6l-2 2M20 10h-3M15 9l1 1"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  record: '<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  safe: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M6 17h12M14 7h4"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 011-1h11"/>',
  dots: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z"/>',
};

// icons that point somewhere are mirrored in right-to-left languages
const DIRECTIONAL = new Set(['back']);

export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.className = DIRECTIONAL.has(name) ? 'ico rtl-flip' : 'ico';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

// ---------------------------------------------------------------- toasts

export function toast(message, { action, onAction, timeout = 4200, kind = '' } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, h('span', { text: message }));
  if (action) {
    el.append(
      h('button', {
        class: 'btn ghost small',
        text: action,
        on: {
          click: () => {
            onAction && onAction();
            close();
          },
        },
      })
    );
  }
  host.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let timer = setTimeout(close, timeout);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => (timer = setTimeout(close, 1800)));
  function close() {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 220);
  }
  return close;
}

// ---------------------------------------------------------------- dialogs

let openCount = 0;

export function modal({ title, body, actions = [], onClose, size = '', dismissable = true, className = '' }) {
  const prevFocus = document.activeElement;
  const titleId = 'dlg-' + Math.random().toString(36).slice(2, 8);
  const panel = h('div', { class: `dialog ${size} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
  const head = h('div', { class: 'dialog-head' }, h('h2', { id: titleId, text: title }));
  if (dismissable) head.append(h('button', { class: 'btn icon ghost', 'aria-label': t('Close'), on: { click: () => close() } }, icon('x')));
  const foot = h('div', { class: 'dialog-foot' });
  const bodyWrap = h('div', { class: 'dialog-body' }, body);
  panel.append(head, bodyWrap, foot);
  const backdrop = h('div', { class: 'backdrop' }, panel);
  const setActions = (list) => {
    clear(foot);
    for (const a of list) {
      foot.append(
        h(
          'button',
          {
            class: `btn ${a.kind || 'ghost'}`,
            disabled: !!a.disabled,
            on: { click: () => a.onClick && a.onClick(close) },
          },
          a.icon ? icon(a.icon) : null,
          a.label
        )
      );
    }
    foot.hidden = !list.length;
  };
  setActions(actions);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop && dismissable) close();
  });
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      close();
    }
    if (e.key === 'Tab') trapFocus(e, panel);
  };
  document.addEventListener('keydown', onKey, true);
  // a dialog belongs to the screen it was opened on: moving to another screen closes it
  const onRoute = () => close();
  window.addEventListener('hashchange', onRoute);
  document.body.append(backdrop);
  openCount++;
  document.body.classList.add('has-dialog');
  requestAnimationFrame(() => {
    backdrop.classList.add('in');
    const f = panel.querySelector('[autofocus], .dialog-body input, .dialog-body textarea, .dialog-body button, .dialog-foot .btn.primary');
    (f || panel).focus && (f || panel).focus();
  });
  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', onRoute);
    backdrop.classList.remove('in');
    setTimeout(() => backdrop.remove(), 180);
    openCount--;
    if (!openCount) document.body.classList.remove('has-dialog');
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    onClose && onClose(result);
  }
  return { close, panel, body: bodyWrap, setActions, setTitle: (text) => (head.querySelector('h2').textContent = text) };
}

function trapFocus(e, root) {
  const els = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function confirmDialog(message, { title = t('Are you sure?'), okLabel = t('Confirm'), danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    modal({
      title,
      size: 'small',
      body: h('p', { class: 'lead', text: message }),
      actions: [
        { label: t('Cancel'), onClick: (close) => close() },
        {
          label: okLabel,
          kind: danger ? 'danger' : 'primary',
          onClick: (close) => {
            result = true;
            close();
          },
        },
      ],
      onClose: () => resolve(result),
    });
  });
}

// ---------------------------------------------------------------- controls

/** Segmented control. options: [{value, label, locked, title}] */
export function seg(options, value, onChange, { label, className = '' } = {}) {
  const wrap = h('div', { class: `seg ${className}`, role: 'radiogroup', 'aria-label': label || '' });
  const render = (v) => {
    clear(wrap);
    for (const o of options) {
      const b = h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(o.value === v),
          title: o.title || null,
          class: o.locked ? 'locked' : '',
          on: {
            click: () => {
              onChange(o.value, o);
            },
          },
        },
        o.icon ? icon(o.icon, 16) : null,
        o.label,
        o.locked ? icon('lock', 13) : null
      );
      wrap.append(b);
    }
  };
  render(value);
  wrap.set = render;
  wrap.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const btns = [...wrap.querySelectorAll('button')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    // the arrow keys follow the reading direction (reversed in Arabic)
    const forward = (e.key === 'ArrowRight') !== (getComputedStyle(wrap).direction === 'rtl');
    const n = btns[(i + (forward ? 1 : btns.length - 1)) % btns.length];
    n.focus();
    e.preventDefault();
  });
  return wrap;
}

export function toggle(labelText, checked, onChange, { hint } = {}) {
  const id = 'tg-' + Math.random().toString(36).slice(2, 8);
  const input = h('input', { type: 'checkbox', id, class: 'switch', checked: !!checked, on: { change: (e) => onChange(e.target.checked) } });
  return h('label', { class: 'toggle', for: id }, input, h('span', { class: 'toggle-text' }, h('span', { text: labelText }), hint ? h('small', { text: hint }) : null));
}

export function slider(labelText, value, { min = 0, max = 1, step = 0.01, format = (v) => v, onInput, onChange } = {}) {
  const out = h('output', { text: format(value) });
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    value,
    on: {
      input: (e) => {
        out.textContent = format(+e.target.value);
        onInput && onInput(+e.target.value);
      },
      change: (e) => onChange && onChange(+e.target.value),
    },
  });
  return h('label', { class: 'slider' }, h('span', { class: 'slider-head' }, h('span', { text: labelText }), out), input);
}

export function field(labelText, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: labelText }), control, hint ? h('small', { class: 'hint', text: hint }) : null);
}

export function autosize(ta) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 2 + 'px';
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('Copied to clipboard'));
  } catch {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(t('Copied to clipboard'));
  }
}

export function pickFiles({ accept = '*/*', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve([...input.files]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export async function saveBlob(blob, filename, { description = 'File', mime, ext } = {}) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: mime && ext ? [{ description, accept: { [mime]: [ext] } }] : undefined,
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return 'saved';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // fall through to a regular download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 4000);
  return 'downloaded';
}
