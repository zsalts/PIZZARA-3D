/* ============ editor 2D: interacción sobre la cancha ============ */
import { W, L, clamp, uid, clone, readPrefs, writePrefs } from './util.js';
import { app, S, hooks, snap, changed, addEnt, removeIds, nextLabel, FIELD_MIN, FIELD_MAX } from './state.js';
import { hasLink } from './formations.js';
import { drawScene2D, shapeBox } from './cancha.js';

let cv, cx, lay = null, mouse = null, raf = 0;
export const view = { z: 1, x: 0, y: 0 };
export const prefs = { paths: !!readPrefs().paths };
/** Estilo para las anotaciones nuevas (se actualiza al editar una). */
export const shapeStyle = { color: '#ffffff', dash: false };   // blanco: se lee sobre la cancha azul

let drag = null;          // gesto en curso
let spaceDown = false;
let clip = null, pasteN = 0;
let lastNudge = 0;

const cl = p => [clamp(p[0], FIELD_MIN[0], FIELD_MAX[0]), clamp(p[1], FIELD_MIN[1], FIELD_MAX[1])];
const pxToM = px => px / (lay?.sc || 1);

/* ---------- dibujo ---------- */
export function draw() {
  if (raf || !cv) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const dpr = devicePixelRatio || 1, r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (cv.width !== Math.round(r.width*dpr) || cv.height !== Math.round(r.height*dpr)) { cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr); }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--cv').trim() || '#e9e2d8';
    cx.fillRect(0, 0, r.width, r.height);
    const single = app.sel.size === 1 ? S().shapes.find(x => app.sel.has(x.id)) : null;
    lay = drawScene2D(cx, app.P, S(), app.step, { x: 16, y: 16, w: r.width - 32, h: r.height - 32 }, {
      sel: app.sel, linkFrom: app.linkFrom, mouse: app.tool === 'link' ? mouse : null,
      view, paths: prefs.paths, draft: drag?.kind === 'draw' ? drag.shape : null, handles: !!single,
    });
    if (drag?.kind === 'marquee') {
      const [a, b] = [drag.a, drag.b], X = q => lay.ox + q*lay.sc, Y = q => lay.oy + q*lay.sc;
      cx.fillStyle = 'rgba(255,255,255,.1)'; cx.strokeStyle = '#ffffff'; cx.lineWidth = 1; cx.setLineDash([4, 3]);
      const x0 = X(Math.min(a[0], b[0])), y0 = Y(Math.min(a[1], b[1]));
      cx.fillRect(x0, y0, Math.abs(b[0] - a[0])*lay.sc, Math.abs(b[1] - a[1])*lay.sc);
      cx.strokeRect(x0, y0, Math.abs(b[0] - a[0])*lay.sc, Math.abs(b[1] - a[1])*lay.sc);
      cx.setLineDash([]);
    }
    hooks.zoomLabel?.(Math.round(view.z * 100));
  });
}

/* ---------- hit testing ---------- */
const toField = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - lay.ox) / lay.sc, (e.clientY - r.top - lay.oy) / lay.sc]; };

function hitEnt(m) {
  const s = S(), pos = s.steps[app.step];
  const rad = Math.max(2.2, 10 / lay.sc);
  const ord = [...s.ents].sort((a, b) => (b.type === 'ball') - (a.type === 'ball'));
  for (const e of ord) {
    const p = pos[e.id]; if (!p) continue;
    if (Math.hypot(p[0] - m[0], p[1] - m[1]) < (e.type === 'ball' ? rad*.7 : rad)) return e;
  }
  return null;
}
function segDist(m, A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx*dx + dy*dy || 1;
  const t = clamp(((m[0] - A[0])*dx + (m[1] - A[1])*dy) / l2);
  return Math.hypot(A[0] + t*dx - m[0], A[1] + t*dy - m[1]);
}
function hitLink(m) {
  const s = S(), pos = s.steps[app.step];
  return s.links.findIndex(([a, b]) => { const A = pos[a], B = pos[b]; return A && B && segDist(m, A, B) < Math.max(1.2, pxToM(6)); });
}
function hitShape(m) {
  const s = S(), tol = Math.max(1.2, pxToM(7));
  // de arriba hacia abajo: textos, flechas, zonas
  const order = { text: 0, arrow: 1, zone: 2 };
  for (const sh of [...s.shapes].sort((a, b) => order[a.kind] - order[b.kind])) {
    if (sh.kind === 'arrow' && segDist(m, sh.a, sh.b) < tol) return sh;
    if (sh.kind !== 'arrow') { const [x0, y0, x1, y1] = shapeBox(sh); if (m[0] > x0 - .5 && m[0] < x1 + .5 && m[1] > y0 - .5 && m[1] < y1 + .5) return sh; }
  }
  return null;
}
function hitHandle(m) {
  if (app.sel.size !== 1) return null;
  const sh = S().shapes.find(x => app.sel.has(x.id));
  if (!sh || sh.kind === 'text') return null;
  const tol = Math.max(1, pxToM(9));
  for (const key of ['b', 'a']) if (Math.hypot(sh[key][0] - m[0], sh[key][1] - m[1]) < tol) return { sh, key };
  return null;
}

