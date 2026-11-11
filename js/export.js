/* ============ exportación: JSON, video, PNG y PDF ============ */
import { today, download, sleep, esc } from './util.js';
import { normalizeProject } from './state.js';

/* ---------- proyecto JSON (compatible con la versión original) ---------- */
export function saveJSON(P) {
  download(new Blob([JSON.stringify(P, null, 1)], { type: 'application/json' }), `charla-${today()}.json`);
}
export async function readJSON(file) {
  return normalizeProject(JSON.parse(await file.text()));
}

/* ---------- video ---------- */
const VIDEO_TYPES = [
  { mime: 'video/mp4;codecs=avc1.640028', label: 'MP4 (H.264)', ext: 'mp4' },
  { mime: 'video/mp4;codecs=avc1', label: 'MP4 (H.264)', ext: 'mp4' },
  { mime: 'video/mp4', label: 'MP4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9', label: 'WebM (VP9)', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8', label: 'WebM (VP8)', ext: 'webm' },
  { mime: 'video/webm', label: 'WebM', ext: 'webm' },
];
/** Formatos que este navegador puede grabar (uno por etiqueta). */
export function videoTypes() {
  if (!window.MediaRecorder) return [];
  const out = [];
  for (const t of VIDEO_TYPES) {
    // una opción por etiqueta; los genéricos solo si no hay variante con códec de esa extensión
    if (out.some(o => o.label === t.label || (!t.label.includes('(') && o.ext === t.ext))) continue;
    if (MediaRecorder.isTypeSupported(t.mime)) out.push(t);
  }
  return out;
}
/** Bitrate (bits/s) según calidad y resolución. */
export function bitrateFor(quality, w, h, fps) {
  const base = { media: .08, alta: .14, maxima: .24 }[quality] ?? .14;   // bits por pixel por frame
  return Math.round(Math.min(60e6, Math.max(4e6, w * h * fps * base)));
}
/** Graba un canvas. Devuelve { stop(): Promise<Blob> }. */
export function recordCanvas(canvas, { mime, fps, bitrate }, onError) {
  const stream = canvas.captureStream(fps), chunks = [];
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate }); }
  catch (err) { stream.getTracks().forEach(t => t.stop()); throw err; }
  rec.onerror = e => onError?.(e.error || e);
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(res => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(chunks, { type: mime.split(';')[0] })); }; });
  try { rec.start(250); }
  catch (err) { stream.getTracks().forEach(t => t.stop()); throw err; }
  return { rec, stop() { if (rec.state !== 'inactive') rec.stop(); return done; } };
}
/** A 60 fps el perfil H.264 4.0 (avc1.640028) puede quedarse corto en 1080p: probar 4.2 o el genérico. */
export function mimeForFps(t, fps) {
  if (t.ext !== 'mp4' || fps <= 30) return t.mime;
  return ['video/mp4;codecs=avc1.64002A', 'video/mp4;codecs=avc1', t.mime].find(m => MediaRecorder.isTypeSupported(m)) || t.mime;
}
export const videoName = ext => `charla-${today()}.${ext}`;

/* ---------- imágenes ---------- */
const toBlob = (cv, type = 'image/png', q) => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('toBlob')), type, q));
const pad = n => String(n).padStart(2, '0');

/** Exporta PNG de los slides indicados (estado final de cada uno). */
export async function exportPNGs(V, indices, onProgress) {
  for (let n = 0; n < indices.length; n++) {
    const i = indices[n];
    onProgress?.(n, indices.length);
    const blob = await toBlob(V.renderStill(i));
    download(blob, `slide-${pad(i + 1)}-${today()}.png`);
    if (indices.length > 1) await sleep(350);   // los navegadores bloquean descargas en ráfaga
  }
}

/* ---------- PDF ---------- */
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
let jspdfP = null;
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return jspdfP ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = JSPDF_URL; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => window.jspdf?.jsPDF ? res(window.jspdf.jsPDF) : rej(new Error('jsPDF'));
    s.onerror = () => { jspdfP = null; rej(new Error('No se pudo cargar jsPDF')); };
    document.head.append(s);
  });
}

/**
 * PDF con un slide por página. Con notas: página A4 apaisada con la imagen a la izquierda
 * y título + notas del orador a la derecha. Si jsPDF no carga (sin conexión), cae en
 * window.print() con CSS de impresión.
 */
