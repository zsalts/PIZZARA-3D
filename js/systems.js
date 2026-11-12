/* ============ sistemas tácticos: incluidos + biblioteca personal ============
   Formato de archivo (también es el que se guarda en localStorage):
   {
     "type": "pizarra-sistemas", "version": 1,
     "systems": [
       { "name": "3-4-3 presión alta",
         "players": [ { "label": "ARQ", "role": "ARQ", "x": 27.5, "y": 87.5 }, … ],
         "links":   [ ["ARQ", "LC"], … ] }          ← opcional, por etiqueta (o rol)
     ]
   }
   Coordenadas en metros: x de 0 a 55 (ancho), y de 0 a 91,4 (largo), del lado del equipo propio
   (el propio defiende el arco de abajo, y = 91,4, y ataca hacia y = 0). Al aplicarlo al rival se espeja. */
import { W, L, uid, clone } from './util.js';
import { FORMATIONS, applyFormation, hasLink } from './formations.js';

export const SYS_KEY = 'pizarra-sistemas-v1';
export const SYS_TYPE = 'pizarra-sistemas';
export const SYS_VERSION = 1;
const MARGIN = 3;          // se aceptan jugadoras hasta 3 m afuera de la cancha (igual que el editor)
const MAX_PLAYERS = 30;
const r2 = v => Math.round(v * 100) / 100;

/* ---------- incluidos ---------- */
export const BUILTIN = Object.entries(FORMATIONS).map(([key, f]) => ({ id: key, name: f.name, builtin: true, abs: !!f.abs }));

/* ---------- biblioteca (localStorage, compartida entre proyectos) ---------- */
let lib = null;
export const onLibraryChange = new Set();
export function library() {
  if (!lib) {
    lib = [];
    try {
      const raw = JSON.parse(localStorage.getItem(SYS_KEY) || 'null');
      const ids = new Set();
      for (const [i, s] of (Array.isArray(raw?.systems) ? raw.systems : []).entries()) {
        const r = normSystem(s, i); if (!r.sys) continue;   // una entrada dañada no tira abajo las demás
        let id = typeof s.id === 'string' && s.id ? s.id : uid();
        while (ids.has(id) || FORMATIONS[id]) id = uid();
        ids.add(id); lib.push({ id, ...r.sys });
      }
    } catch { lib = []; }
  }
  return lib;
}
/** Solo para pruebas: olvida la biblioteca en memoria y la vuelve a leer. */
export function reloadLibrary() { lib = null; return library(); }
function persist() {
  let ok = true;
  try { localStorage.setItem(SYS_KEY, JSON.stringify({ type: SYS_TYPE, version: SYS_VERSION, systems: lib })); }
  catch { ok = false; }
  onLibraryChange.forEach(f => f());
  return ok;
}
export const getSystem = id => library().find(s => s.id === id) || null;

/** Huella del contenido (para no duplicar al importar). */
export const fingerprint = s => JSON.stringify([s.players.map(p => [p.label, p.role, r2(p.x), r2(p.y)]), (s.links || []).map(l => [...l].sort()).sort()]);
// mismo contenido = mismo sistema, aunque se haya renombrado (por ejemplo "(2)" al chocar de nombre)
const hasSame = s => { const f = fingerprint(s); return library().some(x => fingerprint(x) === f); };
function freeName(name) {
  const names = new Set(library().map(s => s.name));
  if (!names.has(name)) return name;
  for (let n = 2; ; n++) if (!names.has(`${name} (${n})`)) return `${name} (${n})`;
}

export function addSystem(s) {
  const sys = { id: uid(), name: freeName(s.name || 'Sistema'), players: clone(s.players), links: clone(s.links || []) };
  library().push(sys); persist();
  return sys;
}
/** Agrega varios (de un archivo o de un proyecto). Saltea los de igual contenido; renombra los que chocan de nombre. */
export function addSystems(list) {
  const added = [], skipped = [];
  for (const s of list) { if (hasSame(s)) skipped.push(s.name); else added.push(addSystem(s)); }
  return { added, skipped };
}
/** Sistemas de `list` que no están en la biblioteca (por contenido). */
export const missingFromLibrary = list => list.filter(s => !hasSame(s));

export function deleteSystem(id) {
  const i = library().findIndex(s => s.id === id); if (i < 0) return false;
  lib.splice(i, 1); persist(); return true;
}

/* ---------- validación del archivo ---------- */
const s0 = v => (v == null ? '' : String(v)).trim();
const normLabel = v => s0(v).toUpperCase().slice(0, 4);
const normRole = v => s0(v).toUpperCase().slice(0, 8);
const num = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v) ? +v : NaN;

