/* ============ cancha: textura compartida 2D/3D y dibujo de escena 2D ============ */
import { W, L, M, GROUND, SURFACE, LINE } from './util.js';

function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const PX = 22;
// colores pensados para leerse sobre la cancha azul
export const LINK = 'rgba(255,255,255,.85)', LINK_3D = '#f3f6fb';
const SEL = '#ffffff';
/** true si el color hex es claro (para elegir el halo del texto). */
export function isLight(hex) {
  const h = hex.replace('#', ''), f = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

/** Imagen de la cancha (se usa en el editor, miniaturas y como textura del visor 3D). */
export const pitchImg = (() => {
  const c = document.createElement('canvas');
  c.width = (W + 2*M) * PX; c.height = (L + 2*M) * PX;
  const x = c.getContext('2d');
  x.scale(PX, PX);
  x.fillStyle = GROUND; x.fillRect(0, 0, W + 2*M, L + 2*M);
  x.translate(M, M);
  const r = rng(11);
  x.fillStyle = SURFACE; x.fillRect(0, 0, W, L);
  for (let y = 0; y < L; y += 1.5) {
    const k = r();
    // franjas sutiles del sintético: algo más claras o más oscuras que la base
    x.fillStyle = k < .5 ? `rgba(120,180,255,${.04 + k*.1})` : `rgba(5,25,60,${(k - .5) * .16})`;
    x.fillRect(0, y, W, 1.5);
    x.fillStyle = 'rgba(8,30,70,.18)'; x.fillRect(0, y, W, .045);
    let px = -r() * 9;
    while (px < W) { px += 6 + r() * 9; x.fillRect(px, y, .045, 1.5); }
  }
  x.strokeStyle = LINE; x.lineWidth = .2;
  x.strokeRect(0, 0, W, L);
  const ln = (a, b, c2, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); };
  ln(0, L/2, W, L/2); ln(0, 22.9, W, 22.9); ln(0, L - 22.9, W, L - 22.9);
  const arcD = R => {
    const xl = W/2 - 1.83, xr = W/2 + 1.83;
    x.beginPath(); x.moveTo(xl - R, 0);
    x.arc(xl, 0, R, Math.PI, Math.PI/2, true); x.lineTo(xr, R);
    x.arc(xr, 0, R, Math.PI/2, 0, true); x.stroke();
  };
  for (const bottom of [false, true]) {
    x.save();
    if (bottom) { x.translate(0, L); x.scale(1, -1); }
    arcD(14.63);
    x.setLineDash([.9, .9]); arcD(19.63); x.setLineDash([]);
    x.fillStyle = LINE; x.beginPath(); x.arc(W/2, 6.475, .22, 0, 7); x.fill();
    x.lineWidth = .16; x.strokeRect(W/2 - 1.83, -1.2, 3.66, 1.2);
    x.lineWidth = .2;
    x.restore();
  }
  return c;
})();

/* ---------- flechas ---------- */
function arrowHead(ctx, ex, ey, ux, uy, size) {
  ctx.beginPath();
  ctx.moveTo(ex + ux*size*.2, ey + uy*size*.2);
  ctx.lineTo(ex - ux*size - uy*size*.6, ey - uy*size + ux*size*.6);
  ctx.lineTo(ex - ux*size + uy*size*.6, ey - uy*size - ux*size*.6);
  ctx.closePath(); ctx.fill();
}

/** Bounding box de una anotación (en metros). */
export function shapeBox(sh) {
  if (sh.kind === 'text') {
    const h = sh.size || 2.6, w = Math.max(1, (sh.text || '').length) * h * .62;
    return [sh.a[0] - w/2, sh.a[1] - h/2, sh.a[0] + w/2, sh.a[1] + h/2];
  }
  return [Math.min(sh.a[0], sh.b[0]), Math.min(sh.a[1], sh.b[1]), Math.max(sh.a[0], sh.b[0]), Math.max(sh.a[1], sh.b[1])];
}

/**
 * Dibuja anotaciones libres (flechas, zonas, textos).
 * X/Y convierten metros a píxeles; sc = píxeles por metro.
 */
