/* Medición con muchos clientes: n clientes al azar, flota de m vehículos; mide construcción del modelo,
   tamaño y el gap que alcanza el MILP en T segundos. Uso: node pruebas/grande.js n m T */
const { spawnSync } = require('child_process'); const path = require('path');
require('../web/js/solver.js'); const Vrp = require('../web/js/vrp.js'); const Va = require('../web/js/variantes.js');
const n = +(process.argv[2] || 100), m = +(process.argv[3] || 5), T = +(process.argv[4] || 60);
let s = 42; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const xy = [[0, 0]]; for (let i = 0; i < n; i++) xy.push([rnd() * 40, rnd() * 40]);
const D = xy.map((a) => xy.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
const nodos = xy.map((_, i) => ({ tipo: i === 0 ? 'dc' : 'cliente', peso: i === 0 ? 0 : 1 + Math.floor(rnd() * 5), rec: 0, premio: 0, par: null, vtOn: false, vtA: 0, vtB: 48 }));
const flota = [{ tipo: 'camión', n: m, cap: Math.ceil((n * 3) / m), costoKm: 1, vel: 30, fijo: 0 }];
const { I } = Va.construir('cvrp', { D, nodos, flota, vt: { inicio: 8, servicio: 0, cierre: null } }, { origen: 0, m, xy });
const ctx = { log: () => {}, solve: async (lp, o) => {
  const r = spawnSync('python3', [path.join(__dirname, 'lp_python.py'), String(Math.max(1, o.timeLimit)), String(o.gap)], { input: lp, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status) throw new Error('HiGHS: ' + (r.stderr || '').slice(0, 300));
  const j = JSON.parse(r.stdout); console.log('  etapa', o.timeLimit.toFixed(1), 's →', j.status, 'obj', j.obj, 'gap', j.gap, 'cota', j.dual);
  return { ok: j.ok, status: j.status === 'Optimal' ? 'óptimo' : (j.ok ? 'límite de tiempo' : j.status), obj: j.obj, gap: j.status === 'Optimal' ? 0 : j.gap, dual: j.dual, val: (k) => j.values[k] || 0, nodos: j.nodos };
} };
(async () => {
  const t0 = Date.now(); const metodo = process.argv[5] || 'mtz'; const r = await Vrp.vrp(I, ctx, { tiempo: T, brecha: 1e-6, metodo, heurInicial: false });
  console.log(`n=${n} m=${m}: construcción+resolución ${((Date.now() - t0) / 1000).toFixed(1)} s · variables ${r.informe && r.informe.variables} (${r.informe && r.informe.binarias} binarias) · restricciones ${r.informe && r.informe.restricciones} · estado: ${r.estado} · objetivo ${r.objetivo} · gap ${r.gap}`);
})();
