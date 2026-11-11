/* ============ estado del proyecto, persistencia e historial ============ */
import { W, L, M, STORE, STORE_V1, VERSION, uid, clone } from './util.js';
import { applyFormation, autoLinks } from './formations.js';

/** Estado global mutable. `P` es el proyecto (formato JSON compatible con la versión original). */
export const app = {
  P: null,
  cur: 0,            // slide actual
  step: 0,           // paso actual
  sel: new Set(),    // ids seleccionados (jugadoras, bocha o anotaciones)
  tool: 'move',
  linkFrom: null,
  fmt: 'v',          // formato del visor / exportación: 'v' 9:16, 'h' 16:9
};

/** Callbacks que registran los módulos de interfaz (evita imports circulares). */
export const hooks = {
  renderAll() {}, renderSlides() {}, renderSteps() {}, renderProps() {}, renderTools() {},
  draw() {}, updateThumb() {}, storageError() {}, history() {},
};

export const S = () => app.P.slides[app.cur];

/* ---------- creación ---------- */
export function blankSlide() {
  return { id: uid(), kicker: '', title: 'NUEVO SLIDE', accent: '', subtitle: '', camera: 'full', moveDur: 1.6, hold: .6, ents: [], links: [], steps: [{}], notes: '', shapes: [] };
}

export function defaultProject() {
  const s1 = blankSlide();
  Object.assign(s1, { kicker: 'NO ES SOLO UNA FORMACIÓN', title: 'ES UN SISTEMA', accent: 'SISTEMA', subtitle: 'ONCE JUGADORAS CONECTADAS', camera: 'full' });
  applyFormation(s1, 'home', '433'); autoLinks(s1);

  const s2 = blankSlide();
  Object.assign(s2, { kicker: 'ATRÁS', title: 'LA LÍNEA DE 4', accent: '4', subtitle: 'SE MUEVE JUNTA HACIA LA BOCHA', camera: 'full' });   // todos los slides por defecto en 'full' (misma cancha)
  applyFormation(s2, 'home', '433'); applyFormation(s2, 'away', '433');
  const H = l => s2.ents.find(e => e.team === 'home' && e.label === l);
  const A = r => s2.ents.find(e => e.team === 'away' && e.role === r);
  ['LI', 'CI', 'CD', 'LD'].forEach(l => H(l).hl = true);
  s2.links = [[H('LI').id, H('CI').id], [H('CI').id, H('CD').id], [H('CD').id, H('LD').id]];
  const ball = { id: uid(), type: 'ball', hl: false };
  s2.ents.push(ball);
  const st0 = s2.steps[0];
  st0[H('LI').id] = [10, 72]; st0[H('CI').id] = [21, 74]; st0[H('CD').id] = [34, 74]; st0[H('LD').id] = [45, 72];
  const car = A('PI').id; st0[car] = [33, 56]; st0[ball.id] = [34.6, 57.6];
  const st1 = clone(st0);
  s2.ents.filter(e => e.team === 'home' && !e.hl).forEach(e => st1[e.id] = [Math.min(W - 3, st1[e.id][0] + 5), st1[e.id][1] + 1]);
  st1[H('LI').id] = [19, 74]; st1[H('CI').id] = [30, 74.5]; st1[H('CD').id] = [40, 70]; st1[H('LD').id] = [47.5, 64];
  st1[car] = [47, 59]; st1[ball.id] = [48.3, 61];
  s2.steps.push(st1);
  s2.notes = 'La línea de 4 bascula hacia el lado de la bocha manteniendo distancias cortas.';
  return { version: VERSION, showTexts: false, showLinks: false, handle: '@MICLUB', homeColor: '#c8323c', awayColor: '#8e8e93', slides: [s1, s2] };
}

/* ---------- normalización / compatibilidad ---------- */
const SHAPES = ['arrow', 'zone', 'text'];
const num = (v, d, a = -Infinity, b = Infinity) => { if (v == null || v === '') return d; v = +v; return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const str = v => (v == null ? '' : String(v));
const isPt = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1]);
const pt = p => [+p[0], +p[1]];
const isColor = c => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);

