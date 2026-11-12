/* ============ nube: planteos tácticos guardados en Supabase (sin login) ============ */
import { $, esc } from './util.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { app, save, normalizeProject } from './state.js';
import { toast, openDialog, confirmDialog } from './ui.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const TABLE = 'proyectos';

export const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);

let sb = null, onOpen = () => {};

async function client() {
  if (!sb) {
    const { createClient } = await import(SUPABASE_JS);
    sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return sb;
}

/* ---------- datos ---------- */
const nombreDe = P => P.nube?.nombre || (P.slides[0]?.title || 'Sin nombre').slice(0, 60);
/** El proyecto sin la referencia a la nube (eso va en columnas aparte). */
const datosDe = P => { const { nube, ...d } = P; return d; };

async function list() {
  const { data, error } = await (await client()).from(TABLE).select('id,nombre,actualizado').order('actualizado', { ascending: false });
  if (error) throw error;
  return data;
}

/** Guarda el proyecto actual. Si ya estaba en la nube, lo actualiza; si no (o `asNew`), crea uno nuevo. */
async function saveCloud(nombre, asNew = false) {
  const c = await client(), P = app.P, datos = datosDe(P);
  let row = null;
  if (P.nube?.id && !asNew) {
    const { data, error } = await c.from(TABLE).update({ nombre, datos }).eq('id', P.nube.id).select('id,nombre');
    if (error) throw error;
    row = data[0] || null;   // vacío si se borró o es de otra cuenta → se crea uno nuevo
  }
  if (!row) {
    const { data, error } = await c.from(TABLE).insert({ nombre, datos }).select('id,nombre').single();
    if (error) throw error;
    row = data;
  }
  P.nube = { id: row.id, nombre: row.nombre };
  save();
  return row;
}

async function load(id) {
  const { data, error } = await (await client()).from(TABLE).select('id,nombre,datos').eq('id', id).single();
  if (error) throw error;
  const P = normalizeProject(data.datos);
  P.nube = { id: data.id, nombre: data.nombre };
  return P;
}

async function remove(id) {
  const { error } = await (await client()).from(TABLE).delete().eq('id', id);
  if (error) throw error;
  if (app.P.nube?.id === id) { delete app.P.nube; save(); }
}

/* ---------- interfaz ---------- */
const fecha = s => new Date(s).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const errMsg = err => { console.error(err); return /fetch|network/i.test(err?.message) ? 'Sin conexión con la nube.' : (err?.message || 'Error con la nube.'); };

async function render() {
  const body = $('#clBody');
  if (!cloudConfigured()) {
    body.innerHTML = `<p>La nube todavía no está configurada.</p>
      <p class="muted">Completá <code>SUPABASE_URL</code> y <code>SUPABASE_KEY</code> en <code>js/config.js</code> y corré <code>supabase/schema.sql</code> en tu proyecto de Supabase.</p>`;
    return;
  }
  const P = app.P;
  body.innerHTML = `<h3>Planteo actual</h3>
    <div class="field"><label for="clName">Nombre</label><input type="text" id="clName" maxlength="80" value="${esc(nombreDe(P))}"></div>
    <div class="grid2">
      <button type="button" id="clSave" class="primary">${P.nube?.id ? 'Guardar cambios' : 'Guardar en la nube'}</button>
      <button type="button" id="clSaveNew"${P.nube?.id ? '' : ' hidden'}>Guardar como copia</button>
    </div>
    <h3>Planteos guardados</h3>
    <div id="clList" class="clList"><p class="muted">Cargando…</p></div>`;

  const doSave = async asNew => {
    const nombre = $('#clName').value.trim() || 'Sin nombre';
    $('#clSave').disabled = $('#clSaveNew').disabled = true;
    try { await saveCloud(nombre, asNew); toast(`Guardado en la nube: ${nombre}`, 'ok'); render(); }
    catch (err) { toast(errMsg(err), 'error', 6000); $('#clSave').disabled = $('#clSaveNew').disabled = false; }
  };
  $('#clSave').onclick = () => doSave(false);
  $('#clSaveNew').onclick = () => doSave(true);

  const box = $('#clList');
  try {
    const rows = await list();
    if (!box.isConnected) return;
    box.innerHTML = rows.length ? rows.map(r => `<div class="clRow${r.id === P.nube?.id ? ' cur' : ''}">
        <div class="clInfo"><b>${esc(r.nombre)}</b><span class="muted">${fecha(r.actualizado)}${r.id === P.nube?.id ? ' · abierto' : ''}</span></div>
        <button type="button" data-open="${r.id}">Abrir</button>
        <button type="button" data-del="${r.id}" class="sq" title="Borrar" aria-label="Borrar ${esc(r.nombre)}">🗑</button>
      </div>`).join('') : '<p class="muted">Todavía no hay planteos guardados.</p>';
    box.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      const name = b.closest('.clRow').querySelector('b').textContent;
      if (b.dataset.open) {
        if (!await confirmDialog(`¿Abrir “${name}”? Lo que tenés ahora en el editor se reemplaza (podés deshacer con ⌘Z).`, { ok: 'Abrir' })) return openDialog('dlgCloud');
        try { const d = await load(b.dataset.open); $('#dlgCloud').close(); onOpen(d); toast(`Abierto de la nube: ${name}`, 'ok'); }
        catch (err) { toast(errMsg(err), 'error', 6000); }
      } else if (b.dataset.del) {
        const ok = await confirmDialog(`¿Borrar “${name}” de la nube? No se puede deshacer.`, { ok: 'Borrar', danger: true });
        openDialog('dlgCloud');
        if (!ok) return;
        try { await remove(b.dataset.del); toast('Borrado de la nube'); render(); }
        catch (err) { toast(errMsg(err), 'error', 6000); }
      }
    };
  } catch (err) { box.innerHTML = `<p class="muted">${esc(errMsg(err))}</p>`; }
}

export async function openCloud() {
  openDialog('dlgCloud');
  $('#clBody').innerHTML = '<p class="muted">Conectando…</p>';
  try { if (cloudConfigured()) await client(); }
  catch (err) { $('#clBody').innerHTML = `<p class="muted">${esc(errMsg(err))}</p>`; return; }
  render();
}

/** `open(P)` reemplaza el proyecto del editor con uno abierto de la nube. */
export function initCloud(open) {
  onOpen = open;
  $('#bCloud').onclick = openCloud;
}