function normSystem(s, i) {
  const where = `Sistema ${i + 1}`;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { error: `${where}: no es un objeto { name, players }.` };
  const name = s0(s.name).slice(0, 60);
  if (!name) return { error: `${where}: falta el nombre ("name").` };
  const tag = `«${name}»`;
  if (!Array.isArray(s.players) || !s.players.length) return { error: `${tag}: no tiene jugadoras ("players" vacío o ausente).` };
  if (s.players.length > MAX_PLAYERS) return { error: `${tag}: tiene ${s.players.length} jugadoras (máximo ${MAX_PLAYERS}).` };
  const players = [];
  for (const [j, p] of s.players.entries()) {
    const who = `${tag}, jugadora ${j + 1}`;
    if (!p || typeof p !== 'object') return { error: `${who}: no es un objeto { label, role, x, y }.` };
    const x = num(p.x), y = num(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: `${who}: faltan las coordenadas "x" e "y" (en metros).` };
    if (x < -MARGIN || x > W + MARGIN) return { error: `${who}: x = ${x} está fuera de la cancha (0 a ${W} m de ancho).` };
    if (y < -MARGIN || y > L + MARGIN) return { error: `${who}: y = ${y} está fuera de la cancha (0 a ${L} m de largo).` };
    const label = normLabel(p.label ?? p.role ?? j + 1);
    players.push({ label, role: normRole(p.role) || label, x: r2(x), y: r2(y) });
  }
  // conexiones: por etiqueta o rol; las que no se pueden resolver se descartan con aviso
  const links = [], keys = new Set(players.flatMap(p => [p.label, p.role]));
  let dropped = 0;
  if (s.links != null && !Array.isArray(s.links)) dropped++;
  const ref = v => { const u = s0(v).toUpperCase(); return !u ? null : keys.has(u) ? u : keys.has(u.slice(0, 4)) ? u.slice(0, 4) : null; };
  for (const l of Array.isArray(s.links) ? s.links : []) {
    if (!Array.isArray(l) || l.length < 2) { dropped++; continue; }
    const a = ref(l[0]), b = ref(l[1]);
    if (!a || !b || a === b) { dropped++; continue; }
    if (!links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) links.push([a, b]);
  }
  return { sys: { name, players, links }, warning: dropped ? `${tag}: se descartaron ${dropped} conexión${dropped > 1 ? 'es' : ''} con etiquetas que no existen.` : null };
}

/**
 * Valida un archivo de sistemas ya parseado. Acepta el formato documentado, un array de sistemas,
 * un sistema suelto o un proyecto que traiga el campo `systems`.
 * Devuelve { systems, errors, warnings } (errors no vacío y systems vacío = archivo inválido).
 */
export function parseSystems(d) {
  const errors = [], warnings = [], systems = [];
  let list = null;
  if (Array.isArray(d)) list = d;
  else if (d && typeof d === 'object') {
    if (d.type != null && d.type !== SYS_TYPE && !Array.isArray(d.slides)) return { systems, warnings, errors: [`No es un archivo de sistemas (type = "${d.type}"; se esperaba "${SYS_TYPE}").`] };
    if (d.version != null && !(+d.version >= 1 && +d.version <= SYS_VERSION)) return { systems, warnings, errors: [`Versión ${d.version} del archivo no soportada (esta app lee la versión ${SYS_VERSION}).`] };
    if (Array.isArray(d.systems)) list = d.systems;
    else if (Array.isArray(d.players)) list = [d];
    else if (Array.isArray(d.slides)) return { systems, warnings, errors: ['Es un proyecto sin sistemas tácticos: abrilo con “Abrir proyecto”.'] };
  }
  if (!list) return { systems, warnings, errors: ['El archivo no tiene sistemas: falta la lista "systems".'] };
  if (!list.length) return { systems, warnings, errors: ['El archivo no trae ningún sistema ("systems" está vacío).'] };
  list.forEach((s, i) => { const r = normSystem(s, i); if (r.error) errors.push(r.error); else { systems.push(r.sys); if (r.warning) warnings.push(r.warning); } });
  return { systems, errors, warnings };
}
/** Lee el texto de un archivo. Nunca lanza: los problemas vienen en `errors`. */
export function parseSystemsText(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { systems: [], warnings: [], errors: ['El archivo no es un JSON válido.'] }; }
  return parseSystems(d);
}
export const isSystemsFile = d => !!d && typeof d === 'object' && !Array.isArray(d) && d.type === SYS_TYPE;

/** Texto del archivo para compartir (sin ids internos). */
export function exportSystemsText(list = library()) {
  return JSON.stringify({ type: SYS_TYPE, version: SYS_VERSION, systems: list.map(({ name, players, links }) => ({ name, players, links })) }, null, 1);
}
/** Para guardar dentro del proyecto (campo opcional `systems`). */
export const projectSystems = () => library().map(({ name, players, links }) => clone({ name, players, links }));

