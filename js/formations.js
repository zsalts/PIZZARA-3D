/* ============ formaciones ============
   Coordenadas en metros, equipo propio atacando hacia arriba (y = 0).
   Para el rival se espejan (W - x, L - y), salvo las formaciones "abs" (corner corto),
   que traen listas absolutas para cada equipo. */
import { W, L, uid } from './util.js';

const F433 = [['ARQ',27.5,87.5],['LI',7,69],['CI',20,77],['CD',35,77],['LD',48,69],['VC',27.5,61],['VI',16,49],['VD',39,49],['PI',9,28],['9',27.5,23],['PD',46,28]];
const L433 = [['ARQ','CI'],['ARQ','CD'],['CI','CD'],['CI','LI'],['CD','LD'],['CI','VC'],['CD','VC'],['LI','VI'],['LD','VD'],['VC','VI'],['VC','VD'],['VI','PI'],['VI','9'],['VD','9'],['VD','PD'],['PI','9'],['9','PD']];

export const FORMATIONS = {
  '433': {
    name: '4-3-3',
    pos: F433,
    away: ['1','3','2','6','4','5','8','10','11','9','7'],
    links: L433
  },
  '442': {
    name: '4-4-2',
    pos: [['ARQ',27.5,87.5],['LI',7,69],['CI',20,77],['CD',35,77],['LD',48,69],['VI',8,48],['VCI',21,55],['VCD',34,55],['VD',47,48],['DI',20,27],['DD',35,27]],
    links: [['ARQ','CI'],['ARQ','CD'],['CI','CD'],['CI','LI'],['CD','LD'],['LI','VI'],['LD','VD'],['CI','VCI'],['CD','VCD'],['VCI','VCD'],['VI','VCI'],['VCD','VD'],['VCI','DI'],['VCD','DD'],['VI','DI'],['VD','DD'],['DI','DD']]
  },
  '3331': {
    name: '3-3-3-1',
    pos: [['ARQ',27.5,87.5],['LI',13,73],['LC',27.5,78],['LD',42,73],['VI',10,57],['VC',27.5,61],['VD',45,57],['II',12,40],['EN',27.5,44],['ID',43,40],['9',27.5,24]],
    links: [['ARQ','LC'],['LC','LI'],['LC','LD'],['LI','VI'],['LD','VD'],['LC','VC'],['VC','VI'],['VC','VD'],['VI','II'],['VD','ID'],['VC','EN'],['EN','II'],['EN','ID'],['II','9'],['ID','9'],['EN','9']]
  },
  '4231': {
    name: '4-2-3-1',
    pos: [['ARQ',27.5,87.5],['LI',7,69],['CI',20,77],['CD',35,77],['LD',48,69],['MCI',20,60],['MCD',35,60],['PI',9,38],['EN',27.5,42],['PD',46,38],['9',27.5,23]],
    links: [['ARQ','CI'],['ARQ','CD'],['CI','CD'],['CI','LI'],['CD','LD'],['CI','MCI'],['CD','MCD'],['MCI','MCD'],['LI','PI'],['LD','PD'],['MCI','EN'],['MCD','EN'],['MCI','PI'],['MCD','PD'],['EN','9'],['PI','9'],['PD','9']]
  },
  'pc': {
    name: 'Corner corto',
    abs: true,
    // propio: ataca el arco de arriba (inyectora, parada, pegadora, desviadora...)
    home: [['INY',15.6,0.4],['PAR',26.8,14.2],['PEG',28.4,15.7],['DES',31.5,6.5],['P1',20.5,13.2],['P2',35,13.4],['REB',23.5,8.5],['MED',27.5,40],['D1',17,52],['D2',38,52],['ARQ',27.5,87.5]],
    // rival: arquera + 4 en la línea de fondo, el resto detrás de la mitad de cancha
    away: [['1',27.5,0.9],['2',25,0.4],['3',30,0.4],['4',32.6,0.4],['5',22.4,0.4],['6',8,47.5],['7',16,47.5],['8',24,47.5],['9',31,47.5],['10',39,47.5],['11',47,47.5]],
    links: [['INY','PAR'],['PAR','PEG'],['PEG','DES'],['P1','PAR'],['P2','PEG'],['REB','DES']]
  }
};

export const hasLink = (s, a, b) => s.links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** Reemplaza las jugadoras de `team` del slide por la formación `key`. */
export function applyFormation(s, team, key = '433') {
  const F = FORMATIONS[key] || FORMATIONS['433'];
  s.ents = s.ents.filter(e => !(e.type === 'player' && e.team === team));
  const alive = new Set(s.ents.map(e => e.id));
  s.links = s.links.filter(([a, b]) => alive.has(a) && alive.has(b));
  s.steps = s.steps.map(st => Object.fromEntries(Object.entries(st).filter(([k]) => alive.has(k))));
  const list = F.abs ? F[team] : F.pos;
  list.forEach(([role, x, y], i) => {
    const label = F.abs || team === 'home' ? role : (F.away?.[i] ?? String(i + 1));
    const e = { id: uid(), type: 'player', team, label, hl: false, role, form: key };
    const p = F.abs || team === 'home' ? [x, y] : [W - x, L - y];
    s.ents.push(e);
    s.steps.forEach(st => st[e.id] = [...p]);
  });
}

/** Conexiones automáticas del equipo propio según la formación de cada jugadora. */
export function autoLinks(s) {
  const home = s.ents.filter(e => e.type === 'player' && e.team === 'home');
  const groups = {};
  for (const e of home) (groups[e.form || '433'] ||= []).push(e);
  let added = 0;
  for (const [key, ents] of Object.entries(groups)) {
    const F = FORMATIONS[key]; if (!F) continue;
    const by = {};
    // primero por etiqueta (como la original), después por rol (si se renombró la etiqueta)
    ents.forEach(e => { if (e.label) by[e.label] ??= e.id; });
    ents.forEach(e => { if (e.role) by[e.role] = e.id; });
    F.links.forEach(([a, b]) => {
      if (by[a] && by[b] && by[a] !== by[b] && !hasLink(s, by[a], by[b])) { s.links.push([by[a], by[b]]); added++; }
    });
  }
  return added;
}