/* ---------- puntero ---------- */
function onDown(e) {
  if (!lay) return;
  cv.focus({ preventScroll: true });
  const m = toField(e), s = S();
  if (e.button === 1 || spaceDown || app.tool === 'pan') {
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; e.preventDefault(); return;
  }
  if (e.button !== 0) return;
  const tool = app.tool;
  if (tool === 'move') {
    const h = hitHandle(m);
    if (h) { drag = { kind: 'handle', sh: h.sh, key: h.key, snapped: false }; cv.setPointerCapture(e.pointerId); return; }
    const hit = hitEnt(m) || hitShape(m);
    if (hit) {
      if (e.shiftKey) { app.sel.has(hit.id) ? app.sel.delete(hit.id) : app.sel.add(hit.id); }
      else if (!app.sel.has(hit.id)) { app.sel.clear(); app.sel.add(hit.id); }
      if (app.sel.has(hit.id)) startMove(m, e);
    } else {
      if (!e.shiftKey) app.sel.clear();
      drag = { kind: 'marquee', a: m, b: m, base: new Set(app.sel) };
      cv.setPointerCapture(e.pointerId);
    }
    hooks.renderProps();
  } else if (tool === 'link') {
    const hit = hitEnt(m);
    if (hit && hit.type === 'player') {
      if (!app.linkFrom) app.linkFrom = hit.id;
      else if (app.linkFrom !== hit.id) {
        snap();
        const a = app.linkFrom, b = hit.id;
        if (hasLink(s, a, b)) s.links = s.links.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)));
        else s.links.push([a, b]);
        app.linkFrom = hit.id; changed();
      }
    } else app.linkFrom = null;
  } else if (tool === 'home' || tool === 'away') {
    const hit = hitEnt(m);
    if (hit) { app.sel.clear(); app.sel.add(hit.id); app.tool = 'move'; hooks.renderTools(); hooks.renderProps(); }
    else {
      snap();
      const ent = { id: uid(), type: 'player', team: tool, label: nextLabel(s, tool), hl: false };
      addEnt(s, ent, cl(m)); app.sel.clear(); app.sel.add(ent.id); changed(); hooks.renderProps(); hooks.renderSlides();
    }
  } else if (tool === 'erase') {
    const hit = hitEnt(m) || hitShape(m);
    if (hit) { snap(); removeIds(s, [hit.id]); changed(); hooks.renderProps(); hooks.renderTools(); }
    else { const li = hitLink(m); if (li >= 0) { snap(); s.links.splice(li, 1); changed(); } }
  } else if (tool === 'arrow' || tool === 'zone') {
    drag = { kind: 'draw', shape: { id: uid(), kind: tool, a: cl(m), b: cl(m), color: shapeStyle.color, dash: tool === 'zone' ? true : shapeStyle.dash } };
    cv.setPointerCapture(e.pointerId);
  } else if (tool === 'text') {
    const hit = hitShape(m);
    if (hit && hit.kind === 'text') { app.sel.clear(); app.sel.add(hit.id); }
    else {
      snap();
      const sh = { id: uid(), kind: 'text', a: cl(m), text: 'TEXTO', color: shapeStyle.color, size: 2.6 };
      s.shapes.push(sh); app.sel.clear(); app.sel.add(sh.id); changed();
    }
    app.tool = 'move'; hooks.renderTools(); hooks.renderProps();
    // evitar que el navegador devuelva el foco a la cancha después del pointerdown:
    // si no, escribir en el texto dispararía atajos (B, E, P, R, X, ⌫…)
    e.preventDefault();
    setTimeout(() => hooks.focusShapeText?.(), 0);
  }
  draw();
}

function startMove(m, e) {
  const s = S(), pos = s.steps[app.step], orig = new Map();
  for (const id of app.sel) {
    if (pos[id]) orig.set(id, [...pos[id]]);
    else { const sh = s.shapes.find(x => x.id === id); if (sh) orig.set(id, { a: [...sh.a], b: sh.b ? [...sh.b] : null }); }
  }
  drag = { kind: 'move', start: m, orig, snapped: false };
  cv.setPointerCapture(e.pointerId);
}

