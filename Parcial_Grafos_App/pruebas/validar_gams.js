/* Valida las 27 variantes de la app contra los modelos GAMS (GAMS_modelos/) sobre la MISMA instancia CVRP-10.
   Uso: node pruebas/validar_gams.js [id1 id2 ...]   Sale con código 1 si alguna variante no coincide. */
const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../web/js/solver.js'); const Vrp = require('../web/js/vrp.js'); const Va = require('../web/js/variantes.js');
const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'cvrp10_gams.json'), 'utf8'));
const py = path.join(__dirname, 'lp_python.py');
const ctx = { log: () => {}, solve: async (lp, o) => {
  const r = spawnSync('python3', [py, String(Math.max(1, o.timeLimit)), String(o.gap)], { input: lp, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status) throw new Error('HiGHS: ' + (r.stderr || '').slice(0, 300));
  const j = JSON.parse(r.stdout); ctx.nodos = (ctx.nodos || 0) + (j.nodos || 0);
  return { ok: j.ok && !/Unbounded/.test(j.status), status: j.status === 'Optimal' ? 'óptimo' : (j.ok ? 'límite de tiempo' : (j.status === 'Infeasible' ? 'infactible' : j.status)),
    obj: j.obj, gap: j.status === 'Optimal' ? 0 : j.gap, dual: j.dual, nodos: j.nodos, val: (n) => j.values[n] || 0 }; } };

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const DEP3 = { d1: [30, 70], d2: [72, 30], d3: [50, 50] };
const dem = (k) => G.dem[k]; const cli = (k) => G.coord[k];       // k = 1..10 (c_k)
const VT = (k) => G.VT['c' + k];

/* Instancia para cada variante: nodos (depósitos primero, luego clientes), flota y parámetros del usuario */
function instancia(id) {
  const multi = ['mdvrp', 'mdvrptw', 'lrp', 'omdvrp'].includes(id);
  const nDep = multi ? (id === 'lrp' ? 3 : 2) : 1;
  const depNames = multi ? ['d1', 'd2', 'd3'].slice(0, nDep) : ['d'];
  const depXY = (nm) => (nm === 'd' ? G.coord[0] : DEP3[nm]);
  const cs = id === 'sdvrp' || id === 'ccvrp' ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];   // latencia: modelo más difícil, instancia de 8 clientes
  const xy = depNames.map(depXY).concat(cs.map(cli));
  const nodos = depNames.map((nm) => ({ tipo: 'dc', peso: 0, rec: 0, premio: 0, par: null, costoApertura: id === 'lrp' ? { d1: 100, d2: 100, d3: 160 }[nm] : 0, capDep: id === 'lrp' ? { d1: 25, d2: 25, d3: 40 }[nm] : 0 }));
  cs.forEach((k) => {
    const x = { tipo: 'cliente', peso: id === 'sdvrp' ? G.SD_DEM['c' + k] : dem(k), rec: 0, premio: 0, par: null, vtOn: true, vtA: VT(k)[0], vtB: VT(k)[1] };
    if (id === 'vrpb' && k >= 7) x.rec = dem(k);
    if (id === 'vrpspd') x.rec = G.PK['c' + k];
    if (id === 'vrppd') { const par = G.PARES.find(([a, b]) => a === 'c' + k || b === 'c' + k); if (par) x.par = G.PARES.indexOf(par); }
    if (['pcvrp', 'top', 'op', 'ptp'].includes(id)) x.premio = G.PREMIO['c' + k];
    nodos.push(x);
  });
  const D = xy.map((a) => xy.map((b) => dist(a, b)));
  const cap = id === 'minveh' ? 13 : 15;
  const flota = { hfvrp: [{ tipo: 'grande', n: 2, cap: 20, costoKm: 1.3, vel: 1, fijo: 0 }, { tipo: 'pequeno', n: 2, cap: 10, costoKm: 0.8, vel: 1, fijo: 0 }],
    hfvrptw: [{ tipo: 'grande', n: 2, cap: 20, costoKm: 1.3, vel: 1, fijo: 0 }, { tipo: 'pequeno', n: 2, cap: 10, costoKm: 0.8, vel: 1, fijo: 0 }],
    fsmvrp: [{ tipo: 'grande', n: 2, cap: 20, costoKm: 1, vel: 1, fijo: 80 }, { tipo: 'mediano', n: 2, cap: 15, costoKm: 1, vel: 1, fijo: 60 }, { tipo: 'pequeno', n: 2, cap: 10, costoKm: 1, vel: 1, fijo: 45 }] }[id]
    || [{ tipo: 'camión', n: 5, cap, costoKm: 1, vel: 1, fijo: 0 }];
  const p = { m: { tsp: 1, otsp: 1, mtsp: 3, mtspb: 3, omtsp: 3, omtspb: 4, mtspmm: 3, cvrp: 5, ovrp: 5, dcvrp: 5, vrpl: 5, minveh: 5, cvrpb: 4, vrptw: 5, ovrptw: 5, mdvrp: 3, mdvrptw: 3, lrp: 3, vrpb: 5, vrpspd: 5, vrppd: 3, sdvrp: 4, pcvrp: 2, top: 2, cvrpmm: 5, vrpstw: 5, dvrpt: 5, ccvrp: 3, omdvrp: 3 }[id] };
  if (id === 'dcvrp') p.Lmax = 150; if (id === 'top' || id === 'op') p.Lmax = 160; if (id === 'dvrpt') p.tmax = 150; if (id === 'vrpstw') p.pen = 2; if (id === 'vrpl') p.lstops = 3;
  if (id === 'mtspb' || id === 'omtspb' || id === 'cvrpb') p.balanced = true;
  const S0 = { D, nodos, flota, vt: { inicio: 0, servicio: 600, cierre: 480 } };
  return { S: S0, p };
}

