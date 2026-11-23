/* Modelo matemático general de VRP (MILP). Una sola formulación con opciones que cubre más de 20 variantes:
   TSP, mTSP, CVRP, VRPTW, flota heterogénea, multi-depósito, backhauls, recoger-entregar, entrega dividida,
   con beneficios, orienteering, localización-ruteo, etc. Requiere Solver.Model (solver.js).
   Instancia I = { D, depots:[idx], cust:[idx], w[], r[], prize[], optional[], pairs:[[p,d]],
                   veh:[{depot,cap,costoKm,vel,fijo,Lmax}], f:{...opciones} } */
(function (root) {
  'use strict';
  const INF = Infinity, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const Model = () => root.Solver.Model;

  async function vrpExacto(I, ctx, o) {
    o = o || {}; const t0 = now(), f = I.f || {}, D = I.D, veh = I.veh, m = veh.length, cl = I.cust, nc = cl.length, depots = I.depots;
    if (o.metodo === 'arco' && arcoAplica(I)) return vrpArco(I, ctx, o);
    /* mínima flota (MinVeh): fase 1 minimiza el número de vehículos; fase 2 fija ese número y minimiza la distancia */
    if (f.minVeh && !o.fase && !o.fijarVeh) {
      const T = o.tiempo || 120, r1 = await vrp(I, ctx, Object.assign({}, o, { fase: 'veh', tiempo: T * 0.4 }));
      if (!r1.rutas || !r1.rutas.length) return r1;
      const nV = r1.rutas.length, r2 = await vrp(I, ctx, Object.assign({}, o, { fijarVeh: nV, tiempo: T * 0.6 }));
      r2.flota = nV; r2.fase1 = { estado: r1.estado, vehiculos: nV, seg: r1.seg };
      if (r2.informe) r2.informe.vehiculos = nV;
      return r2;
    }
    const w = I.w || D.map(() => 0), r = I.r || D.map(() => 0), mode = f.mode || 'entrega';
    const prize = I.prize || D.map(() => 0), optional = (i) => !!(I.optional && I.optional[i]);
    const obj = f.obj || 'costo', abierto = !!f.open, vt = f.vt && f.vt.usar ? f.vt : null;
    const lat = obj === 'latencia', blandas = !!(vt && f.blandas), tmax = f.tmax > 0 ? f.tmax : null, servJ = f.servicio || (vt ? vt.servicio || 0 : 0);
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
      for (const [i, j] of A) M.addVar(X(k, i, j), o.fase === 'veh' ? 0 : (maxo || lat ? 1e-3 : 1) * tinyTop * costo(k, i, j), 0, 1, true);
      for (const i of cl) M.addVar(Y(k, i), o.fase === 'veh' || !(obj === 'profit' || obj === 'top') ? 0 : -(prize[i] || 0), 0, 1, true);
      M.addVar(V(k), o.fase === 'veh' ? 1 : (veh[k].fijo || 0), todas ? 1 : 0, 1, true);
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
      if (tmax) M.addCon(A.map(([i, j]) => X(k, i, j)).concat(cl.map((i) => Y(k, i)), [V(k)]), A.map(([i, j]) => dist(k, i, j) / veh[k].vel).concat(cl.map(() => servJ), [-tmax]), -INF, 0);   // jornada máxima
      if (isFinite(veh[k].Lmax)) M.addCon(A.map(([i, j]) => X(k, i, j)).concat([V(k)]), A.map(([i, j]) => dist(k, i, j)).concat([-veh[k].Lmax]), -INF, 0);
      if (maxo) M.addCon(A.map(([i, j]) => X(k, i, j)).concat(['zmax']), A.map(([i, j]) => costo(k, i, j)).concat([-1]), -INF, 0);
      if (f.locDepot) { /* el vehículo solo sale de un depósito abierto */ M.addCon([V(k), DEP(h)], [1, -1], -INF, 0); }
    }
    if (f.locDepot) for (const d of depots) M.addVar(DEP(d), (f.openCost && f.openCost[d]) || 0, 0, 1, true);
    if (o.fijarVeh) M.addCon(Array.from({ length: m }, (_, k) => V(k)), 1, o.fijarVeh, o.fijarVeh);
    // cobertura
    for (const i of cl) {
      const ys = Array.from({ length: m }, (_, k) => Y(k, i));
      if (mode === 'split') M.addCon(ys, 1, 1, INF); else if (optional(i)) M.addCon(ys, 1, -INF, 1); else M.addCon(ys, 1, 1, 1);
    }
    // corte válido: la capacidad de los vehículos usados cubre la demanda total (entrega y recogida)
    if ((mode === 'entrega' || mode === 'backhaul' || mode === 'spd') && !cl.some((i) => optional(i))) {
      const caps = Array.from({ length: m }, (_, k) => cap(k));
      if (caps.every(isFinite) && sumW > 0) M.addCon(Array.from({ length: m }, (_, k) => V(k)), caps, sumW, INF);
      if (mode === 'backhaul' && sumR > 0 && caps.every(isFinite)) M.addCon(Array.from({ length: m }, (_, k) => V(k)), caps, sumR, INF);
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
    // capacidad de cada centro de distribución abierto (localización-ruteo)
    if (f.locDepot && f.capD) for (const d of depots) { if (!(f.capD[d] > 0)) continue; const nm = [], co = []; for (let k = 0; k < m; k++) if (veh[k].depot === d) for (const i of cl) { nm.push(Y(k, i)); co.push(w[i]); } nm.push(DEP(d)); co.push(-f.capD[d]); M.addCon(nm, co, -INF, 0); }
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
      const T = (root.Variantes || require('./variantes.js')).tiempos(I), s = T.s, H0 = T.H0;   // cotas de tiempo y M grande ajustada por arco
      for (const i of cl) M.addVar('t_' + i, o.fase !== 'veh' && lat ? 1 : 0, T.lo[i], T.up[i], false);
      if (lat && o.fase !== 'veh') M.addVar('cte', -nc * (vt.inicio || 0), 1, 1, false);   // Σ (t_i − t0): constante −n·t0
      if (blandas) for (const i of cl) { M.addVar('e_' + i, o.fase === 'veh' ? 0 : f.penRetraso || 0, 0, INF, false); M.addCon(['e_' + i, 't_' + i], [1, -1], -(vt.b[i] ?? H0), INF); }   // retraso ≥ t − b
      for (let k = 0; k < m; k++) { const h = veh[k].depot; for (const j of cl) if (arcs[k].has.has(h + ',' + j)) { const Mk = T.Mdep(k, j); M.addCon(['t_' + j, X(k, h, j)], [1, -(D[h][j] / veh[k].vel + Mk)], (vt.inicio || 0) - Mk, INF); } }
      // cierre del depósito: la última parada más el regreso no pasan de la hora de cierre
      if (!abierto && vt.cierre > 0) for (let k = 0; k < m; k++) { const h = veh[k].depot; for (const i of cl) if (arcs[k].has.has(i + ',' + h)) { const Mk = T.Mfin(k, i); M.addCon(['t_' + i, X(k, i, h)], [1, Mk], -INF, vt.cierre + Mk - s - D[i][h] / veh[k].vel); } }
      for (const i of cl) for (const j of cl) if (i !== j) {
        const names = ['t_' + j, 't_' + i], coefs = [1, -1], ks = []; let Mx = 0;
        for (let k = 0; k < m; k++) if (arcs[k].has.has(i + ',' + j)) { ks.push(k); Mx = Math.max(Mx, T.Mij(k, i, j)); }
        ks.forEach((k) => { names.push(X(k, i, j)); coefs.push(-(D[i][j] / veh[k].vel + Mx)); });
        if (names.length > 2) M.addCon(names, coefs, s - Mx, INF);
      }
    }
    // el valor de la función: costos de apertura ya están en las variables o_d
    let cortes = 0, gapIt = metodo === 'dfj' ? Math.max(o.brecha || 1e-6, 0.05) : (o.brecha || 1e-6), valida = null, sol;
    for (;;) {
      const left = (o.tiempo || 120) - (now() - t0) / 1000;
      if (left <= 0.5 || (ctx.detenido && ctx.detenido())) { if (!valida) return { estado: 'límite de tiempo (sin solución válida)', rutas: [], cota: sol && sol.dual != null && isFinite(sol.dual) ? sol.dual : null }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
      sol = await ctx.solve(M.toLP(), { timeLimit: left, gap: gapIt, soloCota: metodo === 'dfj' });   // DFJ: cada iteración es una relajación con cortes
      if (!sol.ok) { if (!valida) return { estado: sol.status === 'infactible' ? 'infactible: con estos datos no existe solución' : sol.status, rutas: [], cota: sol.dual != null && isFinite(sol.dual) ? sol.dual : null }; sol = valida; sol.status = 'límite de tiempo (mejor solución encontrada, no probada óptima)'; break; }
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
    const latencia = lat ? cl.reduce((a, i) => a + sol.val('t_' + i) - (vt.inicio || 0), 0) : null, retraso = blandas ? cl.reduce((a, i) => a + Math.max(0, sol.val('e_' + i)), 0) : null;
    const tarde = blandas ? cl.filter((i) => sol.val('e_' + i) > 1e-6) : null;
    const cota = sol.cota != null ? sol.cota : (sol.dual != null && isFinite(sol.dual) ? sol.dual : (sol.gap > 0 && isFinite(sol.gap) ? sol.obj - Math.abs(sol.obj) * sol.gap : sol.obj));
    const seg = (now() - t0) / 1000;
    const informe = { modelo: metodo === 'mtz' ? 'MILP con eliminación MTZ' : 'MILP con cortes DFJ', estado: sol.status, objetivo: sol.obj, cota, gap: sol.gap, tiempo: seg,
      variables: M.vars.length, binarias: M.vars.filter((v) => v.int).length, restricciones: M.cons.length, cortes, rutas: R.length, vehiculos: null, tiempoLimite: o.tiempo || 120, nodos: sol.nodos };
    return { estado: sol.status, objetivo: sol.obj, total, totalCosto, rutas: R, dists: In.map((x) => x.dist), info: In, noVisitados: noVis, premio, abiertos: aper, latencia, retraso, tarde, gap: sol.gap, cota, cortes, seg, metodoSol: 'exacto', informe };
  }
  /* Solución inicial: con muchos clientes el MILP puede tardar en hallar la primera solución factible. Si se puede,
     la heurística da una solución factible en segundos; se muestra de inmediato y el MILP intenta mejorarla. */
  /* Formulación de dos índices (flota homogénea): x_ij binaria por arco, sin índice de vehículo. Es mucho más ajustada que
     la de vehículo-arco. Cortes de capacidad redondeada y de subtours se agregan por separación iterativa. */
  function arcoAplica(I) {
    const f = I.f || {}, veh = I.veh || [];
    if (!veh.length || (I.depots || []).length !== 1 || f.open || f.locDepot || f.vt || f.blandas || f.balanced || f.minVeh) return false;
    if (f.tmax > 0 || f.lmin > 0 || (f.lmax > 0 && f.lmax < (I.cust || []).length)) return false;   // jornada máxima y mínimo/máximo de clientes por ruta: solo en la formulación por vehículo
    if (f.mode && f.mode !== 'entrega') return false;
    if ((f.obj && f.obj !== 'costo') || f.objetivo === 'maximo' || (I.optional && I.optional.some(Boolean)) || (I.pairs && I.pairs.length)) return false;
    const v0 = veh[0]; return veh.every((v) => v.cap === v0.cap && v.costoKm === v0.costoKm && v.depot === v0.depot && !(v.fijo > 0) && !isFinite(v.Lmax) && !v.lstops);
  }
  async function vrpArco(I, ctx, o) {
    o = o || {}; const t0 = now(), D = I.D, veh = I.veh, h = I.depots[0], cl = I.cust, m = veh.length, v0 = veh[0];
    const Q = isFinite(v0.cap) ? v0.cap : Infinity, cu = v0.costoKm, w = I.w || D.map(() => 0);
    const nodos = [h, ...cl], dem = (S) => S.reduce((a, i) => a + (w[i] || 0), 0);
    const M = new (Model())(), X = (i, j) => 'x_' + i + '_' + j;
    for (const i of nodos) for (const j of nodos) if (i !== j && isFinite(D[i][j]) && !(cl.indexOf(i) < 0 && cl.indexOf(j) < 0)) M.addVar(X(i, j), cu * D[i][j], 0, 1, true);
    const arcs = (A, B) => { const out = []; for (const i of A) for (const j of B) if (i !== j && isFinite(D[i][j])) out.push(X(i, j)); return out; };
    for (const i of cl) { const sal = arcs([i], nodos), ent = arcs(nodos, [i]); M.addCon(sal, sal.map(() => 1), 1, 1); M.addCon(ent, ent.map(() => 1), 1, 1); }
    const salD = arcs([h], cl), entD = arcs(cl, [h]);
    M.addCon(salD, salD.map(() => 1), -Infinity, m);                    // a lo sumo m vehículos
    M.addCon(salD.concat(entD), salD.map(() => 1).concat(entD.map(() => -1)), 0, 0);   // regresan los que salen
    if (isFinite(Q)) { const kmin = Math.ceil(dem(cl) / Q - 1e-9); if (kmin > 0) M.addCon(salD, salD.map(() => 1), kmin, Infinity); }   // cota de flota
    let cortes = 0, sol = null, valida = null, gapIt = Math.max(o.brecha || 1e-6, 1e-6), cotaLP = -Infinity;
    /* corte de capacidad redondeada: al menos ceil(d(S)/Q) arcos saliendo de S */
    const ponerCorte = (S, lb) => { const fuera = nodos.filter((j) => !S.includes(j)), out = arcs(S, fuera); M.addCon(out, out.map(() => 1), lb, Infinity); cortes++; };
    const cortar = (S) => {   // cortes válidos sobre el conjunto S de clientes
      const dS = dem(S);
      if (isFinite(Q) && dS > Q + 1e-9) { ponerCorte(S, Math.ceil(dS / Q - 1e-9)); return true; }
      return false;
    };
    /* Fase A: cortes con la relajación lineal (mucho más rápida que resolver el entero en cada ronda).
       Las componentes del grafo de apoyo fraccional con demasiada salida reciben un corte de capacidad. */
    const tA = Math.max(3, (o.tiempo || 120) * 0.3); const tIni = now();
    for (let ronda = 0; ronda < 200; ronda++) {
      const left = Math.min(tA - (now() - tIni) / 1000, (o.tiempo || 120) - (now() - t0) / 1000);
      if (left <= 0.5 || !isFinite(Q)) break;
      const sA = await ctx.solve(M.toLP(true), { timeLimit: left, gap: 0, soloCota: true });
      if (!sA.ok) break;
      if (sA.obj != null && isFinite(sA.obj)) cotaLP = Math.max(cotaLP, sA.obj);   // la relajación da una cota inferior válida
      const xv = (i, j) => sA.val(X(i, j)), vistos = new Set(); let nuevos = 0;
      for (const i of cl) {
        if (vistos.has(i)) continue; const S = [i], cola = [i]; vistos.add(i);
        while (cola.length) { const a = cola.pop(); for (const b of cl) if (!vistos.has(b) && (xv(a, b) + xv(b, a)) > 1e-6) { vistos.add(b); S.push(b); cola.push(b); } }
        const lb = Math.ceil(dem(S) / Q - 1e-9), inS = new Set(S);
        let salida = 0; for (const a of S) for (const b of nodos) if (!inS.has(b) && a !== b && isFinite(D[a][b])) salida += xv(a, b);
        if (lb >= 1 && salida < lb - 1e-6) { ponerCorte(S, lb); nuevos++; }
      }
      if (!nuevos) break;
    }
    const subtour = (S) => { const dentro = arcs(S, S); M.addCon(dentro, dentro.map(() => 1), -Infinity, S.length - 1); cortes++; };
    for (;;) {
      const left = (o.tiempo || 120) - (now() - t0) / 1000;
      if (left <= 0.5 || (ctx.detenido && ctx.detenido())) break;
      // las iteraciones de cortes son relajaciones: su «mejor solución» no es factible; solo se informa la cota
      sol = await ctx.solve(M.toLP(), { timeLimit: left, gap: gapIt, soloCota: true });
      if (!sol.ok) break;
      const val = (i, j) => sol.val(X(i, j)) > 0.5;
      const rutas = []; let visitados = new Set();
      for (const j of cl) if (val(h, j)) { const ru = [h, j]; visitados.add(j); let u = j, g = 0; while (g++ < cl.length + 2) { const nx = nodos.find((k) => k !== u && val(u, k)); if (nx === undefined || nx === h) break; ru.push(nx); visitados.add(nx); u = nx; } ru.push(h); rutas.push(ru); }
      const violados = [];
      rutas.forEach((ru) => { const S = ru.slice(1, -1); if (S.length && dem(S) > Q + 1e-9) violados.push(S); });
      // clientes en ciclos sin depósito: subtours
      const sinVisitar = cl.filter((i) => !visitados.has(i)), seen = new Set();
      for (const i of sinVisitar) { if (seen.has(i)) continue; const C = []; let u = i, g = 0; do { C.push(u); seen.add(u); const nx = nodos.find((k) => k !== u && cl.includes(k) && val(u, k)); if (nx === undefined) break; u = nx; g++; } while (u !== i && g <= cl.length); if (u === i) violados.push(C); }
      if (!violados.length) { valida = { rutas, obj: sol.obj, status: sol.status, gap: sol.gap, dual: sol.dual }; break; }
      for (const S of violados) {
        const esRuta = rutas.some((ru) => S.every((c) => ru.includes(c)));
        if (esRuta) cortar(S); else subtour(S);   // una ruta con demasiada carga: corte de capacidad; un ciclo sin depósito: subtour
      }
    }
    const fuente = valida || (sol && sol.ok ? { rutas: [], obj: sol.obj, status: sol.status, gap: sol.gap, dual: sol.dual } : null);
    const seg = (now() - t0) / 1000;
    if (!valida) return { estado: 'límite de tiempo (sin solución válida)', rutas: [], cortes, seg, metodoSol: 'exacto', cota: sol && sol.dual != null && isFinite(sol.dual) ? sol.dual : null };
    const R = valida.rutas, dists = R.map((ru) => ru.slice(1).reduce((a, v, q) => a + D[ru[q]][v], 0));
    const info = R.map((ru, k) => ({ tipo: v0.tipo, depot: h, dist: dists[k], costo: cu * dists[k], carga: dem(ru.slice(1, -1)), cap: v0.cap, llegadas: null, entregas: null }));
    const obj = info.reduce((a, x) => a + x.costo, 0);
    const cotaMIP = fuente.dual != null && isFinite(fuente.dual) ? fuente.dual : -Infinity, cota = Math.max(cotaMIP, cotaLP) > -Infinity ? Math.max(cotaMIP, cotaLP) : null;   // la mejor cota de ambas fases
    const gap = cota != null ? Math.max(0, (obj - cota) / Math.max(Math.abs(obj), 1e-9)) : null;
    const estado = valida.status === 'óptimo' || (gap != null && gap <= 1e-6) ? 'óptimo' : 'límite de tiempo (mejor solución encontrada, no probada óptima)';
    const informe = { modelo: 'Dos índices + cortes de capacidad redondeada', estado, objetivo: obj, cota, gap, tiempo: seg, variables: M.vars.length, binarias: M.vars.length, restricciones: M.cons.length, cortes, rutas: R.length, vehiculos: null, tiempoLimite: o.tiempo || 120, nodos: sol.nodos };
    return { estado, objetivo: obj, total: dists.reduce((a, b) => a + b, 0), totalCosto: obj, rutas: R, dists, info, noVisitados: [], premio: 0, abiertos: null, gap, cota, cortes, seg, metodoSol: 'exacto', informe };
  }
  /* costo simple: la función objetivo es exactamente la suma de costoKm × distancia (así se puede verificar una solución) */
  function esSimple(I, o) {
    const f = I.f || {};
    return !(o && (o.fase || o.fijarVeh)) && !f.minVeh && f.mode !== 'split' && !f.locDepot && (!f.obj || f.obj === 'costo') && f.objetivo !== 'maximo' && !(I.optional && I.optional.some(Boolean)) && !(I.pairs && I.pairs.length) && !f.blandas;
  }
  function incumbente(I, o) {
    const nc = I.cust.length;
    if (nc < 20 || !esSimple(I, o) || o.heurInicial === false || typeof Heur === 'undefined') return null;
    let mejor = null;
    /* ahorros y VND son casi instantáneos; la búsqueda grande vecindario (LNS) mejora unos 5 % en pocos segundos */
    const parar = typeof hayParar === 'function' ? hayParar : () => false;
    const tLns = Math.min(8, Math.max(2, (o.tiempo || 60) * 0.05));
    for (const [a, t] of [['ahorros', 1], ['vnd', 3], ['lns', tLns]]) {
      if (a === 'lns' && parar()) break;
      try { const r = Heur.resolver(I, a, { tiempo: t, semilla: 1, parar }); if (r.factible && r.rutas && r.rutas.length && (!mejor || r.objetivo < mejor.objetivo - 1e-9)) mejor = r; } catch (e) { /* sigue con las demás */ }
    }
    return mejor;
  }
  /* Verificación independiente de una solución del MILP (sobre todo si se detuvo a mitad): cada cliente una vez,
     capacidad respetada y costo recalculado igual al que informa el modelo. Si no cuadra, no se entrega. */
  function solucionValida(I, r) {
    if (!r || !r.rutas || !r.rutas.length || !isFinite(r.objetivo)) return false;
    const f = I.f || {}, open = !!f.open, w = I.w || I.D.map(() => 0), cnt = new Map(), cl = new Set(I.cust);
    let costo = 0;
    for (let k = 0; k < r.rutas.length; k++) {
      const ru = r.rutas[k]; if (ru.length < 2) return false;
      const h = ru[0], vis = ru.slice(1).filter((v, q, a) => !(q === a.length - 1 && v === h));
      let carga = 0; for (const v of vis) { if (!cl.has(v)) return false; cnt.set(v, (cnt.get(v) || 0) + 1); carga += w[v] || 0; }
      const kv = (r.info && r.info[k]) || {}; const cap = isFinite(kv.cap) && kv.cap > 0 ? kv.cap : Infinity;
      if (carga > cap + 1e-6) return false;
      let d = 0; for (let q = 1; q < ru.length; q++) { if (open && q === ru.length - 1 && ru[q] === h) break; d += I.D[ru[q - 1]][ru[q]]; }
      if (!isFinite(d)) return false;
      const vk = I.veh.find((v) => v.depot === h && (!kv.tipo || v.tipo === kv.tipo)) || I.veh[0];
      costo += vk.costoKm * d + (vk.fijo || 0);
    }
    if (I.cust.some((i) => cnt.get(i) !== 1)) return false;
    return Math.abs(costo - r.objetivo) <= 1e-6 * Math.max(1, Math.abs(costo));
  }
  /* Elige entre la solución del MILP y la de la heurística inicial: nunca se entrega una peor ni una no verificada */
  function elegir(inc, r, I, parado) {
    if (!inc) return r;
    if (r && solucionValida(I, r) && r.objetivo <= inc.objetivo + 1e-9) return r;
    const cota = r && r.cota != null && isFinite(r.cota) ? r.cota : null;
    const gap = cota != null ? Math.max(0, (inc.objetivo - cota) / Math.max(Math.abs(inc.objetivo), 1e-9)) : null;
    const estado = parado ? 'detenido por el usuario (solución heurística; el modelo matemático no la mejoró antes de parar)' : 'límite de tiempo (solución heurística; el modelo matemático no la mejoró en el tiempo dado)';
    const guion = (v) => (v === undefined || v === null ? '—' : v);
    const informe = Object.assign({}, (r && r.informe) || {}, { modelo: 'Heurística inicial (ahorros / VND) + MILP', estado, objetivo: inc.objetivo, cota, gap, tiempo: r && r.seg, tiempoLimite: r && r.informe ? r.informe.tiempoLimite : null, rutas: inc.rutas.length, variables: guion(r && r.informe && r.informe.variables), binarias: guion(r && r.informe && r.informe.binarias), restricciones: guion(r && r.informe && r.informe.restricciones), cortes: guion(r && r.informe && r.informe.cortes), vehiculos: null });
    return Object.assign({}, inc, { estado, gap, cota, metodoSol: 'Heurística inicial mejorada por el modelo (sin mejora)', informe, seg: r ? r.seg : inc.seg });
  }
  async function vrp(I, ctx, o) {
    o = o || {};
    const inc = incumbente(I, o);
    if (inc && typeof postMessage === 'function') postMessage({ tipo: 'progreso', mejor: inc.objetivo, cota: null, t: 0, heuristica: true });
    if (inc && ctx.log) ctx.log('Solución inicial por heurística: ' + inc.objetivo.toFixed(2) + '. El modelo matemático intenta mejorarla.');
    let r;
    try { r = await vrpExacto(I, ctx, o); } catch (e) { if (inc) return elegir(inc, null, I, false); throw e; }
    const parado = !!(ctx.detenido && ctx.detenido());
    if (esSimple(I, o) && r && r.rutas && r.rutas.length && !solucionValida(I, r)) r = Object.assign({}, r, { rutas: [], estado: 'solución no verificada (se descarta; revise el tiempo o los datos)' });
    return elegir(inc, r, I, parado);
  }
  root.Vrp = { vrp, vrpExacto, arcoAplica };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Vrp;
})(typeof globalThis !== 'undefined' ? globalThis : this);
