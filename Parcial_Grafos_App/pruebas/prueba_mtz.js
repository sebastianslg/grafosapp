const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../web/js/solver.js'); const A = require('./ayuda.js'); const py = path.join(__dirname, 'lp_python.py');
const ctx = { log: () => {}, solve: async (lp, o) => { const r = spawnSync('python3', [py, String(o.timeLimit), String(o.gap)], { input: lp, encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) throw new Error(r.stderr); const j = JSON.parse(r.stdout);
  return { ok: j.ok, status: j.status === 'Optimal' ? 'óptimo' : (j.ok ? 'límite de tiempo (mejor solución encontrada, no probada óptima)' : j.status), obj: j.obj, gap: j.gap, todos: j.values, val: (n) => j.values[n] ?? 0 }; } };
const chk = (n, v, e, t0) => { const ok = Math.abs(v - e) < 0.01; console.log(ok ? 'OK   ' : 'FALLA', n, Number(v).toFixed(3), '(esperado', e + ')', t0 ? ((Date.now() - t0) / 1000).toFixed(1) + ' s' : ''); if (!ok) process.exitCode = 1; };
const demo = A.cargar(fs.readFileSync(path.join(__dirname, '..', '..', 'App_TSP_mTSP', 'datos', 'ejemplo_puntos.csv'), 'utf8'), { factor: 1.3, metrica: 'haversine' }), D = demo.D;
const ch = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'datos', 'china.json'))), Dc = ch.D.map((f, i) => f.map((v, j) => (i === j ? Infinity : v)));
(async () => {
  let t = Date.now(), r;
  r = await S.tsp(D, ctx, { modo: 'ciclo', origen: 0, tiempo: 120, brecha: 1e-6, metodo: 'mtz' }); chk('TSP MTZ circuito (ec. 1-3 del curso)', r.objetivo, 68.014, t);
  t = Date.now(); r = await S.tsp(D, ctx, { modo: 'abierto', origen: 0, tiempo: 120, brecha: 1e-6, metodo: 'mtz' }); chk('TSP MTZ abierto', r.objetivo, 59.586, t);
  t = Date.now(); r = await S.tsp(Dc, ctx, { modo: 'ciclo', origen: 0, tiempo: 120, brecha: 1e-6, metodo: 'mtz' }); chk('TSP MTZ China 25 ciudades', r.objetivo, 10423.3, t);
  t = Date.now(); r = await S.mtsp(D, ctx, { m: 3, deposito: 0, lmin: 1, lmax: 0, objetivo: 'suma', abierto: false, tiempo: 120, brecha: 1e-6, metodo: 'mtz' }); chk('m-TSP MTZ m=3 (ec. 1-5 del curso)', r.objetivo, 73.853, t);
  t = Date.now(); r = await S.mtsp(D, ctx, { m: 3, deposito: 0, lmin: 4, lmax: 5, objetivo: 'suma', abierto: false, tiempo: 120, brecha: 1e-6, metodo: 'mtz' }); chk('m-TSP MTZ balanceado 4-5', r.objetivo, 84.699, t);
  t = Date.now(); r = await S.mtsp(D, ctx, { m: 3, deposito: 0, lmin: 4, lmax: 5, objetivo: 'suma', abierto: true, tiempo: 120, brecha: 1e-6, metodo: 'mtz' }); chk('m-TSP MTZ abierto balanceado', r.objetivo, 58.614, t);
})();
