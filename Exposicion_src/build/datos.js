/* Datos de la instancia y resultados de referencia (generados por ../ref/resultados.py) */
const fs = require('fs'), path = require('path');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '../ref/resultados.json'), 'utf8'));
const COORD = [[48, 52], [18, 82], [38, 92], [62, 84], [88, 72], [92, 46], [78, 18], [52, 8], [28, 16], [8, 38], [14, 64]];
const DEM = [0, 4, 3, 5, 4, 3, 5, 4, 3, 5, 2]; const Q = 15, OPT = R.optimo.costo;
const dist = (a, b) => Math.sqrt((COORD[a][0] - COORD[b][0]) ** 2 + (COORD[a][1] - COORD[b][1]) ** 2);
const fmt = (x, d = 2) => Number(x).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
function dRuta(ru) { const p = [0, ...ru, 0]; let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; }
const cargaRuta = (ru) => ru.reduce((a, c) => a + DEM[c], 0);
const rutasTxt = (rutas) => rutas.map((ru, k) => `R${k + 1} [${ru.join('→')}]  q=${cargaRuta(ru)}/${Q}  ${fmt(dRuta(ru), 1)}`);
const GAMS_DIR = path.join(__dirname, '../../GAMS_algoritmos');
const ARCHIVOS = { nn: '01_vecino_mas_cercano', barrido: '02_barrido', insercion: '03_insercion_mas_barata', dos_opt: '04_dos_opt', vnd: '05_vnd_relocate_swap_2opt', tabu: '06_busqueda_tabu', sa: '07_recocido_simulado', ga: '08_algoritmo_genetico', aco: '09_colonia_de_hormigas', grasp: '10_grasp', vns: '11_vns', bb: '12_branch_and_bound_exacto' };
const MARC = {
  nn: ['* ---- solución inicial: vecino más cercano', "   nodo = pick;\n);"],
  barrido: ['* ---- BARRIDO', 'display ang, orden, rot, bests;'],
  insercion: ['* ---- INSERCIÓN MÁS BARATA', 'display rtn, lcr, traza;'],
  dos_opt: ['* 2-opt = un solo vecindario', null], vnd: ['* ---- BÚSQUEDA LOCAL VND', null],
  tabu: ['* ---- BÚSQUEDA TABÚ', 'display hist;'], sa: ['* ---- RECOCIDO SIMULADO', 'display hist, acept;'], ga: ['* ---- ALGORITMO GENÉTICO', 'display hist;'],
  aco: ['* ---- COLONIA DE HORMIGAS', 'display hist, tau;'], grasp: ['* ---- GRASP', 'display hist;'], vns: ['* ---- VNS', 'display hist, histk;'], bb: ['* ---- MODELO EXACTO CVRP', 'display z.l, cvrp.modelStat, cvrp.solveStat;'],
};
function nucleo(id) {
  let t = fs.readFileSync(path.join(GAMS_DIR, ARCHIVOS[id] + '.gms'), 'utf8');
  const [ini, fin] = MARC[id]; let a = t.indexOf(ini); if (a < 0) throw new Error('inicio no encontrado ' + id);
  t = t.slice(a);
  // fin
  const reVND = /kv = kv \+ 1;\s*\);\s*\);/;
  if (fin === null) { const m = reVND.exec(t); t = t.slice(0, m.index + m[0].length); } else { const b = t.indexOf(fin); t = t.slice(0, b + fin.length); }
  const reEval = /^\*\s*---- EVALUAR[^\n]*\n\s*cst = 0; ld = 0; pv = 0; rn = 1; nev = nev \+ 1;[\s\S]*?\n\s*\);\n\s*cst = cst \+ sum\(i\$\(ord\(i\) = pv\+1\), dist\(i,'d'\)\);\n/gm;
  t = t.replace(reEval, '* [EVALUAR trE -> cst: bloque común]\n');
  if (id === 'grasp' || id === 'vns') {
    const re = /^\*\s*---- BÚSQUEDA LOCAL VND[\s\S]*?kv = kv \+ 1;\s*\);\s*\);\n/m; t = t.replace(re, '* [VND completo: relocate, swap y 2-opt; ver archivo 05]\n');
    t = t.replace(/\*\s*\[EVALUAR trE -> cst: bloque común\]\n\s*c0 = cst;\n/, '* [EVALUAR trE -> cst: bloque común]\n   c0 = cst;\n');
  }
  return t.split('\n').map((l) => l.replace(/\s+$/, ''));
}
module.exports = { R, COORD, DEM, Q, OPT, dist, fmt, dRuta, cargaRuta, rutasTxt, nucleo, ARCHIVOS };
