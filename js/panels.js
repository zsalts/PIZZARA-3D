/* ============ paneles: slides, pasos, herramientas y propiedades ============ */
import { $, $$, esc, clone, uid, readPrefs, writePrefs } from './util.js';
import { app, S, hooks, snap, save, changed, removeIds, defaultProject, setProject, blankSlide } from './state.js';
import { autoLinks, hasLink } from './formations.js';
import { linksFor } from './systems.js';
import { initSystemsUI } from './systems-ui.js';
import { drawScene2D } from './cancha.js';
import { draw, shapeStyle, setPaths, prefs, fitView, zoomBy } from './editor2d.js';
import { toast, confirmDialog } from './ui.js';

const SHAPE_COLORS = [['#ffffff', 'Blanco'], ['#f2c94c', 'Amarillo'], ['#c8323c', 'Rojo'], ['#7dd3fc', 'Celeste'], ['#4ade80', 'Verde'], ['#1c1a18', 'Negro']];

/* ---------- herramientas ---------- */
/* ayuda corta que aparece unos segundos al cambiar de herramienta (el detalle está en el panel “?”) */
const HINTS = {
  move: 'Arrastrá para mover · Shift+clic o recuadro para elegir varias',
  link: 'Clic en una jugadora y después en otra · clic en el vacío corta',
  home: 'Clic en la cancha para agregar una propia',
  away: 'Clic en la cancha para agregar una rival',
  erase: 'Clic en lo que quieras borrar',
  arrow: 'Arrastrá para dibujar una flecha',
  zone: 'Arrastrá para marcar una zona',
  text: 'Clic en la cancha para escribir',
  pan: 'Arrastrá para desplazar · rueda para zoom',
};
const TOUCH_HINTS = {
  move: 'Arrastrá para mover · mantené apretado para elegir varias · dos dedos: zoom',
  link: 'Tocá una jugadora y después otra',
  home: 'Tocá la cancha para agregar una propia',
  away: 'Tocá la cancha para agregar una rival',
  erase: 'Tocá lo que quieras borrar',
  text: 'Tocá la cancha para escribir',
};
const coarse = () => !!window.matchMedia?.('(pointer: coarse)').matches;
let hintTool = null, hintT = 0;
function showHint(tool) {
  const h = $('#hint');
  h.textContent = (coarse() && TOUCH_HINTS[tool]) || HINTS[tool] || '';
  h.classList.add('show'); clearTimeout(hintT);
  hintT = setTimeout(() => h.classList.remove('show'), 2600);
}
export function renderTools() {
  $$('[data-tool]').forEach(b => { const on = b.dataset.tool === app.tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if (hintTool !== null && hintTool !== app.tool) showHint(app.tool);
  hintTool = app.tool;
  if (app.tool !== 'link') app.linkFrom = null;
  $('#dHome').style.background = app.P.homeColor; $('#dAway').style.background = app.P.awayColor;
  const ball = S().ents.some(e => e.type === 'ball'), bb = $('#bBall');
  bb.classList.toggle('on', ball); bb.setAttribute('aria-pressed', ball);
  bb.setAttribute('aria-label', ball ? 'Quitar bocha' : 'Agregar bocha'); bb.title = `${ball ? 'Quitar' : 'Agregar'} la bocha (B)`;
  $('#tPaths').checked = prefs.paths;
  draw();
}
export function setTool(t) { app.tool = t; renderTools(); }
export function toggleBall() {
  snap(); const s = S(), b = s.ents.find(e => e.type === 'ball');
  if (b) removeIds(s, [b.id]);
  else { const id = uid(); s.ents.push({ id, type: 'ball', hl: false }); s.steps.forEach(st => st[id] = [27.5, 45.7]); }
  renderTools(); renderProps(); changed();
}

/* ---------- pasos ---------- */
export function setStep(i) {
  const s = S(); i = Math.max(0, Math.min(s.steps.length - 1, i));
  if (i === app.step) return;
  app.step = i; renderSteps(); draw();
}
export function renderSteps() {
  const s = S();
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  $('#steps').innerHTML = `<span class="lbl">Pasos</span><div class="chips">` +
    s.steps.map((_, i) => `<button class="step ${i === app.step ? 'on' : ''}" data-i="${i}" aria-pressed="${i === app.step}" aria-label="Paso ${i + 1}" title="Paso ${i + 1}">${i + 1}</button>`).join('') +
    `<button id="stAdd" class="ghost" title="Agregar paso (copia las posiciones del actual)" aria-label="Agregar paso">${ic('plus')}<span class="t">Paso</span></button></div>` +
    (s.steps.length > 1 ? `<button id="stDel" class="ib ghost" title="Eliminar paso ${app.step + 1}" aria-label="Eliminar paso ${app.step + 1}">${ic('erase')}</button>` : '');
  $$('#steps .step').forEach(b => b.onclick = () => setStep(+b.dataset.i));
  $('#stAdd').onclick = () => { snap(); s.steps.splice(app.step + 1, 0, clone(s.steps[app.step])); app.step++; renderSteps(); changed(); renderSlides(); };
  const d = $('#stDel'); if (d) d.onclick = () => { snap(); s.steps.splice(app.step, 1); app.step = Math.max(0, app.step - 1); renderSteps(); changed(); renderSlides(); };
}

/* ---------- slides ---------- */
function drawThumb(c, s) {
  const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
  drawScene2D(x, app.P, s, s.steps.length - 1, { x: 0, y: 0, w: c.width, h: c.height }, { thumb: true });
}
const metaTxt = s => `${s.steps.length} paso${s.steps.length > 1 ? 's' : ''} · ${s.ents.filter(e => e.type === 'player').length} jugadoras`;
export function updateThumb() {
  const d = $$('#slideList .slide')[app.cur]; if (!d) return;
  drawThumb(d.querySelector('canvas'), S());
  d.querySelector('.m2').textContent = metaTxt(S());
}
function selectSlide(i) {
  if (app.cur === i) return;
  app.cur = i; app.step = 0; app.sel.clear(); app.linkFrom = null; hooks.renderAll();
  $$('#slideList .slide')[i]?.focus();
}
let dragFrom = -1;
export function renderSlides() {
  const el = $('#slideList'); el.innerHTML = '';
  app.P.slides.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'slide' + (i === app.cur ? ' on' : '');
    d.tabIndex = i === app.cur ? 0 : -1;
    d.setAttribute('role', 'option'); d.setAttribute('aria-selected', i === app.cur);
    d.setAttribute('aria-label', `Slide ${i + 1}: ${s.kicker ? s.kicker + ' — ' : ''}${s.title || 'Sin título'}`);
    d.draggable = true;
    d.innerHTML = `<span class="num">${i + 1}</span><canvas width="116" height="188" aria-hidden="true"></canvas><div class="meta"><small class="m0">${esc(s.kicker)}</small><b>${esc(s.title || 'Sin título')}</b><small class="m2">${metaTxt(s)}</small></div>${s.notes?.trim() ? '<span class="nt" title="Tiene notas del orador">✎</span>' : ''}`;
    d.onclick = () => selectSlide(i);
    d.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSlide(i); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (e.altKey) moveSlide(1); else selectSlide(Math.min(app.P.slides.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (e.altKey) moveSlide(-1); else selectSlide(Math.max(0, i - 1)); }
    };
    // reordenar arrastrando
    d.ondragstart = e => { dragFrom = i; d.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); };
    d.ondragend = () => { dragFrom = -1; $$('#slideList .slide').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')); };
    d.ondragover = e => {
      if (dragFrom < 0) return; e.preventDefault();
      const r = d.getBoundingClientRect(), vertical = getComputedStyle(el).display !== 'flex';
      const after = vertical ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
      d.classList.toggle('drop-after', after); d.classList.toggle('drop-before', !after);
    };
    d.ondragleave = () => d.classList.remove('drop-before', 'drop-after');
    d.ondrop = e => {
      e.preventDefault(); if (dragFrom < 0) return;
      const after = d.classList.contains('drop-after');
      let to = i + (after ? 1 : 0); if (dragFrom < to) to--;
      if (to !== dragFrom) {
        snap(); const [sl] = app.P.slides.splice(dragFrom, 1); app.P.slides.splice(to, 0, sl);
        app.cur = to; app.step = 0; app.sel.clear(); hooks.renderAll(); save();
      }
    };
    el.append(d); drawThumb(d.querySelector('canvas'), s);
  });
  el.querySelector('.slide.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function moveSlide(d) {
  const j = app.cur + d; if (j < 0 || j >= app.P.slides.length) return;
  snap(); [app.P.slides[app.cur], app.P.slides[j]] = [app.P.slides[j], app.P.slides[app.cur]]; app.cur = j;
  renderSlides(); save(); $$('#slideList .slide')[j]?.focus();
}

/* ---------- propiedades ---------- */
function renderLabels() { $('#mvV').textContent = S().moveDur.toFixed(1) + ' s'; $('#hdV').textContent = S().hold.toFixed(1) + ' s'; }
const selList = () => { const s = S(); return { ents: s.ents.filter(e => app.sel.has(e.id)), shapes: s.shapes.filter(x => app.sel.has(x.id)) }; };

export function renderProps() {
  const s = S();
  $$('#right [data-k]').forEach(inp => { if (document.activeElement !== inp) inp.value = s[inp.dataset.k] ?? ''; });
  renderLabels();
  const { ents, shapes } = selList(), n = ents.length + shapes.length;
  $('#selEnt').hidden = !(n === 1 && ents.length === 1);
  $('#selShape').hidden = !(n === 1 && shapes.length === 1);
  $('#selMulti').hidden = n < 2;
  if (n === 1 && ents.length) {
    const e = ents[0], ball = e.type === 'ball';
    $('#selEntT').textContent = ball ? 'Bocha seleccionada' : 'Jugadora seleccionada';
    $('#eLabelF').hidden = $('#eTeamF').hidden = $('#eHlF').hidden = ball;
    if (document.activeElement !== $('#eLabel')) $('#eLabel').value = e.label || '';
    $('#eTeam').value = e.team || 'home'; $('#eHl').checked = !!e.hl;
  }
  if (n === 1 && shapes.length) {
    const sh = shapes[0], txt = sh.kind === 'text';
    $('#selShapeT').textContent = { arrow: 'Flecha seleccionada', zone: 'Zona seleccionada', text: 'Texto seleccionado' }[sh.kind];
    $('#shTextF').hidden = $('#shSizeF').hidden = !txt;
    $('#shDashF').hidden = txt;
    if (txt) { if (document.activeElement !== $('#shText')) $('#shText').value = sh.text; $('#shSize').value = sh.size; $('#shSizeV').textContent = sh.size.toFixed(1) + ' m'; }
    $('#shDash').checked = !!sh.dash;
    $$('#shColors button').forEach(b => b.setAttribute('aria-checked', b.dataset.c.toLowerCase() === sh.color.toLowerCase()));
  }
  if (n > 1) {
    const parts = [];
    const pl = ents.filter(e => e.type === 'player').length;
    if (pl) parts.push(`${pl} jugadora${pl > 1 ? 's' : ''}`);
    if (ents.some(e => e.type === 'ball')) parts.push('bocha');
    if (shapes.length) parts.push(`${shapes.length} anotación${shapes.length > 1 ? 'es' : ''}`);
    $('#selMultiT').textContent = `Selección: ${parts.join(', ')}`;
  }
  $('#pShowTexts').checked = !!app.P.showTexts;
  $('#pShowLinks').checked = !!app.P.showLinks;
  $('#pHandle').value = app.P.handle || ''; $('#pHome').value = app.P.homeColor; $('#pAway').value = app.P.awayColor;
}

/** Engancha un input para que el primer cambio después de enfocarlo genere un punto de deshacer. */
function undoable(inp) {
  let pending = false;
  inp.addEventListener('focus', () => pending = true);
  inp.addEventListener('pointerdown', () => pending = true);
  return () => { if (pending) { snap(); pending = false; } };
}

export function initPanels() {
  // textos y animación del slide
  $$('#right [data-k]').forEach(inp => {
    const mark = undoable(inp);
    inp.addEventListener('input', () => {
      mark();
      const k = inp.dataset.k;
      S()[k] = inp.type === 'range' ? +inp.value : (k === 'notes' ? inp.value : inp.value.toUpperCase());
      renderLabels(); save();
      if (k === 'title' || k === 'kicker') {
        const m = $$('#slideList .slide')[app.cur];
        if (m) { m.querySelector('b').textContent = S().title || 'Sin título'; m.querySelector('.m0').textContent = S().kicker; }
      }
    });
    if (inp.dataset.k === 'notes') inp.addEventListener('change', renderSlides);
  });
  // conservar posición del cursor al pasar a mayúsculas
  $$('#right input[type=text][data-k], #eLabel, #shText, #pHandle').forEach(inp => inp.addEventListener('input', () => {
    const p = inp.selectionStart; if (inp.value !== inp.value.toUpperCase()) { inp.value = inp.value.toUpperCase(); inp.setSelectionRange(p, p); }
  }, true));

  // entidad seleccionada
  const one = () => selList().ents[0];
  const mLabel = undoable($('#eLabel'));
  $('#eLabel').oninput = e => { const x = one(); if (x) { mLabel(); x.label = e.target.value.toUpperCase(); changed(); } };
  $('#eTeam').onchange = e => { const x = one(); if (x) { snap(); x.team = e.target.value; changed(); } };
  $('#eHl').onchange = e => { const x = one(); if (x) { snap(); x.hl = e.target.checked; changed(); } };
  $('#eDel').onclick = () => { if (!app.sel.size) return; snap(); removeIds(S(), [...app.sel]); changed(); renderProps(); renderTools(); renderSlides(); };

  // anotación seleccionada
  const sh1 = () => selList().shapes[0];
  $('#shColors').innerHTML = SHAPE_COLORS.map(([c, n]) => `<button type="button" role="radio" data-c="${c}" style="background:${c}" title="${n}" aria-label="${n}" aria-checked="false"></button>`).join('');
  $$('#shColors button').forEach(b => b.onclick = () => {
    shapeStyle.color = b.dataset.c;
    const x = sh1(); if (x) { snap(); x.color = b.dataset.c; changed(); renderProps(); }
  });
  const mText = undoable($('#shText'));
  $('#shText').oninput = e => { const x = sh1(); if (x) { mText(); x.text = e.target.value.toUpperCase() || ' '; changed(); } };
  const mSize = undoable($('#shSize'));
  $('#shSize').oninput = e => { const x = sh1(); if (x) { mSize(); x.size = +e.target.value; $('#shSizeV').textContent = x.size.toFixed(1) + ' m'; changed(); } };
  $('#shDash').onchange = e => { shapeStyle.dash = e.target.checked; const x = sh1(); if (x) { snap(); x.dash = e.target.checked; changed(); } };
  $('#shDel').onclick = () => $('#eDel').onclick();

  // selección múltiple
  const multi = fn => () => { const { ents } = selList(); const pl = ents.filter(e => e.type === 'player'); if (!pl.length) return toast('La selección no tiene jugadoras', 'warn'); snap(); fn(pl); changed(); renderProps(); renderSlides(); };
  $('#mHl').onclick = multi(pl => pl.forEach(e => e.hl = true));
  $('#mNoHl').onclick = multi(pl => pl.forEach(e => e.hl = false));
  $('#mHome').onclick = multi(pl => pl.forEach(e => e.team = 'home'));
  $('#mAway').onclick = multi(pl => pl.forEach(e => e.team = 'away'));
  $('#mLink').onclick = multi(pl => {
    // une en cadena según la posición (de izquierda a derecha)
    const pos = S().steps[app.step], s = S();
    const ord = [...pl].sort((a, b) => pos[a.id][0] - pos[b.id][0]);
    for (let i = 1; i < ord.length; i++) if (!hasLink(s, ord[i - 1].id, ord[i].id)) s.links.push([ord[i - 1].id, ord[i].id]);
  });
  $('#mDel').onclick = () => $('#eDel').onclick();

  // sistemas tácticos (incluidos + biblioteca personal) y limpieza
  initSystemsUI();
  $('#fNoAway').onclick = () => { snap(); removeIds(S(), S().ents.filter(e => e.team === 'away').map(e => e.id)); changed(); renderSlides(); renderProps(); };
  $('#fNoHl').onclick = () => { snap(); S().ents.forEach(e => e.hl = false); changed(); renderProps(); };
  $('#fNoLinks').onclick = () => { snap(); S().links = []; changed(); };
  $('#fAutoLinks').onclick = () => {
    const n = autoLinks(clone(S()), linksFor);   // prueba en una copia: si no agrega nada, no se crea un paso de deshacer vacío
    if (n) { snap(); autoLinks(S(), linksFor); changed(); }
    toast(n ? `${n} conexiones agregadas` : 'No hay conexiones nuevas para agregar (se usan los roles del sistema propio)', n ? 'ok' : 'info');
  };
  $('#fNoShapes').onclick = () => { if (!S().shapes.length) return; snap(); removeIds(S(), S().shapes.map(x => x.id)); changed(); renderProps(); };

  // proyecto
  const mHandle = undoable($('#pHandle'));
  $('#pHandle').oninput = e => { mHandle(); app.P.handle = e.target.value.toUpperCase(); save(); };
  $('#pShowTexts').onchange = e => { snap(); app.P.showTexts = e.target.checked; save(); toast(e.target.checked ? 'Los textos se verán en el visor, el video y los PNG' : 'Presentación solo con la cancha'); };
  $('#pShowLinks').onchange = e => { snap(); app.P.showLinks = e.target.checked; save(); toast(e.target.checked ? 'Las conexiones se verán en la presentación' : 'Presentación sin conexiones'); };
  const mHome = undoable($('#pHome')), mAway = undoable($('#pAway'));
  // mientras se arrastra el selector solo se redibuja la cancha; las miniaturas al confirmar
  $('#pHome').oninput = e => { mHome(); app.P.homeColor = e.target.value; renderTools(); save(); };
  $('#pAway').oninput = e => { mAway(); app.P.awayColor = e.target.value; renderTools(); save(); };
  $('#pHome').onchange = $('#pAway').onchange = () => renderSlides();
  $('#pNew').onclick = async () => {
    if (!await confirmDialog('¿Empezar de cero? Se pierde el proyecto actual (podés deshacer con ⌘Z, o guardalo antes).', { ok: 'Empezar de cero', danger: true })) return;
    snap(); setProject(defaultProject()); hooks.renderAll(); save(); toast('Proyecto nuevo');
  };

  // slides
  $('#sAdd').onclick = () => {
    snap(); const s = blankSlide();   // slide nuevo = cancha vacía
    app.P.slides.splice(app.cur + 1, 0, s); app.cur++; app.step = 0; app.sel.clear(); hooks.renderAll(); save();
  };
  $('#sDup').onclick = () => { snap(); const s = clone(S()); s.id = uid(); app.P.slides.splice(app.cur + 1, 0, s); app.cur++; app.step = 0; app.sel.clear(); hooks.renderAll(); save(); toast('Slide duplicado'); };
  $('#sDel').onclick = async () => {
    if (app.P.slides.length < 2) return toast('Tiene que quedar al menos un slide.', 'warn');
    if (!await confirmDialog('¿Eliminar este slide?', { ok: 'Eliminar', danger: true })) return;
    snap(); app.P.slides.splice(app.cur, 1); app.cur = Math.max(0, app.cur - 1); app.step = 0; app.sel.clear(); hooks.renderAll(); save();
    toast('Slide eliminado (⌘Z para deshacer)');
  };
  $('#sUp').onclick = () => moveSlide(-1); $('#sDown').onclick = () => moveSlide(1);

  // barra de herramientas
  $$('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $('#bBall').onclick = toggleBall;
  $('#tPaths').onchange = e => setPaths(e.target.checked);
  $('#zIn').onclick = () => zoomBy(1.25); $('#zOut').onclick = () => zoomBy(1 / 1.25); $('#zFit').onclick = fitView;
  hooks.zoomLabel = z => { $('#zFit').textContent = z + '%'; };
  hooks.focusLabel = () => { const i = $('#eLabel'); openProps(); i.focus(); i.select(); };
  hooks.focusShapeText = () => { const i = $('#shText'); if ($('#selShape').hidden || $('#shTextF').hidden) return; openProps(); i.focus(); i.select(); };

  // panel derecho como cajón (tablet) u hoja inferior (celular)
  $$('[data-props]').forEach(b => b.onclick = () => toggleProps());
  $('#bPropsClose').onclick = () => toggleProps(false);
  $('#scrim').onclick = () => toggleProps(false);
  // hoja inferior: deslizar hacia abajo desde la barrita la cierra
  let sy = null;
  $('#right .sheetbar').addEventListener('pointerdown', e => { sy = e.clientY; });
  addEventListener('pointerup', e => { if (sy != null && e.clientY - sy > 50) toggleProps(false); sy = null; });

  // secciones colapsables: se recuerda cuáles quedaron abiertas
  const open = readPrefs().secs || {};
  $$('#right details[data-sec]').forEach(d => {
    if (d.dataset.sec in open) d.open = !!open[d.dataset.sec];
    d.addEventListener('toggle', () => writePrefs({ secs: { ...(readPrefs().secs || {}), [d.dataset.sec]: d.open } }));
  });
}
const narrow = () => !!window.matchMedia?.('(max-width:980px)').matches;
function openProps() { if (narrow()) toggleProps(true); }
export function toggleProps(on = !document.body.classList.contains('props-open')) {
  document.body.classList.toggle('props-open', on);
  $('#scrim').hidden = !on || !narrow();
  $$('[data-props]').forEach(b => { b.setAttribute('aria-expanded', on); b.classList.toggle('on', on && narrow()); });
}
