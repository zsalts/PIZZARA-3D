/* ============ arranque, visor, exportación y teclado ============ */
import { $, $$, clamp, download, readPrefs, writePrefs } from './util.js';
import { app, hooks, loadInitial, flushSave, save, snap, undo, redo, canUndo, canRedo, setProject } from './state.js';
import { initEditor, draw, selectAll, clearSel, copySel, paste, cutSel, duplicateSel, deleteSel, nudge, zoomBy, fitView, setSpace } from './editor2d.js';
import { initPanels, renderSlides, renderSteps, renderProps, renderTools, updateThumb, setTool, toggleBall, setStep, toggleProps } from './panels.js';
import { Viewer, slideDur } from './visor3d.js';
import { saveJSON, readJSON, videoTypes, mimeForFps, bitrateFor, recordCanvas, videoName, exportPNGs, exportPDF } from './export.js';
import { toast, openDialog, closeDialog, anyDialogOpen, initTheme } from './ui.js';

/* ---------- render global ---------- */
function renderAll() { renderSlides(); renderSteps(); renderProps(); renderTools(); draw(); syncHistory(); }
function syncHistory() { $('#bUndo').disabled = !canUndo(); $('#bRedo').disabled = !canRedo(); }
Object.assign(hooks, {
  renderAll, renderSlides, renderSteps, renderProps, renderTools, draw, updateThumb, history: syncHistory,
  storageError: (() => { let shown = false; return () => { if (!shown) { shown = true; toast('No se pudo guardar en el navegador (¿espacio lleno?). Usá “Guardar archivo”.', 'error', 7000); } }; })(),
});

/* ---------- archivo ---------- */
function doSave() { saveJSON(app.P); toast('Proyecto guardado como archivo', 'ok'); }
async function openFile(f) {
  try { const d = await readJSON(f); snap(); setProject(d); renderAll(); save(); toast(`Abierto: ${f.name} (${d.slides.length} slides)`, 'ok'); }
  catch { toast('Ese archivo no es un proyecto válido.', 'error', 5000); }
}
$('#bExport').onclick = doSave;
$('#bImport').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = async e => { const f = e.target.files[0]; if (f) await openFile(f); e.target.value = ''; };
$('#bUndo').onclick = () => undo();
$('#bRedo').onclick = () => redo();
$('#bHelp').onclick = () => openDialog('dlgHelp');
// arrastrar un .json a la ventana
addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
addEventListener('drop', e => {
  const f = e.dataTransfer.files?.[0]; if (!f) return;
  e.preventDefault();
  if (viewerOpen() || rec) return toast('Cerrá el visor para abrir otro proyecto.', 'warn');
  openFile(f);
});

/* ============ visor ============ */
let V = null, vRaf = 0, last = 0, rec = null;
const viewerEl = $('#viewer');
const viewerOpen = () => !viewerEl.classList.contains('hidden');
const fmtSize = f => f === 'h' ? [1920, 1080] : [1080, 1920];

function getViewer() {
  if (!V) {
    V = new Viewer($('#stage'));
    V.onSlide = i => { $('#vInfo').textContent = `${i + 1} / ${app.P.slides.length}`; $('#vNotes').textContent = app.P.slides[i].notes || ''; };
    V.onEnd = () => { syncPlay(); if (rec) setTimeout(stopVideo, 400); };
    V.setFormat(...fmtSize(app.fmt), 1);
  }
  return V;
}
function totalProgress() {
  if (!V.playAll) return V.t / V.dur;
  const durs = app.P.slides.map(slideDur), tot = durs.reduce((a, b) => a + b, 0);
  return (durs.slice(0, V.i).reduce((a, b) => a + b, 0) + V.t) / tot;
}
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
  if (!V.busy) { V.frame(dt); $('#vProg i').style.width = (clamp(totalProgress()) * 100) + '%'; }
  vRaf = requestAnimationFrame(loop);
}
function previewQ() {
  const r = $('.vstage').getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  const fit = Math.min(r.width / V.bw, r.height / V.bh) * dpr;
  return clamp(fit, .35, 1);
}
const refit = () => { if (V && !rec && viewerOpen()) V.setFormat(V.bw, V.bh, previewQ()); };
addEventListener('resize', refit);
document.addEventListener('fullscreenchange', () => setTimeout(refit, 100));
function syncPlay() { $('#vPlay').textContent = V.playing ? '⏸ Pausa' : '▶ Reproducir'; }

