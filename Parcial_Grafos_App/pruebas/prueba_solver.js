const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../web/js/solver.js'); const py = path.join(__dirname, 'lp_python.py');
const ctx = { solve: async (lp, o) => { const r = spawnSync('python3', [py, String(o.timeLimit), String(o.gap)], { input: lp, encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) throw new Error(r.stderr); const j = JSON.parse(r.stdout);
  return { ok: j.ok, status: j.status === 'Optimal' ? 'óptimo' : (j.ok ? 'límite de tiempo (mejor solución encontrada, no probada óptima)' : (j.status === 'Infeasible' ? 'infactible' : (j.status === 'Unbounded' ? 'no acotado' : j.status))), obj: j.obj, gap: j.gap, todos: j.values, val: (n) => j.values[n] ?? 0 }; } };
const cargar = (k) => { const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'datos', k + '.json'))); const n = d.D.length; return { d, D: d.D.map((r, i) => r.map((v, j) => (i === j || v === null ? Infinity : v))) }; };
const chk = (nombre, val, esp, tol = 0.06) => { const ok = Math.abs(val - esp) < tol; console.log(ok ? 'OK   ' : 'FALLA', nombre, Number(val).toFixed(3), '(esperado', esp + ')'); if (!ok) process.exitCode = 1; };
(async () => {
  const ch = cargar('china'), ca = cargar('cali');
  let r = await S.camino(ch.D, ctx, { origen: 1, destino: 24 }); chk('China camino Top2→Top25', r.objetivo, 1972.2); console.log('  ruta', r.rutas[0].map((i) => i + 1).join('>'));
  r = await S.caminosDesde(ch.D, ctx, { origenes: [1] }); chk('China desde Top2 a Top25', r.dist[0][24], 1972.2);
  r = await S.arbol(ch.D, ctx, { raiz: 10, tiempo: 120 }); chk('China árbol raíz 11', r.objetivo, 8130.1); console.log('  aristas', r.aristas.length);
  r = await S.tsp(ca.D, ctx, { modo: 'ciclo', origen: 0, tiempo: 60, brecha: 1e-6 }); chk('Cali TSP', r.objetivo, 72.048, 0.01);
  r = await S.mtsp(ca.D, ctx, { m: 2, deposito: 0, lmin: 12, lmax: 13, objetivo: 'suma', abierto: false, tiempo: 120, brecha: 1e-6 }); chk('Cali m-TSP 12/13', r.objetivo, 75.675, 0.01);
  r = await S.camino(ca.D, ctx, { origen: 1, destino: 25 }); chk('Cali camino 1→25', r.objetivo, 8.857, 0.01);
})();
