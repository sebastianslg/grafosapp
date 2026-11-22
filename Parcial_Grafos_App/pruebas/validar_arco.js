/* Valida la formulación de dos índices (flota homogénea) contra GAMS en CVRP-10 y otras variantes que la usan.
   Uso: node pruebas/validar_arco.js   Sale con código 1 si alguna no coincide. */
const { instancia, ctx } = require('./validar_gams.js');
const Va = require('../web/js/variantes.js'); const Vrp = require('../web/js/vrp.js'); const G = require('./cvrp10_gams.json');
(async () => {
  let malos = 0;
  const { S, p } = instancia('cvrp'); const { I } = Va.construir('cvrp', S, p);
  if (!Vrp.arcoAplica(I)) { console.log('FALLA: la formulación de dos índices no aplica a CVRP-10'); process.exit(1); }
  const r = await Vrp.vrp(I, ctx, { tiempo: 120, brecha: 1e-6, metodo: 'arco' });
  const ref = G.z.cvrp, ok = r.rutas && r.rutas.length && Math.abs(r.objetivo - ref) <= 1e-3 * Math.max(1, ref);
  if (!ok) malos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} cvrp (dos índices) GAMS=${ref.toFixed(4)} app=${(+r.objetivo).toFixed(4)} · ${r.estado}`);
  process.exit(malos ? 1 : 0);
})();
