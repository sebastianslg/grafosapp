/* Catálogo de variantes de VRP (27) y constructor de la instancia a partir de los datos del proyecto. */
(function (root) {
  'use strict';
  const INF = Infinity;
  /* flota: 'uno' = un tipo repetido m veces; 'mixta' = tabla de flota; multi = un conjunto de vehículos por depósito */
  const V = [
    { id: 'tsp', nombre: 'TSP', fam: 'Un vehículo', desc: 'Un viajante, ruta cerrada.', m: 1 },
    { id: 'otsp', nombre: 'TSP abierto', fam: 'Un vehículo', desc: 'Un viajante que no regresa al origen.', m: 1, f: { open: true } },
    { id: 'mtsp', nombre: 'm-TSP', fam: 'Varios viajantes', desc: 'm viajantes desde un depósito, cada uno visita al menos un cliente.', f: { lmin: 1 } },
    { id: 'mtspb', nombre: 'm-TSP balanceado', fam: 'Varios viajantes', desc: 'Todas las rutas con igual número de clientes (±1).', f: { balanced: true } },
    { id: 'omtsp', nombre: 'Open m-TSP', fam: 'Varios viajantes', desc: 'Rutas que no regresan al depósito.', f: { open: true, lmin: 1 } },
    { id: 'omtspb', nombre: 'Open m-TSP balanceado', fam: 'Varios viajantes', desc: 'Rutas abiertas y equilibradas.', f: { open: true, balanced: true } },
    { id: 'mtspmm', nombre: 'm-TSP min-max', fam: 'Varios viajantes', desc: 'Minimiza la ruta más larga.', f: { objetivo: 'maximo', lmin: 1 } },
    { id: 'cvrp', nombre: 'CVRP', fam: 'Capacidad', desc: 'Vehículos con capacidad Q; cada cliente tiene demanda.', cap: true },
    { id: 'ovrp', nombre: 'OVRP (ruteo abierto)', fam: 'Capacidad', desc: 'CVRP en el que las rutas no regresan al depósito.', cap: true, f: { open: true } },
    { id: 'dcvrp', nombre: 'DCVRP (distancia máxima)', fam: 'Capacidad', desc: 'CVRP con distancia máxima L por ruta.', cap: true, lmaxDist: true },
    { id: 'vrpl', nombre: 'CVRP con máximo de paradas', fam: 'Capacidad', desc: 'CVRP con máximo de clientes por ruta.', cap: true, paradas: true },
    { id: 'minveh', nombre: 'CVRP con mínima flota', fam: 'Capacidad', desc: 'Minimiza primero la cantidad de vehículos usados.', cap: true, minVeh: true },
    { id: 'cvrpb', nombre: 'CVRP balanceado', fam: 'Capacidad', desc: 'CVRP con rutas de igual número de clientes.', cap: true, f: { balanced: true } },
    { id: 'vrptw', nombre: 'VRPTW (ventanas de tiempo)', fam: 'Tiempo', desc: 'CVRP con ventana horaria en cada cliente.', cap: true, vt: true },
    { id: 'ovrptw', nombre: 'OVRPTW', fam: 'Tiempo', desc: 'VRPTW con rutas abiertas.', cap: true, vt: true, f: { open: true } },
    { id: 'hfvrp', nombre: 'HFVRP (flota heterogénea)', fam: 'Flota', desc: 'Tipos de vehículo con capacidad y costo por km distintos.', mixta: true },
    { id: 'fsmvrp', nombre: 'FSMVRP (tamaño y mezcla de flota)', fam: 'Flota', desc: 'Flota mixta con costo fijo por vehículo usado.', mixta: true, fijos: true },
    { id: 'hfvrptw', nombre: 'HFVRPTW', fam: 'Flota', desc: 'Flota heterogénea con ventanas de tiempo.', mixta: true, vt: true },
    { id: 'mdvrp', nombre: 'MDVRP (varios depósitos)', fam: 'Depósitos', desc: 'Cada ruta sale y vuelve al mismo depósito.', cap: true, multi: true },
    { id: 'mdvrptw', nombre: 'MDVRPTW', fam: 'Depósitos', desc: 'Varios depósitos con ventanas de tiempo.', cap: true, multi: true, vt: true },
    { id: 'lrp', nombre: 'LRP (localización y ruteo)', fam: 'Depósitos', desc: 'Decide qué depósitos abrir y las rutas.', cap: true, multi: true, f: { locDepot: true } },
    { id: 'vrpb', nombre: 'VRPB (backhauls)', fam: 'Cargas', desc: 'Entregas primero, luego recogidas en el camino de regreso.', cap: true, f: { mode: 'backhaul' } },
    { id: 'vrpspd', nombre: 'VRPSPD (recoge y entrega a la vez)', fam: 'Cargas', desc: 'Cada cliente recibe y entrega mercancía en la misma visita.', cap: true, f: { mode: 'spd' } },
    { id: 'vrppd', nombre: 'VRPPD (recogida y entrega por pares)', fam: 'Cargas', desc: 'Pares origen-destino; misma ruta y la recogida primero.', cap: true, f: { mode: 'pd' } },
    { id: 'sdvrp', nombre: 'SDVRP (entrega dividida)', fam: 'Cargas', desc: 'La demanda de un cliente puede atenderse entre varios vehículos.', cap: true, f: { mode: 'split' } },
    { id: 'pcvrp', nombre: 'VRP con beneficios', fam: 'Selectivos', desc: 'Visita solo los clientes rentables: maximiza premio − costo.', cap: true, f: { obj: 'profit' }, opcional: true },
    { id: 'top', nombre: 'Orienteering / TOP', fam: 'Selectivos', desc: 'Maximiza el premio recogido con distancia máxima por ruta.', cap: false, f: { obj: 'top' }, opcional: true, lmaxDist: true },
  ];
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
    if (v.minVeh) { const big = 1000 * (Math.max(...D.flat().filter(isFinite)) || 1); veh.forEach((x) => { x.fijo = big; }); }
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
    if (f.locDepot) { const base = (cust.reduce((a, i) => a + (D[depots[0]][i] || 0), 0) / Math.max(1, cust.length)) * 3; f.openCost = {}; depots.forEach((d) => { f.openCost[d] = +nodos[d].costoApertura > 0 ? +nodos[d].costoApertura : Math.round(base * 100) / 100; }); }
    if (v.vt) { const a = new Array(n).fill(0), b = new Array(n).fill(48); nodos.forEach((x, i) => { if (x.vtOn) { a[i] = x.vtA; b[i] = x.vtB; } }); f.vt = { usar: true, inicio: S.vt ? S.vt.inicio : 8, servicio: ((S.vt ? +S.vt.servicio : 10) || 0) / 60, a, b }; }
    f.balanced = !!f.balanced; if (p.lmin) f.lmin = p.lmin; if (p.lmax) f.lmax = p.lmax;
    return { I: { D, depots, cust, w, r, prize, optional, pairs, veh, f, xy: p.xy || null }, notas };
  }
  root.Variantes = { VARIANTES: V, porId, construir };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Variantes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
