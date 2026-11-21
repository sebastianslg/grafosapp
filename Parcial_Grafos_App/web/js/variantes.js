/* Catálogo de variantes de VRP (34) y constructor de la instancia a partir de los datos del proyecto. */
(function (root) {
  'use strict';
  const INF = Infinity;
  /* flota: 'uno' = un tipo repetido m veces; 'mixta' = tabla de flota; multi = un conjunto de vehículos por depósito */
  const V = [
    { id: 'tsp', nombre: 'TSP', fam: 'Un vehículo', desc: 'Un viajante, ruta cerrada.', m: 1 },
    { id: 'otsp', nombre: 'TSP abierto', fam: 'Un vehículo', desc: 'Un viajante que no regresa al origen.', m: 1, f: { open: true } },
    { id: 'mtsp', nombre: 'm-TSP', fam: 'Varios viajantes', desc: 'm viajantes desde un depósito, cada uno visita al menos un cliente.', f: { lmin: 1 } },
    { id: 'mtspb', nombre: 'm-TSP balanceado (Balanced mTSP)', fam: 'Varios viajantes', desc: 'Todas las rutas con igual número de clientes (±1).', f: { balanced: true } },
    { id: 'omtsp', nombre: 'Open m-TSP', fam: 'Varios viajantes', desc: 'Rutas que no regresan al depósito.', f: { open: true, lmin: 1 } },
    { id: 'omtspb', nombre: 'Open m-TSP balanceado (Open Balanced mTSP)', fam: 'Varios viajantes', desc: 'Rutas abiertas y equilibradas.', f: { open: true, balanced: true } },
    { id: 'mtspmm', nombre: 'm-TSP min-max (Min-Max mTSP)', fam: 'Varios viajantes', desc: 'Minimiza la ruta más larga.', f: { objetivo: 'maximo', lmin: 1 } },
    { id: 'cvrp', nombre: 'CVRP', fam: 'Capacidad', desc: 'Vehículos con capacidad Q; cada cliente tiene demanda.', cap: true },
    { id: 'ovrp', nombre: 'OVRP (ruteo abierto)', fam: 'Capacidad', desc: 'CVRP en el que las rutas no regresan al depósito.', cap: true, f: { open: true } },
    { id: 'dcvrp', nombre: 'DCVRP (distancia máxima)', fam: 'Capacidad', desc: 'CVRP con distancia máxima L por ruta.', cap: true, lmaxDist: true },
    { id: 'vrpl', nombre: 'CVRP-L · CVRP con máximo de paradas', fam: 'Capacidad', desc: 'CVRP con máximo de clientes por ruta.', cap: true, paradas: true },
    { id: 'minveh', nombre: 'MinVeh · CVRP con mínima flota', fam: 'Capacidad', desc: 'Minimiza primero la cantidad de vehículos usados.', cap: true, minVeh: true },
    { id: 'cvrpb', nombre: 'BCVRP · CVRP balanceado', fam: 'Capacidad', desc: 'CVRP con rutas de igual número de clientes.', cap: true, f: { balanced: true } },
    { id: 'cvrpmm', nombre: 'CVRP min-max (ruta más larga mínima)', fam: 'Capacidad', desc: 'CVRP que minimiza el costo de la ruta más costosa: reparte la jornada entre los vehículos.', cap: true, f: { objetivo: 'maximo' } },
    { id: 'vrptw', nombre: 'VRPTW (ventanas de tiempo)', fam: 'Tiempo', desc: 'CVRP con ventana horaria en cada cliente.', cap: true, vt: true },
    { id: 'ovrptw', nombre: 'OVRPTW', fam: 'Tiempo', desc: 'VRPTW con rutas abiertas.', cap: true, vt: true, f: { open: true } },
    { id: 'vrpstw', nombre: 'VRPSTW (ventanas suaves)', fam: 'Tiempo', desc: 'Se puede llegar después del cierre de la ventana pagando una penalización por hora de retraso.', cap: true, vt: true, blandas: true },
    { id: 'dvrpt', nombre: 'VRP con jornada máxima (duración)', fam: 'Tiempo', desc: 'CVRP en el que la duración de cada ruta (viaje + servicio) no supera la jornada T.', cap: true, jornada: true },
    { id: 'ccvrp', nombre: 'CCVRP (latencia mínima, VRP acumulativo)', fam: 'Tiempo', desc: 'Minimiza la suma de las horas de llegada a los clientes: reparto urgente o humanitario.', cap: true, latencia: true },
    { id: 'hfvrp', nombre: 'HFVRP (flota heterogénea)', fam: 'Flota', desc: 'Tipos de vehículo con capacidad y costo por km distintos.', mixta: true },
    { id: 'fsmvrp', nombre: 'FSMVRP (tamaño y mezcla de flota)', fam: 'Flota', desc: 'Flota mixta con costo fijo por vehículo usado.', mixta: true, fijos: true },
    { id: 'hfvrptw', nombre: 'HFVRPTW', fam: 'Flota', desc: 'Flota heterogénea con ventanas de tiempo.', mixta: true, vt: true },
    { id: 'mdvrp', nombre: 'MDVRP (varios depósitos)', fam: 'Depósitos', desc: 'Cada ruta sale y vuelve al mismo depósito.', cap: true, multi: true },
    { id: 'mdvrptw', nombre: 'MDVRPTW', fam: 'Depósitos', desc: 'Varios depósitos con ventanas de tiempo.', cap: true, multi: true, vt: true },
    { id: 'omdvrp', nombre: 'OMDVRP (varios depósitos, rutas abiertas)', fam: 'Depósitos', desc: 'Cada vehículo sale de su depósito y termina en su último cliente.', cap: true, multi: true, f: { open: true } },
    { id: 'lrp', nombre: 'LRP (localización y ruteo)', fam: 'Depósitos', desc: 'Decide qué depósitos abrir y las rutas.', cap: true, multi: true, f: { locDepot: true } },
    { id: 'vrpb', nombre: 'VRPB (backhauls)', fam: 'Cargas', desc: 'Entregas primero, luego recogidas en el camino de regreso.', cap: true, f: { mode: 'backhaul' } },
    { id: 'vrpspd', nombre: 'VRPSPD (recoge y entrega a la vez)', fam: 'Cargas', desc: 'Cada cliente recibe y entrega mercancía en la misma visita.', cap: true, f: { mode: 'spd' } },
    { id: 'vrppd', nombre: 'VRPPD (recogida y entrega por pares)', fam: 'Cargas', desc: 'Pares origen-destino; misma ruta y la recogida primero.', cap: true, f: { mode: 'pd' } },
    { id: 'sdvrp', nombre: 'SDVRP (entrega dividida)', fam: 'Cargas', desc: 'La demanda de un cliente puede atenderse entre varios vehículos.', cap: true, f: { mode: 'split' } },
    { id: 'pcvrp', nombre: 'PCVRP · VRP con beneficios', fam: 'Selectivos', desc: 'Visita solo los clientes rentables: maximiza premio − costo.', cap: true, f: { obj: 'profit' }, opcional: true },
    { id: 'top', nombre: 'TOP · Orienteering por equipos', fam: 'Selectivos', desc: 'Maximiza el premio recogido con distancia máxima por ruta.', cap: false, f: { obj: 'top' }, opcional: true, lmaxDist: true },
    { id: 'op', nombre: 'OP · Orienteering (un vehículo)', fam: 'Selectivos', desc: 'Un solo vehículo con distancia máxima L recoge el mayor premio posible.', m: 1, f: { obj: 'top' }, opcional: true, lmaxDist: true },
    { id: 'ptp', nombre: 'PTP · Tour rentable (TSP con beneficios)', fam: 'Selectivos', desc: 'Un viajante visita solo los clientes que convienen: maximiza premio − costo.', m: 1, f: { obj: 'profit' }, opcional: true },
  ];
  const EN = {"tsp": "Traveling Salesman Problem", "otsp": "Open Traveling Salesman Problem (Hamiltonian path)", "mtsp": "Multiple Traveling Salesman Problem", "mtspb": "Balanced Multiple TSP", "omtsp": "Open Multiple TSP", "omtspb": "Open Balanced Multiple TSP", "mtspmm": "Min-Max Multiple TSP", "cvrp": "Capacitated Vehicle Routing Problem", "ovrp": "Open Vehicle Routing Problem", "dcvrp": "Distance-Constrained CVRP", "vrpl": "CVRP with route-length (max. stops) limit", "minveh": "Fleet-size minimization VRP", "cvrpb": "Balanced (workload-balanced) CVRP", "vrptw": "Vehicle Routing Problem with Time Windows", "ovrptw": "Open VRP with Time Windows", "hfvrp": "Heterogeneous Fleet VRP", "fsmvrp": "Fleet Size and Mix VRP", "hfvrptw": "Heterogeneous Fleet VRP with Time Windows", "mdvrp": "Multi-Depot VRP", "mdvrptw": "Multi-Depot VRP with Time Windows", "lrp": "Location-Routing Problem", "vrpb": "VRP with Backhauls", "vrpspd": "VRP with Simultaneous Pickup and Delivery", "vrppd": "VRP with Pickup and Delivery", "sdvrp": "Split Delivery VRP", "pcvrp": "Prize-Collecting / Profitable Tour VRP", "top": "Team Orienteering Problem", "cvrpmm": "Min-Max Capacitated VRP", "vrpstw": "VRP with Soft Time Windows", "dvrpt": "Duration-Constrained VRP", "ccvrp": "Cumulative Capacitated VRP (minimum latency)", "omdvrp": "Open Multi-Depot VRP", "op": "Orienteering Problem", "ptp": "Profitable Tour Problem"};
  V.forEach((v) => { v.en = EN[v.id]; });
  const porId = Object.fromEntries(V.map((v) => [v.id, v]));
  const ANOTA = {};

  /* S: {D, nodos:[{tipo,peso,rec,premio,par,costoApertura,vtOn,vtA,vtB}], flota:[...], vt:{inicio,servicio(min)}}; p: parámetros del usuario */
  function construir(id, S, p) {
    p = p || {}; const v = porId[id]; if (!v) throw new Error('Variante desconocida: ' + id);
    const D = S.D, n = D.length, nodos = S.nodos, notas = [], isDc = (i) => nodos[i].tipo === 'dc';
    const origen = p.origen !== undefined ? p.origen : Math.max(0, nodos.findIndex((x) => x.tipo === 'dc'));
    let depots = v.multi ? nodos.map((_, i) => i).filter(isDc) : [origen];
    if (v.multi && depots.length < 2) { notas.push('Marque al menos 2 nodos como centro de distribución (tipo «dc») para usar varios depósitos; se usó un solo depósito.'); depots = [origen]; }
    const cust = nodos.map((_, i) => i).filter((i) => !depots.includes(i));
    const w = new Array(n).fill(0), r = new Array(n).fill(0), prize = new Array(n).fill(0), optional = new Array(n).fill(false);
    const peso = (i) => (+nodos[i].peso > 0 ? +nodos[i].peso : 1);
    const fl = S.flota && S.flota.length ? S.flota : [{ tipo: 'camión de reparto', n: 2, cap: 15, costoKm: 1, vel: 30 }];
    const mUser = Math.max(1, Math.round(p.m || fl.reduce((a, t) => a + (+t.n || 0), 0) || 2));
    const f = Object.assign({}, v.f || {});
    cust.forEach((i) => { w[i] = peso(i); });
    // vehículos
    let tipos;
    if (v.mixta) tipos = fl.flatMap((t) => Array.from({ length: Math.round(+t.n || 0) }, () => t));
    else { const t0 = fl.find((t) => +t.n > 0) || fl[0]; tipos = Array.from({ length: v.m || mUser }, () => t0); }
    if (!tipos.length) tipos = [fl[0]];
    const capDe = (t) => (v.cap || v.mixta ? (+t.cap > 0 ? +t.cap : INF) : INF);
    let veh = [];
    for (const d of depots) for (const t of tipos) veh.push({ tipo: t.tipo, depot: d, cap: capDe(t), costoKm: +t.costoKm || 1, vel: +t.vel || 30, fijo: v.fijos ? (+t.fijo || Math.round(5 * (+t.costoKm || 1) * 10) / 10) : 0, Lmax: INF });
    if (v.minVeh) f.minVeh = true;   /* mínima flota: dos fases lexicográficas en vrp.js (no se usa un costo fijo gigante) */
    if (v.lmaxDist) { const mx = Math.max(...cust.map((i) => D[depots[0]][i] || 0)); const L = +p.Lmax > 0 ? +p.Lmax : Math.round(mx * 3 * 100) / 100; veh.forEach((x) => { x.Lmax = L; }); notas.push('Distancia máxima por ruta L = ' + L + (p.Lmax ? '' : ' (calculada: 3 × la distancia al cliente más lejano)')); }
    if (v.paradas) { const ls = +p.lstops > 0 ? +p.lstops : Math.ceil(cust.length / Math.max(1, veh.length) * 1.5); veh.forEach((x) => { x.lstops = ls; }); notas.push('Máximo de ' + ls + ' clientes por ruta.'); }
    // modos de carga
    if (f.mode === 'backhaul') {
      let hay = cust.some((i) => +nodos[i].rec > 0);
      cust.forEach((i, q) => { if (hay) { r[i] = +nodos[i].rec > 0 ? +nodos[i].rec : 0; if (r[i] > 0) w[i] = 0; } else if (q >= Math.ceil(cust.length * 0.7)) { r[i] = peso(i); w[i] = 0; } });
      if (!hay) notas.push('Sin datos de recogida: el 30 % final de los clientes se tomó como «backhaul» (recoge en lugar de entregar). Defina «Recoge» en Nodos.');
    }
    if (f.mode === 'spd') { const hay = cust.some((i) => +nodos[i].rec > 0); cust.forEach((i) => { r[i] = hay ? (+nodos[i].rec || 0) : Math.max(1, Math.round(peso(i) / 2)); }); if (!hay) notas.push('Sin datos de recogida: cada cliente recoge la mitad de lo que recibe.'); }
    let pairs = [];
    if (f.mode === 'pd') {
      const pr = new Map(); cust.forEach((i) => { if (nodos[i].par !== undefined && nodos[i].par !== '' && nodos[i].par !== null) { const k = String(nodos[i].par); if (!pr.has(k)) pr.set(k, []); pr.get(k).push(i); } });
      pr.forEach((a) => { if (a.length === 2) pairs.push(a); });
      if (!pairs.length) { for (let q = 0; q + 1 < cust.length; q += 2) pairs.push([cust[q], cust[q + 1]]); notas.push('Sin pares definidos: los clientes se emparejaron en orden (1 recoge → 2 entrega, 3 → 4, …). Defina «Par» en Nodos.'); }
      const inP = new Set(pairs.flat()); cust.forEach((i) => { w[i] = 0; r[i] = 0; });
      pairs.forEach(([a, b]) => { const q = Math.max(peso(a), 1); r[a] = q; w[a] = 0; w[b] = q; r[b] = 0; });
      cust.forEach((i) => { if (!inP.has(i)) { w[i] = peso(i); r[i] = 0; } });
    }
    if (v.opcional) {
      cust.forEach((i) => { optional[i] = true; });
      const base = cust.reduce((a, i) => a + (D[depots[0]][i] || 0), 0) / Math.max(1, cust.length);
      const hay = cust.some((i) => +nodos[i].premio > 0);
      cust.forEach((i) => { prize[i] = hay ? +nodos[i].premio || 0 : Math.round((base * (1.4 + ((i * 7) % 5) / 5)) * 100) / 100; });
      if (!hay) notas.push('Sin premios definidos: se asignaron premios automáticos (≈ 1,4–2,2 × distancia media al depósito). Defina «Premio» en Nodos.');
    }
    if (f.locDepot) { const base = (cust.reduce((a, i) => a + (D[depots[0]][i] || 0), 0) / Math.max(1, cust.length)) * 3; f.openCost = {}; f.capD = {}; depots.forEach((d) => { f.openCost[d] = +nodos[d].costoApertura > 0 ? +nodos[d].costoApertura : Math.round(base * 100) / 100; if (+nodos[d].capDep > 0) f.capD[d] = +nodos[d].capDep; }); }
    const servH = ((S.vt ? +S.vt.servicio : 10) || 0) / 60, ini = S.vt && Number.isFinite(+S.vt.inicio) ? +S.vt.inicio : 8;
    if (v.jornada) { const vmin = Math.min(...veh.map((x) => x.vel)), lejos = Math.max(...cust.map((i) => D[depots[0]][i] || 0)); const T = +p.tmax > 0 ? +p.tmax : Math.round((2 * lejos / vmin + Math.ceil(cust.length / Math.max(1, veh.length)) * 1.5 * servH + 0.5) * 100) / 100; f.tmax = T; f.servicio = servH; notas.push('Jornada máxima por ruta T = ' + T + ' h (viaje + ' + Math.round(servH * 60) + ' min de servicio por cliente)' + (+p.tmax > 0 ? '' : ' (calculada; cámbiela en «Jornada máx.»)') + '.'); }
    if (v.latencia) { f.obj = 'latencia'; const vmin = Math.min(...veh.map((x) => x.vel)), maxd = Math.max(...D.flat().filter(isFinite)), H = Math.ceil((ini + (cust.length + 1) * (servH + maxd / vmin)) * 100) / 100; f.vt = { usar: true, inicio: ini, servicio: servH, a: new Array(n).fill(0), b: new Array(n).fill(H), H, cierre: null }; notas.push('Se minimiza la suma de las horas de llegada (latencia); salida ' + ini + ' h, servicio ' + Math.round(servH * 60) + ' min.'); }
    if (v.vt) { const H = S.vt && +S.vt.cierre > 0 ? +S.vt.cierre : 48; const a = new Array(n).fill(0), b = new Array(n).fill(H); nodos.forEach((x, i) => { if (x.vtOn) { a[i] = x.vtA; b[i] = x.vtB; } }); f.vt = { usar: true, inicio: S.vt ? S.vt.inicio : 8, servicio: ((S.vt ? +S.vt.servicio : 10) || 0) / 60, a, b, H, cierre: S.vt && +S.vt.cierre > 0 ? +S.vt.cierre : null }; }
    if (v.blandas && f.vt) { f.blandas = true; const cmed = veh.reduce((a, x) => a + x.costoKm * x.vel, 0) / Math.max(1, veh.length); f.penRetraso = +p.pen > 0 ? +p.pen : Math.round(cmed * 2 * 100) / 100; notas.push('Ventanas suaves: cada hora de retraso cuesta ' + f.penRetraso + (+p.pen > 0 ? '' : ' (2 × el costo de una hora de viaje; cámbiela en «Penalización»)') + '.'); }
    f.balanced = !!f.balanced; if (p.lmin) f.lmin = p.lmin; if (p.lmax) f.lmax = p.lmax;
    return { I: { D, depots, cust, w, r, prize, optional, pairs, veh, f, xy: p.xy || null }, notas };
  }
  /* Datos de tiempo del modelo (compartidos por vrp.js y gams.js): para cada cliente la hora más temprana posible
     (salida + camino más corto desde un depósito; válida aunque la matriz no cumpla la desigualdad triangular) y la más
     tardía (fin de ventana, u horizonte si las ventanas son suaves), y una M grande ajustada por arco. */
  function tiempos(I) {
    const f = I.f || {}, vt = f.vt && f.vt.usar ? f.vt : null; if (!vt) return null;
    const D = I.D, veh = I.veh, cl = I.cust, nc = cl.length, n = D.length, s = vt.servicio || 0, t0 = vt.inicio || 0;
    const maxd = Math.max(...D.flat().filter(isFinite)), minv = Math.min(...veh.map((v) => v.vel)), blandas = !!f.blandas;
    const H0 = Math.max(vt.H || 48, ...vt.b.filter(isFinite)), H = blandas ? H0 + t0 + (nc + 1) * (s + maxd / minv) : H0;
    const sp = {};
    for (const d of new Set(veh.map((v) => v.depot))) {
      const dist = new Array(n).fill(INF), hecho = new Array(n).fill(false); dist[d] = 0;
      for (let it = 0; it < n; it++) { let u = -1; for (let i = 0; i < n; i++) if (!hecho[i] && (u < 0 || dist[i] < dist[u])) u = i; if (u < 0 || !isFinite(dist[u])) break; hecho[u] = true; for (let j = 0; j < n; j++) if (!hecho[j] && isFinite(D[u][j]) && dist[u] + D[u][j] < dist[j]) dist[j] = dist[u] + D[u][j]; }
      sp[d] = dist;
    }
    const lo = {}, up = {};
    for (const i of cl) { let mn = INF; veh.forEach((v) => { const x = sp[v.depot][i] / v.vel; if (x < mn) mn = x; }); up[i] = blandas ? H : (vt.b[i] ?? H); lo[i] = Math.min(up[i], Math.max(vt.a[i] ?? 0, t0 + (isFinite(mn) ? mn : 0))); lo[i] = Math.floor(lo[i] * 1e6) / 1e6; up[i] = Math.ceil(up[i] * 1e6) / 1e6; }
    const Mdep = (k, j) => Math.max(0, t0 + D[veh[k].depot][j] / veh[k].vel - lo[j]);
    const Mij = (k, i, j) => Math.max(0, up[i] + s + D[i][j] / veh[k].vel - lo[j]);
    const Mfin = (k, i) => Math.max(0, up[i] + s + D[i][veh[k].depot] / veh[k].vel - (vt.cierre || 0));
    return { s, t0, H, H0, lo, up, Mdep, Mij, Mfin };
  }
  root.Variantes = { VARIANTES: V, porId, construir, tiempos };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Variantes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
