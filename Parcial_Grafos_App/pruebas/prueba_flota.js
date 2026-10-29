const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../web/js/solver.js'); const A = require('./ayuda.js'); const py = path.join(__dirname, 'lp_python.py');
const ctx = { log: () => {}, solve: async (lp, o) => { const r = spawnSync('python3', [py, String(o.timeLimit), String(o.gap)], { input: lp, encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) throw new Error(r.stderr); const j = JSON.parse(r.stdout);
  return { ok: j.ok && !/Unbounded/.test(j.status), status: j.status === 'Optimal' ? 'óptimo' : (j.ok ? 'límite de tiempo (mejor solución encontrada, no probada óptima)' : (j.status === 'Infeasible' ? 'infactible' : j.status)), obj: j.obj, gap: j.gap, todos: j.values, val: (n) => j.values[n] ?? 0 }; } };
const chk = (n, v, e, tol = 0.01) => { const ok = Math.abs(v - e) < tol; console.log(ok ? 'OK   ' : 'FALLA', n, Number(v).toFixed(3), '(esperado', e + ')'); if (!ok) process.exitCode = 1; };
const csvp = path.join(__dirname, '..', '..', 'App_TSP_mTSP', 'datos', 'ejemplo_puntos.csv');
const demo = A.cargar(fs.readFileSync(csvp, 'utf8'), { factor: 1.3, metrica: 'haversine' }), D = demo.D, n = D.length;
const dem = fs.readFileSync(csvp, 'utf8').trim().split('\n').slice(1).map((l) => Number(l.split(',').at(-1)));
const V = (k, cap = Infinity, c = 1, v = 40, t = 'camión') => Array.from({ length: k }, () => ({ tipo: t, cap, costoKm: c, vel: v, fijo: 0 }));
(async () => {
  let r = await S.flota(D, ctx, { deposito: 0, vehiculos: V(3), balanceado: true, tiempo: 120 }); chk('3 vehículos balanceado (4-5 por ruta)', r.objetivo, 84.699); console.log('  clientes', r.rutas.map((x) => x.length - 2).join(','));
  r = await S.flota(D, ctx, { deposito: 0, vehiculos: V(3), balanceado: true, abierto: true, tiempo: 120 }); chk('abierto + balanceado', r.objetivo, 58.614);
  r = await S.flota(D, ctx, { deposito: 0, vehiculos: V(3, 35), peso: dem, tiempo: 120 }); chk('capacidad 35 × 3 (CVRP)', r.objetivo, 85.245);
  const a = new Array(n).fill(0), b = new Array(n).fill(48);
  r = await S.flota(D, ctx, { deposito: 0, vehiculos: V(3), balanceado: true, tiempo: 120, vt: { usar: true, inicio: 8, servicio: 0.1, a, b } }); chk('ventanas anchas = sin ventanas', r.objetivo, 84.699);
  // ventanas ajustadas: los nodos 1..4 deben atenderse entre las 8:00 y 8:40 (con salida 8:00)
  const a2 = a.slice(), b2 = b.slice(); [1, 2, 3, 4, 5, 6].forEach((i) => { a2[i] = 8; b2[i] = 9.0; });
  r = await S.flota(D, ctx, { deposito: 0, vehiculos: V(3, Infinity, 1, 40), balanceado: true, tiempo: 180, vt: { usar: true, inicio: 8, servicio: 0.1, a: a2, b: b2 } });
  if (r.rutas.length) { const ok = r.info.every((x, q) => r.rutas[q].every((v, k) => v === 0 || (x.llegadas[k] >= a2[v] - 1e-6 && x.llegadas[k] <= b2[v] + 1e-6))); console.log(ok ? 'OK   ' : 'FALLA', 'ventanas ajustadas respetadas; objetivo', r.objetivo.toFixed(3), '(≥ 84.699)', r.objetivo >= 84.699 - 1e-6 ? 'ok' : 'MAL'); if (!ok) process.exitCode = 1; } else { console.log('ventanas ajustadas:', r.estado); }
  const flotaMixta = [...V(2, 5, 1, 30, 'camión de reparto'), ...V(1, 34, 2.4, 50, 'tractocamión')];
  r = await S.flota(D, ctx, { deposito: 0, vehiculos: flotaMixta, tiempo: 180 });
  const recomp = r.rutas.reduce((s, ru, q) => s + ru.slice(1).reduce((t, v, i) => t + D[ru[i]][v], 0) * flotaMixta.find((f) => f.tipo === r.info[q].tipo).costoKm, 0);
  chk('flota mixta: costo = Σ costo/km × distancia', r.objetivo, recomp, 1e-6); console.log('  ', r.info.map((x) => `${x.tipo} ${x.carga}/${x.cap} ${x.dist.toFixed(1)}km`).join(' | '));
  if (!r.info.every((x) => x.carga <= x.cap + 1e-9)) { console.log('FALLA capacidad'); process.exitCode = 1; }
})();