export function drawShapes(ctx, shapes, X, Y, sc, o = {}) {
  if (!shapes?.length) return;
  const order = { zone: 0, arrow: 1, text: 2 };
  const list = [...shapes].sort((a, b) => order[a.kind] - order[b.kind]);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const sh of list) {
    const col = sh.color || '#c8323c';
    if (sh.kind === 'zone') {
      const [x0, y0, x1, y1] = shapeBox(sh);
      const rx = X(x0), ry = Y(y0), rw = (x1 - x0) * sc, rh = (y1 - y0) * sc;
      ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, Math.min(rw, rh, 1.6*sc) / 2);
      ctx.globalAlpha = .2; ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = .85; ctx.strokeStyle = col; ctx.lineWidth = o.thumb ? .6 : Math.max(1.5, .22*sc);
      ctx.setLineDash(sh.dash ? [Math.max(4, .8*sc), Math.max(4, .6*sc)] : []);
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    } else if (sh.kind === 'arrow') {
      const ax = X(sh.a[0]), ay = Y(sh.a[1]), bx = X(sh.b[0]), by = Y(sh.b[1]);
      const d = Math.hypot(bx - ax, by - ay); if (d < 1) continue;
      const ux = (bx - ax) / d, uy = (by - ay) / d, hs = o.thumb ? 3 : Math.max(9, 1.3*sc);
      ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = o.thumb ? .8 : Math.max(2.2, .38*sc);
      ctx.setLineDash(sh.dash ? [Math.max(6, 1*sc), Math.max(5, .8*sc)] : []);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx - ux*hs*.7, by - uy*hs*.7); ctx.stroke(); ctx.setLineDash([]);
      arrowHead(ctx, bx, by, ux, uy, hs);
    } else if (sh.kind === 'text') {
      const fs = (sh.size || 2.6) * sc;
      if (o.thumb && fs < 3) continue;
      ctx.font = `800 ${fs}px Montserrat`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, fs * .22); ctx.strokeStyle = isLight(col) ? 'rgba(8,24,52,.75)' : 'rgba(255,255,255,.85)';
      ctx.strokeText(sh.text || '', X(sh.a[0]), Y(sh.a[1]));
      ctx.fillStyle = col; ctx.fillText(sh.text || '', X(sh.a[0]), Y(sh.a[1]));
    }
  }
  // selección
  if (o.sel?.size && !o.thumb) {
    for (const sh of shapes) {
      if (!o.sel.has(sh.id)) continue;
      const [x0, y0, x1, y1] = shapeBox(sh), pad = 6;
      ctx.strokeStyle = SEL; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.strokeRect(X(x0) - pad, Y(y0) - pad, (x1 - x0)*sc + 2*pad, (y1 - y0)*sc + 2*pad);
      ctx.setLineDash([]);
      if (o.handles && sh.kind !== 'text') {
        for (const p of [sh.a, sh.b]) {
          ctx.fillStyle = SEL; ctx.strokeStyle = '#0f2440'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.rect(X(p[0]) - 5, Y(p[1]) - 5, 10, 10); ctx.fill(); ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

/**
 * Dibuja un slide en 2D.
 * proj: proyecto (colores) · s: slide · si: paso · box: {x,y,w,h} en píxeles
 * o: { thumb, sel:Set, linkFrom, mouse, view:{z,x,y}, paths, draft, handles }
 */
export function drawScene2D(ctx, proj, s, si, box, o = {}) {
  const v = o.view || { z: 1, x: 0, y: 0 };
  const sc = Math.min(box.w / (W + 2*M), box.h / (L + 2*M)) * v.z;
  const ox = box.x + (box.w - W*sc) / 2 + v.x, oy = box.y + (box.h - L*sc) / 2 + v.y;
  ctx.drawImage(pitchImg, ox - M*sc, oy - M*sc, (W + 2*M)*sc, (L + 2*M)*sc);
  const X = q => ox + q*sc, Y = q => oy + q*sc;
  const pos = s.steps[si], prev = si > 0 ? s.steps[si - 1] : null;
  const R = Math.max(1.75*sc, o.thumb ? 1.6 : 8);
  const colOf = e => e.team === 'away' ? proj.awayColor : proj.homeColor;
  const sel = o.sel || new Set();

  // anotaciones libres (debajo de las jugadoras)
  drawShapes(ctx, s.shapes, X, Y, sc, { thumb: o.thumb, sel, handles: o.handles });
  if (o.draft) drawShapes(ctx, [o.draft], X, Y, sc, {});

  // recorrido completo hasta el paso actual (opcional)
  if (o.paths && si > 0 && !o.thumb) {
    ctx.save(); ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]); ctx.globalAlpha = .55;
    for (const e of s.ents) {
      ctx.strokeStyle = e.type === 'ball' ? '#fff' : colOf(e);
      ctx.beginPath();
      for (let k = 0; k <= si; k++) { const p = s.steps[k][e.id]; if (!p) continue; k ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])); }
      ctx.stroke();
      for (let k = 0; k < si - 1; k++) { const p = s.steps[k][e.id]; if (!p) continue; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 2.5, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }

  // fantasmas + flechas del paso anterior: carrera (punteada, color del equipo) y pase (bocha, línea continua)
  if (prev && !o.thumb) {
    for (const e of s.ents) {
      const a = prev[e.id], b = pos[e.id]; if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
      if (d < .4) continue;
      const isBall = e.type === 'ball';
      const col = isBall ? '#ffffff' : colOf(e);
      ctx.globalAlpha = .22; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(X(a[0]), Y(a[1]), isBall ? R*.45 : R, 0, 7); ctx.fill();
      const ux = dx/d, uy = dy/d, end = (isBall ? R*.45 : R) + 4, ex = X(b[0]) - ux*end, ey = Y(b[1]) - uy*end;
      ctx.globalAlpha = isBall ? .9 : .75; ctx.strokeStyle = col; ctx.lineWidth = isBall ? 2.5 : 2;
      ctx.setLineDash(isBall ? [] : [6, 5]);
      if (isBall) { // halo blanco para que el pase se lea sobre la cancha
        ctx.save(); ctx.strokeStyle = 'rgba(8,24,52,.55)'; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(ex, ey); ctx.stroke(); ctx.restore();
      }
      ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; arrowHead(ctx, ex, ey, ux, uy, 11);
      ctx.globalAlpha = 1;
    }
  }
  // conexiones
  ctx.lineCap = 'round';
  for (const [a, b] of s.links) {
    const pa = pos[a], pb = pos[b]; if (!pa || !pb) continue;
    ctx.strokeStyle = LINK;   // sin atenuado: todas las conexiones a pleno
    ctx.lineWidth = o.thumb ? 1 : Math.max(2, .35*sc);
    ctx.beginPath(); ctx.moveTo(X(pa[0]), Y(pa[1])); ctx.lineTo(X(pb[0]), Y(pb[1])); ctx.stroke();
  }
  if (o.linkFrom && o.mouse && pos[o.linkFrom]) {
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(pos[o.linkFrom][0]), Y(pos[o.linkFrom][1])); ctx.lineTo(X(o.mouse[0]), Y(o.mouse[1])); ctx.stroke(); ctx.setLineDash([]);
  }
  // jugadoras y bocha
  const ord = [...s.ents].sort((a, b) => (a.type === 'ball') - (b.type === 'ball') || (a.hl - b.hl));
  for (const e of ord) {
    const p = pos[e.id]; if (!p) continue;
    const x = X(p[0]), y = Y(p[1]);
    if (e.type === 'ball') {
      ctx.fillStyle = '#151515'; ctx.strokeStyle = '#fff'; ctx.lineWidth = o.thumb ? .5 : 2;
      ctx.beginPath(); ctx.arc(x, y, R*.45, 0, 7); ctx.fill(); ctx.stroke();
    } else {
      // todas a pleno (sin atenuar a las no destacadas); la destacada suma el halo amarillo
      if (e.hl) { ctx.fillStyle = 'rgba(242,201,76,.45)'; ctx.beginPath(); ctx.arc(x, y, R*1.55, 0, 7); ctx.fill(); }
      ctx.fillStyle = colOf(e); ctx.strokeStyle = '#fff'; ctx.lineWidth = o.thumb ? .6 : 2.5;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); ctx.stroke();
      if (!o.thumb && e.label) {
        const fs = R * (e.label.length > 2 ? .72 : .95);
        ctx.fillStyle = '#fff'; ctx.font = `800 ${fs}px Montserrat`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(e.label, x, y + 1);
      }
      ctx.globalAlpha = 1;
    }
    if (!o.thumb && (sel.has(e.id) || e.id === o.linkFrom)) {
      ctx.strokeStyle = e.id === o.linkFrom ? '#f2c94c' : SEL; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(x, y, (e.type === 'ball' ? R*.45 : R) + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  return { sc, ox, oy, box, base: sc / v.z };
}
