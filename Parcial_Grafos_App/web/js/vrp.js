/* Modelo matemático general de VRP (MILP). Una sola formulación con opciones que cubre más de 20 variantes:
   TSP, mTSP, CVRP, VRPTW, flota heterogénea, multi-depósito, backhauls, recoger-entregar, entrega dividida,
   con beneficios, orienteering, localización-ruteo, etc. Requiere Solver.Model (solver.js).
   Instancia I = { D, depots:[idx], cust:[idx], w[], r[], prize[], optional[], pairs:[[p,d]],
                   veh:[{depot,cap,costoKm,vel,fijo,Lmax}], f:{...opciones} } */
(function (root) {
  'use strict';
  const INF = Infinity, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const Model = () => root.Solver.Model;

  async function vrp(I, ctx, o) {
    o = o || {}; const t0 = now(), f = I.f || {}, D = I.D, veh = I.veh, m = veh.length, cl = I.cust, nc = cl.length, depots = I.depots;
    const w = I.w || D.map(() => 0), r = I.r || D.map(() => 0), mode = f.mode || 'entrega';
    const prize = I.prize || D.map(() => 0), optional = (i) => !!(I.optional && I.optional[i]);
    const obj = f.obj || 'costo', abierto = !!f.open, vt = f.vt && f.vt.usar ? f.vt : null;
    const metodo = mode === 'split' ? 'dfj' : (o.metodo === 'dfj' && !(I.pairs && I.pairs.length) ? 'dfj' : 'mtz');
    const hasArc = (k, i, j) => {   // reglas de arcos por vehículo
      const h = veh[k].depot; if (i === j) return false;
      const isC = (x) => x !== h, bh = (x) => r[x] > 0 && !(w[x] > 0);
      if (!isFinite(D[i][j])) return false;
      if (mode === 'backhaul') { if (i === h && bh(j)) return false; if (isC(i) && isC(j) && bh(i) && !bh(j)) return false; }
      return true;
    };
    const cap = (k) => (isFinite(veh[k].cap) ? veh[k].cap : INF);
    const Qmax = Math.max(...veh.map((_, k) => cap(k)));
    const sumW = cl.reduce((a, i) => a + w[i], 0), sumR = cl.reduce((a, i) => a + r[i], 0);
    if (mode !== 'split' && isFinite(Qmax) && cl.some((i) => w[i] > Qmax + 1e-9 || r[i] > Qmax + 1e-9)) return { estado: 'infactible: un cliente supera la capacidad del mayor vehículo', rutas: [] };
    const M = new (Model())(), X = (k, i, j) => 'x_' + k + '_' + i + '_' + j, Y = (k, i) => 'y_' + k + '_' + i, V = (k) => 'v_' + k, Z = (k, i) => 'z_' + k + '_' + i, DEP = (d) => 'o_' + d;
    const costo = (k, i, j) => (abierto && j === veh[k].depot ? 0 : veh[k].costoKm * D[i][j]);
    const dist = (k, i, j) => (abierto && j === veh[k].depot ? 0 : D[i][j]);
    const maxo = f.objetivo === 'maximo' || obj === 'maximo';
    let lmin = 0, lmax = nc;
    if (f.balanced) { lmin = Math.max(1, Math.floor(nc / m)); lmax = Math.ceil(nc / m); } else { lmin = f.lmin || 0; lmax = f.lmax || nc; }
    const todas = !!f.balanced || lmin >= 1;
    const arcs = [];   // por vehículo
    for (let k = 0; k < m; k++) {
      const h = veh[k].depot, nodes = [...cl, h], A = [];
      for (const i of nodes) for (const j of nodes) if (hasArc(k, i, j)) A.push([i, j]);
      arcs.push({ A, has: new Set(A.map(([i, j]) => i + ',' + j)), nodes });
    }
    if (maxo) M.addVar('zmax', 1, 0, INF, false);
    const tinyTop = obj === 'top' ? 1e-4 : 1;
    for (let k = 0; k < m; k++) {
      const h = veh[k].depot, { A, has, nodes } = arcs[k];
      for (const [i, j] of A) M.addVar(X(k, i, j), (maxo ? 1e-3 : 1) * tinyTop * costo(k, i, j), 0, 1, true);
      for (const i of cl) M.addVar(Y(k, i), obj === 'costo' || obj === 'maximo' ? 0 : -(prize[i] || 0), 0, 1, true);
      M.addVar(V(k), veh[k].fijo || 0, todas ? 1 : 0, 1, true);
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
      M.addCon(cl.map((i) => Y(k, i)).concat([V(k)]), cl.map(() => 1).concat([-(veh[k].lstops || lmax)]), -INF, 0);
      if (isFinite(veh[k].Lmax)) M.addCon(A.map(([i, j]) => X(k, i, j)).concat([V(k)]), A.map(([i, j]) => dist(k, i, j)).concat([-veh[k].Lmax]), -INF, 0);
      if (maxo) M.addCon(A.map(([i, j]) => X(k, i, j)).concat(['zmax']), A.map(([i, j]) => costo(k, i, j)).concat([-1]), -INF, 0);
      if (f.locDepot) { /* el vehículo solo sale de un depósito abierto */ M.addCon([V(k), DEP(h)], [1, -1], -INF, 0); }
    }
    if (f.locDepot) for (const d of depots) M.addVar(DEP(d), (f.openCost && f.openCost[d]) || 0, 0, 1, true);
    // cobertura
    for (const i of cl) {
      const ys = Array.from({ length: m }, (_, k) => Y(k, i));
      if (mode === 'split') M.addCon(ys, 1, 1, INF); else if (optional(i)) M.addCon(ys, 1, -INF, 1); else M.addCon(ys, 1, 1, 1);
    }
    // capacidad según modo
    for (let k = 0; k < m; k++) {
      const q = cap(k); if (!isFinite(q)) continue;
      if (mode === 'entrega' || mode === 'backhaul') M.addCon(cl.map((i) => Y(k, i)), cl.map((i) => w[i]), -INF, q);
      if (mode === 'backhaul') M.addCon(cl.map((i) => Y(k, i)), cl.map((i) => r[i]), -INF, q);
      if (mode === 'spd') M.addCon(cl.map((i) => Y(k, i)), cl.map((i) => w[i]), -INF, q);
    }
    if (mode === 'split') {
      for (const i of cl) for (let k = 0; k < m; k++) { M.addVar(Z(k, i), 0, 0, w[i], false); M.addCon([Z(k, i), Y(k, i)], [1, -w[i]], -INF, 0); }
      for (const i of cl) M.addCon(Array.from({ length: m }, (_, k) => Z(k, i)), 1, w[i], w[i]);
      for (let k = 0; k < m; k++) if (isFinite(cap(k))) M.addCon(cl.map((i) => Z(k, i)).concat([V(k)]), cl.map(() => 1).concat([-cap(k)]), -INF, 0);
    }
    // carga a lo largo de la ruta (recoger-entregar, simultáneo)
    if (mode === 'spd' || mode === 'pd') {
      const Ml = Math.max(1, sumW + sumR, isFinite(Qmax) ? Qmax : 0);
      for (const i of cl) M.addVar('l_' + i, 0, 0, isFinite(Qmax) ? Qmax : Ml, false);
      for (const i of cl) { const ys = Array.from({ length: m }, (_, k) => Y(k, i)), qs = Array.from({ length: m }, (_, k) => (isFinite(cap(k)) ? cap(k) : Ml)); M.addCon(['l_' + i].concat(ys), [1].concat(qs.map((v) => -v)), -INF, 0); }
      for (const i of cl) for (const j of cl) if (i !== j) {
        const xs = [], co = []; for (let k = 0; k < m; k++) if (arcs[k].has.has(i + ',' + j)) { xs.push(X(k, i, j)); co.push(-Ml); }
        if (xs.length) M.addCon(['l_' + j, 'l_' + i].concat(xs), [1, -1].concat(co), (r[j] - w[j]) - Ml, INF);
      }
      for (let k = 0; k < m; k++) { const h = veh[k].depot; for (const j of cl) if (arcs[k].has.has(h + ',' + j)) {
        const names = ['l_' + j, X(k, h, j)], co = [1, -Ml]; if (mode === 'spd') cl.forEach((i) => { names.push(Y(k, i)); co.push(-w[i]); });
        M.addCon(names, co, (r[j] - w[j]) - Ml, INF); } }
    }
    // pares recoger-entregar
    const pairs = I.pairs || [];
    for (const [p, d] of pairs) for (let k = 0; k < m; k++) M.addCon([Y(k, p), Y(k, d)], [1, -1], 0, 0);
    // eliminación de subtours
    if (metodo === 'mtz') {
      for (const i of cl) M.addVar('p_' + i, 0, 1, nc, false);
      for (const i of cl) for (const j of cl) if (i !== j) {
        const xs = []; for (let k = 0; k < m; k++) if (arcs[k].has.has(i + ',' + j)) xs.push(X(k, i, j));
        if (xs.length) M.addCon(['p_' + i, 'p_' + j].concat(xs), [1, -1].concat(xs.map(() => nc)), -INF, nc - 1);
      }
      for (const [p, d] of pairs) M.addCon(['p_' + d, 'p_' + p], [1, -1], 1, INF);
    }
    // simetría entre vehículos idénticos
    if (mode !== 'split') for (let k = 1; k < m; k++) { const a = veh[k - 1], b = veh[k]; if (a.depot === b.depot && a.cap === b.cap && a.costoKm === b.costoKm && a.vel === b.vel && a.fijo === b.fijo && a.Lmax === b.Lmax && !pairs.length)
      cl.forEach((j, pos) => { const prev = cl.slice(0, pos).map((l) => Y(k - 1, l)); M.addCon([Y(k, j), ...prev], [1, ...prev.map(() => -1)], -INF, 0); }); }
    // ventanas de tiempo
    if (vt) {
      const H = 48, s = vt.servicio || 0, maxd = Math.max(...D.flat().filter(isFinite)), minv = Math.min(...veh.map((v) => v.vel)), Mt = H + s + maxd / minv;
      for (const i of cl) M.addVar('t_' + i, 0, vt.a[i] ?? 0, vt.b[i] ?? H, false);
      for (let k = 0; k < m; k++) { const h = veh[k].depot; for (const j of cl) if (arcs[k].has.has(h + ',' + j)) M.addCon(['t_' + j, X(k, h, j)], [1, -(D[h][j] / veh[k].vel + Mt)], (vt.inicio || 0) - Mt, INF); }
      for (const i of cl) for (const j of cl) if (i !== j) {
        const names = ['t_' + j, 't_' + i], coefs = [1, -1];
        for (let k = 0; k < m; k++) if (arcs[k].has.has(i + ',' + j)) { names.push(X(k, i, j)); coefs.push(-(D[i][j] / veh[k].vel + Mt)); }
        if (names.length > 2) M.addCon(names, coefs, s - Mt, INF);
      }
    }
    // el valor de la función: costos de apertura ya están en las variables o_d
    let cortes = 0, gapIt = metodo === 'dfj' ? Math.max(o.brecha || 1e-6, 0.05) : (o.brecha || 1e-6), valida = null, sol;
    for (;;) {
      const left = (o.tiempo || 120) - (now() - t0) / 1000;
      if (left <= 0.5 || (ctx.detenido && ctx.detenido())) { if (!valida) return { estado: 'límite de tiempo (sin solución válida)', rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      sol = await ctx.solve(M.toLP(), { timeLimit: left, gap: gapIt });
      if (!sol.ok) { if (!valida) return { estado: sol.status === 'infactible' ? 'infactible: con estos datos no existe solución' : sol.status, rutas: [] }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      if (metodo === 'mtz') break;
      const cs = [];
      for (let k = 0; k < m; k++) {
        const h = veh[k].depot, succ = {}, vis = new Set();
        for (const [i, j] of arcs[k].A) if (i !== h && sol.val(X(k, i, j)) > 0.5) succ[i] = j;
        for (const j of cl) if (arcs[k].has.has(h + ',' + j) && sol.val(X(k, h, j)) > 0.5) { let u = j; while (u !== h && !vis.has(u)) { vis.add(u); u = succ[u] === undefined ? h : succ[u]; } }
        for (const i of cl) if (sol.val(Y(k, i)) > 0.5 && !vis.has(i) && succ[i] !== undefined) { const c = []; let u = i; while (!vis.has(u) && succ[u] !== undefined) { vis.add(u); c.push(u); u = succ[u]; } if (c.length) cs.push(c); }
      }
      if (ctx.log) ctx.log('VRP: ' + cs.length + ' subcircuito(s), ' + cortes + ' cortes');
      if (!cs.length) { valida = sol; if (gapIt > (o.brecha || 1e-6) * 1.0001 && sol.status === 'óptimo' && (o.tiempo || 120) - (now() - t0) / 1000 > 2) { gapIt = o.brecha || 1e-6; continue; } break; }
      for (const S of cs) for (let k = 0; k < m; k++) {
        const inter = []; for (const i of S) for (const j of S) if (arcs[k].has.has(i + ',' + j)) inter.push(X(k, i, j));
        for (const hh of new Set([S[0], S[S.length >> 1]])) { const ys = S.filter((i) => i !== hh).map((i) => Y(k, i)); M.addCon(inter.concat(ys), inter.map(() => 1).concat(ys.map(() => -1)), -INF, 0); }
        cortes++;
      }
    }
    // decodificar
    const rutas = [], info = [];
    for (let k = 0; k < m; k++) {
      if (sol.val(V(k)) < 0.5) continue; const h = veh[k].depot, succ = {}; let st = null;
      for (const [i, j] of arcs[k].A) if (sol.val(X(k, i, j)) > 0.5) { if (i === h) st = j; else succ[i] = j; }
      if (st === null) continue;
      const ru = [h, st]; let u = st, g = 0; while (succ[u] !== undefined && succ[u] !== h && g++ < 500) { u = succ[u]; ru.push(u); } if (!abierto) ru.push(h);
      const d = ru.slice(1).reduce((a, v, q) => a + dist(k, ru[q], v), 0), c = ru.slice(1).reduce((a, v, q) => a + costo(k, ru[q], v), 0);
      const ent = mode === 'split' ? ru.reduce((a, v) => a + (v === h ? 0 : sol.val(Z(k, v))), 0) : ru.reduce((a, v) => a + (v === h ? 0 : w[v]), 0);
      rutas.push(ru); info.push({ tipo: veh[k].tipo, depot: h, dist: d, costo: c + (veh[k].fijo || 0), carga: ent, cap: veh[k].cap, llegadas: vt ? ru.map((v) => (v === h ? null : sol.val('t_' + v))) : null, entregas: mode === 'split' ? ru.map((v) => (v === h ? null : sol.val(Z(k, v)))) : null });
    }
    const ord = rutas.map((_, q) => q).sort((a, b) => rutas[b].length - rutas[a].length), R = ord.map((q) => rutas[q]), In = ord.map((q) => info[q]);
    const visit = new Set(R.flat()); const noVis = cl.filter((i) => !visit.has(i));
    const aper = f.locDepot ? depots.filter((d) => sol.val(DEP(d)) > 0.5) : null;
    const total = In.reduce((a, x) => a + x.dist, 0), totalCosto = In.reduce((a, x) => a + x.costo, 0);
    const premio = cl.filter((i) => visit.has(i)).reduce((a, i) => a + (prize[i] || 0), 0);
    return { estado: sol.status, objetivo: sol.obj, total, totalCosto, rutas: R, dists: In.map((x) => x.dist), info: In, noVisitados: noVis, premio, abiertos: aper, gap: sol.gap, cota: sol.gap > 0 && isFinite(sol.gap) ? sol.obj - Math.abs(sol.obj) * sol.gap : sol.obj, cortes, seg: (now() - t0) / 1000, metodoSol: 'exacto' };
  }
  root.Vrp = { vrp };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Vrp;
})(typeof globalThis !== 'undefined' ? globalThis : this);