function setFmt(f) {
  app.fmt = f; writePrefs({ fmt: f });
  $$('[data-fmt]').forEach(x => { const on = x.dataset.fmt === f; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  $$('input[name=xFmt]').forEach(r => r.checked = r.value === f);
  if (V && !rec) { V.setFormat(...fmtSize(f), 1); if (viewerOpen()) V.setFormat(V.bw, V.bh, previewQ()); }
}

/** Con el visor abierto, el editor queda inerte (foco y lectores de pantalla) y los toasts
    se mueven dentro del visor para que se vean también en pantalla completa. */
function setEditorInert(on) {
  for (const el of [$('header'), $('main'), $('#scrim')]) el.inert = on;
  (on ? viewerEl : document.body).append($('#toasts'));
}

let hintT = 0;
function flashHint() { const h = $('#vHint'); h.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('show'), 3000); }

function openViewer(i = app.cur) {
  getViewer();
  viewerEl.classList.remove('hidden');
  setEditorInert(true);
  toggleProps(false);
  V.setFormat(...fmtSize(app.fmt), 1);
  V.setFormat(V.bw, V.bh, previewQ());
  V.playAll = $('#vAll').checked;
  V.load(i, true); V.playing = true; syncPlay();
  last = performance.now(); cancelAnimationFrame(vRaf); vRaf = requestAnimationFrame(loop);
  $('#vClose').focus();
  flashHint();
}
function closeViewer() {
  if (rec) return toast('Detené la grabación antes de salir.', 'warn');
  if (document.fullscreenElement) document.exitFullscreen();
  viewerEl.classList.add('hidden'); cancelAnimationFrame(vRaf);
  setEditorInert(false);
  app.cur = V.i; app.step = 0; app.sel.clear(); renderAll();
  $('#bView').focus();
}
const goTo = i => { if (recBlocked()) return; V.load(clamp(i, 0, app.P.slides.length - 1), false); V.playing = true; syncPlay(); };
const go = d => goTo(V.i + d);
const recBlocked = () => { if (rec) { toast('Detené la grabación primero.', 'warn'); return true; } return false; };
function togglePlay() { if (recBlocked()) return; if (!V.playing && V.t >= V.dur) V.t = 0; V.playing = !V.playing; syncPlay(); }
/** Espacio: si el slide terminó, avanza; si no, pausa/reanuda. */
function smartSpace() {
  if (recBlocked()) return;
  if (!V.playing && V.t >= V.dur) { if (V.i < app.P.slides.length - 1) go(1); else togglePlay(); }
  else togglePlay();
}
function toggleNotes() {
  const n = $('#vNotes'); n.hidden = !n.hidden;
  $('#vNotesB').classList.toggle('on', !n.hidden); $('#vNotesB').setAttribute('aria-pressed', !n.hidden);
  requestAnimationFrame(refit);
}
function present() {
  if (document.fullscreenElement) document.exitFullscreen();
  else viewerEl.requestFullscreen?.().then(flashHint).catch(() => toast('El navegador no permitió pantalla completa.', 'warn'));
}

$('#bView').onclick = () => openViewer();
$('#vClose').onclick = closeViewer;
$('#vPrev').onclick = () => go(-1);
$('#vNext').onclick = () => go(1);
$('#vPlay').onclick = togglePlay;
$('#vReplay').onclick = () => { if (!rec) goTo(V.i); };
$('#vAll').onchange = e => V.playAll = e.target.checked;
$('#vNotesB').onclick = toggleNotes;
$$('[data-fmt]').forEach(b => b.onclick = () => { if (!rec) setFmt(b.dataset.fmt); });
$('#vPresent').onclick = present;
$('#vExport').onclick = () => openExport();
$('#vRec').onclick = () => rec ? stopVideo() : openExport(true);
// ocultar el cursor en pantalla completa si no se mueve
let idleT = 0;
// (en pantalla completa también se oculta la barra de controles; vuelve al mover el mouse o al tabular)
const wake = () => { viewerEl.classList.remove('idle'); clearTimeout(idleT); if (document.fullscreenElement) idleT = setTimeout(() => { if (!viewerEl.querySelector('.vbar').contains(document.activeElement) || document.activeElement === $('#vClose')) viewerEl.classList.add('idle'); }, 2500); };
viewerEl.addEventListener('pointermove', wake);
viewerEl.addEventListener('focusin', e => { if (e.target.closest('.vbar')) wake(); });
document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) { viewerEl.classList.add('idle'); clearTimeout(idleT); } else { viewerEl.classList.remove('idle'); } });