function onMove(e) {
  if (!lay) return;
  const m = toField(e); mouse = m;
  if (drag?.kind === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; draw(); return; }
  if (drag?.kind === 'move') {
    const dx = m[0] - drag.start[0], dy = m[1] - drag.start[1];
    if (!drag.snapped) { if (Math.hypot(dx, dy) * lay.sc < 2) return; snap(); drag.snapped = true; }
    const s = S(), pos = s.steps[app.step];
    for (const [id, o] of drag.orig) {
      if (Array.isArray(o)) pos[id] = cl([o[0] + dx, o[1] + dy]);
      else { const sh = s.shapes.find(x => x.id === id); if (!sh) continue; sh.a = cl([o.a[0] + dx, o.a[1] + dy]); if (o.b) sh.b = cl([o.b[0] + dx, o.b[1] + dy]); }
    }
    draw(); return;
  }
  if (drag?.kind === 'handle') {
    if (!drag.snapped) { snap(); drag.snapped = true; }
    drag.sh[drag.key] = cl(m); draw(); return;
  }
  if (drag?.kind === 'draw') { drag.shape.b = cl(m); draw(); return; }
  if (drag?.kind === 'marquee') {
    drag.b = m;
    const x0 = Math.min(drag.a[0], m[0]), x1 = Math.max(drag.a[0], m[0]), y0 = Math.min(drag.a[1], m[1]), y1 = Math.max(drag.a[1], m[1]);
    const inR = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    const s = S(), pos = s.steps[app.step];
    app.sel = new Set(drag.base);
    for (const ent of s.ents) if (pos[ent.id] && inR(pos[ent.id])) app.sel.add(ent.id);
    for (const sh of s.shapes) { const b = shapeBox(sh); if (inR([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2])) app.sel.add(sh.id); }
    draw(); return;
  }
  // cursor
  const tool = app.tool;
  if (spaceDown || tool === 'pan') cv.style.cursor = 'grab';
  else if (tool === 'move') cv.style.cursor = hitHandle(m) ? 'move' : (hitEnt(m) || hitShape(m)) ? 'grab' : 'default';
  else if (tool === 'erase') cv.style.cursor = (hitEnt(m) || hitShape(m) || hitLink(m) >= 0) ? 'pointer' : 'default';
  else if (tool === 'text') cv.style.cursor = 'text';
  else cv.style.cursor = 'crosshair';
  if (tool === 'link') draw();
}

function onUp() {
  const d = drag; drag = null;
  if (!d) return;
  if (d.kind === 'pan') { cv.style.cursor = spaceDown || app.tool === 'pan' ? 'grab' : 'default'; return; }
  if (d.kind === 'move' || d.kind === 'handle') { if (d.snapped) { changed(); hooks.renderProps(); } return; }
  if (d.kind === 'marquee') { hooks.renderProps(); draw(); return; }
  if (d.kind === 'draw') {
    const sh = d.shape, len = Math.hypot(sh.b[0] - sh.a[0], sh.b[1] - sh.a[1]);
    if (sh.kind === 'arrow' ? len > 1.5 : Math.abs(sh.b[0] - sh.a[0]) > 1.5 && Math.abs(sh.b[1] - sh.a[1]) > 1.5) {
      snap(); S().shapes.push(sh); app.sel.clear(); app.sel.add(sh.id); changed(); hooks.renderProps();
    } else draw();
  }
}

/* ---------- zoom / pan ---------- */
export function zoomAt(mx, my, f) {
  if (!lay) return;
  const fx = (mx - lay.ox) / lay.sc, fy = (my - lay.oy) / lay.sc;
  const z = clamp(view.z * f, .5, 6), sc = lay.base * z, b = lay.box;
  view.z = z;
  view.x = (mx - fx*sc) - (b.x + (b.w - W*sc) / 2);
  view.y = (my - fy*sc) - (b.y + (b.h - L*sc) / 2);
  draw();
}
export function zoomBy(f) { const r = cv.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }
export function fitView() { view.z = 1; view.x = 0; view.y = 0; draw(); }
export function setSpace(on) { spaceDown = on; if (cv) cv.style.cursor = on ? 'grab' : 'default'; }
export function setPaths(on) { prefs.paths = on; writePrefs({ paths: on }); draw(); }

