/* Verifica el botón «Código GAMS (.gms)»: para cada variante, genera el .gms con web/js/gams.js sobre la instancia CVRP-10,
   lo ejecuta completo con el intérprete gamsx (subconjunto de GAMS + HiGHS, en Exposicion_src/ref) y compara z con el
   objetivo del modelo de la app. Así se comprueba que el código exportado compila y da el mismo óptimo.
   Uso: node pruebas/validar_export_gams.js [id1 id2 ...]   Sale con código 1 si alguna variante no coincide. */
const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs'); const os = require('os');
require('../web/js/solver.js'); const Vrp = require('../web/js/vrp.js'); const Va = require('../web/js/variantes.js'); const Gams = require('../web/js/gams.js');
const { instancia, ctx } = require('./validar_gams.js');
const REF = __dirname;   // gamsx.py (intérprete de un subconjunto de GAMS + HiGHS de scipy) viene en esta carpeta
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmsx-'));

function gamsx(archivo) {
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(REF)}); import gamsx\nit = gamsx.correr(${JSON.stringify(archivo)})\nr = it.resoluciones[-1]\nprint(json.dumps({'z': it.nivel('z'), 'estado': r['estado']}))`;
  const r = spawnSync('python3', ['-c', code], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000 });
  if (r.status) throw new Error((r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' '));
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Va.VARIANTES.map((v) => v.id);
  let malos = 0;
  for (const id of ids) {
    try {
      const { S: S0, p } = instancia(id); const { I } = Va.construir(id, S0, p);
      const r = await Vrp.vrp(I, ctx, { tiempo: 300, brecha: 1e-6, metodo: 'mtz' });
      const f = path.join(tmp, id + '.gms'); fs.writeFileSync(f, Gams.generar(I, Va.porId[id].nombre));
      const t0 = Date.now(), g = gamsx(f), seg = (Date.now() - t0) / 1000;
      const app = I.f && I.f.minVeh ? r.total : r.objetivo;
      const ok = r.rutas && r.rutas.length && Math.abs(g.z - app) <= 1e-3 * Math.max(1, Math.abs(app));
      if (!ok) malos++;
      console.log(`${ok ? 'OK   ' : 'FALLA'} ${id.padEnd(8)} app=${(+app).toFixed(4).padStart(11)}  gms=${(+g.z).toFixed(4).padStart(11)}  ${seg.toFixed(1).padStart(5)} s  ${g.estado}`);
    } catch (e) { malos++; console.log(`ERR   ${id.padEnd(8)} ${e.message.slice(0, 300)}`); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(malos ? `${malos} variante(s) con problemas en el código GAMS exportado` : 'El código GAMS exportado de todas las variantes compila y da el mismo óptimo');
  process.exit(malos ? 1 : 0);
})();