/* ============ exportación ============ */
function openExport(focusVideo = false) {
  const sel = $('#xVType'), types = videoTypes();
  sel.innerHTML = types.length ? types.map(t => `<option value="${t.mime}">${t.label}</option>`).join('') : '<option value="">No disponible en este navegador</option>';
  sel.disabled = $('#xVideo').disabled = !types.length;
  const pv = readPrefs().video || {};
  for (const [id, k] of [['#xVType', 'mime'], ['#xVQ', 'q'], ['#xVRes', 'res'], ['#xVFps', 'fps'], ['#xVRange', 'range']]) if (pv[k] != null && [...$(id).options].some(o => o.value === String(pv[k]))) $(id).value = pv[k];
  $$('input[name=xFmt]').forEach(r => r.checked = r.value === app.fmt);
  openDialog('dlgExport');
  (focusVideo ? $('#xVideo') : $('#xPngCur')).focus();
}
$('#bExportMenu').onclick = () => openExport();
$$('input[name=xFmt]').forEach(r => r.onchange = () => { if (!rec) setFmt(r.value); });

let busy = false, recPlayAll = true;
/** Renderiza fotos fijas con el visor sin romper la reproducción si estaba abierto. */
async function withStills(fn) {
  if (busy || rec) return;
  busy = true;
  const v = getViewer(), wasOpen = viewerOpen(), back = { i: v.s ? v.i : app.cur, playing: v.playing };
  v.busy = true;
  try { v.setFormat(...fmtSize(app.fmt), 1); return await fn(v); }
  finally {
    v.busy = false; busy = false;
    if (wasOpen) { v.setFormat(v.bw, v.bh, previewQ()); v.load(back.i, true); v.playing = back.playing; syncPlay(); }
  }
}
const curIdx = () => viewerOpen() && V ? V.i : app.cur;
$('#xPngCur').onclick = async () => {
  const i = curIdx();
  try { await withStills(v => exportPNGs(v, [i])); toast(`PNG del slide ${i + 1} exportado`, 'ok'); }
  catch (err) { console.error(err); toast('No se pudo exportar el PNG.', 'error'); }
};
$('#xPngAll').onclick = async () => {
  const n = app.P.slides.length, t = toast(`Exportando ${n} PNG…`, 'info', 60000);
  try { await withStills(v => exportPNGs(v, app.P.slides.map((_, i) => i), (k) => t.textContent = `Exportando PNG ${k + 1} de ${n}…`)); toast(`${n} PNG exportados`, 'ok'); }
  catch (err) { console.error(err); toast('No se pudieron exportar los PNG.', 'error'); }
  finally { t.click(); }
};
$('#xPdf').onclick = async () => {
  const n = app.P.slides.length, t = toast('Preparando PDF…', 'info', 60000);
  try {
    const how = await withStills(v => exportPDF(v, app.P, { notes: $('#xNotes').checked }, k => t.textContent = `Preparando PDF: slide ${k + 1} de ${n}…`));
    toast(how === 'print' ? 'Sin conexión para generar el PDF: elegí “Guardar como PDF” en el diálogo de impresión.' : 'PDF exportado', how === 'print' ? 'warn' : 'ok', 6000);
  } catch (err) { console.error(err); toast('No se pudo generar el PDF.', 'error'); }
  finally { t.click(); }
};
$('#xVideo').onclick = startVideo;

