/* Consistencia heurísticas ↔ modelo exacto en las 34 variantes (instancia CVRP-10):
   1) ningún algoritmo lanza errores; 2) si un algoritmo dice «factible», su objetivo no puede ser mejor que el óptimo probado
   (si lo fuera, o la heurística no verifica alguna restricción o el modelo exacto restringe de más); 3) las rutas de la heurística
   cumplen capacidad, ventanas, cierre, distancia y jornada máximas, según una verificación independiente.
   Uso: node pruebas/prueba_heur.js [id1 id2 ...]   Sale con código 1 si algo falla. */
require('../web/js/solver.js'); const Vrp = require('../web/js/vrp.js'); const Va = require('../web/js/variantes.js'); const Heur = require('../web/js/heur.js');
const { instancia, ctx } = require('./validar_gams.js');

function verificar(I, r) {   // verificación independiente de las rutas que entrega la heurística
  const f = I.f || {}, vt = f.vt && f.vt.usar ? f.vt : null, D = I.D, w = I.w, rr = I.r, errores = [];
  r.rutas.forEach((ru, q) => {
    const info = r.info[q], k = I.veh.findIndex((v) => v.depot === ru[0] && v.tipo === info.tipo), V = I.veh[k >= 0 ? k : 0], cl = ru.slice(1).filter((x, i, a) => !(i === a.length - 1 && x === ru[0]));
    const carga = cl.reduce((a, x) => a + (w[x] || 0), 0); if ((f.mode || 'entrega') === 'entrega' && isFinite(V.cap) && carga > V.cap + 1e-9) errores.push(`ruta ${q + 1}: carga ${carga} > ${V.cap}`);
    let d = 0; for (let i = 1; i < ru.length; i++) d += f.open && i === ru.length - 1 && ru[i] === ru[0] ? 0 : D[ru[i - 1]][ru[i]];
    if (isFinite(V.Lmax) && d > V.Lmax + 1e-6) errores.push(`ruta ${q + 1}: distancia ${d.toFixed(2)} > L ${V.Lmax}`);
    if (f.tmax && d / V.vel + (f.servicio || 0) * cl.length > f.tmax + 1e-6) errores.push(`ruta ${q + 1}: jornada > T`);
    if (vt) { let t = vt.inicio || 0, prev = ru[0]; for (const x of cl) { t += D[prev][x] / V.vel; t = Math.max(t, vt.a[x] ?? 0); if (!f.blandas && t > (vt.b[x] ?? Infinity) + 1e-6) errores.push(`ruta ${q + 1}: llega a ${x} a las ${t.toFixed(2)} > ${vt.b[x]}`); t += vt.servicio || 0; prev = x; }
      if (!f.open && vt.cierre > 0 && t + D[prev][ru[0]] / V.vel > vt.cierre + 1e-6) errores.push(`ruta ${q + 1}: vuelve después del cierre`); }
    if (f.mode === 'backhaul') { let vioB = false; cl.forEach((x) => { if (rr[x] > 0 && !(w[x] > 0)) vioB = true; else if (vioB) errores.push(`ruta ${q + 1}: entrega después de recoger`); }); }
  });
  if (f.locDepot && f.capD) { const c = {}; r.rutas.forEach((ru) => { c[ru[0]] = (c[ru[0]] || 0) + ru.slice(1).filter((x) => x !== ru[0]).reduce((a, x) => a + (w[x] || 0), 0); }); Object.entries(c).forEach(([d, v]) => { if (f.capD[d] > 0 && v > f.capD[d] + 1e-9) errores.push(`depósito ${d}: carga ${v} > ${f.capD[d]}`); }); }
  return errores;
}

(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Va.VARIANTES.map((v) => v.id);
  let malos = 0;
  for (const id of ids) {
    const { S: S0, p } = instancia(id); const { I } = Va.construir(id, S0, p);
    const ex = await Vrp.vrp(I, ctx, { tiempo: 120, brecha: 1e-6, metodo: 'mtz' }), optimo = String(ex.estado).startsWith('óptimo') ? ex.objetivo : null;
    if (I.f && I.f.mode === 'split') {   // heurística de reparto: cada cliente recibe toda su demanda y ninguna ruta excede la capacidad
      const r = Heur.entregaDividida(I, { semilla: 3 }); const fallas = [];
      if (!r.factible) fallas.push('no halla solución'); else {
        const tot = {}; r.info.forEach((q, k) => { q.entregas.forEach((e, pos) => { const v = r.rutas[k][pos]; if (v !== I.depots[0] && e) tot[v] = (tot[v] || 0) + e; }); if (isFinite(q.cap) && q.carga > q.cap + 1e-9) fallas.push(`ruta ${k + 1} excede la capacidad`); });
        I.cust.forEach((i) => { if (Math.abs((tot[i] || 0) - I.w[i]) > 1e-6) fallas.push(`cliente ${i} recibe ${(tot[i] || 0).toFixed(2)} de ${I.w[i]}`); });
        if (optimo != null && r.objetivo < optimo - 1e-6 * Math.max(1, Math.abs(optimo))) fallas.push(`mejora el óptimo (${r.objetivo.toFixed(4)} < ${optimo.toFixed(4)})`);
      }
      if (fallas.length) malos++;
      console.log(`${fallas.length ? 'FALLA' : 'OK   '} ${id.padEnd(8)} óptimo=${optimo == null ? '—' : optimo.toFixed(4)}  heurística=${r.factible ? r.objetivo.toFixed(4) : '—'}  ${fallas.slice(0, 3).join(' | ')}`);
      continue;
    }
    const fallas = [];
    for (const a of Object.keys(Heur.ALGORITMOS)) {
      try {
        const r = Heur.resolver(I, a, { tiempo: Heur.ALGORITMOS[a].tipo === 'meta' ? 0.6 : 1, semilla: 3 });
        if (!r.factible) continue;
        const flotaOpt = I.f && I.f.minVeh && ex.flota; if (I.f && I.f.minVeh && flotaOpt != null && r.rutas.length < flotaOpt) fallas.push(`${a} usa ${r.rutas.length} vehículos, menos que la flota mínima ${flotaOpt}`);
        if (optimo != null && !(I.f && I.f.minVeh && (r.rutas.length > (flotaOpt ?? 0))) && r.objetivo < optimo - 1e-6 * Math.max(1, Math.abs(optimo))) fallas.push(`${a} mejora el óptimo (${r.objetivo.toFixed(4)} < ${optimo.toFixed(4)})`);
        const e = verificar(I, r); if (e.length) fallas.push(`${a}: ${e.slice(0, 2).join('; ')}`);
      } catch (err) { fallas.push(`${a}: error ${err.message}`); }
    }
    if (fallas.length) malos++;
    console.log(`${fallas.length ? 'FALLA' : 'OK   '} ${id.padEnd(8)} óptimo=${optimo == null ? '— (' + ex.estado + ')' : optimo.toFixed(4)}  ${fallas.slice(0, 3).join(' | ')}`);
  }
  console.log(malos ? `${malos} variante(s) con inconsistencias` : 'Heurísticas consistentes con el modelo exacto en todas las variantes');
  process.exit(malos ? 1 : 0);
})();
