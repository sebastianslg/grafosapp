/* Regresión a escala: resuelve CVRP con 20, 50 y 100 clientes (instancias fijas) y compara con la referencia guardada.
   Falla si una solución empeora más de un 2 % (6 % con 100 clientes) o si una corrida deja de dar solución.
   Uso: node pruebas/regresion_escala.js [--actualizar] [segundos_por_tamaño]
   La referencia está en pruebas/regresion_escala.json. */
const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
require('../web/js/solver.js'); require('../web/js/heur.js'); const Vrp = require('../web/js/vrp.js'); const Va = require('../web/js/variantes.js');
const actualizar = process.argv.includes('--actualizar'); const T = +(process.argv.filter((a) => /^\d+$/.test(a))[0] || 30);
const REF = path.join(__dirname, 'regresion_escala.json');
const LP = path.join(__dirname, 'lp_python.py');
const ctx = { log: () => {}, solve: async (lp, o) => {
  const r = spawnSync('python3', [LP, String(Math.max(1, o.timeLimit)), String(o.gap)], { input: lp, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status) throw new Error('HiGHS: ' + (r.stderr || '').slice(0, 200));
  const j = JSON.parse(r.stdout);
  return { ok: j.ok, status: j.status === 'Optimal' ? 'óptimo' : (j.ok ? 'límite de tiempo' : j.status), obj: j.obj, gap: j.status === 'Optimal' ? 0 : j.gap, dual: j.dual, val: (k) => j.values[k] || 0, nodos: j.nodos };
} };
function instancia(n, m) {   // instancia fija: misma semilla para siempre
  let s = 1000 + n; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const xy = [[0, 0]]; for (let i = 0; i < n; i++) xy.push([rnd() * 40, rnd() * 40]);
  const D = xy.map((a) => xy.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
  const nodos = xy.map((_, i) => ({ tipo: i === 0 ? 'dc' : 'cliente', peso: i === 0 ? 0 : 1 + Math.floor(rnd() * 5), rec: 0, premio: 0, par: null, vtOn: false, vtA: 0, vtB: 48 }));
  const flota = [{ tipo: 'camión', n: m, cap: Math.ceil(n * 3 / m * 1.3), costoKm: 1, vel: 30, fijo: 0 }];
  return Va.construir('cvrp', { D, nodos, flota, vt: { inicio: 8, servicio: 0, cierre: null } }, { origen: 0, m, xy }).I;
}
if (process.env.SOLO) { /* sólo para diagnóstico */ }
(async () => {
  const casos = process.env.CASOS ? JSON.parse(process.env.CASOS) : [[20, 3], [50, 4], [100, 5]], res = {};
  for (const [n, m] of casos) {
    const I = instancia(n, m), t0 = Date.now();
    const r = await Vrp.vrp(I, ctx, { tiempo: T, brecha: 1e-6, metodo: process.env.METODO || 'arco' });
    res[n] = { objetivo: r.rutas && r.rutas.length ? +r.objetivo.toFixed(4) : null, gap: r.gap != null ? +r.gap.toFixed(5) : null, estado: r.estado, segundos: +((Date.now() - t0) / 1000).toFixed(1) };
    console.log(`n=${n}: objetivo ${res[n].objetivo} · brecha ${res[n].gap} · ${res[n].estado} · ${res[n].segundos} s`);
  }
  if (process.env.DIAG) process.exit(0);
  if (actualizar || !fs.existsSync(REF)) { fs.writeFileSync(REF, JSON.stringify(res, null, 1)); console.log('referencia guardada en', REF); process.exit(0); }
  const ref = JSON.parse(fs.readFileSync(REF, 'utf8')); let malos = 0;
  for (const n of Object.keys(ref)) {
    const a = ref[n].objetivo, b = res[n].objetivo;
    if (b == null) { malos++; console.log(`FALLA n=${n}: ya no hay solución`); continue; }
    /* la heurística de inicio usa un límite de tiempo: con 100 clientes su resultado varía entre corridas (hasta ~6 %) */
    const umbral = +n >= 100 ? 1.06 : 1.02;
    if (a != null && b > a * umbral) { malos++; console.log(`FALLA n=${n}: empeoró de ${a} a ${b} (umbral ${((umbral - 1) * 100).toFixed(0)} %)`); continue; }
    console.log(`OK    n=${n}: ${b} (referencia ${a})`);
  }
  console.log(malos ? `${malos} regresión(es)` : 'Sin regresiones a escala');
  process.exit(malos ? 1 : 0);
})();