function startVideo() {
  const types = videoTypes();
  if (!types.length) return toast('Este navegador no puede grabar video. Probá con Chrome o Safari actualizados.', 'error', 6000);
  const t = types.find(x => x.mime === $('#xVType').value) || types[0];
  const q = +$('#xVRes').value, fps = +$('#xVFps').value, range = $('#xVRange').value, quality = $('#xVQ').value;
  writePrefs({ video: { mime: t.mime, q: quality, res: $('#xVRes').value, fps, range } });
  closeDialog('dlgExport');
  const start = range === 'cur' ? curIdx() : 0;
  if (!viewerOpen()) openViewer(start);
  recPlayAll = $('#vAll').checked;
  V.playAll = range === 'all'; $('#vAll').checked = V.playAll;
  V.setFormat(...fmtSize(app.fmt), q);
  V.load(start, true); V.playing = true; syncPlay();
  const bitrate = bitrateFor(quality, V.w, V.h, fps);
  try {
    rec = recordCanvas($('#stage'), { mime: mimeForFps(t, fps), fps, bitrate }, err => {
      console.error(err); toast('Error durante la grabación del video.', 'error', 6000); stopVideo();
    });
  } catch (err) {
    console.error(err); rec = null; restoreAfterRec();
    return toast('No se pudo iniciar la grabación con ese formato.', 'error');
  }
  rec.ext = t.ext;
  $('#recBadge').classList.add('on'); $('#vRec').textContent = '■ Detener';
  toast(`Grabando ${V.w}×${V.h} · ${fps} fps · ${(bitrate / 1e6).toFixed(0)} Mbps`, 'info');
}
async function stopVideo() {
  if (!rec || rec.stopping) return;
  rec.stopping = true;
  const r = rec;
  let blob = null;
  try { blob = await r.stop(); } catch (err) { console.error(err); }
  rec = null;
  restoreAfterRec();
  if (!blob || !blob.size) return toast('La grabación salió vacía: probá otro formato o calidad.', 'error', 6000);
  download(blob, videoName(r.ext));
  toast(`Video exportado (${(blob.size / 1048576).toFixed(1)} MB)`, 'ok');
}
function restoreAfterRec() {
  $('#recBadge').classList.remove('on'); $('#vRec').textContent = '● Exportar video';
  V.playAll = recPlayAll; $('#vAll').checked = recPlayAll;
  V.setFormat(V.bw, V.bh, previewQ());
}

