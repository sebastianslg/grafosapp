/* Modelos de optimización exactos para TSP y m-TSP (MILP). Independiente del solver:
   recibe ctx.solve(lpText, {timeLimit, gap}) -> {ok, status, obj, gap, val(nombre)}. */
(function (root) {
  'use strict';
  const INF = Infinity;

  /* ---------- constructor de modelos y escritura en formato LP ---------- */
  class Model {
    constructor() { this.vars = []; this.idx = new Map(); this.cons = []; }
    addVar(name, cost, lb, ub, int) {
      this.idx.set(name, this.vars.length);
      this.vars.push({ name, cost, lb, ub, int });
      return name;
    }
    addCon(names, coefs, lo, hi) { this.cons.push({ names, coefs, lo, hi }); }
    toLP() {
      const fmt = (c) => { const a = Math.abs(c); const s = a === Math.round(a) ? String(a) : a.toFixed(6); return (c < 0 ? '- ' : '+ ') + s; };
      const expr = (names, coefs) => {
        const out = []; let line = [];
        names.forEach((n, i) => {
          const c = Array.isArray(coefs) ? coefs[i] : coefs;
          if (c === 0) return;
          line.push(fmt(c) + ' ' + n);
          if (line.length >= 8) { out.push(line.join(' ')); line = []; }
        });
        if (line.length) out.push(line.join(' '));
        return out.join('\n   ');
      };
      const L = ['Minimize'];
      const on = [], oc = [];
      this.vars.forEach((v) => { if (v.cost !== 0) { on.push(v.name); oc.push(v.cost); } });
      L.push(' obj: ' + (on.length ? expr(on, oc) : '0 ' + this.vars[0].name));
      L.push('Subject To');
      this.cons.forEach((c, k) => {
        if (!c.names.length) return;
        const e = expr(c.names, c.coefs);
        if (!e) return;
        if (c.lo === c.hi) L.push(' r' + k + ': ' + e + ' = ' + c.lo);
        else {
          if (c.lo > -INF) L.push(' r' + k + 'a: ' + e + ' >= ' + c.lo);
          if (c.hi < INF) L.push(' r' + k + 'b: ' + e + ' <= ' + c.hi);
        }
      });
      L.push('Bounds');
      const bin = [], gen = [];
      this.vars.forEach((v) => {
        if (v.int && v.lb === 0 && v.ub === 1) { bin.push(v.name); return; }
        if (v.int) gen.push(v.name);
        if (v.lb === 0 && v.ub === INF) return;
        L.push(' ' + (v.lb === -INF ? '-inf' : v.lb) + ' <= ' + v.name + ' <= ' + (v.ub === INF ? 'inf' : v.ub));
      });
      if (bin.length) { L.push('Binary'); for (let i = 0; i < bin.length; i += 10) L.push(' ' + bin.slice(i, i + 10).join(' ')); }
      if (gen.length) { L.push('General'); for (let i = 0; i < gen.length; i += 10) L.push(' ' + gen.slice(i, i + 10).join(' ')); }
      L.push('End');
      return L.join('\n');
    }
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const log = (ctx, s) => { if (ctx && ctx.log) ctx.log(s); };

  /* ---------- TSP exacto (asignación + cortes de subtour DFJ) ---------- */
  function ciclos(succ) {
    const vis = new Set(), out = [];
    for (let a = 0; a < succ.length; a++) {
      if (vis.has(a)) continue;
      const c = []; let u = a;
      while (!vis.has(u)) { vis.add(u); c.push(u); u = succ[u]; }
      out.push(c);
    }
    return out;
  }

  async function tspCore(E, ctx, opts) {
    const N = E.length, t0 = now();
    const m = new Model(), nm = (i, j) => 'x_' + i + '_' + j;
    const ent = Array.from({ length: N }, () => []), sal = Array.from({ length: N }, () => []);
    const has = new Set();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i !== j && isFinite(E[i][j])) { m.addVar(nm(i, j), E[i][j], 0, 1, true); sal[i].push(nm(i, j)); ent[j].push(nm(i, j)); has.add(i + ',' + j); }
    }
    for (let i = 0; i < N; i++) { m.addCon(sal[i], 1, 1, 1); m.addCon(ent[i], 1, 1, 1); }
    let cortes = 0;
    for (;;) {
      const left = opts.tiempo - (now() - t0) / 1000;
      if (left <= 0.5) return { estado: 'límite de tiempo (sin tour válido)', cortes };
      const sol = await ctx.solve(m.toLP(), { timeLimit: left, gap: opts.brecha });
      if (!sol.ok) return { estado: sol.status, cortes };
      const succ = new Array(N).fill(-1);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (has.has(i + ',' + j) && sol.val(nm(i, j)) > 0.5) succ[i] = j;
      if (succ.includes(-1)) return { estado: 'infactible', cortes };
      const cs = ciclos(succ);
      log(ctx, 'TSP: ' + cs.length + ' subcircuito(s), ' + cortes + ' cortes');
      if (cs.length === 1) return { estado: sol.status, succ, obj: sol.obj, gap: sol.gap, cortes };
      for (const S of cs) {
        const inS = new Set(S), inter = [], front = [];
        for (const i of S) for (let j = 0; j < N; j++) if (has.has(i + ',' + j)) (inS.has(j) ? inter : front).push(nm(i, j));
        if (inter.length <= front.length) m.addCon(inter, 1, -INF, S.length - 1);
        else m.addCon(front, 1, 1, INF);
        cortes++;
      }
    }
  }

  /* D: matriz (Infinity = sin arco). modo: ciclo | abierto | fijo | libre */
  async function tsp(D, ctx, o) {
    const t0 = now(), n = D.length, s = o.origen || 0;
    let E;
    if (o.modo === 'ciclo') E = D.map((r) => r.slice());
    else {
      E = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(INF));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) E[i][j] = D[i][j];
      if (o.modo === 'abierto') { for (let i = 0; i < n; i++) E[i][n] = 0; E[s][n] = INF; E[n][s] = 0; }
      else if (o.modo === 'fijo') { E[o.fin][n] = 0; E[n][s] = 0; }
      else { for (let i = 0; i < n; i++) { E[i][n] = 0; E[n][i] = 0; } }
    }
    const r = await tspCore(E, ctx, o);
    if (!r.succ) return { estado: r.estado, rutas: [] };
    let ruta = [], u;
    if (o.modo === 'ciclo') { ruta = [s]; u = r.succ[s]; while (u !== s) { ruta.push(u); u = r.succ[u]; } ruta.push(s); }
    else { u = o.modo === 'libre' ? r.succ[n] : s; while (u !== n) { ruta.push(u); u = r.succ[u]; } }
    const dist = ruta.slice(1).reduce((a, v, i) => a + D[ruta[i]][v], 0);
    return { estado: r.estado, objetivo: dist, rutas: [ruta], dists: [dist], gap: r.gap, cortes: r.cortes, seg: (now() - t0) / 1000 };
  }

  /* ---------- m-TSP: suma mínima, dos índices ---------- */
  async function mtspSuma(D, ctx, o) {
    const t0 = now(), n = D.length, h = o.deposito || 0, m = o.m;
    const cl = []; for (let i = 0; i < n; i++) if (i !== h) cl.push(i);
    const nc = cl.length, lmin = Math.max(0, o.lmin | 0), lmax = o.lmax ? o.lmax : nc;
    const C = D.map((r) => r.slice());
    if (o.abierto) for (let i = 0; i < n; i++) if (isFinite(C[i][h])) C[i][h] = 0;
    const M = new Model(), nm = (i, j) => 'x_' + i + '_' + j, has = new Set();
    const ent = {}, sal = {};
    [...cl, h].forEach((i) => { ent[i] = []; sal[i] = []; });
    for (const i of [...cl, h]) for (const j of [...cl, h]) if (i !== j && isFinite(C[i][j])) {
      M.addVar(nm(i, j), C[i][j], 0, 1, true); sal[i].push(nm(i, j)); ent[j].push(nm(i, j)); has.add(i + ',' + j);
    }
    for (const i of cl) { M.addCon(ent[i], 1, 1, 1); M.addCon(sal[i], 1, 1, 1); }
    M.addCon(sal[h], 1, m, m); M.addCon(ent[h], 1, m, m);
    const libre = lmin <= 1 && lmax >= nc;
    if (!libre) {
      for (const i of cl) M.addVar('p_' + i, 0, 1, lmax, false);
      for (const i of cl) {
        if (has.has(h + ',' + i)) M.addCon(['p_' + i, nm(h, i)], [1, lmax - 1], -INF, lmax);
        if (lmin > 1 && has.has(i + ',' + h)) M.addCon(['p_' + i, nm(i, h)], [1, -lmin], 0, INF);
      }
      for (const i of cl) for (const j of cl) if (i !== j && has.has(i + ',' + j)) {
        M.addCon(['p_' + j, 'p_' + i, nm(i, j)], [1, -1, -lmax], 1 - lmax, INF);
        if (lmin > 1) M.addCon(['p_' + j, 'p_' + i, nm(i, j)], [1, -1, lmax - 2], -INF, lmax - 1);
      }
    }
    let cortes = 0, gapIt = Math.max(o.brecha, 0.02), valida = null, sol;
    for (;;) {
      const left = o.tiempo - (now() - t0) / 1000;
      if (left <= 0.5) { if (!valida) return { estado: 'límite de tiempo (sin solución válida)', rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      sol = await ctx.solve(M.toLP(), { timeLimit: left, gap: gapIt });
      if (!sol.ok) { if (!valida) return { estado: sol.status, rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      const succ = {};
      for (const key of has) { const [i, j] = key.split(',').map(Number); if (i !== h && sol.val(nm(i, j)) > 0.5) succ[i] = j; }
      const vis = new Set();
      for (const j of sal[h].map((s) => +s.split('_')[2])) if (sol.val(nm(h, j)) > 0.5) { let u = j; while (u !== h && !vis.has(u)) { vis.add(u); u = succ[u] === undefined ? h : succ[u]; } }
      const cs = [];
      for (const i of cl) if (!vis.has(i)) { const c = []; let u = i; while (!vis.has(u) && u !== h) { vis.add(u); c.push(u); u = succ[u]; } cs.push(c); }
      log(ctx, 'm-TSP: ' + cs.length + ' subcircuito(s), ' + cortes + ' cortes');
      if (!cs.length) {
        valida = sol;
        if (gapIt > o.brecha * 1.0001 && sol.status === 'óptimo' && o.tiempo - (now() - t0) / 1000 > 2) { gapIt = o.brecha; continue; }
        break;
      }
      for (const S of cs) {
        const inter = [];
        for (const i of S) for (const j of S) if (has.has(i + ',' + j)) inter.push(nm(i, j));
        M.addCon(inter, 1, -INF, S.length - 1); cortes++;
      }
    }
    const succ = {}, starts = [];
    for (const key of has) { const [i, j] = key.split(',').map(Number); if (sol.val(nm(i, j)) > 0.5) { if (i === h) starts.push(j); else succ[i] = j; } }
    const rutas = [];
    for (const j of starts) { const r = [h, j]; let u = j; while (succ[u] !== undefined && succ[u] !== h) { u = succ[u]; r.push(u); } if (!o.abierto) r.push(h); rutas.push(r); }
    return finRutas(D, rutas, sol, cortes, t0);
  }

  /* ---------- m-TSP: minimizar la ruta más larga (índice de vehículo) ---------- */
  async function mtspMax(D, ctx, o) {
    const t0 = now(), n = D.length, h = o.deposito || 0, m = o.m;
    const cl = []; for (let i = 0; i < n; i++) if (i !== h) cl.push(i);
    const nc = cl.length, lmin = Math.max(1, o.lmin | 0), lmax = o.lmax ? o.lmax : nc;
    const C = D.map((r) => r.slice());
    if (o.abierto) for (let i = 0; i < n; i++) if (isFinite(C[i][h])) C[i][h] = 0;
    const M = new Model(), nodes = [...cl, h], xs = [];
    const X = (k, i, j) => 'x_' + k + '_' + i + '_' + j, Y = (k, i) => 'y_' + k + '_' + i;
    M.addVar('z', 1, 0, INF, false);
    const arcs = [];
    for (const i of nodes) for (const j of nodes) if (i !== j && isFinite(C[i][j])) arcs.push([i, j]);
    const has = new Set(arcs.map(([i, j]) => i + ',' + j));
    for (let k = 0; k < m; k++) {
      for (const [i, j] of arcs) M.addVar(X(k, i, j), 1e-3 * C[i][j], 0, 1, true);
      for (const i of cl) M.addVar(Y(k, i), 0, 0, 1, true);
      M.addCon(cl.filter((j) => has.has(h + ',' + j)).map((j) => X(k, h, j)), 1, 1, 1);
      M.addCon(cl.filter((i) => has.has(i + ',' + h)).map((i) => X(k, i, h)), 1, 1, 1);
      for (const i of cl) {
        const a = nodes.filter((j) => j !== i && has.has(j + ',' + i)).map((j) => X(k, j, i)).concat([Y(k, i)]);
        const b = nodes.filter((j) => j !== i && has.has(i + ',' + j)).map((j) => X(k, i, j)).concat([Y(k, i)]);
        M.addCon(a, a.map((_, q) => (q === a.length - 1 ? -1 : 1)), 0, 0);
        M.addCon(b, b.map((_, q) => (q === b.length - 1 ? -1 : 1)), 0, 0);
      }
      for (let a = 0; a < cl.length; a++) for (let b = a + 1; b < cl.length; b++) {
        const i = cl[a], j = cl[b];
        if (has.has(i + ',' + j) && has.has(j + ',' + i)) M.addCon([X(k, i, j), X(k, j, i), Y(k, i)], [1, 1, -1], -INF, 0);
      }
      M.addCon(cl.map((i) => Y(k, i)), 1, lmin, lmax);
      M.addCon(arcs.map(([i, j]) => X(k, i, j)).concat(['z']), arcs.map(([i, j]) => C[i][j]).concat([-1]), -INF, 0);
    }
    for (const i of cl) M.addCon(Array.from({ length: m }, (_, k) => Y(k, i)), 1, 1, 1);
    for (let k = 1; k < m; k++) cl.forEach((j, pos) => {
      const prev = cl.slice(0, pos).map((l) => Y(k - 1, l));
      M.addCon([Y(k, j), ...prev], [1, ...prev.map(() => -1)], -INF, 0);
    });
    let cortes = 0, gapIt = Math.max(o.brecha, 0.05), valida = null, sol;
    for (;;) {
      const left = o.tiempo - (now() - t0) / 1000;
      if (left <= 0.5) { if (!valida) return { estado: 'límite de tiempo (sin solución válida)', rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      sol = await ctx.solve(M.toLP(), { timeLimit: left, gap: gapIt });
      if (!sol.ok) { if (!valida) return { estado: sol.status, rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      const cs = [];
      for (let k = 0; k < m; k++) {
        const succ = {}, vis = new Set();
        for (const [i, j] of arcs) if (i !== h && sol.val(X(k, i, j)) > 0.5) succ[i] = j;
        for (const j of cl) if (has.has(h + ',' + j) && sol.val(X(k, h, j)) > 0.5) { let u = j; while (u !== h && !vis.has(u)) { vis.add(u); u = succ[u] === undefined ? h : succ[u]; } }
        for (const i of cl) if (sol.val(Y(k, i)) > 0.5 && !vis.has(i) && succ[i] !== undefined) { const c = []; let u = i; while (!vis.has(u) && succ[u] !== undefined) { vis.add(u); c.push(u); u = succ[u]; } if (c.length) cs.push(c); }
      }
      log(ctx, 'm-TSP (ruta más larga): ' + cs.length + ' subcircuito(s), ' + cortes + ' cortes');
      if (!cs.length) {
        valida = sol;
        if (gapIt > o.brecha * 1.0001 && sol.status === 'óptimo' && o.tiempo - (now() - t0) / 1000 > 2) { gapIt = o.brecha; continue; }
        break;
      }
      for (const S of cs) for (let k = 0; k < m; k++) {
        const inter = []; for (const i of S) for (const j of S) if (has.has(i + ',' + j)) inter.push(X(k, i, j));
        for (const hh of new Set([S[0], S[S.length >> 1]])) {
          const ys = S.filter((i) => i !== hh).map((i) => Y(k, i));
          M.addCon(inter.concat(ys), inter.map(() => 1).concat(ys.map(() => -1)), -INF, 0);
        }
        cortes++;
      }
    }
    const rutas = [];
    for (let k = 0; k < m; k++) {
      const succ = {}; let st = null;
      for (const [i, j] of arcs) if (sol.val(X(k, i, j)) > 0.5) { if (i === h) st = j; else succ[i] = j; }
      const r = [h, st]; let u = st; while (succ[u] !== undefined && succ[u] !== h) { u = succ[u]; r.push(u); }
      if (!o.abierto) r.push(h); rutas.push(r);
    }
    return finRutas(D, rutas, sol, cortes, t0);
  }

  function finRutas(D, rutas, sol, cortes, t0) {
    rutas.sort((a, b) => b.length - a.length);
    const dists = rutas.map((r) => r.slice(1).reduce((s, v, i) => s + D[r[i]][v], 0));
    return { estado: sol.status, rutas, dists, total: dists.reduce((a, b) => a + b, 0), maxima: Math.max(...dists),
             gap: sol.gap, cortes, seg: (now() - t0) / 1000 };
  }

  async function mtsp(D, ctx, o) {
    const r = o.objetivo === 'maximo' ? await mtspMax(D, ctx, o) : await mtspSuma(D, ctx, o);
    if (r.rutas && r.rutas.length) r.objetivo = o.objetivo === 'maximo' ? r.maxima : r.total;
    return r;
  }

  /* ---------- caminos mínimos (LP de flujo) ---------- */
  async function flujoCaminos(D, s, destinos, ctx, excluir) {
    const n = D.length, ex = new Set(excluir || []);
    const arcs = []; let suma = 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && isFinite(D[i][j]) && !ex.has(i) && !ex.has(j)) { arcs.push([i, j, D[i][j]]); suma += Math.abs(D[i][j]); }
    const BIG = 10 * suma * Math.max(1, n), nd = destinos.length, M = new Model();
    const sal = Array.from({ length: n }, () => []), ent = Array.from({ length: n }, () => []);
    arcs.forEach(([i, j, c]) => { const nm = 'f_' + i + '_' + j; M.addVar(nm, c, 0, nd, true); sal[i].push(nm); ent[j].push(nm); });
    const art = {};
    if (nd > 1) destinos.forEach((t) => { const nm = 'a_' + t; M.addVar(nm, BIG, 0, 1, true); art[t] = nm; sal[s].push(nm); ent[t].push(nm); });
    for (let u = 0; u < n; u++) {
      if (ex.has(u)) continue;
      const b = (u === s ? nd : 0) - (destinos.includes(u) ? 1 : 0);
      M.addCon(sal[u].concat(ent[u]), sal[u].map(() => 1).concat(ent[u].map(() => -1)), b, b);
    }
    const sol = await ctx.solve(M.toLP(), { timeLimit: 60, gap: 1e-9 });
    if (!sol.ok) return { sol };
    const pred = new Array(n).fill(-1), mejor = new Array(n).fill(0);
    arcs.forEach(([i, j]) => { const f = Math.round(sol.val('f_' + i + '_' + j)); if (f > mejor[j]) { mejor[j] = f; pred[j] = i; } });
    const dist = new Array(n).fill(INF); dist[s] = 0;
    for (const t of destinos) {
      if (art[t] && Math.round(sol.val(art[t])) > 0) continue;
      let u = t, tot = 0, pasos = 0;
      while (u !== s && pasos++ <= n) { const p = pred[u]; if (p < 0) { tot = INF; break; } tot += D[p][u]; u = p; }
      dist[t] = u === s ? tot : INF;
    }
    return { sol, pred, dist };
  }
  function traza(pred, s, t) {
    const c = [t]; let u = t;
    while (u !== s) { u = pred[u]; if (u < 0 || c.length > pred.length) return null; c.push(u); }
    return c.reverse();
  }
  async function camino(D, ctx, o) {
    const t0 = now(), r = await flujoCaminos(D, o.origen, [o.destino], ctx, []);
    if (!r.pred) return { estado: r.sol && r.sol.status === 'infactible' ? 'no existe camino' : (r.sol ? r.sol.status : 'sin solución'), rutas: [] };
    const ruta = traza(r.pred, o.origen, o.destino);
    if (!ruta) return { estado: 'no existe camino', rutas: [] };
    const d = ruta.slice(1).reduce((a, v, i) => a + D[ruta[i]][v], 0);
    return { estado: r.sol.status, objetivo: d, rutas: [ruta], dists: [d], gap: r.sol.gap, seg: (now() - t0) / 1000 };
  }
  /* distancias mínimas desde varios orígenes (a todos los nodos): un LP por origen */
  async function caminosDesde(D, ctx, o) {
    const t0 = now(), n = D.length, dist = [], pred = [];
    for (let k = 0; k < o.origenes.length; k++) {
      const s = o.origenes[k];
      const r = await flujoCaminos(D, s, Array.from({ length: n }, (_, i) => i).filter((i) => i !== s), ctx, []);
      if (!r.pred) return { estado: r.sol ? r.sol.status : 'sin solución', rutas: [] };
      dist.push(r.dist); pred.push(r.pred);
      log(ctx, 'Origen ' + (k + 1) + ' de ' + o.origenes.length + ' resuelto');
    }
    return { estado: 'óptimo', origenes: o.origenes, dist, pred, rutas: [], seg: (now() - t0) / 1000, trazas: null };
  }

  /* ---------- árbol de valor mínimo (MILP de flujo desde la raíz) ---------- */
  async function arbol(D, ctx, o) {
    const t0 = now(), n = D.length, r = o.raiz || 0, M = new Model(), arcs = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && isFinite(D[i][j])) arcs.push([i, j, D[i][j]]);
    const ent = Array.from({ length: n }, () => []), sal = Array.from({ length: n }, () => []);
    arcs.forEach(([i, j, c]) => {
      const y = 'y_' + i + '_' + j, f = 'g_' + i + '_' + j;
      M.addVar(y, c, 0, 1, true); M.addVar(f, 0, 0, n - 1, false);
      M.addCon([f, y], [1, -(n - 1)], -INF, 0);
      ent[j].push([y, f]); sal[i].push([y, f]);
    });
    for (let u = 0; u < n; u++) {
      if (u === r) {
        M.addCon(ent[u].map((a) => a[0]), 1, 0, 0);
        M.addCon(sal[u].map((a) => a[1]).concat(ent[u].map((a) => a[1])), sal[u].map(() => 1).concat(ent[u].map(() => -1)), n - 1, n - 1);
      } else {
        M.addCon(ent[u].map((a) => a[0]), 1, 1, 1);
        M.addCon(ent[u].map((a) => a[1]).concat(sal[u].map((a) => a[1])), ent[u].map(() => 1).concat(sal[u].map(() => -1)), 1, 1);
      }
    }
    const sol = await ctx.solve(M.toLP(), { timeLimit: o.tiempo || 120, gap: 1e-6 });
    if (!sol.ok) return { estado: sol.status, aristas: [] };
    const aristas = arcs.filter(([i, j]) => sol.val('y_' + i + '_' + j) > 0.5).map(([i, j, c]) => [i, j, c]);
    return { estado: sol.status, objetivo: aristas.reduce((a, e) => a + e[2], 0), aristas, rutas: [], gap: sol.gap, seg: (now() - t0) / 1000 };
  }

  /* ---------- flujos de red ---------- */
  const noAcotado = (st) => /unbounded|no acotado/i.test(String(st));
  function arcosRed(D, cap) {
    const n = D.length, arcs = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && isFinite(D[i][j])) {
      const c = cap && cap[i] && isFinite(cap[i][j]) ? cap[i][j] : INF;
      if (c > 0) arcs.push([i, j, D[i][j], c]);
    }
    return arcs;
  }
  async function flujoMax(D, cap, ctx, o) {
    const t0 = now(), n = D.length, s = o.origen, t = o.destino, M = new Model(), arcs = arcosRed(D, cap);
    const sal = Array.from({ length: n }, () => []), ent = Array.from({ length: n }, () => []);
    arcs.forEach(([i, j, , c]) => { const nm = 'f_' + i + '_' + j; M.addVar(nm, 0, 0, c, false); sal[i].push(nm); ent[j].push(nm); });
    M.addVar('v', -1, 0, INF, false);
    for (let u = 0; u < n; u++) {
      const names = sal[u].concat(ent[u]), coefs = sal[u].map(() => 1).concat(ent[u].map(() => -1));
      if (u === s) { names.push('v'); coefs.push(-1); } else if (u === t) { names.push('v'); coefs.push(1); }
      M.addCon(names, coefs, 0, 0);
    }
    const sol = await ctx.solve(M.toLP(), { timeLimit: o.tiempo || 60, gap: 1e-9 });
    if (!sol.ok) return { estado: noAcotado(sol.status) ? 'no acotado: el corte mínimo no tiene capacidad finita (asigne capacidades a las aristas)' : sol.status, flujos: [] };
    const flujos = arcs.map(([i, j, c, k]) => [i, j, sol.val('f_' + i + '_' + j), k]).filter((f) => f[2] > 1e-9);
    return { estado: sol.status, objetivo: -sol.obj, flujos, rutas: [], seg: (now() - t0) / 1000 };
  }
  async function flujoCosto(D, cap, ctx, o) {
    const t0 = now(), n = D.length, b = o.balance, M = new Model(), arcs = arcosRed(D, cap);
    if (Math.abs(b.reduce((a, v) => a + v, 0)) > 1e-9) return { estado: 'infactible: la oferta total debe igualar la demanda total (suma de balances = 0)', flujos: [] };
    const sal = Array.from({ length: n }, () => []), ent = Array.from({ length: n }, () => []);
    arcs.forEach(([i, j, c, k]) => { const nm = 'f_' + i + '_' + j; M.addVar(nm, c, 0, k, false); sal[i].push(nm); ent[j].push(nm); });
    for (let u = 0; u < n; u++) M.addCon(sal[u].concat(ent[u]), sal[u].map(() => 1).concat(ent[u].map(() => -1)), b[u], b[u]);
    const sol = await ctx.solve(M.toLP(), { timeLimit: o.tiempo || 60, gap: 1e-9 });
    if (!sol.ok) return { estado: sol.status === 'infactible' ? 'infactible: las capacidades o conexiones no permiten enviar todo' : sol.status, flujos: [] };
    const flujos = arcs.map(([i, j, c, k]) => [i, j, sol.val('f_' + i + '_' + j), k, c]).filter((f) => f[2] > 1e-9);
    return { estado: sol.status, objetivo: sol.obj, flujos, rutas: [], seg: (now() - t0) / 1000 };
  }
  /* cartero chino: cuántas veces recorrer cada arista para cubrirlas todas con costo mínimo (la red debe ser conexa) */
  async function cartero(D, ctx, o) {
    const t0 = now(), n = D.length, M = new Model(), arcs = [];
    if (o.dirigido) { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && isFinite(D[i][j])) arcs.push([i, j, D[i][j]]); }
    else for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (isFinite(D[i][j])) arcs.push([i, j, D[i][j]]);
    arcs.forEach(([i, j, c]) => M.addVar('x_' + i + '_' + j, c, 1, INF, true));
    if (o.dirigido) {
      for (let u = 0; u < n; u++) { const sal = arcs.filter((a) => a[0] === u).map((a) => 'x_' + a[0] + '_' + a[1]), ent = arcs.filter((a) => a[1] === u).map((a) => 'x_' + a[0] + '_' + a[1]); M.addCon(sal.concat(ent), sal.map(() => 1).concat(ent.map(() => -1)), 0, 0); }
    } else for (let u = 0; u < n; u++) {
      M.addVar('z_' + u, 0, 0, INF, true);
      const inc = arcs.filter((a) => a[0] === u || a[1] === u).map((a) => 'x_' + a[0] + '_' + a[1]);
      M.addCon(inc.concat(['z_' + u]), inc.map(() => 1).concat([-2]), 0, 0);
    }
    const sol = await ctx.solve(M.toLP(), { timeLimit: o.tiempo || 60, gap: 1e-9 });
    if (!sol.ok) return { estado: sol.status, aristas: [] };
    const aristas = arcs.map(([i, j, c]) => [i, j, c, Math.round(sol.val('x_' + i + '_' + j))]);
    const base = arcs.reduce((a, e) => a + e[2], 0);
    return { estado: sol.status, objetivo: sol.obj, base, extra: sol.obj - base, aristas, rutas: [], seg: (now() - t0) / 1000 };
  }

  /* ---------- localización de instalaciones ---------- */
  /* dist[k][i]: distancia del candidato k al cliente i. tipo: mediana | centro | fijo | cobertura */
  async function ubicar(dist, ctx, o) {
    const t0 = now(), K = dist.length, n = dist[0].length, w = o.pesos || new Array(n).fill(1), M = new Model(), p = o.p | 0;
    for (let j = 0; j < K; j++) M.addVar('y_' + j, o.tipo === 'fijo' ? (o.fijos ? o.fijos[j] : 0) : (o.tipo === 'cobertura' ? 1 : 0), 0, 1, true);
    if (o.tipo === 'cobertura') {
      for (let i = 0; i < n; i++) {
        const ok = []; for (let j = 0; j < K; j++) if (dist[j][i] <= o.radio + 1e-9) ok.push('y_' + j);
        if (!ok.length) return { estado: 'infactible: el cliente ' + (i + 1) + ' no queda a menos del radio de ningún candidato', abiertas: [] };
        M.addCon(ok, 1, 1, INF);
      }
    } else {
      if (o.tipo === 'centro') M.addVar('z', 1, 0, INF, false);
      for (let i = 0; i < n; i++) {
        const xs = [];
        for (let j = 0; j < K; j++) { const nm = 'x_' + i + '_' + j; M.addVar(nm, o.tipo === 'centro' ? 0 : w[i] * dist[j][i], 0, 1, false); xs.push(nm); M.addCon([nm, 'y_' + j], [1, -1], -INF, 0); }
        M.addCon(xs, 1, 1, 1);
        if (o.tipo === 'centro') M.addCon(xs.concat(['z']), xs.map((_, j) => dist[j][i]).concat([-1]), -INF, 0);
      }
      const ys = Array.from({ length: K }, (_, j) => 'y_' + j);
      if (p > 0) M.addCon(ys, 1, o.tipo === 'fijo' ? 0 : p, p);
      else if (o.tipo !== 'fijo') M.addCon(ys, 1, 1, 1);
    }
    const sol = await ctx.solve(M.toLP(), { timeLimit: o.tiempo || 120, gap: 1e-7 });
    if (!sol.ok) return { estado: sol.status, abiertas: [] };
    const abiertas = []; for (let j = 0; j < K; j++) if (sol.val('y_' + j) > 0.5) abiertas.push(j);
    const asign = []; let transporte = 0, maxd = 0;
    for (let i = 0; i < n; i++) { let b = -1; abiertas.forEach((j) => { if (b < 0 || dist[j][i] < dist[b][i]) b = j; }); asign.push([i, b, dist[b][i]]); transporte += w[i] * dist[b][i]; maxd = Math.max(maxd, dist[b][i]); }
    const fijo = o.tipo === 'fijo' && o.fijos ? abiertas.reduce((a, j) => a + o.fijos[j], 0) : 0;
    return { estado: sol.status, objetivo: sol.obj, abiertas, asign, transporte, fijo, maxd, gap: sol.gap, rutas: [], seg: (now() - t0) / 1000 };
  }
  /* CD óptimo para el recorrido: para cada candidato se resuelve el TSP / m-TSP exacto con el CD ahí. */
  async function ubicarRuta(o, ctx) {
    const t0 = now(), n = o.Dcl.length, K = o.ida.length;
    const orden = Array.from({ length: K }, (_, k) => k).sort((a, b) => o.ida[a].reduce((x, y) => x + y, 0) - o.ida[b].reduce((x, y) => x + y, 0));
    const evaluar = orden.slice(0, Math.min(K, o.top || K)), ranking = [];
    if (o.actual >= 0 && !evaluar.includes(o.actual)) evaluar.push(o.actual);   // siempre se evalúa el CD actual para comparar
    let mejor = null;
    for (let q = 0; q < evaluar.length; q++) {
      const k = evaluar[q], E = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(INF));
      for (let i = 0; i < n; i++) { E[0][i + 1] = o.ida[k][i]; E[i + 1][0] = o.vuelta ? o.vuelta[k][i] : o.ida[k][i]; for (let j = 0; j < n; j++) E[i + 1][j + 1] = o.Dcl[i][j]; }
      const r = o.modo === 'tsp' ? await tsp(E, ctx, { modo: 'ciclo', origen: 0, tiempo: o.tiempoCand || 60, brecha: 1e-6 })
        : await mtsp(E, ctx, { m: o.m, deposito: 0, lmin: o.lmin || 1, lmax: o.lmax || 0, objetivo: o.objetivo || 'suma', abierto: false, tiempo: o.tiempoCand || 120, brecha: 1e-6 });
      const ok = r.rutas && r.rutas.length;
      const fila = { k, objetivo: ok ? r.objetivo : null, estado: r.estado, rutas: r.rutas, dists: r.dists, total: r.total };
      ranking.push(fila);
      if (ok && (!mejor || fila.objetivo < mejor.objetivo - 1e-9)) mejor = fila;
      log(ctx, 'Candidato ' + (q + 1) + ' de ' + evaluar.length + ': ' + (ok ? r.objetivo.toFixed(3) : r.estado));
    }
    ranking.sort((a, b) => (a.objetivo === null) - (b.objetivo === null) || a.objetivo - b.objetivo);
    return { estado: mejor ? 'óptimo (exacto en cada candidato evaluado)' : 'sin solución', ranking, mejor, evaluados: evaluar.length, total: K, seg: (now() - t0) / 1000, rutas: [] };
  }

  /* ---------- CVRP: hasta m vehículos con capacidad (índice de vehículo + carga acumulada) ---------- */
  async function cvrp(D, ctx, o) {
    const t0 = now(), n = D.length, h = o.deposito || 0, m = o.m, Q = o.capacidad, q = o.demanda;
    const cl = []; for (let i = 0; i < n; i++) if (i !== h) cl.push(i);
    if (cl.some((i) => q[i] > Q + 1e-9)) return { estado: 'infactible: un cliente pide más que la capacidad del vehículo', rutas: [] };
    const M = new Model(), nodes = [...cl, h], X = (k, i, j) => 'x_' + k + '_' + i + '_' + j, Y = (k, i) => 'y_' + k + '_' + i, V = (k) => 'v_' + k;
    const arcs = []; for (const i of nodes) for (const j of nodes) if (i !== j && isFinite(D[i][j])) arcs.push([i, j]);
    const has = new Set(arcs.map(([i, j]) => i + ',' + j));
    for (let k = 0; k < m; k++) {
      for (const [i, j] of arcs) M.addVar(X(k, i, j), D[i][j], 0, 1, true);
      for (const i of cl) M.addVar(Y(k, i), 0, 0, 1, true);
      M.addVar(V(k), 0, 0, 1, true);
      M.addCon(cl.filter((j) => has.has(h + ',' + j)).map((j) => X(k, h, j)).concat([V(k)]), cl.filter((j) => has.has(h + ',' + j)).map(() => 1).concat([-1]), 0, 0);
      M.addCon(cl.filter((i) => has.has(i + ',' + h)).map((i) => X(k, i, h)).concat([V(k)]), cl.filter((i) => has.has(i + ',' + h)).map(() => 1).concat([-1]), 0, 0);
      for (const i of cl) {
        const a = nodes.filter((j) => j !== i && has.has(j + ',' + i)).map((j) => X(k, j, i)).concat([Y(k, i)]);
        const b = nodes.filter((j) => j !== i && has.has(i + ',' + j)).map((j) => X(k, i, j)).concat([Y(k, i)]);
        M.addCon(a, a.map((_, z) => (z === a.length - 1 ? -1 : 1)), 0, 0); M.addCon(b, b.map((_, z) => (z === b.length - 1 ? -1 : 1)), 0, 0);
        M.addCon([Y(k, i), V(k)], [1, -1], -INF, 0);
      }
      for (let a = 0; a < cl.length; a++) for (let b = a + 1; b < cl.length; b++) { const i = cl[a], j = cl[b]; if (has.has(i + ',' + j) && has.has(j + ',' + i)) M.addCon([X(k, i, j), X(k, j, i), Y(k, i)], [1, 1, -1], -INF, 0); }
      M.addCon(cl.map((i) => Y(k, i)), cl.map((i) => q[i]), -INF, Q);
    }
    for (const i of cl) M.addCon(Array.from({ length: m }, (_, k) => Y(k, i)), 1, 1, 1);
    for (const i of cl) M.addVar('u_' + i, 0, q[i], Q, false);
    for (const i of cl) for (const j of cl) if (i !== j && has.has(i + ',' + j)) {
      const xs = Array.from({ length: m }, (_, k) => X(k, i, j));
      M.addCon(['u_' + i, 'u_' + j].concat(xs), [1, -1].concat(xs.map(() => Q)), -INF, Q - q[j]);
    }
    for (let k = 1; k < m; k++) cl.forEach((j, pos) => { const prev = cl.slice(0, pos).map((l) => Y(k - 1, l)); M.addCon([Y(k, j), ...prev], [1, ...prev.map(() => -1)], -INF, 0); });
    let cortes = 0, gapIt = Math.max(o.brecha || 1e-6, 0.05), valida = null, sol;
    for (;;) {
      const left = (o.tiempo || 120) - (now() - t0) / 1000;
      if (left <= 0.5) { if (!valida) return { estado: 'límite de tiempo (sin solución válida)', rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      sol = await ctx.solve(M.toLP(), { timeLimit: left, gap: gapIt });
      if (!sol.ok) { if (!valida) return { estado: sol.status === 'infactible' ? 'infactible: con ' + m + ' vehículos y capacidad ' + Q + ' no se puede atender toda la demanda' : sol.status, rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      const cs = [];
      for (let k = 0; k < m; k++) {
        const succ = {}, vis = new Set();
        for (const [i, j] of arcs) if (i !== h && sol.val(X(k, i, j)) > 0.5) succ[i] = j;
        for (const j of cl) if (has.has(h + ',' + j) && sol.val(X(k, h, j)) > 0.5) { let u = j; while (u !== h && !vis.has(u)) { vis.add(u); u = succ[u] === undefined ? h : succ[u]; } }
        for (const i of cl) if (sol.val(Y(k, i)) > 0.5 && !vis.has(i) && succ[i] !== undefined) { const c = []; let u = i; while (!vis.has(u) && succ[u] !== undefined) { vis.add(u); c.push(u); u = succ[u]; } if (c.length) cs.push(c); }
      }
      log(ctx, 'CVRP: ' + cs.length + ' subcircuito(s), ' + cortes + ' cortes');
      if (!cs.length) { valida = sol; if (gapIt > (o.brecha || 1e-6) * 1.0001 && sol.status === 'óptimo' && (o.tiempo || 120) - (now() - t0) / 1000 > 2) { gapIt = o.brecha || 1e-6; continue; } break; }
      for (const S of cs) for (let k = 0; k < m; k++) {
        const inter = []; for (const i of S) for (const j of S) if (has.has(i + ',' + j)) inter.push(X(k, i, j));
        for (const hh of new Set([S[0], S[S.length >> 1]])) { const ys = S.filter((i) => i !== hh).map((i) => Y(k, i)); M.addCon(inter.concat(ys), inter.map(() => 1).concat(ys.map(() => -1)), -INF, 0); }
        cortes++;
      }
    }
    const rutas = [];
    for (let k = 0; k < m; k++) {
      if (sol.val(V(k)) < 0.5) continue;
      const succ = {}; let st = null;
      for (const [i, j] of arcs) if (sol.val(X(k, i, j)) > 0.5) { if (i === h) st = j; else succ[i] = j; }
      const r = [h, st]; let u = st; while (succ[u] !== undefined && succ[u] !== h) { u = succ[u]; r.push(u); } r.push(h); rutas.push(r);
    }
    const out = finRutas(D, rutas, sol, cortes, t0);
    out.cargas = out.rutas.map((r) => r.reduce((a, v) => a + (v === h ? 0 : q[v]), 0)); out.objetivo = out.total; out.capacidad = Q;
    return out;
  }

  /* ---------- m-TSP con flota heterogénea, pesos, balance, rutas abiertas y ventanas de tiempo ---------- */
  async function flota(D, ctx, o) {
    const t0 = now(), n = D.length, h = o.deposito || 0, veh = o.vehiculos, m = veh.length;
    const w = o.peso || new Array(n).fill(1), pa = o.pesoArco || null;
    const cl = []; for (let i = 0; i < n; i++) if (i !== h) cl.push(i);
    const nc = cl.length, vt = o.vt && o.vt.usar ? o.vt : null;
    const C = D.map((f, i) => f.map((v, j) => (i === j || !isFinite(v) ? INF : v * (pa && pa[i] && isFinite(pa[i][j]) ? pa[i][j] : 1))));
    const capMax = Math.max(...veh.map((v) => (isFinite(v.cap) ? v.cap : INF)));
    if (cl.some((i) => w[i] > capMax + 1e-9)) return { estado: 'infactible: un cliente pesa más que la capacidad del mayor vehículo', rutas: [] };
    let lmin = 0, lmax = nc;
    if (o.balanceado) { lmin = Math.max(1, Math.floor(nc / m)); lmax = Math.ceil(nc / m); } else { lmin = o.lmin || 0; lmax = o.lmax || nc; }
    const todas = !!o.balanceado || lmin >= 1;
    const M = new Model(), nodes = [...cl, h], X = (k, i, j) => 'x_' + k + '_' + i + '_' + j, Y = (k, i) => 'y_' + k + '_' + i, V = (k) => 'v_' + k;
    const arcs = []; for (const i of nodes) for (const j of nodes) if (i !== j && isFinite(C[i][j])) arcs.push([i, j]);
    const has = new Set(arcs.map(([i, j]) => i + ',' + j));
    const costo = (k, i, j) => (o.abierto && j === h ? 0 : veh[k].costoKm * C[i][j]);
    const maxo = o.objetivo === 'maximo';
    if (maxo) M.addVar('z', 1, 0, INF, false);
    for (let k = 0; k < m; k++) {
      for (const [i, j] of arcs) M.addVar(X(k, i, j), (maxo ? 1e-3 : 1) * costo(k, i, j), 0, 1, true);
      for (const i of cl) M.addVar(Y(k, i), 0, 0, 1, true);
      M.addVar(V(k), (veh[k].fijo || 0), todas ? 1 : 0, 1, true);
      const so = cl.filter((j) => has.has(h + ',' + j)), en = cl.filter((i) => has.has(i + ',' + h));
      M.addCon(so.map((j) => X(k, h, j)).concat([V(k)]), so.map(() => 1).concat([-1]), 0, 0);
      M.addCon(en.map((i) => X(k, i, h)).concat([V(k)]), en.map(() => 1).concat([-1]), 0, 0);
      for (const i of cl) {
        const a = nodes.filter((j) => j !== i && has.has(j + ',' + i)).map((j) => X(k, j, i)).concat([Y(k, i)]);
        const b = nodes.filter((j) => j !== i && has.has(i + ',' + j)).map((j) => X(k, i, j)).concat([Y(k, i)]);
        M.addCon(a, a.map((_, z) => (z === a.length - 1 ? -1 : 1)), 0, 0); M.addCon(b, b.map((_, z) => (z === b.length - 1 ? -1 : 1)), 0, 0);
        M.addCon([Y(k, i), V(k)], [1, -1], -INF, 0);
      }
      for (let a = 0; a < cl.length; a++) for (let b = a + 1; b < cl.length; b++) { const i = cl[a], j = cl[b]; if (has.has(i + ',' + j) && has.has(j + ',' + i)) M.addCon([X(k, i, j), X(k, j, i), Y(k, i)], [1, 1, -1], -INF, 0); }
      M.addCon(cl.map((i) => Y(k, i)).concat([V(k)]), cl.map(() => 1).concat([-lmin]), 0, INF);
      M.addCon(cl.map((i) => Y(k, i)).concat([V(k)]), cl.map(() => 1).concat([-lmax]), -INF, 0);
      if (isFinite(veh[k].cap)) M.addCon(cl.map((i) => Y(k, i)), cl.map((i) => w[i]), -INF, veh[k].cap);
      if (maxo) { const xs = arcs.map(([i, j]) => X(k, i, j)); M.addCon(xs.concat(['z']), arcs.map(([i, j]) => costo(k, i, j)).concat([-1]), -INF, 0); }
    }
    for (const i of cl) M.addCon(Array.from({ length: m }, (_, k) => Y(k, i)), 1, 1, 1);
    const Qm = isFinite(capMax) ? capMax : cl.reduce((a, i) => a + w[i], 0);
    for (const i of cl) M.addVar('u_' + i, 0, w[i], Qm, false);
    for (const i of cl) for (const j of cl) if (i !== j && has.has(i + ',' + j)) {
      const xs = Array.from({ length: m }, (_, k) => X(k, i, j));
      M.addCon(['u_' + i, 'u_' + j].concat(xs), [1, -1].concat(xs.map(() => Qm)), -INF, Qm - w[j]);
    }
    for (let k = 1; k < m; k++) if (veh[k].tipo === veh[k - 1].tipo && veh[k].cap === veh[k - 1].cap) cl.forEach((j, pos) => { const prev = cl.slice(0, pos).map((l) => Y(k - 1, l)); M.addCon([Y(k, j), ...prev], [1, ...prev.map(() => -1)], -INF, 0); });
    if (vt) {   // ventanas de tiempo (horas): t_i = llegada al cliente i
      const H = 48, s = vt.servicio || 0, maxd = Math.max(...D.flat().filter(isFinite)), minv = Math.min(...veh.map((v) => v.vel)), Mt = H + s + maxd / minv;
      for (const i of cl) M.addVar('t_' + i, 0, vt.a[i] ?? 0, vt.b[i] ?? H, false);
      for (const j of cl) if (has.has(h + ',' + j)) {
        const names = [], coefs = [];
        for (let k = 0; k < m; k++) { names.push(X(k, h, j)); coefs.push(-D[h][j] / veh[k].vel - Mt); }
        M.addCon(['t_' + j].concat(names), [1].concat(coefs), (vt.inicio || 0) - Mt, INF);
      }
      for (const i of cl) for (const j of cl) if (i !== j && has.has(i + ',' + j)) {
        const names = ['t_' + j, 't_' + i], coefs = [1, -1];
        for (let k = 0; k < m; k++) { names.push(X(k, i, j)); coefs.push(-D[i][j] / veh[k].vel - Mt); }
        M.addCon(names, coefs, s - Mt, INF);
      }
    }
    let cortes = 0, gapIt = Math.max(o.brecha || 1e-6, 0.05), valida = null, sol;
    for (;;) {
      const left = (o.tiempo || 120) - (now() - t0) / 1000;
      if (left <= 0.5) { if (!valida) return { estado: 'límite de tiempo (sin solución válida)', rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      sol = await ctx.solve(M.toLP(), { timeLimit: left, gap: gapIt });
      if (!sol.ok) { if (!valida) return { estado: sol.status === 'infactible' ? 'infactible: con esta flota, capacidades, balance' + (vt ? ' y ventanas de tiempo' : '') + ' no hay solución' : sol.status, rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      const cs = [];
      for (let k = 0; k < m; k++) {
        const succ = {}, vis = new Set();
        for (const [i, j] of arcs) if (i !== h && sol.val(X(k, i, j)) > 0.5) succ[i] = j;
        for (const j of cl) if (has.has(h + ',' + j) && sol.val(X(k, h, j)) > 0.5) { let u = j; while (u !== h && !vis.has(u)) { vis.add(u); u = succ[u] === undefined ? h : succ[u]; } }
        for (const i of cl) if (sol.val(Y(k, i)) > 0.5 && !vis.has(i) && succ[i] !== undefined) { const c = []; let u = i; while (!vis.has(u) && succ[u] !== undefined) { vis.add(u); c.push(u); u = succ[u]; } if (c.length) cs.push(c); }
      }
      log(ctx, 'Flota: ' + cs.length + ' subcircuito(s), ' + cortes + ' cortes');
      if (!cs.length) { valida = sol; if (gapIt > (o.brecha || 1e-6) * 1.0001 && sol.status === 'óptimo' && (o.tiempo || 120) - (now() - t0) / 1000 > 2) { gapIt = o.brecha || 1e-6; continue; } break; }
      for (const S of cs) for (let k = 0; k < m; k++) {
        const inter = []; for (const i of S) for (const j of S) if (has.has(i + ',' + j)) inter.push(X(k, i, j));
        for (const hh of new Set([S[0], S[S.length >> 1]])) { const ys = S.filter((i) => i !== hh).map((i) => Y(k, i)); M.addCon(inter.concat(ys), inter.map(() => 1).concat(ys.map(() => -1)), -INF, 0); }
        cortes++;
      }
    }
    const rutas = [], info = [];
    for (let k = 0; k < m; k++) {
      if (sol.val(V(k)) < 0.5) continue;
      const succ = {}; let st = null;
      for (const [i, j] of arcs) if (sol.val(X(k, i, j)) > 0.5) { if (i === h) st = j; else succ[i] = j; }
      if (st === null) continue;
      const r = [h, st]; let u = st; while (succ[u] !== undefined && succ[u] !== h) { u = succ[u]; r.push(u); } if (!o.abierto) r.push(h);
      const dist = r.slice(1).reduce((a, v, q) => a + (o.abierto && v === h ? 0 : D[r[q]][v]), 0), cost = r.slice(1).reduce((a, v, q) => a + costo(k, r[q], v), 0);
      rutas.push(r); info.push({ tipo: veh[k].tipo, dist, costo: cost + (veh[k].fijo || 0), carga: r.reduce((a, v) => a + (v === h ? 0 : w[v]), 0), cap: veh[k].cap, llegadas: vt ? r.map((v) => (v === h ? null : sol.val('t_' + v))) : null });
    }
    const ord = rutas.map((_, q) => q).sort((a, b) => rutas[b].length - rutas[a].length);
    const R = ord.map((q) => rutas[q]), I = ord.map((q) => info[q]);
    const total = I.reduce((a, x) => a + x.dist, 0), totalCosto = I.reduce((a, x) => a + x.costo, 0);
    return { estado: sol.status, objetivo: maxo ? Math.max(...I.map((x) => x.costo)) : totalCosto, total, totalCosto, rutas: R, dists: I.map((x) => x.dist), info: I, gap: sol.gap, cortes, seg: (now() - t0) / 1000 };
  }

  /* ---------- modelo libre (texto en formato LP de CPLEX) ---------- */
  async function modeloLibre(lp, ctx, o) {
    const t0 = now(), sol = await ctx.solve(lp, { timeLimit: o.tiempo || 60, gap: 1e-6 });
    if (!sol.ok) return { estado: sol.status, valores: [] };
    return { estado: sol.status, objetivo: sol.obj, valores: Object.entries(sol.todos || {}).map(([k, v]) => [k, v]), gap: sol.gap, seg: (now() - t0) / 1000, rutas: [] };
  }

  root.Solver = { Model, tsp, mtsp, camino, caminosDesde, traza, arbol, flujoMax, flujoCosto, cartero, ubicar, ubicarRuta, cvrp, flota, modeloLibre };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Solver;
})(typeof globalThis !== 'undefined' ? globalThis : this);
