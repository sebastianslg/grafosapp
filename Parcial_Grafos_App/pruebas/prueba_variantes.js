/* Prueba de las 27 variantes: modelo matemático (HiGHS) vs. fuerza bruta vs. heurísticas/metaheurísticas. */
const { spawnSync } = require('child_process'); const path = require('path');
const S = require('../web/js/solver.js'); const Vrp = require('../web/js/vrp.js'); const H = require('../web/js/heur.js'); const Va = require('../web/js/variantes.js');
const py = path.join(__dirname, 'lp_python.py');
const ctx = { log: () => {}, solve: async (lp, o) => { const r = spawnSync('python3', [py, String(o.timeLimit), String(o.gap)], { input: lp, encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) throw new Error(r.stderr); const j = JSON.parse(r.stdout);
  return { ok: j.ok && !/Unbounded/.test(j.status), status: j.status === 'Optimal' ? 'óptimo' : (j.ok ? 'límite de tiempo' : (j.status === 'Infeasible' ? 'infactible' : j.status)), obj: j.obj, gap: j.status === 'Optimal' ? 0 : j.gap, val: (n) => j.values[n] || 0 }; } };
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function datos(seed, nDep) {
  const rnd = mulberry(seed), N = 7, pts = Array.from({ length: N }, () => [Math.round(rnd() * 40), Math.round(rnd() * 40)]);
  const D = pts.map((a) => pts.map((b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * 10) / 10)); D.forEach((f, i) => { f[i] = Infinity; });
  const nodos = pts.map((_, i) => ({ tipo: i < nDep ? 'dc' : 'cliente', peso: 1 + Math.floor(rnd() * 4), vtOn: i >= nDep && i % 2 === 0, vtA: 8 + (i % 3) * 0.2, vtB: 9.2 + (i % 3) * 0.3, par: undefined }));
  nodos.slice(0, nDep).forEach((x) => { x.peso = 0; });
  const tot = nodos.reduce((a, x) => a + x.peso, 0);
  return { D, nodos, xy: pts, vt: { inicio: 8, servicio: 5 }, flota: [{ tipo: 'A', n: 2, cap: Math.ceil(tot / 2) + 3, costoKm: 1, vel: 30 }, { tipo: 'B', n: 1, cap: Math.ceil(tot / 2) + 6, costoKm: 1.8, vel: 45 }] };
}
function fuerzaBruta(I) {
  const E = H.crear(I, {}), m = I.veh.length, cl = I.cust, n = cl.length, perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
  const best = Array.from({ length: m }, () => new Map());
  for (let k = 0; k < m; k++) for (let mask = 0; mask < (1 << n); mask++) { const sub = cl.filter((_, q) => mask & (1 << q)); let bc = Infinity, bp = null; for (const p of perms(sub)) { const c = E.ruta(k, p); if (c < bc) { bc = c; bp = p; } } best[k].set(mask, [bc, bp]); }
  let bestTotal = Infinity; const assign = new Array(n).fill(0), optAny = I.cl_opt;
  const rec = (q) => {
    if (q === n) { const masks = new Array(m).fill(0), un = []; assign.forEach((a, c) => { if (a >= 0) masks[a] |= 1 << c; }); const R = [], rc = []; for (let k = 0; k < m; k++) { const [c, p] = best[k].get(masks[k]); R.push(p); rc.push(c); } const t = E.total(R, rc); if (t < bestTotal) bestTotal = t; void un; return; }
    for (let k = 0; k < m; k++) { assign[q] = k; rec(q + 1); } if (I.optional && I.optional[cl[q]]) { assign[q] = -1; rec(q + 1); } };
  rec(0); return bestTotal;
}
(async () => {
  const filas = []; let fallos = 0;
  for (const v of Va.VARIANTES) {
    const dat = datos(7 + v.id.length, v.multi ? 2 : 1), { I, notas } = Va.construir(v.id, dat, { m: 2, xy: dat.xy });
    if (v.id === 'lrp') { const E0 = H.crear(I, {}); void E0; }
    const t0 = Date.now(); const ex = await Vrp.vrp(I, ctx, { tiempo: 120, brecha: 1e-9, metodo: 'mtz' }); const tEx = (Date.now() - t0) / 1000;
    let bf = null; if (v.id !== 'sdvrp') bf = fuerzaBruta(I);
    const okBf = bf === null ? null : Math.abs(ex.objetivo - bf) < 1e-4 * Math.max(1, Math.abs(bf)) + 1e-6;
    // heurísticas
    const res = {}; let mejorH = Infinity, mejorN = '';
    if (v.id !== 'sdvrp') for (const a of Object.keys(H.ALGORITMOS)) { const x = H.resolver(I, a, { tiempo: a === 'vecino' || a === 'ahorros' || a === 'barrido' || a === 'insercion' ? 1 : 1.2, semilla: 3 }); res[a] = x.factible ? x.objetivo : null; if (x.factible && x.objetivo < mejorH) { mejorH = x.objetivo; mejorN = a; } }
    const nOK = Object.values(res).filter((x) => x !== null && Math.abs(x - ex.objetivo) < 1e-4 * Math.max(1, Math.abs(ex.objetivo))).length;
    filas.push({ id: v.id, nombre: v.nombre, res, ex: ex.objetivo, bf, okBf, tEx, mejorH: isFinite(mejorH) ? mejorH : null, mejorN, nOK, estado: ex.estado });
    const gapH = isFinite(mejorH) ? ((mejorH - ex.objetivo) / Math.abs(ex.objetivo) * 100).toFixed(2) + '%' : 'n/a';
    console.log((okBf === false ? 'FALLA ' : 'OK    ') + v.id.padEnd(8), 'MILP', ex.objetivo === undefined ? ex.estado : ex.objetivo.toFixed(3), '| fuerza bruta', bf === null ? 'n/a' : bf.toFixed(3), '| mejor heur.', isFinite(mejorH) ? mejorH.toFixed(3) + ' (' + mejorN + ', gap ' + gapH + ')' : 'ninguna factible', '| algoritmos en el óptimo:', nOK + '/' + Object.keys(res).length, '|', tEx.toFixed(1) + 's', notas.length ? '' : '');
    if (okBf === false) fallos++;
  }
  require('fs').writeFileSync(path.join(__dirname, 'resultados_variantes.json'), JSON.stringify(filas, null, 1));
  console.log(fallos ? 'FALLOS: ' + fallos : 'TODAS LAS VARIANTES COINCIDEN CON LA FUERZA BRUTA');
})();