/* ============ teclado ============ */
const TEXT_INPUTS = ['text', 'search', 'number', 'email', 'url', 'tel', 'password'];
const isTyping = () => {
  const a = document.activeElement;
  return a?.tagName === 'TEXTAREA' || a?.isContentEditable || (a?.tagName === 'INPUT' && TEXT_INPUTS.includes(a.type));
};
addEventListener('keydown', e => {
  if (anyDialogOpen()) return;          // los <dialog> manejan Esc y Tab
  const mod = e.metaKey || e.ctrlKey, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (viewerOpen()) {
    if (mod) return;
    const act = {
      ArrowRight: () => go(1), PageDown: () => go(1), ArrowDown: () => go(1),
      ArrowLeft: () => go(-1), PageUp: () => go(-1), ArrowUp: () => go(-1),
      ' ': smartSpace, k: togglePlay, r: () => $('#vReplay').click(),
      Home: () => goTo(0), End: () => goTo(app.P.slides.length - 1),
      f: present, n: toggleNotes,
      Escape: () => { if (!document.fullscreenElement) closeViewer(); },
    }[k];
    // en el visor el Espacio siempre es pausa/sigue (los botones de la barra se activan con Enter)
    if (act) { e.preventDefault(); act(); }
    return;
  }

  if (mod && k === 's') { e.preventDefault(); doSave(); return; }
  if (mod && k === 'o') { e.preventDefault(); $('#fileIn').click(); return; }
  if (isTyping()) return;
  // [ y ] antes del corte por modificadores: en teclados ES/LatAm salen con Option (Mac) o AltGr (= Ctrl+Alt en Windows)
  if ((k === '[' || k === ']') && !e.metaKey) { e.preventDefault(); return setStep(app.step + (k === ']' ? 1 : -1)); }
  if (mod) {
    const act = {
      z: () => (e.shiftKey ? redo() : undo()) || toast(e.shiftKey ? 'Nada para rehacer' : 'Nada para deshacer'),
      y: () => redo() || toast('Nada para rehacer'),
      c: () => { const n = copySel(); if (n) toast(`${n} elemento${n > 1 ? 's' : ''} copiado${n > 1 ? 's' : ''}`); },
      x: () => { const n = cutSel(); if (n) toast(`${n} elemento${n > 1 ? 's' : ''} cortado${n > 1 ? 's' : ''}`); },
      v: () => { const r = paste(); if (r === 0) toast('No hay nada copiado'); else if (r < 0) toast('Este slide ya tiene bocha'); },
      d: () => { if (!app.sel.size) toast('No hay nada seleccionado'); else if (duplicateSel() < 0) toast('Este slide ya tiene bocha'); },
      a: () => selectAll(),
    }[k];
    if (act) { e.preventDefault(); act(); }
    return;
  }
  if (e.altKey) return;
  const tools = { v: 'move', c: 'link', p: 'home', r: 'away', x: 'erase', a: 'arrow', z: 'zone', t: 'text', h: 'pan' };
  const inSlides = document.activeElement?.closest?.('#slideList');
  if (tools[k]) { setTool(tools[k]); return; }
  if (k === 'b') return toggleBall();
  if (k === '?') return openDialog('dlgHelp');
  if (k === 'e') return openExport();
  if (k === ',' || k === 'PageUp') { e.preventDefault(); return setStep(app.step - 1); }
  if (k === '.' || k === 'PageDown') { e.preventDefault(); return setStep(app.step + 1); }
  if (k === '+' || k === '=') return zoomBy(1.25);
  if (k === '-') return zoomBy(1 / 1.25);
  if (k === '0') return fitView();
  if (k === 'Delete' || k === 'Backspace') { if (app.sel.size) { e.preventDefault(); deleteSel(); } return; }
  if (k === 'Escape') { clearSel(); if (app.tool !== 'move') setTool('move'); toggleProps(false); return; }
  if (k === 'Enter' && !/^(BUTTON|A|SUMMARY)$/.test(document.activeElement?.tagName) && !inSlides) { openViewer(); return; }
  if (k.startsWith('Arrow') && !inSlides) {
    const st = e.shiftKey ? 2 : .5;
    const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[k];
    if (nudge(...d)) e.preventDefault();
    return;
  }
  if (k === ' ' && (document.activeElement === document.body || document.activeElement === $('#cv'))) { e.preventDefault(); if (!e.repeat) setSpace(true); }
});
addEventListener('keyup', e => { if (e.key === ' ') setSpace(false); });
addEventListener('blur', () => setSpace(false));

/* ============ inicio ============ */
addEventListener('beforeunload', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

initTheme();
initPanels();
initEditor($('#cv'));
app.fmt = readPrefs().fmt === 'h' ? 'h' : 'v';
setFmt(app.fmt);
const origin = loadInitial();
await Promise.all([document.fonts.load('400 80px "Bebas Neue"'), document.fonts.load('800 40px Montserrat'), document.fonts.load('600 14px Montserrat')]).catch(() => {});
$('#loading').remove();
renderAll();
if (origin === 'v1') toast('Se recuperó tu proyecto de la versión anterior.', 'ok', 5000);
else if (origin === 'v1-rescate') toast('El guardado automático estaba dañado: se recuperó la copia de la versión anterior.', 'warn', 8000);
else if (origin === 'nuevo-rescate') toast('El guardado automático estaba dañado y no había copia: se empezó un proyecto nuevo.', 'error', 8000);
