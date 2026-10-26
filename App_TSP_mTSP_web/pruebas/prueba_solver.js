// Prueba la lógica de solver.js con el HiGHS de Python como adaptador.
const { spawnSync } = require('child_process');
const path = require('path');
const S = require('../fuente/solver.js');
const py = path.join(__dirname, 'lp_python.py');
const ctx = {
  solve: async (lp, o) => {
    const r = spawnSync('python3', [py, String(o.timeLimit), String(o.gap)], { input: lp, encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(r.stderr);
    const j = JSON.parse(r.stdout);
    const optimo = j.status === 'Optimal';
    return { ok: j.ok, status: optimo ? 'óptimo' : (j.ok ? 'límite de tiempo (mejor solución encontrada, no probada óptima)' : (j.status === 'Infeasible' ? 'infactible' : j.status)),
             obj: j.obj, gap: j.gap, val: (n) => j.values[n] ?? 0 };
  },
};
const fs = require('fs');
const demo = S.cargar(fs.readFileSync(path.join(__dirname, '..', '..', 'App_TSP_mTSP', 'datos', 'ejemplo_puntos.csv'), 'utf8'), { factor: 1.3, metrica: 'haversine', dirigido: false });
const D = demo.D;
const chk = (nombre, val, esp) => { const ok = Math.abs(val - esp) < 1e-2; console.log((ok ? 'OK  ' : 'FALLA'), nombre, val.toFixed(3), '(esperado', esp, ')'); if (!ok) process.exitCode = 1; };
(async () => {
  console.log('nodos', demo.ids.length, demo.tipo);
  let r = await S.tsp(D, ctx, { modo: 'ciclo', origen: 0, tiempo: 60, brecha: 1e-6 }); chk('TSP ciclo', r.objetivo, 68.014);
  r = await S.tsp(D, ctx, { modo: 'abierto', origen: 0, tiempo: 60, brecha: 1e-6 }); chk('TSP abierto', r.objetivo, 59.586);
  r = await S.tsp(D, ctx, { modo: 'fijo', origen: 0, fin: 14, tiempo: 60, brecha: 1e-6 }); console.log('TSP fijo', r.objetivo, r.rutas[0][0], r.rutas[0].at(-1));
  r = await S.tsp(D, ctx, { modo: 'libre', tiempo: 60, brecha: 1e-6 }); console.log('TSP libre', r.objetivo);
  r = await S.mtsp(D, ctx, { m: 3, deposito: 0, lmin: 1, lmax: 0, objetivo: 'suma', abierto: false, tiempo: 60, brecha: 1e-6 }); chk('m-TSP suma m=3', r.objetivo, 73.853);
  r = await S.mtsp(D, ctx, { m: 3, deposito: 0, lmin: 4, lmax: 5, objetivo: 'suma', abierto: false, tiempo: 120, brecha: 1e-6 }); chk('m-TSP 4-5', r.objetivo, 84.699); console.log(r.rutas.map((x) => x.length - 2));
  r = await S.mtsp(D, ctx, { m: 3, deposito: 0, lmin: 4, lmax: 5, objetivo: 'suma', abierto: true, tiempo: 120, brecha: 1e-6 }); console.log('m-TSP 4-5 abierto', r.objetivo);
  r = await S.mtsp(D, ctx, { m: 3, deposito: 0, lmin: 1, lmax: 0, objetivo: 'maximo', abierto: false, tiempo: 120, brecha: 1e-6 }); chk('m-TSP ruta más larga', r.objetivo, 29.8);
  // formatos
  const a = S.cargar('\t1\t2\t3\n1\t#\t5\t9\n2\t5\t#\t2\n3\t9\t2\t#', { factor: 1 }); console.log('matriz', a.ids, a.D[0]);
  const b = S.cargar('origen,destino,costo\n1,2,5\n2,3,2\n1,3,9', { dirigido: false }); console.log('aristas', b.ids, b.D[0]);
})();
