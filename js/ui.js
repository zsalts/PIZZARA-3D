/* ============ UI genérica: toasts, diálogos, tema ============ */
import { $, THEME_KEY } from './util.js';
import { hooks } from './state.js';

/* ---------- toasts (reemplazan a alert) ---------- */
export function toast(msg, type = 'info', ms = 3200) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.textContent = msg;
  box.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  const kill = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 250); };
  const tm = setTimeout(kill, ms);
  t.onclick = () => { clearTimeout(tm); kill(); };
  return t;
}

/* ---------- diálogos ---------- */
export function openDialog(id) {
  const d = document.getElementById(id);
  if (!d.open) d.showModal();
  return d;
}
export function closeDialog(id) { const d = document.getElementById(id); if (d.open) d.close(); }
export const anyDialogOpen = () => !!document.querySelector('dialog[open]');

/** Confirmación accesible (reemplaza a confirm). Devuelve Promise<boolean>. */
export function confirmDialog(msg, { ok = 'Aceptar', danger = false } = {}) {
  const d = $('#dlgConfirm');
  $('#cfMsg').textContent = msg;
  const okB = $('#cfOk');
  okB.textContent = ok; okB.classList.toggle('danger', danger);
  d.returnValue = '';
  d.showModal();
  okB.focus();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
}

/* ---------- tema claro / oscuro / automático ---------- */
const THEMES = ['auto', 'light', 'dark'];
const THEME_TXT = { auto: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: oscuro' };
const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
let theme = 'auto';
function applyTheme() {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme; else root.dataset.theme = theme;
  const b = $('#bTheme');
  if (b) { b.textContent = THEME_ICON[theme]; b.title = THEME_TXT[theme]; b.setAttribute('aria-label', THEME_TXT[theme]); }
  hooks.draw();
}
export function initTheme() {
  try { theme = localStorage.getItem(THEME_KEY) || 'auto'; } catch {}
  if (!THEMES.includes(theme)) theme = 'auto';
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => hooks.draw());
  $('#bTheme').onclick = () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    applyTheme(); toast(THEME_TXT[theme]);
  };
}