export async function exportPDF(V, P, { notes = false } = {}, onProgress) {
  const imgs = [];
  for (let i = 0; i < P.slides.length; i++) {
    onProgress?.(i, P.slides.length);
    const cv = V.renderStill(i);
    imgs.push({ url: cv.toDataURL('image/jpeg', .92), w: cv.width, h: cv.height, s: P.slides[i] });
    await sleep(0);
  }
  let jsPDF;
  try { jsPDF = await loadJsPDF(); }
  catch { printFallback(imgs, notes, !!P.showTexts); return 'print'; }

  let doc = null;
  for (const im of imgs) {
    // si las imágenes van sin textos (opción por defecto), los textos del slide se escriben al lado
    const hasNotes = !!(notes && im.s.notes?.trim()), side = hasNotes || !P.showTexts;
    let pw, ph, x, y, w, h;
    if (side) {
      pw = 842; ph = 595;
      const boxW = im.w > im.h ? 500 : 300, boxH = ph - 60, k = Math.min(boxW / im.w, boxH / im.h);
      w = im.w * k; h = im.h * k; x = 30; y = (ph - h) / 2;
    } else {
      pw = im.w / 2; ph = im.h / 2; x = 0; y = 0; w = pw; h = ph;
    }
    const orient = pw > ph ? 'l' : 'p';
    if (!doc) doc = new jsPDF({ orientation: orient, unit: 'pt', format: [pw, ph], compress: true });
    else doc.addPage([pw, ph], orient);
    doc.addImage(im.url, 'JPEG', x, y, w, h, undefined, 'FAST');
    if (side) {
      const tx = x + w + 30, tw = pw - tx - 30;
      let ty = 60;
      doc.setTextColor(200, 50, 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      if (im.s.kicker) { const kl = doc.splitTextToSize(im.s.kicker, tw); doc.text(kl, tx, ty); ty += kl.length * 12 + 8; }
      doc.setTextColor(28, 26, 24); doc.setFontSize(22);
      const tl = doc.splitTextToSize(im.s.title || '', tw); doc.text(tl, tx, ty); ty += tl.length * 24 + 4;
      if (im.s.accent?.trim()) { doc.setFontSize(10); doc.setTextColor(200, 50, 60); doc.text(`Palabra destacada: ${im.s.accent}`, tx, ty + 6); ty += 16; }
      if (im.s.subtitle) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(60, 56, 52); const sl = doc.splitTextToSize(im.s.subtitle, tw); doc.text(sl, tx, ty + 8); ty += sl.length * 14 + 6; }
      ty += 6;
      doc.setDrawColor(200, 50, 60); doc.setLineWidth(2); doc.line(tx, ty, tx + 40, ty); ty += 22;
      if (!hasNotes) continue;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(60, 56, 52);
      // notas largas: siguen en páginas extra del mismo tamaño (misma columna)
      const LH = 12 * 1.45, nl = doc.splitTextToSize(im.s.notes, tw);
      let i = 0;
      while (i < nl.length) {
        const fit = Math.max(1, Math.floor((ph - 40 - ty) / LH));
        doc.text(nl.slice(i, i + fit), tx, ty, { lineHeightFactor: 1.45 });
        i += fit;
        if (i < nl.length) {
          doc.addPage([pw, ph], orient);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(60, 56, 52);
          ty = 50;
          doc.setFontSize(9); doc.setTextColor(150, 140, 130); doc.text(`${im.s.title || ''} (notas, cont.)`, 30, 30);
          doc.setFontSize(12); doc.setTextColor(60, 56, 52);
        }
      }
    }
  }
  doc.save(`charla-${today()}.pdf`);
  return 'pdf';
}

function printFallback(imgs, notes, showTexts) {
  let el = document.getElementById('printArea');
  if (!el) { el = document.createElement('div'); el.id = 'printArea'; document.body.append(el); }
  el.innerHTML = imgs.map(im => { const hasNotes = notes && im.s.notes?.trim(); return `<section class="pp ${im.w > im.h ? 'land' : 'port'}"><img src="${im.url}" alt="">${hasNotes || !showTexts
    ? `<div class="pn"><small>${esc(im.s.kicker)}</small><h2>${esc(im.s.title)}</h2>${im.s.subtitle ? `<b>${esc(im.s.subtitle)}</b>` : ''}${hasNotes ? `<p>${esc(im.s.notes).replace(/\n/g, '<br>')}</p>` : ''}</div>` : ''}</section>`; }).join('');
  const clean = () => { el.innerHTML = ''; removeEventListener('afterprint', clean); };
  addEventListener('afterprint', clean);
  setTimeout(() => print(), 300);
}
