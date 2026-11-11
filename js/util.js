/* ============ constantes y utilidades compartidas ============ */
export const W = 55, L = 91.4, M = 4;          // ancho, largo (m), margen alrededor
// cancha azul de hockey: fondo de escena azul profundo, área exterior azul marino, superficie azul sintético
export const BG = '#0f2440', GROUND = '#163e73', SURFACE = '#1e5aa8', LINE = 'rgba(255,255,255,.92)';
export const STORE = 'pizarra-hockey-v2';       // clave actual de localStorage
export const STORE_V1 = 'pizarra-hockey-v1';    // clave de la versión original (se migra)
export const THEME_KEY = 'pizarra-hockey-theme';
export const PREFS_KEY = 'pizarra-hockey-prefs';
export const VERSION = 2;

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clone = o => JSON.parse(JSON.stringify(o));
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
export function writePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...p })); } catch {}
}
