/* Mide cuánto mejora la solución inicial una búsqueda heurística antes del MILP (ahorros, VND, LNS).
   Uso: node pruebas/mejora_inicial.js n m segundos */
require('../web/js/solver.js'); const Va = require('../web/js/variantes.js'); const Heur = require('../web/js/heur.js');
const n = +(process.argv[2] || 100), m = +(process.argv[3] || 5), T = +(process.argv[4] || 8);
let s = 42; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const xy = [[0, 0]]; for (let i = 0; i < n; i++) xy.push([rnd() * 40, rnd() * 40]);
const D = xy.map((a) => xy.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
const nodos = xy.map((_, i) => ({ tipo: i === 0 ? 'dc' : 'cliente', peso: i === 0 ? 0 : 1 + Math.floor(rnd() * 5), rec: 0, premio: 0, par: null, vtOn: false, vtA: 0, vtB: 48 }));
const flota = [{ tipo: 'camión', n: m, cap: 80, costoKm: 1, vel: 30, fijo: 0 }];
const { I } = Va.construir('cvrp', { D, nodos, flota, vt: { inicio: 8, servicio: 0, cierre: null } }, { origen: 0, m, xy });
for (const [alg, t] of [['ahorros', 1], ['vnd', 3], ['lns', T], ['ils', T]]) {
  const t0 = Date.now(); const r = Heur.resolver(I, alg, { tiempo: t, semilla: 1 });
  console.log(alg.padEnd(8), 'objetivo', r.factible ? r.objetivo.toFixed(3) : 'infactible', 'rutas', r.rutas.length, 'en', ((Date.now() - t0) / 1000).toFixed(1), 's');
}