/* ---------- selección / portapapeles / teclado ---------- */
export function selectAll() {
  const s = S(); app.sel = new Set(s.ents.map(e => e.id).concat(s.shapes.map(x => x.id)));
  hooks.renderProps(); draw();
}
export function clearSel() { app.sel.clear(); app.linkFrom = null; if (drag?.kind === 'draw') drag = null; hooks.renderProps(); draw(); }

export function copySel() {
  const s = S(); if (!app.sel.size) return 0;
  const pos = s.steps[app.step];
  const ents = s.ents.filter(e => app.sel.has(e.id)).map(e => ({ e: clone(e), p: [...pos[e.id]] }));
  const ids = new Set(ents.map(x => x.e.id));
  clip = {
    ents, shapes: clone(s.shapes.filter(x => app.sel.has(x.id))),
    links: s.links.filter(([a, b]) => ids.has(a) && ids.has(b)).map(l => [...l]),
    from: s.id,
  };
  pasteN = 0;
  return ents.length + clip.shapes.length;
}
export function paste() {
  if (!clip || !(clip.ents.length + clip.shapes.length)) return 0;
  const s = S();
  // la única entidad copiada es una bocha y este slide ya tiene una → nada que pegar
  if (!clip.shapes.length && clip.ents.every(x => x.e.type === 'ball') && s.ents.some(e => e.type === 'ball')) return -1;
  snap();
  const same = clip.from === s.id;
  const off = same ? 2 * ++pasteN : 0;
  const map = {};
  app.sel.clear();
  const hasBall = s.ents.some(e => e.type === 'ball');
  for (const { e, p } of clip.ents) {
    if (e.type === 'ball' && hasBall) continue;   // una sola bocha por slide
    const n = { ...clone(e), id: uid() }; map[e.id] = n.id;
    addEnt(s, n, cl([p[0] + off, p[1] + off])); app.sel.add(n.id);
  }
  for (const sh of clip.shapes) {
    const n = { ...clone(sh), id: uid(), a: cl([sh.a[0] + off, sh.a[1] + off]) };
    if (sh.b) n.b = cl([sh.b[0] + off, sh.b[1] + off]);
    s.shapes.push(n); app.sel.add(n.id);
  }
  for (const [a, b] of clip.links) if (map[a] && map[b]) s.links.push([map[a], map[b]]);
  changed(); hooks.renderProps(); hooks.renderSlides(); hooks.renderTools();
  return app.sel.size;
}
export function deleteSel() {
  if (!app.sel.size) return 0;
  const n = app.sel.size;
  snap(); removeIds(S(), [...app.sel]); changed(); hooks.renderProps(); hooks.renderTools(); hooks.renderSlides();
  return n;
}
export function cutSel() { const n = copySel(); if (n) { deleteSel(); clip.from = null; } return n; }
export function duplicateSel() { if (!copySel()) return 0; return paste(); }

export function nudge(dx, dy) {
  if (!app.sel.size) return false;
  const now = performance.now();
  if (now - lastNudge > 700) snap();
  lastNudge = now;
  const s = S(), pos = s.steps[app.step];
  for (const id of app.sel) {
    if (pos[id]) pos[id] = cl([pos[id][0] + dx, pos[id][1] + dy]);
    else { const sh = s.shapes.find(x => x.id === id); if (sh) { sh.a = cl([sh.a[0] + dx, sh.a[1] + dy]); if (sh.b) sh.b = cl([sh.b[0] + dx, sh.b[1] + dy]); } }
  }
  changed();
  return true;
}

/* ---------- init ---------- */
export function initEditor(canvas) {
  cv = canvas; cx = cv.getContext('2d');
  new ResizeObserver(draw).observe(cv);
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('pointerleave', () => { if (app.tool === 'link') { mouse = null; draw(); } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    // pellizco (ctrl) o rueda vertical → zoom; desplazamiento horizontal de trackpad o shift → pan
    if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(e.deltaX) < 1)) {
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018)));
    } else { view.x -= e.shiftKey ? e.deltaY : e.deltaX; view.y -= e.shiftKey ? 0 : e.deltaY; draw(); }
  }, { passive: false });
  cv.addEventListener('dblclick', e => {
    if (!lay) return;
    const m = toField(e), h = hitEnt(m);
    if (h && h.type === 'player') { app.sel.clear(); app.sel.add(h.id); hooks.renderProps(); setTimeout(() => hooks.focusLabel?.(), 0); draw(); return; }
    const sh = hitShape(m);
    if (sh?.kind === 'text') { app.sel.clear(); app.sel.add(sh.id); hooks.renderProps(); setTimeout(() => hooks.focusShapeText?.(), 0); draw(); }
  });
}
