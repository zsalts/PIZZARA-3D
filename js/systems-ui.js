/* ============ sistemas tácticos: interfaz simple ============
   Una grilla con un botón por sistema (incluidos + guardados). Tocar = aplicar al equipo elegido
   en "Aplicar a" (Propio por defecto), con deshacer. "Guardar como sistema" pide solo el nombre.
   Los guardados tienen una × para borrarlos. "Cargar sistemas" agrega los de un .json. */
import { $, $$, esc, download, today, readPrefs, writePrefs } from './util.js';
import { app, S, hooks, snap, unsnap, undo, changed } from './state.js';
import {
  BUILTIN, library, getSystem, addSystems, deleteSystem, applySystem, captureSystem,
  parseSystems, parseSystemsText, exportSystemsText, missingFromLibrary, onLibraryChange,
} from './systems.js';
import { FORMATIONS } from './formations.js';
import { toast, confirmDialog, promptDialog } from './ui.js';

const plural = (n, a, b = a + 's') => `${n} ${n === 1 ? a : b}`;
const nameOf = id => FORMATIONS[id]?.name || getSystem(id)?.name || 'Sistema';
const team = () => $('input[name=sysTeam]:checked')?.value === 'away' ? 'away' : 'home';

/* ---------- grilla ---------- */
export function renderSystems() {
  const mine = library();
  $('#sysGrid').innerHTML =
    BUILTIN.map(b => `<button type="button" class="sysb" data-id="${b.id}" title="Aplicar ${esc(b.name)}${b.abs ? ' (propio ataca, rival defiende)' : ''}">${esc(b.name)}</button>`).join('') +
    mine.map(s => `<span class="sysw"><button type="button" class="sysb mine" data-id="${esc(s.id)}" title="Aplicar ${esc(s.name)}">${esc(s.name)}</button>` +
      `<button type="button" class="sysx" data-del="${esc(s.id)}" aria-label="Borrar ${esc(s.name)}" title="Borrar">×</button></span>`).join('');
  $('#sysExport').hidden = !mine.length;
}

/** Aplica un sistema al equipo elegido (deshacer con ⌘Z o con el botón del aviso). */
export function applyById(id, t = team()) {
  snap();
  // los sistemas guardados traen sus conexiones; los incluidos se conectan con "Conexiones automáticas"
  const r = applySystem(S(), t, id, { links: !FORMATIONS[id] });
  if (!r) { unsnap(); renderSystems(); return toast('Ese sistema ya no existe.', 'error'); }
  app.sel.clear(); changed(); hooks.renderSlides(); hooks.renderProps(); hooks.renderTools();
  toast(`${nameOf(id)} en ${t === 'home' ? 'el equipo propio' : 'el rival'}`, 'ok', 4500, { label: 'Deshacer', run: () => undo() });
  return r;
}

/* ---------- guardar ---------- */
/** Guarda las propias del paso actual con el nombre dado (o lo pide). */
export async function saveCurrent(name) {
  const c = captureSystem(S(), app.step, 'home', { links: true });
  if (!c) return toast('Primero poné jugadoras propias en la cancha.', 'warn');
  if (name == null) name = await promptDialog('Nombre del sistema', '');
  if (name == null) return null;
  c.name = name.trim() || `Sistema ${library().length + 1}`;
  const { added } = addSystems([c]);
  if (!added.length) { toast(`«${c.name}» ya estaba guardado igual.`); return null; }
  toast(`Sistema «${added[0].name}» guardado (${plural(c.players.length, 'jugadora')})`, 'ok');
  return added[0];
}

/* ---------- cargar / exportar ---------- */
const listErr = (errs, n = 2) => errs.slice(0, n).join(' ') + (errs.length > n ? ` (y ${plural(errs.length - n, 'problema')} más)` : '');

/** Importa sistemas desde el texto de un archivo y avisa el resultado. */
export function importSystemsText(text, fname = 'el archivo') {
  const r = parseSystemsText(text);
  if (!r.systems.length) { toast(`No se pudo cargar ${fname}: ${listErr(r.errors)}`, 'error', 9000); return { ...r, added: [], skipped: [] }; }
  const { added, skipped } = addSystems(r.systems);
  let msg = added.length === 1 ? 'Se agregó 1 sistema' : added.length ? `Se agregaron ${added.length} sistemas` : 'No hay sistemas nuevos';
  if (skipped.length) msg += ` (${skipped.length} ya ${skipped.length > 1 ? 'estaban' : 'estaba'})`;
  const problems = [...r.errors, ...r.warnings];
  if (problems.length) msg += `. ${r.errors.length ? `Se saltearon ${r.errors.length}: ` : ''}${listErr(problems)}`;
  toast(msg, problems.length ? 'warn' : 'ok', problems.length ? 9000 : 4000);
  return { ...r, added, skipped };
}
export function exportSystems() {
  const mine = library();
  if (!mine.length) return toast('Todavía no guardaste sistemas.', 'warn');
  download(new Blob([exportSystemsText(mine)], { type: 'application/json' }), `sistemas-${today()}.json`);
  toast(`${plural(mine.length, 'sistema exportado', 'sistemas exportados')}`, 'ok');
}

/** Al abrir un proyecto que trae `systems`: agrega solos a la biblioteca los que falten. */
export function adoptProjectSystems(raw) {
  const miss = missingFromLibrary(parseSystems(raw).systems);
  if (!miss.length) return 0;
  const { added } = addSystems(miss);
  if (added.length) toast(`El proyecto trajo ${plural(added.length, 'sistema')}: ${added.map(s => `«${s.name}»`).join(', ')}`, 'ok', 5000);
  return added.length;
}

/* ---------- init ---------- */
export function initSystemsUI() {
  const t = readPrefs().sysTeam === 'away' ? 'away' : 'home';
  $$('input[name=sysTeam]').forEach(r => { r.checked = r.value === t; r.onchange = () => writePrefs({ sysTeam: team() }); });
  renderSystems();
  $('#sysGrid').onclick = async e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const id = del.dataset.del, name = nameOf(id);
      if (await confirmDialog(`¿Borrar el sistema «${name}»? Las jugadoras ya puestas en los slides no cambian.`, { ok: 'Borrar', danger: true })) { deleteSystem(id); toast(`Sistema «${name}» borrado`); }
      return;
    }
    const b = e.target.closest('.sysb'); if (b) applyById(b.dataset.id);
  };
  $('#sysSave').onclick = () => saveCurrent();
  $('#sysImport').onclick = () => $('#sysFile').click();
  $('#sysFile').onchange = async e => { const f = e.target.files[0]; if (f) importSystemsText(await f.text(), f.name); e.target.value = ''; };
  $('#sysExport').onclick = exportSystems;
  onLibraryChange.add(renderSystems);
}