function normalizeSlide(s, usedIds) {
  if (!s || typeof s !== 'object') s = {};
  let id = typeof s.id === 'string' && s.id ? s.id : uid();
  while (usedIds.has(id)) id = uid();
  usedIds.add(id);

  const ents = [], seen = new Set();
  for (const e of Array.isArray(s.ents) ? s.ents : []) {
    if (!e || typeof e !== 'object' || e.id == null) continue;
    const eid = String(e.id); if (seen.has(eid)) continue; seen.add(eid);
    const out = { ...e, id: eid, type: e.type === 'ball' ? 'ball' : 'player', hl: !!e.hl };
    if (out.type === 'player') { out.team = e.team === 'away' ? 'away' : 'home'; out.label = str(e.label); /* no se recorta: el editor limita a 4 al escribir, pero se respeta lo importado */ }
    ents.push(out);
  }
  // pasos: cada entidad necesita una posición en cada paso
  let steps = (Array.isArray(s.steps) ? s.steps : []).filter(st => st && typeof st === 'object' && !Array.isArray(st));
  if (!steps.length) steps = [{}];
  steps = steps.map(st => {
    const o = {};
    for (const e of ents) if (isPt(st[e.id])) o[e.id] = pt(st[e.id]);
    return o;
  });
  for (const e of ents) {
    let lastP = null;
    for (const st of steps) { if (st[e.id]) lastP = st[e.id]; else if (lastP) st[e.id] = [...lastP]; }
    const first = steps.find(st => st[e.id])?.[e.id] || [W / 2, L / 2];
    for (const st of steps) if (!st[e.id]) st[e.id] = [...first];
  }
  const links = [];
  for (const l of Array.isArray(s.links) ? s.links : []) {
    if (!Array.isArray(l) || l.length < 2) continue;
    const a = String(l[0]), b = String(l[1]);
    if (a !== b && seen.has(a) && seen.has(b) && !links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) links.push([a, b]);
  }
  const shapes = [];
  for (const sh of Array.isArray(s.shapes) ? s.shapes : []) {
    if (!sh || !SHAPES.includes(sh.kind) || !isPt(sh.a)) continue;
    const o = { id: typeof sh.id === 'string' && sh.id && !seen.has(sh.id) ? sh.id : uid(), kind: sh.kind, a: pt(sh.a),
      color: isColor(sh.color) ? sh.color : '#c8323c' };
    if (sh.kind === 'text') { o.text = str(sh.text) || 'TEXTO'; o.size = num(sh.size, 2.6, 1, 10); }
    else { if (!isPt(sh.b)) continue; o.b = pt(sh.b); o.dash = !!sh.dash; }
    seen.add(o.id);
    shapes.push(o);
  }
  const { yaw, ...rest } = s;   // 'yaw' (vista diagonal descartada) se ignora si viene en proyectos guardados
  return {
    ...rest, id,
    kicker: str(s.kicker), title: str(s.title), accent: str(s.accent), subtitle: str(s.subtitle),
    camera: 'full',   // cámara única: se conserva el campo por compatibilidad, siempre 'full' (migra 'action'/'side'/…)
    moveDur: num(s.moveDur, 1.6, .6, 4), hold: num(s.hold, .6, 0, 3),
    ents, links, steps,
    notes: str(s.notes), shapes,
  };
}

/** Valida y completa un proyecto (de la versión original o de esta). Lanza error si no es válido. */
export function normalizeProject(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.slides) || !d.slides.length) throw new Error('Proyecto inválido');
  const used = new Set();
  return {
    ...d,
    version: VERSION,
    showTexts: !!d.showTexts,
    showLinks: !!d.showLinks,   // opcional: conexiones entre jugadoras en visor/video/PNG/PDF (apagado por defecto)   // opcional: textos sobre la imagen en visor/video/PNG (apagado por defecto)
    handle: str(d.handle),
    homeColor: isColor(d.homeColor) ? d.homeColor : '#c8323c',
    awayColor: isColor(d.awayColor) ? d.awayColor : '#8e8e93',
    slides: d.slides.map(s => normalizeSlide(s, used)),
  };
}