/* ---------- capturar / aplicar ---------- */
/** Toma las jugadoras de `team` en el paso `step` del slide. Rival → se espeja al lado propio. */
export function captureSystem(s, step, team, { name = '', links = true } = {}) {
  const pos = s.steps[step] || s.steps[0];
  const pl = s.ents.filter(e => e.type === 'player' && e.team === team && pos[e.id]);
  if (!pl.length) return null;
  const players = pl.map((e, j) => {
    let [x, y] = pos[e.id];
    if (team === 'away') [x, y] = [W - x, L - y];
    const label = normLabel(e.label) || String(j + 1);
    return { label, role: normRole(e.role) || label, x: r2(x), y: r2(y) };
  });
  // referencia de cada jugadora para las conexiones: la etiqueta si es única, si no el rol si es único
  const cnt = k => players.filter(p => p.label === k).length + players.filter(p => p.role === k && p.label !== k).length;
  const ref = pl.map((e, j) => cnt(players[j].label) === 1 ? players[j].label : cnt(players[j].role) === 1 ? players[j].role : null);
  const idx = new Map(pl.map((e, j) => [e.id, j]));
  const out = [];
  if (links) for (const [a, b] of s.links) {
    if (!idx.has(a) || !idx.has(b)) continue;
    const A = ref[idx.get(a)], B = ref[idx.get(b)];
    if (A && B && A !== B && !out.some(([x, y]) => (x === A && y === B) || (x === B && y === A))) out.push([A, B]);
  }
  return { name: s0(name), players, links: out };
}

/** Etiquetas del rival: se conservan las numéricas; las demás pasan a números libres (como hoy con las formaciones). */
function awayLabels(players) {
  const keep = players.map(p => /^\d{1,2}$/.test(p.label) ? p.label : null);
  const used = new Set(keep.filter(Boolean));
  let n = 1;
  return keep.map(k => { if (k) return k; while (used.has(String(n))) n++; used.add(String(n)); return String(n); });
}

/** Une las jugadoras recién puestas según una lista de conexiones (por etiqueta, después por rol). */
function linkNew(s, ents, links) {
  const by = {};
  ents.forEach(e => { if (e.label) by[e.label] ??= e.id; });
  ents.forEach(e => { if (e.role) by[e.role] ??= e.id; });
  let added = 0;
  for (const [a, b] of links || []) {
    const A = by[a], B = by[b];
    if (A && B && A !== B && !hasLink(s, A, B)) { s.links.push([A, B]); added++; }
  }
  return added;
}

/**
 * Reemplaza las jugadoras de `team` del slide por el sistema `id` (incluido o personal).
 * Devuelve { n: jugadoras, links: conexiones agregadas } o null si el sistema no existe.
 */
export function applySystem(s, team, id, { links = false } = {}) {
  if (FORMATIONS[id]) {
    applyFormation(s, team, id);
    const ents = s.ents.filter(e => e.type === 'player' && e.team === team);
    return { n: ents.length, links: links ? linkNew(s, ents.map(e => ({ ...e, label: e.role })), FORMATIONS[id].links) : 0 };
  }
  const sys = getSystem(id); if (!sys) return null;
  s.ents = s.ents.filter(e => !(e.type === 'player' && e.team === team));
  const alive = new Set(s.ents.map(e => e.id));
  s.links = s.links.filter(([a, b]) => alive.has(a) && alive.has(b));
  s.steps = s.steps.map(st => Object.fromEntries(Object.entries(st).filter(([k]) => alive.has(k))));
  const labels = team === 'away' ? awayLabels(sys.players) : sys.players.map(p => p.label);
  const ents = sys.players.map((p, i) => {
    const e = { id: uid(), type: 'player', team, label: labels[i], hl: false, role: p.role || p.label, form: 'u:' + sys.id };
    const pt = team === 'home' ? [p.x, p.y] : [W - p.x, L - p.y];
    s.ents.push(e); s.steps.forEach(st => st[e.id] = [...pt]);
    return e;
  });
  // para conectar se usan las etiquetas originales del sistema (en el rival cambian a números)
  return { n: ents.length, links: links ? linkNew(s, ents.map((e, i) => ({ ...e, label: sys.players[i].label })), sys.links) : 0 };
}

/** Conexiones de un sistema según la clave guardada en cada jugadora (`form`), para "Conexiones automáticas". */
export function linksFor(key) {
  if (FORMATIONS[key]) return FORMATIONS[key].links;
  if (typeof key === 'string' && key.startsWith('u:')) return getSystem(key.slice(2))?.links || null;
  return null;
}
