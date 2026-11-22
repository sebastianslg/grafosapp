/* Heurísticas y metaheurísticas para las variantes de VRP.
   Constructivas: vecino más cercano, ahorros (Clarke-Wright), barrido, inserción más barata.
   Mejora local: VND (relocate, swap, 2-opt, Or-opt, 2-opt* entre rutas, quitar/agregar clientes opcionales).
   Metaheurísticas: recocido simulado, búsqueda tabú, algoritmo genético, colonia de hormigas, GRASP, VNS, ILS y LNS.
   Misma instancia I que Vrp.vrp. Las restricciones se tratan con penalización; se devuelve la mejor solución factible. */
(function (root) {
  'use strict';
  const INF = Infinity, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  function crear(I, o) {
    o = o || {}; const f = I.f || {}, D = I.D, veh = I.veh, m = veh.length, cl = I.cust, nc = cl.length, mode = f.mode || 'entrega';
    if (mode === 'split') throw new Error('La entrega dividida usa su propia heurística (entregaDividida).');
    const w = I.w || D.map(() => 0), r = I.r || D.map(() => 0), prize = I.prize || D.map(() => 0), obj = f.obj || 'costo', open = !!f.open, vt = f.vt && f.vt.usar ? f.vt : null;
    const opt = (i) => !!(I.optional && I.optional[i]);
    let lmin = 0, lmax = nc; if (f.balanced) { lmin = Math.max(1, Math.floor(nc / m)); lmax = Math.ceil(nc / m); } else { lmin = f.lmin || 0; lmax = f.lmax || nc; }
    const todas = !!f.balanced || lmin >= 1;
    const lat = obj === 'latencia', blandas = !!(vt && f.blandas), pRet = f.penRetraso || 0, tmax = f.tmax > 0 ? f.tmax : null, servJ = f.servicio || (vt ? vt.servicio || 0 : 0);
    const Hh = vt ? Math.max(...vt.b.filter(isFinite), vt.H || 0, 1) : 24;
    const maxD = Math.max(...D.flat().filter(isFinite)), P = (lat || blandas ? 10 * nc * Hh * (1 + pRet) : 0) + 50 * maxD * (1 + Math.max(...veh.map((v) => v.costoKm || 1))) + 2 * veh.reduce((a, v) => a + (v.fijo || 0), 0) + 2 * Object.values(f.openCost || {}).reduce((a, b) => a + b, 0) + 2 * (I.prize || []).reduce((a, b) => a + (b || 0), 0);
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
      let extra = 0;
      if (vt) {
        let t = vt.inicio || 0, prev = h;
        for (const x of s) { t += D[prev][x] / V.vel; const a = vt.a[x] ?? 0, b = vt.b[x] ?? 48; if (t < a) t = a; if (t > b + 1e-9) { if (blandas) extra += pRet * (t - b); else pen += 1 + (t - b) / 24; } if (lat) extra += t - (vt.inicio || 0); t += vt.servicio || 0; prev = x; }
        if (!open && vt.cierre > 0) { const tf = t + D[prev][h] / V.vel; if (tf > vt.cierre + 1e-9) pen += 1 + (tf - vt.cierre) / 24; }   // regreso antes del cierre del depósito
      }
      if (tmax) { const dur = d / V.vel + servJ * n; if (dur > tmax + 1e-9) pen += 1 + (dur - tmax) / tmax; }   // jornada máxima
      let dc = D[h][s[0]]; for (let q = 1; q < n; q++) dc += D[s[q - 1]][s[q]]; if (!open) dc += D[s[n - 1]][h];
      const cost = (lat ? 1e-3 : tinyTop) * V.costoKm * dc + (V.fijo || 0) + extra;
      return detalle ? { c: V.costoKm * dc + (V.fijo || 0), d, pen, extra, cost: cost + P * pen } : cost + P * pen;
    }
    const nCustVisited = (R) => { const seen = new Set(); R.forEach((s) => s.forEach((x) => seen.add(x))); return seen; };
    /* costo total de una solución R (arreglo de rutas) con costos por ruta rc */
    function total(R, rc) {
      let t = 0; const maxo = f.objetivo === 'maximo'; if (maxo) { let mx = 0; for (let k = 0; k < m; k++) { t += 1e-3 * rc[k]; if (rc[k] > mx) mx = rc[k]; } t += mx; } else for (let k = 0; k < m; k++) t += rc[k];
      if (f.locDepot) { const used = new Set(), carga = {}; R.forEach((s, k) => { if (s.length) { const d = veh[k].depot; used.add(d); carga[d] = (carga[d] || 0) + s.reduce((a, x) => a + w[x], 0); } });
        used.forEach((d) => { t += (f.openCost && f.openCost[d]) || 0; const cd = f.capD && f.capD[d]; if (cd > 0 && carga[d] > cd + 1e-9) t += P * (1 + (carga[d] - cd) / cd); }); }   // capacidad del depósito abierto
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
          const T = clon(mejor), ks = quitarUnidad(T, un); reeval(T, ks); const b = mejorInsercion(T, un); T.R[b.k] = b.ns; ks.add(b.k); reeval(T, ks);
          if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; }
        }
        if (cambio) continue;
        for (let k = 0; k < m && !cambio; k++) { const a = mejor.R[k]; for (let i = 0; i < a.length - 1 && !cambio; i++) for (let j = i + 1; j < a.length && !cambio; j++) {   // 2-opt
          const T = clon(mejor); T.R[k] = [...a.slice(0, i), ...a.slice(i, j + 1).reverse(), ...a.slice(j + 1)]; reeval(T, new Set([k])); if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; } } }
        if (cambio) continue;
        if (!pairOf.size) for (let k1 = 0; k1 < m && !cambio; k1++) for (let k2 = k1 + 1; k2 < m && !cambio; k2++) for (let i = 0; i < mejor.R[k1].length && !cambio; i++) for (let j = 0; j < mejor.R[k2].length && !cambio; j++) {   // swap
          const T = clon(mejor), t = T.R[k1][i]; T.R[k1][i] = T.R[k2][j]; T.R[k2][j] = t; reeval(T, new Set([k1, k2])); if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; } }
        if (cambio) continue;
        if (!pairOf.size) for (let k = 0; k < m && !cambio; k++) for (const L of [2, 3]) for (let i = 0; i + L <= mejor.R[k].length && !cambio; i++) {   // Or-opt: mover 2 o 3 clientes seguidos
          const seg = mejor.R[k].slice(i, i + L), resto = [...mejor.R[k].slice(0, i), ...mejor.R[k].slice(i + L)], cRes = ruta(k, resto);
          for (let k2 = 0; k2 < m && !cambio; k2++) { const b2 = k2 === k ? resto : mejor.R[k2];
            for (let q = 0; q <= b2.length && !cambio; q++) { if (k2 === k && q === i) continue;
              for (const sg of [seg, seg.slice().reverse()]) { const nv = [...b2.slice(0, q), ...sg, ...b2.slice(q)], dl = k2 === k ? ruta(k, nv) - mejor.rc[k] : cRes + ruta(k2, nv) - mejor.rc[k] - mejor.rc[k2];
                if (dl < -1e-9) { const T = clon(mejor); if (k2 === k) T.R[k] = nv; else { T.R[k] = resto; T.R[k2] = nv; } reeval(T, new Set([k, k2])); if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; break; } } } } }
        }
        if (cambio) continue;
        if (!pairOf.size) for (let k1 = 0; k1 < m && !cambio; k1++) for (let k2 = k1 + 1; k2 < m && !cambio; k2++) {   // 2-opt*: intercambiar las colas de dos rutas
          const A = mejor.R[k1], B = mejor.R[k2]; if (!A.length && !B.length) continue;
          for (let i = 0; i <= A.length && !cambio; i++) for (let j = 0; j <= B.length && !cambio; j++) { if ((i === 0 && j === 0) || (i === A.length && j === B.length)) continue;
            const n1 = [...A.slice(0, i), ...B.slice(j)], n2 = [...B.slice(0, j), ...A.slice(i)], dl = ruta(k1, n1) + ruta(k2, n2) - mejor.rc[k1] - mejor.rc[k2];
            if (dl < -1e-9) { const T = clon(mejor); T.R[k1] = n1; T.R[k2] = n2; reeval(T, new Set([k1, k2])); if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; } } }
        }
        if (cambio) continue;
        for (const un of UN.filter((u) => opt(u[0]))) { const T = clon(mejor), seen = nCustVisited(T.R); if (seen.has(un[0])) { const ks = quitarUnidad(T, un); reeval(T, ks); } else { const b = mejorInsercion(T, un); T.R[b.k] = b.ns; reeval(T, new Set([b.k])); } if (T.f < mejor.f - 1e-9) { mejor = T; cambio = true; break; } }
      }
      return mejor;
    }
    return { sol, clon, reeval, ruta, total, insercion, vecino, barrido, ahorros, mover, opcional, vnd, UN, m, P, veh, cl, mejorInsercion, quitarUnidad, unitOf, cap, D, pairOf, w, r, opt, obj };
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
    const cargaDep = {}; S.R.forEach((s, k) => { if (s.length) cargaDep[veh[k].depot] = (cargaDep[veh[k].depot] || 0) + s.reduce((a, x) => a + w[x], 0); });
    const depOk = !f.locDepot || !f.capD || Object.entries(cargaDep).every(([d, c]) => !(f.capD[d] > 0) || c <= f.capD[d] + 1e-9);
    const obj = S.f, factible = pen < 1e-9 && depOk && noVis.every((i) => I.optional && I.optional[i]);
    const lat = f.obj === 'latencia', blandas = !!(vt && f.blandas), lleg = (s, k) => { let t = vt.inicio || 0, prev = veh[k].depot; return s.map((x) => { t += D[prev][x] / veh[k].vel; t = Math.max(t, vt.a[x] ?? 0); const r0 = t; t += vt.servicio || 0; prev = x; return [x, r0]; }); };
    const todas = vt ? S.R.flatMap((s, k) => lleg(s, k)) : [];
    const latencia = lat ? todas.reduce((a, [, t]) => a + t - (vt.inicio || 0), 0) : null, tardeL = blandas ? todas.filter(([x, t]) => t > (vt.b[x] ?? Infinity) + 1e-6) : [];
    if (extra == null) extra = {}; if (lat) extra.latencia = latencia; if (blandas) { extra.retraso = tardeL.reduce((a, [x, t]) => a + t - vt.b[x], 0); extra.tarde = tardeL.map(([x]) => x); }
    const premio = I.cust.filter((i) => seen.has(i)).reduce((a, i) => a + ((I.prize || [])[i] || 0), 0);
    return Object.assign({ estado: factible ? 'heurístico: solución factible' : 'sin solución factible (restricciones violadas)', objetivo: obj, total, totalCosto: In.reduce((a, x) => a + x.costo, 0), rutas: R, dists: In.map((x) => x.dist), info: In, noVisitados: noVis, premio, gap: null, seg, metodoSol: nombre, historial: hist || [], factible }, extra || {});
  }

  /* ---------- algoritmos ---------- */
  const ALGORITMOS = {
    vecino: { tipo: 'heuristica', nombre: 'Vecino más cercano' },
    ahorros: { tipo: 'heuristica', nombre: 'Ahorros (Clarke-Wright)' },
    barrido: { tipo: 'heuristica', nombre: 'Barrido (sweep)' },
    insercion: { tipo: 'heuristica', nombre: 'Inserción más barata' },
    dosopt: { tipo: 'heuristica', nombre: '2-opt (mejora dentro de cada ruta)' },
    oropt: { tipo: 'heuristica', nombre: 'Or-opt (mover tramos de 1 a 3 clientes)' },
    vnd: { tipo: 'heuristica', nombre: 'Constructiva + mejora local (VND)' },
    split: { tipo: 'heuristica', nombre: 'Ruta primero, agrupa después (Split)' },
    fisher: { tipo: 'heuristica', nombre: 'Fisher-Jaikumar (asignación + TSP)' },
    petalos: { tipo: 'heuristica', nombre: 'Pétalos (partición de conjuntos)' },
    sa: { tipo: 'meta', nombre: 'Recocido simulado' },
    tabu: { tipo: 'meta', nombre: 'Búsqueda tabú' },
    ga: { tipo: 'meta', nombre: 'Algoritmo genético' },
    aco: { tipo: 'meta', nombre: 'Colonia de hormigas' },
    grasp: { tipo: 'meta', nombre: 'GRASP' },
    vns: { tipo: 'meta', nombre: 'VNS (búsqueda de vecindario variable)' },
    ils: { tipo: 'meta', nombre: 'ILS (búsqueda local iterada)' },
    lns: { tipo: 'meta', nombre: 'LNS (destruir y reparar)' },
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
    /* --- mejora local simple (las de la exposición, sin combinarlas como el VND) --- */
    const intra = (S, mov) => {   // primera mejora con un solo tipo de movimiento dentro de cada ruta
      let T = E.clon(S), cambio = true, guard = 0;
      while (cambio && guard++ < 500 && vivo()) { cambio = false;
        for (let k = 0; k < E.m; k++) { const a = T.R[k];
          for (const nv of mov(a)) { const c = E.ruta(k, nv); if (c < T.rc[k] - 1e-9) { T.R[k] = nv; E.reeval(T, new Set([k])); cambio = true; break; } } } }
      return T;
    };
    const sinPares = !(I.pairs && I.pairs.length);
    function* movs2opt(a) { for (let i = 0; i < a.length - 1; i++) for (let j = i + 1; j < a.length; j++) yield [...a.slice(0, i), ...a.slice(i, j + 1).reverse(), ...a.slice(j + 1)]; }
    function* movsOr(a) { for (const L of [1, 2, 3]) for (let i = 0; i + L <= a.length; i++) { const seg = a.slice(i, i + L), resto = [...a.slice(0, i), ...a.slice(i + L)]; for (let q = 0; q <= resto.length; q++) if (q !== i) yield [...resto.slice(0, q), ...seg, ...resto.slice(q)]; } }
    const dosOpt = (S) => (sinPares ? intra(S, movs2opt) : S);
    const orOpt = (S) => {   // Or-opt dentro de la ruta y entre rutas (tramo de 1 a 3 clientes a la mejor posición)
      if (!sinPares) return S; let T = intra(S, movsOr), cambio = true, guard = 0;
      while (cambio && guard++ < 300 && vivo()) { cambio = false;
        for (let k = 0; k < E.m && !cambio; k++) for (const L of [1, 2, 3]) for (let i = 0; i + L <= T.R[k].length && !cambio; i++) {
          const seg = T.R[k].slice(i, i + L), resto = [...T.R[k].slice(0, i), ...T.R[k].slice(i + L)], cr = E.ruta(k, resto);
          for (let k2 = 0; k2 < E.m && !cambio; k2++) { if (k2 === k) continue; const b = T.R[k2];
            for (let q = 0; q <= b.length; q++) { const nv = [...b.slice(0, q), ...seg, ...b.slice(q)]; if (cr + E.ruta(k2, nv) < T.rc[k] + T.rc[k2] - 1e-9) { const N = E.clon(T); N.R[k] = resto; N.R[k2] = nv; E.reeval(N, new Set([k, k2])); if (N.f < T.f - 1e-9) { T = N; cambio = true; break; } } } } }
        if (cambio) T = intra(T, movsOr); }
      return T;
    };
    const tsp = (S) => orOpt(dosOpt(S));   // orden de visita de cada grupo (fase 2 de los métodos de dos fases)
    /* asigna grupos (secuencias de clientes) a vehículos libres: el más barato para cada grupo, primero los grupos grandes */
    const asignar = (grupos) => {
      const R = Array.from({ length: E.m }, () => []), libres = E.veh.map((_, k) => k), sobran = [];
      grupos.slice().sort((a, b) => b.length - a.length).forEach((g) => { if (!libres.length) { sobran.push(...g); return; } let bk = libres[0], bc = INF; for (const k of libres) { const c = E.ruta(k, g); if (c < bc) { bc = c; bk = k; } } R[bk] = g; libres.splice(libres.indexOf(bk), 1); });
      const S = E.sol(R); for (const x of sobran) { const un = E.UN[E.unitOf.get(x)]; if (un[0] !== x) continue; const b = E.mejorInsercion(S, un); S.R[b.k] = b.ns; E.reeval(S, new Set([b.k])); }
      return S;
    };
    /* partición óptima de una secuencia de unidades en a lo sumo m rutas consecutivas (programación dinámica, Bellman) */
    const particion = (seq) => {
      const n = seq.length, mm = E.m, F = Array.from({ length: mm + 1 }, () => new Array(n + 1).fill(INF)), Pd = Array.from({ length: mm + 1 }, () => new Array(n + 1).fill(-1)); F[0][0] = 0;
      for (let r = 1; r <= mm; r++) for (let i = 0; i < n; i++) { if (!isFinite(F[r - 1][i])) continue; let s = [];
        for (let j = i; j < n; j++) { s = s.concat(seq[j]); const c = E.ruta(0, s); if (c >= E.P * 0.5 && j > i) break; if (F[r - 1][i] + c < F[r][j + 1]) { F[r][j + 1] = F[r - 1][i] + c; Pd[r][j + 1] = i; } } }
      let br = -1; for (let r = 1; r <= mm; r++) if (br < 0 || F[r][n] < F[br][n]) br = r;
      if (br < 0 || !isFinite(F[br][n])) return null; const gr = []; let j = n; for (let r = br; r >= 1; r--) { const i = Pd[r][j]; gr.unshift(seq.slice(i, j).flat()); j = i; }
      return { costo: F[br][n], grupos: gr };
    };
    function split() {   // fase 1: tour gigante (vecino más cercano + 2-opt sin capacidad); fase 2: corte óptimo
      const h = E.veh[0].depot, pend = new Set(E.UN.map((_, q) => q)), seq = []; let cur = h;
      while (pend.size) { let bq = -1, bd = INF; for (const q of pend) { const d = E.D[cur][E.UN[q][0]]; if (d < bd) { bd = d; bq = q; } } seq.push(E.UN[bq]); cur = E.UN[bq][E.UN[bq].length - 1]; pend.delete(bq); }
      const lg = (t) => { let d = E.D[h][t[0][0]]; for (let q = 1; q < t.length; q++) d += E.D[t[q - 1][t[q - 1].length - 1]][t[q][0]]; return d + E.D[t[t.length - 1][t[t.length - 1].length - 1]][h]; };
      let mejora = true, g = 0; while (mejora && g++ < 50 && seq.length > 3) { mejora = false; const base = lg(seq);
        for (let i = 0; i < seq.length - 1 && !mejora; i++) for (let j = i + 1; j < seq.length && !mejora; j++) { const t = [...seq.slice(0, i), ...seq.slice(i, j + 1).reverse(), ...seq.slice(j + 1)]; if (sinPares && lg(t) < base - 1e-9) { seq.splice(0, seq.length, ...t); mejora = true; } } }
      let mejor = null; const giros = Math.min(seq.length, 12);
      for (let q = 0; q < giros; q++) { const rot = [...seq.slice(q), ...seq.slice(0, q)], p = particion(rot); if (p && (!mejor || p.costo < mejor.costo)) mejor = p; }
      return mejor ? asignar(mejor.grupos) : E.insercion(rand, false);
    }
    function fisher() {   // semillas alejadas, asignación generalizada por arrepentimiento (regret) con capacidad, TSP por ruta
      const h = E.veh[0].depot, D = E.D, sem = [], uns = E.UN.map((_, q) => q);
      const dmin = (x) => Math.min(D[h][x], ...sem.map((s) => D[s][x]));
      while (sem.length < Math.min(E.m, uns.length)) { let bq = -1, bd = -1; for (const q of uns) { const x = E.UN[q][0]; if (sem.includes(x)) continue; const d = dmin(x); if (d > bd) { bd = d; bq = q; } } sem.push(E.UN[bq][0]); }
      const cAs = (x, k) => D[h][x] + D[x][sem[k]] - D[h][sem[k]], grupos = sem.map(() => []), carga = sem.map(() => 0), capk = (k) => (isFinite(E.veh[k].cap) ? E.veh[k].cap : INF);
      const pend = uns.slice();
      while (pend.length) {
        let bi = -1, bk = -1, breg = -INF;
        pend.forEach((q, pi) => { const un = E.UN[q], wq = un.reduce((a, x) => a + (E.w[x] || 0), 0), cs = sem.map((_, k) => (carga[k] + wq <= capk(k) + 1e-9 ? un.reduce((a, x) => a + cAs(x, k), 0) : INF)).map((c, k) => [c, k]).sort((a, b) => a[0] - b[0]);
          const reg = isFinite(cs[0][0]) ? (cs.length > 1 && isFinite(cs[1][0]) ? cs[1][0] - cs[0][0] : 1e9) : -1; if (reg > breg) { breg = reg; bi = pi; bk = isFinite(cs[0][0]) ? cs[0][1] : sem.reduce((b, _, k) => (carga[k] < carga[b] ? k : b), 0); } });
        const q = pend.splice(bi, 1)[0]; grupos[bk].push(...E.UN[q]); carga[bk] += E.UN[q].reduce((a, x) => a + (E.w[x] || 0), 0);
      }
      const R = grupos.map((g) => g.slice().sort((a, b) => Math.atan2(I.xy ? I.xy[a][1] - I.xy[h][1] : 0, I.xy ? I.xy[a][0] - I.xy[h][0] : a) - Math.atan2(I.xy ? I.xy[b][1] - I.xy[h][1] : 0, I.xy ? I.xy[b][0] - I.xy[h][0] : b)));
      return tsp(asignar(sinPares ? R : grupos));
    }
    function petalos() {   // rutas candidatas = tramos consecutivos en orden angular; la partición exacta del círculo se resuelve por programación dinámica
      const h = E.veh[0].depot, xy = I.xy; if (!xy) return split();
      const ang = (u) => Math.atan2(xy[u[0]][1] - xy[h][1], xy[u[0]][0] - xy[h][0]), ord = E.UN.slice().sort((a, b) => ang(a) - ang(b));
      let mejor = null; const n = ord.length, giros = n <= 60 ? n : 40;
      for (let t = 0; t < giros && vivo(); t++) { const q = Math.floor(t * n / giros), rot = [...ord.slice(q), ...ord.slice(0, q)], p = particion(rot); if (p && (!mejor || p.costo < mejor.costo)) mejor = p; }
      return mejor ? tsp(asignar(mejor.grupos)) : E.barrido();
    }
    switch (algo) {
      case 'vecino': mejorQue(E.vecino()); break;
      case 'ahorros': mejorQue(E.ahorros()); break;
      case 'barrido': mejorQue(E.barrido()); break;
      case 'insercion': mejorQue(E.insercion(rand, false)); break;
      case 'vnd': { const S = E.vnd(E.insercion(rand, false), tmax); mejorQue(S); break; }
      case 'dosopt': { const S0 = E.barrido(); mejorQue(S0); mejorQue(dosOpt(S0)); break; }
      case 'oropt': { const S0 = E.barrido(); mejorQue(S0); mejorQue(orOpt(S0)); break; }
      case 'split': { mejorQue(split()); break; }
      case 'fisher': { mejorQue(fisher()); break; }
      case 'petalos': { mejorQue(petalos()); break; }
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
      case 'ils': {   // búsqueda local iterada: perturbar (k movimientos al azar) + VND; acepta si mejora, a veces vuelve a la mejor
        let cur = E.vnd(inicial(), tmax / 5); mejorQue(cur); const kp = par.perturbacion || Math.max(2, Math.round(E.cl.length / 8));
        while (vivo()) { let N = cur; for (let q = 0; q < kp; q++) { const M = rand() < 0.1 ? E.opcional(N, rand) : E.mover(N, rand); if (M) N = M; } N = E.vnd(N, Math.max(50, tmax / 15));
          if (N.f < cur.f - 1e-9 || rand() < 0.03) cur = N; if (N.f < mejor.f - 1e-9) mejorQue(N); if (rand() < 0.05) cur = mejor; }
        break; }
      case 'lns': {   // destruir (al azar o clientes cercanos a una semilla) y reparar con la inserción más barata; acepta como recocido
        let cur = E.vnd(inicial(), tmax / 5); mejorQue(cur); const frac = par.destruir || 0.3; let T = Math.max(1e-6, Math.abs(cur.f) * 0.01);
        const fo = (I.f && I.f.obj) || 'costo';
        while (vivo()) {
          const N = E.clon(cur), vis = []; N.R.forEach((s) => s.forEach((x) => { const u = E.unitOf.get(x); if (!vis.includes(u)) vis.push(u); }));
          const libres = E.UN.map((_, u) => u).filter((u) => !vis.includes(u) && E.opt(E.UN[u][0]));
          if (!vis.length && !libres.length) break;
          const q = Math.max(1, Math.round(vis.length * (0.1 + rand() * frac))); let quitar;
          if (rand() < 0.5) { for (let i = vis.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [vis[i], vis[j]] = [vis[j], vis[i]]; } quitar = vis.slice(0, q); }
          else { const sem = vis.length ? E.UN[vis[Math.floor(rand() * vis.length)]][0] : 0; quitar = vis.slice().sort((a, b) => E.D[sem][E.UN[a][0]] - E.D[sem][E.UN[b][0]]).slice(0, q); }
          const ks = new Set(); quitar.forEach((u) => E.quitarUnidad(N, E.UN[u]).forEach((k) => ks.add(k))); E.reeval(N, ks);
          const orden = quitar.concat(libres).sort(() => rand() - 0.5);
          for (const u of orden) { const un = E.UN[u], b = E.mejorInsercion(N, un); if (!b) continue; if (E.opt(un[0])) { const gan = un.reduce((a, x) => a + ((I.prize || [])[x] || 0), 0); if (fo === 'profit' && b.c >= gan) continue; if (fo === 'top' && b.c >= E.P * 0.5) continue; } N.R[b.k] = b.ns; E.reeval(N, new Set([b.k])); }
          const M = rand() < 0.3 ? E.vnd(N, 30) : N, dl = M.f - cur.f;
          if (dl < 0 || rand() < Math.exp(-dl / T)) cur = M; if (M.f < mejor.f - 1e-9) mejorQue(M); T = Math.max(1e-9, T * 0.998);
        }
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
    if (mejor && ALGORITMOS[algo].tipo === 'meta') { const T2 = E.vnd(mejor, 2000); if (T2.f < mejor.f - 1e-9) mejorQue(T2); }
    void factibleMejor;
    return resultado(I, E, mejor, (now() - t0) / 1000, ALGORITMOS[algo].nombre, hist);
  }
  /* ---------- entrega dividida (SDVRP): heurística de reparto ----------
     Orden de visita por vecino más cercano (sin capacidad); la demanda de cada cliente se reparte en el orden
     en que se llena cada vehículo. Un cliente puede quedar en dos rutas. Se repite con órdenes perturbados y
     se queda con el de menor costo. Es referencia: el modelo exacto (SDVRP) es el óptimo. */
  function entregaDividida(I, o) {
    o = o || {}; const t0 = now(), D = I.D, veh = I.veh, cl = I.cust, w = I.w || D.map(() => 0), m = veh.length, f = I.f || {}, abierto = !!f.open;
    const h = veh[0].depot, rand = rng(o.semilla || 7), cap = veh.map((v) => (isFinite(v.cap) ? v.cap : Infinity));
    const vecino = () => { const pend = cl.slice(), ord = []; let cur = h; while (pend.length) { let b = 0; for (let q = 1; q < pend.length; q++) if (D[cur][pend[q]] < D[cur][pend[b]]) b = q; cur = pend[b]; ord.push(cur); pend.splice(b, 1); } return ord; };
    const repartir = (ord) => {
      const ent = veh.map(() => new Map()); let k = 0, libre = cap[0];
      for (const i of ord) { let d = w[i]; while (d > 1e-9) { if (k >= m) return null; const q = Math.min(d, libre); if (q > 1e-9) { ent[k].set(i, (ent[k].get(i) || 0) + q); d -= q; libre -= q; } if (d > 1e-9 && libre <= 1e-9) { k++; libre = k < m ? cap[k] : 0; } } }
      return ent;
    };
    const costo = (ent, ord) => {
      let total = 0; const R = [], info = [];
      for (let k = 0; k < m; k++) {
        if (!ent[k].size) continue;
        const vis = ord.filter((i) => ent[k].has(i)), ru = [h, ...vis]; if (!abierto) ru.push(h);
        const dist = ru.slice(1).reduce((a, v, q) => a + D[ru[q]][v], 0), c = veh[k].costoKm * dist + (veh[k].fijo || 0);
        total += c; R.push(ru); info.push({ tipo: veh[k].tipo, depot: h, dist, costo: c, carga: vis.reduce((a, i) => a + ent[k].get(i), 0), cap: veh[k].cap, llegadas: null, entregas: ru.map((v, q) => (v === h && (q === 0 || q === ru.length - 1) ? null : ent[k].get(v) ?? null)) });
      }
      return { total, R, info };
    };
    let mejor = null; const base = vecino(), tries = 60;
    for (let t = 0; t < tries; t++) {
      let ord = base.slice();
      if (t > 0) for (let s = 0; s < 3 && ord.length > 1; s++) { const a = Math.floor(rand() * ord.length), b = Math.floor(rand() * ord.length); [ord[a], ord[b]] = [ord[b], ord[a]]; }
      const ent = repartir(ord); if (!ent) continue;
      const c = costo(ent, ord); if (!mejor || c.total < mejor.total - 1e-9) mejor = Object.assign(c, { ord });
    }
    const seg = (now() - t0) / 1000;
    if (!mejor) return { estado: 'sin solución factible (la flota no alcanza para la demanda)', objetivo: null, rutas: [], dists: [], info: [], noVisitados: [], premio: 0, gap: null, seg, metodoSol: 'Entrega dividida (heurística)', historial: [], factible: false };
    const dists = mejor.info.map((x) => x.dist), ord = mejor.R.map((_, q) => q).sort((a, b) => mejor.R[b].length - mejor.R[a].length);
    return { estado: 'heurístico: solución factible', objetivo: mejor.total, total: dists.reduce((a, b) => a + b, 0), totalCosto: mejor.total, rutas: ord.map((q) => mejor.R[q]), dists: ord.map((q) => dists[q]), info: ord.map((q) => mejor.info[q]), noVisitados: [], premio: 0, gap: null, seg, metodoSol: 'Entrega dividida (heurística)', historial: [], factible: true };
  }

  root.Heur = { resolver, ALGORITMOS, crear, entregaDividida };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Heur;
})(typeof globalThis !== 'undefined' ? globalThis : this);