/* ---------- persistencia ---------- */
let saveT = 0;
export function save() {
  clearTimeout(saveT);
  saveT = setTimeout(flushSave, 250);
}
export function flushSave() {
  clearTimeout(saveT);
  try { localStorage.setItem(STORE, JSON.stringify(app.P)); }
  catch (err) { hooks.storageError(err); }
}

/** Carga el proyecto guardado. Devuelve 'v2' | 'v1' (migrado) | 'nuevo', con sufijo '-rescate' si la clave v2 estaba dañada. */
export function loadInitial() {
  let raw = null;
  try { raw = localStorage.getItem(STORE); } catch {}
  let damaged = false;
  if (raw) {
    try { app.P = normalizeProject(JSON.parse(raw)); return 'v2'; }
    catch { damaged = true; }
  }
  let d1 = null;
  try { d1 = JSON.parse(localStorage.getItem(STORE_V1)); } catch {}
  if (d1) {
    try {
      app.P = normalizeProject(d1);
      flushSave();   // migración: se copia a la clave nueva, la vieja queda intacta
      return damaged ? 'v1-rescate' : 'v1';
    } catch {}
  }
  app.P = defaultProject();
  return damaged ? 'nuevo-rescate' : 'nuevo';
}

export function setProject(d) {
  app.P = d; app.cur = 0; app.step = 0; app.sel.clear(); app.linkFrom = null;
}

/* ---------- historial: deshacer / rehacer ---------- */
const hist = [], fut = [];
const LIMIT = 150;
export function snap() {
  hist.push(JSON.stringify(app.P));
  if (hist.length > LIMIT) hist.shift();
  fut.length = 0;
  hooks.history();
}
function restore(json) {
  app.P = JSON.parse(json);
  app.cur = Math.min(app.cur, app.P.slides.length - 1);
  app.step = Math.min(app.step, S().steps.length - 1);
  const ids = new Set(S().ents.map(e => e.id).concat(S().shapes.map(s => s.id)));
  for (const id of [...app.sel]) if (!ids.has(id)) app.sel.delete(id);
  app.linkFrom = null;
  hooks.renderAll(); save(); hooks.history();
}
export function undo() {
  if (!hist.length) return false;
  fut.push(JSON.stringify(app.P));
  restore(hist.pop());
  return true;
}
export function redo() {
  if (!fut.length) return false;
  hist.push(JSON.stringify(app.P));
  restore(fut.pop());
  return true;
}
export const canUndo = () => hist.length > 0;
export const canRedo = () => fut.length > 0;

/* ---------- operaciones sobre entidades ---------- */
export function addEnt(s, e, p) { s.ents.push(e); s.steps.forEach(st => st[e.id] = [...p]); }

/** Borra jugadoras/bocha/anotaciones por id (y sus conexiones). */
export function removeIds(s, ids) {
  ids = new Set(ids);
  s.ents = s.ents.filter(e => !ids.has(e.id));
  s.shapes = s.shapes.filter(x => !ids.has(x.id));
  s.links = s.links.filter(([a, b]) => !ids.has(a) && !ids.has(b));
  s.steps.forEach(st => ids.forEach(id => delete st[id]));
  ids.forEach(id => app.sel.delete(id));
  if (ids.has(app.linkFrom)) app.linkFrom = null;
}

export function nextLabel(s, team) {
  const used = new Set(s.ents.filter(e => e.team === team).map(e => e.label));
  for (let n = 1; ; n++) if (!used.has(String(n))) return String(n);
}

/** Cambia algo y propaga: guarda, redibuja y actualiza miniatura. */
export function changed() { save(); hooks.draw(); hooks.updateThumb(); }

export const FIELD_MIN = [-M + 1, -M + 1], FIELD_MAX = [W + M - 1, L + M - 1];