/* valor de GAMS y valor que informa la app para comparar */
function valorApp(id, r) {
  if (id === 'pcvrp') return -r.objetivo;                          // GAMS maximiza beneficio neto
  if (id === 'top') return r.premio;                               // GAMS maximiza premio
  if (id === 'minveh') return r.total;                             // distancia con la mínima flota
  return r.objetivo;
}

async function correr(id) {
  const { S: S0, p } = instancia(id);
  const { I, notas } = Va.construir(id, S0, p);
  ctx.nodos = 0; const t0 = Date.now(); const r = await Vrp.vrp(I, ctx, { tiempo: 120, brecha: 1e-6, metodo: 'mtz' });
  const seg = (Date.now() - t0) / 1000;
  const ref = G.z[id]; const val = r.rutas && r.rutas.length ? valorApp(id, r) : null;
  const ok = val !== null && Math.abs(val - ref) <= 1e-3 * Math.max(1, Math.abs(ref));
  return { id, ref, val, ok, estado: r.estado, rutas: r.rutas ? r.rutas.length : 0, seg, notas, nodos: ctx.nodos };
}

module.exports={instancia,ctx,correr};
if (require.main === module) (async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(G.z);
  let malos = 0;
  for (const id of ids) {
    try { const x = await correr(id); if (!x.ok) malos++;
      console.log(`${x.ok ? 'OK  ' : 'FALLA'} ${id.padEnd(8)} GAMS=${G.z[id].toFixed(4).padStart(10)}  app=${x.val === null ? '—' : x.val.toFixed(4).padStart(10)}  ${x.seg.toFixed(1).padStart(5)} s  nodos=${String(x.nodos ?? '—').padStart(6)}  ${x.estado}`);
    } catch (e) { malos++; console.log(`ERR   ${id}: ${e.message}`); }
  }
  console.log(malos ? `${malos} variante(s) no coinciden` : 'Todas las variantes coinciden con GAMS');
  process.exit(malos ? 1 : 0);
})();
