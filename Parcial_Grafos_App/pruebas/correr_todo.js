/* Corre todas las pruebas y reporta el código de salida real de cada una.
   Las pruebas de interfaz (e2e_*, humo, modelo, reglas) necesitan ejecutar_app.py en http://127.0.0.1:8765.
   Uso: node pruebas/correr_todo.js */
const { spawnSync } = require('child_process'); const path = require('path');
const dir = __dirname, URL = 'http://127.0.0.1:8765';
const PRUEBAS = [
  ['validación de las 27 variantes contra GAMS', ['validar_gams.js']],
  ['solver: Cali TSP, m-TSP, camino', ['prueba_solver.js']],
  ['flota (balanceada, ventanas, mixta)', ['prueba_flota.js']],
  ['m-TSP con MTZ (ecuaciones del curso)', ['prueba_mtz.js']],
  ['modelo libre y nuevos problemas', ['prueba_nuevos.js']],
  ['interfaz: métodos, MinVeh, SDVRP, comparación', ['e2e_vrp.js', URL]],
  ['interfaz: parar y progreso en vivo', ['e2e_parar.js', URL]],
];
let malas = 0;
for (const [nombre, args] of PRUEBAS) {
  const r = spawnSync('node', [path.join(dir, args[0]), ...args.slice(1)], { encoding: 'utf8', timeout: 1800000, maxBuffer: 1 << 26 });
  const ok = r.status === 0; if (!ok) malas++;
  console.log(`${ok ? 'PASA ' : 'FALLA'} (código ${r.status})  ${nombre}`);
  if (!ok) console.log((r.stdout || '').split('\n').filter((l) => /FALLA|ERR|Error/.test(l)).slice(0, 6).map((l) => '      ' + l.trim()).join('\n') + '\n      ' + (r.stderr || '').split('\n').slice(0, 3).join('\n      '));
}
console.log(malas ? `${malas} de ${PRUEBAS.length} pruebas fallaron` : `Todas las pruebas pasan (${PRUEBAS.length})`);
process.exit(malas ? 1 : 0);
