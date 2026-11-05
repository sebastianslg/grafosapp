/* Heurísticas y metaheurísticas para las variantes de VRP.
   Constructivas: vecino más cercano, ahorros (Clarke-Wright), barrido, inserción más barata.
   Mejora local: VND (relocate, swap, 2-opt, quitar/agregar clientes opcionales).
   Metaheurísticas: recocido simulado, búsqueda tabú, algoritmo genético, colonia de hormigas, GRASP, VNS.
   Misma instancia I que Vrp.vrp. Las restricciones se tratan con penalización; se devuelve la mejor solución factible. */
(function (root) {
  'use strict';
  const INF = Infinity, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  function crear(I, o) {
    o = o || {}; const f = I.f || {}, D = I.D, veh = I.veh, m = veh.length, cl = I.cust, nc = cl.length, mode = f.mode || 'entrega';
    if (mode === 'split') throw new Error('La entrega dividida (SDVRP) solo se resuelve con el modelo matemático.');
    const w = I.w || D.map(() => 0), r = I.r || D.map(() => 0), prize = I.prize || D.map(() => 0), obj = f.obj || 'costo', open = !!f.open, vt = f.vt && f.vt.usar ? f.vt : null;
    const opt = (i) => !!(I.optional && I.optional[i]);
    let lmin = 0, lmax = nc; if (f.balanced) { lmin = Math.max(1, Math.floor(nc / m)); lmax = Math.ceil(nc / m); } else { lmin = f.lmin || 0; lmax = f.lmax || nc; }
    const todas = !!f.balanced || lmin >= 1;
    const maxD = Math.max(...D.flat().filter(isFinite)), P = 50 * maxD * (1 + Math.max(...veh.map((v) => v.costoKm || 1))) + 2 * veh.reduce((a, v) => a + (v.fijo || 0), 0) + 2 * Object.values(f.openCost || {}).reduce((a, b) => a + b, 0) + 2 * (I.prize || []).reduce((a, b) => a + (b || 0), 0);
    const pairOf = new Map(); (I.pairs || []).forEach(([p, d]) => { pairOf.set(p, [p, d]); pairOf.set(d, [p, d]); });
    const cap = (k) => (isFinite(veh[k].cap) ? veh[k].cap : INF);
    const bh = (x) => r[x] > 0 && !(w[x] > 0);
    const tinyTop = obj === 'top' ? 1e-4 : 1;

    /* costo + penalización de una ruta (secuencia de clientes) del vehículo k */
    function ruta(k, s, detalle) {
      const n = s.length, h = veh[k].depot, V = veh[k];
      if (!n) return detalle ? { c: 0, d: 0, pen: todas ? 1 : 0, cost: todas ? P : 0 } : (todas ? P : 0);
      let d = D[h][s[0]]; for (let q = 1; q < n; q++) d += D[s[q - 1]][s[q]]; if (!open) d += D[s[n - 1]][h];
      let pen = 0;
      if (mode === 'entrega' || mode === 'backhaul' || mode === 'spd') { let sw = 0; for (const x of s) sw += w[x]; if (sw > cap(k) + 1e-9) pen += 1 + (sw - cap(k)) / Math.max(1, cap(k)); }
      if (mode === 'backhaul') { let sr = 0, seenB = false, lh = 0; for (const x of s) { sr += r[x]; if (bh(x)) seenB = true; else { lh++; if (seenB) pen += 1; } } if (sr > cap(k) + 1e-9) pen += 1 + (sr - cap(k)) / Math.max(1, cap(k)); if (!lh) pen += 1; }
      if (mode === 'spd' || mode === 'pd') {
        let load = 0; if (mode === 'spd') for (const x of s) load += w[x]; const Q = cap(k);
        for (const x of s) { load += r[x] - w[x]; if (load < -1e-9) { pen += 1 - load / Math.max(1, Q); load = 0; } if (load > Q + 1e-9) pen += 1 + (load - Q) / Math.max(1, Q); }
      }
      if (isFinite(V.Lmax) && d > V.Lmax + 1e-9) pen += 1 + (d - V.Lmax) / V.Lmax;
      if (n > (V.lstops || lmax)) pen += 1 + (n - (V.lstops || lmax)) / nc; if (n < lmin) pen += 1 + (lmin - n) / nc;
      if (pairOf.size) { const pos = new Map(s.map((x, q) => [x, q])); for (const x of s) { const pr = pairOf.get(x); if (!pr) continue; if (x === pr[1]) { if (!pos.has(pr[0]) || pos.get(pr[0]) > pos.get(x)) pen += 1; } else if (!pos.has(pr[1])) pen += 1; } }
      if (vt) { let t = vt.inicio || 0, prev = h; for (const x of s) { t += D[prev][x] / V.vel; const a = vt.a[x] ?? 0, b = vt.b[x] ?? 48; if (t < a) t = a; if (t > b + 1e-9) pen += 1 + (t - b) / 24; t += vt.servicio || 0; prev = x; } }
      let dc = D[h][s[0]]; for (let q = 1; q < n; q++) dc += D[s[q - 1]][s[q]]; if (!open) dc += D[s[n - 1]][h];
      const cost = V.costoKm * dc * tinyTop + (V.fijo || 0);
      return detalle ? { c: V.costoKm * dc + (V.fijo || 0), d, pen, cost: cost + P * pen } : cost + P * pen;
    }
    const nCustVisited = (R) => { const seen = new Set(); R.forEach((s) => s.forEach((x) => seen.add(x))); return seen; };
    /* costo total de una solución R (arreglo de rutas) con costos por ruta rc */
    function total(R, rc) {
      let t = 0; const maxo = f.objetivo === 'maximo'; if (maxo) { let mx = 0; for (let k = 0; k < m; k++) { t += 1e-3 * rc[k]; if (rc[k] > mx) mx = rc[k]; } t += mx; } else for (let k = 0; k < m; k++) t += rc[k];
      if (f.locDepot) { const used = new Set(); R.forEach((s, k) => { if (s.length) used.add(veh[k].depot); }); used.forEach((d) => { t += (f.openCost && f.openCost[d]) || 0; }); }
      const seen = nCustVisited(R);
      for (const i of cl) { if (!seen.has(i)) { if (opt(i)) t += (obj === 'costo' || obj === 'maximo' ? 0 : 0); else t += P; } else if (obj === 'profit' || obj === 'top') t -= prize[i] || 0; }
      if (pairOf.size) for (const [p, d] of I.pairs) { let kp = -1, kd = -1; R.forEach((s, k) => { if (s.includes(p)) kp = k; if (s.includes(d)) kd = k; }); if (kp !== kd) t += P; }
      return t;
    }
    if (obj === 'maximo') {/* min-max: se maneja en objetivo extendido */}
    const sol = (R) => { const rc = R.map((s, k) => ruta(k, s)); return { R, rc, f: total(R, rc) }; };
    const clon = (S) => ({ R: S.R.map((s) => s.slice()), rc: S.rc.slice(), f: S.f });
    const reeval = (S, ks) => { for (const k of ks) S.rc[k] = ruta(k, S.R[k]); S.f = total(S.R, S.rc); };
    const unidades = () => { const seen = new Set(), u = []; for (const i of cl) { if (seen.has(i)) continue; const pr = pairOf.get(i); if (pr) { pr.forEach((x) => seen.add(x)); u.push([pr[0], pr[1]]); } else { seen.add(i); u.push([i]); } } return u; };
    const UN = unidades(), unitOf = new Map(); UN.forEach((u, q) => u.forEach((x) => unitOf.set(x, q)));

    /* ---------- mejor inserción de una unidad en una solución ---------- */
    function mejorInsercion(S, un, rnd) {
      let best = null;
      for (let k = 0; k < m; k++) {
        const s = S.R[k], base = S.rc[k];
        const posiciones = (un.length === 1) ? s.length + 1 : (s.length + 1) * (s.length + 2) / 2;
        const probar = (ns) => { const c = ruta(k, ns) - base; if (!best || c < best.c) best = { k, ns, c }; };
        if (un.length === 1) for (let q = 0; q <= s.length; q++) probar([...s.slice(0, q), un[0], ...s.slice(q)]);
        else for (let a = 0; a <= s.length; a++) for (let b = a; b <= s.length; b++) { const ns = [...s.slice(0, a), un[0], ...s.slice(a, b), un[1], ...s.slice(b)]; probar(ns); }
        void posiciones;
      }
      return best;
    }
    function quitarUnidad(S, un) { const ks = new Set(); for (let k = 0; k < m; k++) { const ns = S.R[k].filter((x) => !un.includes(x)); if (ns.length !== S.R[k].length) { S.R[k] = ns; ks.add(k); } } return ks; }

    /* ---------- constructivas ---------- */
    function insercion(rand, azar) {
      const R = Array.from({ length: m }, () => []), S = { R, rc: R.map((s, k) => ruta(k, s)), f: 0 };
      let pend = UN.filter((u) => !opt(u[0]) || true).slice();
      if (!azar) pend.sort((a, b) => Math.max(...b.map((x) => D[veh[0].depot][x])) - Math.max(...a.map((x) => D[veh[0].depot][x])));
      else for (let i = pend.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pend[i], pend[j]] = [pend[j], pend[i]]; }
      while (pend.length) {
        let pick = 0, bestc = null;
        if (!azar) { for (let q = 0; q < pend.length; q++) { const b = mejorInsercion(S, pend[q]); if (!bestc || b.c < bestc.c) { bestc = b; pick = q; } } }
        else {   // GRASP: lista restringida de candidatos (20 % mejores)
          const list = pend.map((u, q) => ({ q, b: mejorInsercion(S, u) })).sort((a, b) => a.b.c - b.b.c); const lim = Math.max(1, Math.ceil(list.length * 0.2)), ch = list[Math.floor(rand() * lim)]; pick = ch.q; bestc = ch.b;
        }
        const un = pend.splice(pick, 1)[0];
        if (opt(un[0]) && (obj === 'profit' || obj === 'top')) { const gan = (prize[un[0]] || 0) + (un[1] !== undefined ? prize[un[1]] || 0 : 0); const costo = bestc.c * (obj === 'top' ? 1 : 1); if (obj === 'profit' && costo >= gan) continue; if (obj === 'top' && bestc.c >= P) continue; }
        S.R[bestc.k] = bestc.ns; S.rc[bestc.k] = ruta(bestc.k, bestc.ns);
      }
      S.f = total(S.R, S.rc); return S;
    }
    function vecino() {
      const R = Array.from({ length: m }, () => []), pend = new Set(UN.map((_, q) => q)); let usados = 0;
      for (let k = 0; k < m && pend.size; k++) {
        let s = [], cur = veh[k].depot;
        for (;;) {
          let bestq = -1, bestd = INF, bestns = null;
          for (const q of pend) { const un = UN[q]; if (opt(un[0]) && obj === 'top') {} const ns = [...s, ...un]; if (ruta(k, ns) >= P * 0.999 + 0 && ruta(k, ns) > ruta(k, s) + P * 0.5) continue; const d = D[cur][un[0]]; if (d < bestd) { bestd = d; bestq = q; bestns = ns; } }
          if (bestq < 0) break; s = bestns; cur = s[s.length - 1]; pend.delete(bestq); usados++;
          if (s.length >= (veh[k].lstops || lmax)) break;
        }
        R[k] = s;
      }
      const S = sol(R); for (const q of pend) { const b = mejorInsercion(S, UN[q]); if (opt(UN[q][0]) && (obj === 'profit' || obj === 'top') && b.c >= (prize[UN[q][0]] || 0) + 0) continue; S.R[b.k] = b.ns; S.rc[b.k] = ruta(b.k, b.ns); }
      S.f = total(S.R, S.rc); void usados; return S;
    }
    function barrido() {
      const xy = I.xy; if (!xy) return insercion(Math.random, false);
      const h = veh[0].depot, ang = (x) => Math.atan2(xy[x][1] - xy[h][1], xy[x][0] - xy[h][0]);
      const ord = UN.slice().sort((a, b) => ang(a[0]) - ang(b[0])), R = Array.from({ length: m }, () => []); let k = 0;
      for (const un of ord) { let guard = 0; while (guard++ < m) { const ns = [...R[k], ...un]; if (ruta(k, ns) < P * 0.5 || k === m - 1) { R[k] = ns; break; } k = (k + 1) % m; } }
      const S = sol(R); return S;
    }
    function ahorros() {
      const h = veh[0].depot; let rs = UN.map((u) => u.slice());   // rutas candidatas independientes de vehículo
      const ok = (s) => ruta(0, s) < P * 0.5;
      const pares = []; for (let a = 0; a < UN.length; a++) for (let b = 0; b < UN.length; b++) if (a !== b) { const i = UN[a][UN[a].length - 1], j = UN[b][0]; pares.push([D[i][h] + D[h][j] - D[i][j], a, b]); }
      pares.sort((x, y) => y[0] - x[0]);
      const rutaDe = new Map(UN.map((_, q) => [q, q])), grupos = new Map(UN.map((u, q) => [q, u.slice()]));
      for (const [s0, a, b] of pares) { if (s0 <= 0) break; const ra = rutaDe.get(a), rb = rutaDe.get(b); if (ra === rb) continue; const ga = grupos.get(ra), gb = grupos.get(rb); const ua = UN[a], ub = UN[b];
        if (ga[ga.length - 1] !== ua[ua.length - 1] || gb[0] !== ub[0]) continue; const ns = [...ga, ...gb]; if (!ok(ns)) continue;
        grupos.set(ra, ns); grupos.delete(rb); for (const [q, g] of rutaDe) if (g === rb) rutaDe.set(q, ra); }
      rs = [...grupos.values()];
      if (rs.length > m) return insercion(Math.random, false);
      rs.sort((a, b) => b.length - a.length); const R = Array.from({ length: m }, () => []);
      const libres = veh.map((_, k) => k); for (const g of rs) { let bk = -1, bc = INF; for (const k of libres) { const c = ruta(k, g); if (c < bc) { bc = c; bk = k; } } R[bk] = g; libres.splice(libres.indexOf(bk), 1); }
      const S = sol(R); return S;
    }

    /* ---------- vecindarios ---------- */
    function mover(S, rand) {   // devuelve una solución vecina aleatoria o null
      const T = clon(S), tipo = rand(), k1 = Math.floor(rand() * m);
      const nonE = []; for (let k = 0; k < m; k++) if (T.R[k].length) nonE.push(k); if (!nonE.length) return null;
      const ka = nonE[Math.floor(rand() * nonE.length)], a = T.R[ka];
      if (tipo < 0.4) {   // relocate (unidad)
        const x = a[Math.floor(rand() * a.length)], un = UN[unitOf.get(x)], ks = quitarUnidad(T, un), kb = k1;
        const s = T.R[kb], pos = () => Math.floor(rand() * (s.length + 1));
        if (un.length === 1) s.splice(pos(), 0, un[0]); else { const p1 = pos(); s.splice(p1, 0, un[0]); const p2 = p1 + 1 + Math.floor(rand() * (s.length - p1)); s.splice(p2, 0, un[1]); }
        ks.add(kb); reeval(T, ks); return T;
      }
      if (tipo < 0.7) {   // swap
        const kb = nonE[Math.floor(rand() * nonE.length)], b = T.R[kb], i = Math.floor(rand() * a.length), j = Math.floor(rand() * b.length);
        if (pairOf.size && (pairOf.has(a[i]) || pairOf.has(b[j]))) return null;
        const t = a[i]; a[i] = b[j]; b[j] = t; reeval(T, new Set([ka, kb])); return T;
      }
      if (a.length >= 2) {   // 2-opt intra-ruta
        let i = Math.floor(rand() * a.length), j = Math.floor(rand() * a.length); if (i > j) [i, j] = [j, i]; if (i === j) return null;
        const seg = a.slice(i, j + 1).reverse(); T.R[ka] = [...a.slice(0, i), ...seg, ...a.slice(j + 1)]; reeval(T, new Set([ka])); return T;
      }
      return null;
    }
    function opcional(S, rand) {   // agregar o quitar un cliente opcional
      const op = UN.filter((u) => opt(u[0])); if (!op.length) return null; const un = op[Math.floor(rand() * op.length)], T = clon(S), seen = nCustVisited(T.R);
      if (seen.has(un[0])) { const ks = quitarUnidad(T, un); reeval(T, ks); return T; }
      const b = mejorInsercion(T, un); T.R[b.k] = b.ns; reeval(T, new Set([b.k])); return T;
    }
    function vnd(S, tmax) {   // búsqueda local de descenso: relocate, swap, 2-opt, opcionales
      let mejor = S, cambio = true, guard = 0; const t0 = now();
      while (cambio && guard++ < 200 && now() - t0 < tmax) {
        cambio = false;
        for (let k = 0; k < m && !cambio; k++) for (let ia = 0; ia < mejor.R[k].length && !cambio; ia++) {   // relocate
          const x = mejor.R[k][ia], un = UN[unitOf.get(x)]; if (un[0] !== x) continue;
          const T = clon(mejor), ks = quitarUnidad(T, un), b = mejorInsercion(T, un); T.R[b.k] = b.ns; ks.add(b.k); reeval(T, ks);
          if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; }
        }
        if (cambio) continue;
        for (let k = 0; k < m && !cambio; k++) { const a = mejor.R[k]; for (let i = 0; i < a.length - 1 && !cambio; i++) for (let j = i + 1; j < a.length && !cambio; j++) {   // 2-opt
          const T = clon(mejor); T.R[k] = [...a.slice(0, i), ...a.slice(i, j + 1).reverse(), ...a.slice(j + 1)]; reeval(T, new Set([k])); if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; } } }
        if (cambio) continue;
        if (!pairOf.size) for (let k1 = 0; k1 < m && !cambio; k1++) for (let k2 = k1 + 1; k2 < m && !cambio; k2++) for (let i = 0; i < mejor.R[k1].length && !cambio; i++) for (let j = 0; j < mejor.R[k2].length && !cambio; j++) {   // swap
          const T = clon(mejor), t = T.R[k1][i]; T.R[k1][i] = T.R[k2][j]; T.R[k2][j] = t; reeval(T, new Set([k1, k2])); if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; } }
        if (cambio) continue;
        for (const un of UN.filter((u) => opt(u[0]))) { const T = clon(mejor), seen = nCustVisited(T.R); if (seen.has(un[0])) { const ks = quitarUnidad(T, un); reeval(T, ks); } else { const b = mejorInsercion(T, un); T.R[b.k] = b.ns; reeval(T, new Set([b.k])); } if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; break; } }
      }
      return mejor;
    }
    return { sol, clon, reeval, ruta, total, insercion, vecino, barrido, ahorros, mover, opcional, vnd, UN, m, P, veh, cl, mejorInsercion, quitarUnidad, unitOf, cap, D, pairOf, w, r, opt };
  }

  /* ---------- resultado legible ---------- */
  function resultado(I, E, S, seg, nombre, hist, extra) {
    const f = I.f || {}, open = !!f.open, vt = f.vt && f.vt.usar ? f.vt : null, veh = I.veh, D = I.D, w = I.w || D.map(() => 0);
    const info = [], rutas = []; let pen = 0, total = 0;
    S.R.forEach((s, k) => { if (!s.length) return; const det = E.ruta(k, s, true); pen += det.pen; const h = veh[k].depot; const ru = [h, ...s]; if (!open) ru.push(h);
      let t = vt ? (vt.inicio || 0) : 0, prev = h; const lleg = vt ? [null] : null; if (vt) for (const x of s) { t += D[prev][x] / veh[k].vel; t = Math.max(t, vt.a[x] ?? 0); lleg.push(t); t += vt.servicio || 0; prev = x; } if (vt && !open) lleg.push(null);
      rutas.push(ru); info.push({ tipo: veh[k].tipo, depot: h, dist: det.d, costo: det.c, carga: s.reduce((a, x) => a + w[x], 0), cap: veh[k].cap, llegadas: lleg }); total += det.d; });
    const ord = rutas.map((_, q) => q).sort((a, b) => rutas[b].length - rutas[a].length);
    const R = ord.map((q) => rutas[q]), In = ord.map((q) => info[q]), seen = new Set(R.flat()), noVis = I.cust.filter((i) => !seen.has(i));
    const obj = S.f, factible = pen < 1e-9 && noVis.every((i) => I.optional && I.optional[i]);
    const premio = I.cust.filter((i) => seen.has(i)).reduce((a, i) => a + ((I.prize || [])[i] || 0), 0);
    return Object.assign({ estado: factible ? 'heurístico: solución factible' : 'sin solución factible (restricciones violadas)', objetivo: obj, total, totalCosto: In.reduce((a, x) => a + x.costo, 0), rutas: R, dists: In.map((x) => x.dist), info: In, noVisitados: noVis, premio, gap: null, seg, metodoSol: nombre, historial: hist || [], factible }, extra || {});
  }

  /* ---------- algoritmos ---------- */
  const ALGORITMOS = {
    vecino: { tipo: 'heuristica', nombre: 'Vecino más cercano' },
    ahorros: { tipo: 'heuristica', nombre: 'Ahorros (Clarke-Wright)' },
    barrido: { tipo: 'heuristica', nombre: 'Barrido (sweep)' },
    insercion: { tipo: 'heuristica', nombre: 'Inserción más barata' },
    vnd: { tipo: 'heuristica', nombre: 'Constructiva + mejora local (VND)' },
    sa: { tipo: 'meta', nombre: 'Recocido simulado' },
    tabu: { tipo: 'meta', nombre: 'Búsqueda tabú' },
    ga: { tipo: 'meta', nombre: 'Algoritmo genético' },
    aco: { tipo: 'meta', nombre: 'Colonia de hormigas' },
    grasp: { tipo: 'meta', nombre: 'GRASP' },
    vns: { tipo: 'meta', nombre: 'VNS (búsqueda de vecindario variable)' },
  };

  function resolver(I, algo, o) {
    o = o || {}; const t0 = now(); let tmax = (o.tiempo || 10) * 1000; const rand = rng(o.semilla || 12345), E = crear(I, o), hist = [];
    const pararF = o.parar || (() => false); let ultCheck = 0; const vivo = () => { const t = now(); if (t - t0 >= tmax) return false; if (t - ultCheck > 400) { ultCheck = t; if (pararF()) { tmax = 0; return false; } } return true; };
    const report = o.progreso || (() => {});
    let mejor = null, factibleMejor = null;
    const mejorQue = (S) => { if (!mejor || S.f < mejor.f - 1e-12) { mejor = S; hist.push([(now() - t0) / 1000, S.f]); report(hist[hist.length - 1], S.f); } };
    const consideraciones = (S) => mejorQue(S);
    const construir = () => { const S = E.insercion(rand, false); return S; };
    const inicial = () => (o.inicial === 'vecino' ? E.vecino() : o.inicial === 'ahorros' ? E.ahorros() : o.inicial === 'barrido' ? E.barrido() : construir());
    const par = o.params || {};
    switch (algo) {
      case 'vecino': mejorQue(E.vecino()); break;
      case 'ahorros': mejorQue(E.ahorros()); break;
      case 'barrido': mejorQue(E.barrido()); break;
      case 'insercion': mejorQue(E.insercion(rand, false)); break;
      case 'vnd': { const S = E.vnd(E.insercion(rand, false), tmax); mejorQue(S); break; }
      case 'sa': {
        let S = E.vnd(inicial(), tmax / 5), T = par.T0 || Math.max(1e-6, Math.abs(S.f) * 0.05), a = par.alpha || 0.995; const L = par.L || 100; mejorQue(S);
        const Tini = T; while (vivo()) { T = Math.max(1e-9, Tini * Math.pow(1e-3, Math.min(1, (now() - t0) / Math.max(1, tmax)))); for (let q = 0; q < L; q++) { const N = rand() < 0.1 ? E.opcional(S, rand) : E.mover(S, rand); if (!N) continue; const d = N.f - S.f; if (d <= 0 || rand() < Math.exp(-d / T)) { S = N; if (S.f < mejor.f) mejorQue(S); } } void a; }
        break; }
      case 'tabu': {
        let S = E.vnd(inicial(), tmax / 5); mejorQue(S); const tabu = new Map(), ten = par.tenencia || Math.max(7, Math.round(Math.sqrt(E.cl.length) * 2)); let it = 0; const K = par.vecinos || 60;
        while (vivo()) { it++; let bestN = null, key = null;
          for (let q = 0; q < K; q++) { const N = rand() < 0.1 ? E.opcional(S, rand) : E.mover(S, rand); if (!N) continue;
            const sig = N.R.map((s) => s.join('.')).join('|'); const prohibido = tabu.has(sig) && tabu.get(sig) > it && !(N.f < mejor.f - 1e-9); if (prohibido) continue; if (!bestN || N.f < bestN.f) { bestN = N; key = sig; } }
          if (!bestN) continue; tabu.set(S.R.map((s) => s.join('.')).join('|'), it + ten); S = bestN; if (S.f < mejor.f - 1e-9) mejorQue(S); void key; }
        break; }
      case 'vns': {
        let S = E.vnd(inicial(), tmax / 5); mejorQue(S); const kmax = par.kmax || 5;
        while (vivo()) { let k = 1; while (k <= kmax && vivo()) { let N = S; for (let q = 0; q < k * 2; q++) { const M = rand() < 0.08 ? E.opcional(N, rand) : E.mover(N, rand); if (M) N = M; } N = E.vnd(N, Math.max(50, tmax / 20)); if (N.f < S.f - 1e-9) { S = N; if (S.f < mejor.f - 1e-9) mejorQue(S); k = 1; } else k++; } }
        break; }
      case 'grasp': {
        while (vivo()) { const S = E.vnd(E.insercion(rand, true), Math.max(100, tmax / 10)); consideraciones(S); }
        break; }
      case 'ga': {
        const N = par.poblacion || 40, pm = par.mutacion || 0.2, perm = () => { const u = E.UN.map((_, q) => q); for (let i = u.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [u[i], u[j]] = [u[j], u[i]]; } return u; };
        const decod = (g) => { const R = Array.from({ length: E.m }, () => []); let k = 0;
          for (const q of g) { const un = E.UN[q]; let col = false; for (let t = 0; t < E.m; t++) { const kk = (k + t) % E.m, ns = [...R[kk], ...un]; if (E.ruta(kk, ns) < E.P * 0.5) { R[kk] = ns; k = kk; col = true; break; } } if (!col) { R[k] = [...R[k], ...un]; k = (k + 1) % E.m; } }
          return E.sol(R); };
        let pob = Array.from({ length: N }, () => { const g = perm(); return { g, S: decod(g) }; }); pob[0] = { g: (() => { const S0 = E.vnd(inicial(), tmax / 10), g = []; S0.R.forEach((s) => s.forEach((x) => { const q = E.unitOf.get(x); if (!g.includes(q)) g.push(q); })); E.UN.forEach((_, q) => { if (!g.includes(q)) g.push(q); }); return g; })() }; pob[0].S = decod(pob[0].g);
        pob.forEach((p) => mejorQue(p.S)); const torneo = () => { const a = pob[Math.floor(rand() * N)], b = pob[Math.floor(rand() * N)]; return a.S.f < b.S.f ? a : b; };
        while (vivo()) { const hijos = [];
          while (hijos.length < N) { const A = torneo().g, B = torneo().g, n = A.length; let i = Math.floor(rand() * n), j = Math.floor(rand() * n); if (i > j) [i, j] = [j, i];
            const h = new Array(n).fill(-1), usado = new Set(); for (let q = i; q <= j; q++) { h[q] = A[q]; usado.add(A[q]); } let p = 0; for (const x of B) { if (usado.has(x)) continue; while (h[p] !== -1) p++; h[p] = x; }
            if (rand() < pm && n > 1) { const a = Math.floor(rand() * n), b = Math.floor(rand() * n); [h[a], h[b]] = [h[b], h[a]]; }
            let S = decod(h); if (rand() < 0.15) S = E.vnd(S, 30); hijos.push({ g: h, S }); }
          pob = pob.concat(hijos).sort((a, b) => a.S.f - b.S.f).slice(0, N); mejorQue(pob[0].S); }
        break; }
      case 'aco': {
        const nh = par.hormigas || 20, alpha = par.alpha || 1, beta = par.beta || 3, rho = par.rho || 0.1, nodes = [...I.cust, ...I.depots], tau = new Map(), key = (i, j) => i + ',' + j; const tau0 = 1 / (Math.abs(E.ahorros().f) + 1);
        const T = (i, j) => (tau.has(key(i, j)) ? tau.get(key(i, j)) : tau0); let bestSol = null;
        while (vivo()) { const sols = [];
          for (let h = 0; h < nh; h++) { const pend = new Set(E.UN.map((_, q) => q)), R = Array.from({ length: E.m }, () => []);
            for (let k = 0; k < E.m && pend.size; k++) { let cur = E.veh[k].depot, s = [];
              for (;;) { const cand = [], pr = []; let sum = 0;
                for (const q of pend) { const un = E.UN[q], ns = [...s, ...un]; if (E.ruta(k, ns) >= E.P * 0.5) continue; const eta = 1 / (E.D[cur][un[0]] + 1e-9), v = Math.pow(T(cur, un[0]), alpha) * Math.pow(eta, beta); cand.push(q); pr.push(v); sum += v; }
                if (!cand.length) break; let x = rand() * sum, q = cand[cand.length - 1]; for (let t = 0; t < cand.length; t++) { x -= pr[t]; if (x <= 0) { q = cand[t]; break; } }
                const un = E.UN[q]; s = [...s, ...un]; cur = un[un.length - 1]; pend.delete(q); }
              R[k] = s; }
            let S = E.sol(R); for (const q of pend) { const b = E.mejorInsercion(S, E.UN[q]); S.R[b.k] = b.ns; E.reeval(S, new Set([b.k])); }
            if (rand() < 0.3) S = E.vnd(S, 20); sols.push(S); mejorQue(S); if (!bestSol || S.f < bestSol.f) bestSol = S; }
          for (const [kk, v] of tau) tau.set(kk, v * (1 - rho)); const ib = sols.reduce((a, b) => (a.f < b.f ? a : b));
          const dep = 1 / (Math.abs(ib.f) + 1) * 10; ib.R.forEach((s, k) => { let p = E.veh[k].depot; for (const x of s) { tau.set(key(p, x), T(p, x) + dep); p = x; } }); }
        void nodes; break; }
      default: throw new Error('Algoritmo desconocido: ' + algo);
    }
    // hacer factible si es posible: mejor solución con VND final
    if (mejor && algo !== 'vecino') { const T2 = E.vnd(mejor, 2000); if (T2.f < mejor.f - 1e-9) mejorQue(T2); }
    void factibleMejor;
    return resultado(I, E, mejor, (now() - t0) / 1000, ALGORITMOS[algo].nombre, hist);
  }
  root.Heur = { resolver, ALGORITMOS, crear };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Heur;
})(typeof globalThis !== 'undefined' ? globalThis : this);
