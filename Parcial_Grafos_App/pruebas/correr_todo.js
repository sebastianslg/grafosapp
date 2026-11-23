/* Corre todas las pruebas y reporta el código de salida real de cada una.
   Las pruebas de interfaz (e2e_*, humo, modelo, reglas) necesitan ejecutar_app.py en http://127.0.0.1:8765.
   Uso: node pruebas/correr_todo.js */
const { spawnSync, spawn } = require('child_process'); const path = require('path');
const APP = path.join(__dirname, '..');
const dir = __dirname, URL = 'http://127.0.0.1:8765/';
const PRUEBAS = [
  ['validación de las 27 variantes base contra los modelos GAMS escritos a mano', ['validar_gams.js']],
  ['el código GAMS exportado (34 variantes) compila y da el mismo óptimo', ['validar_export_gams.js']],
  ['heurísticas consistentes con el modelo exacto (34 variantes)', ['prueba_heur.js']],
  ['solver: Cali TSP, m-TSP, camino', ['prueba_solver.js']],
  ['flota (balanceada, ventanas, mixta)', ['prueba_flota.js']],
  ['m-TSP con MTZ (ecuaciones del curso)', ['prueba_mtz.js']],
  ['modelo libre y nuevos problemas', ['prueba_nuevos.js']],
  ['formulación de dos índices: mismo óptimo que MTZ', ['validar_arco.js']],
  ['regresión de escala (20, 50 y 100 clientes)', ['regresion_escala.js']],
  ['interfaz: métodos, MinVeh, SDVRP, comparación', ['e2e_vrp.js', URL]],
  ['ejemplos de la exposición: los 34 modelos dan el mismo valor que GAMS', ['e2e_ejemplos.js', URL, '5']],
  ['interfaz: parar y progreso en vivo', ['e2e_parar.js', URL]],
  ['interfaz: simulación, gráficas, sensibilidad, variantes nuevas', ['e2e_graficas.js', URL]],
  ['caos: 300 acciones al azar (semilla 11)', ['caos.js', URL, '300', '11']],
  ['caos: 300 acciones al azar (semilla 12)', ['caos.js', URL, '300', '12']],
  ['interfaz: 100 clientes en el navegador (dos índices, parar a los 80 s)', ['e2e_100.js', URL]],
];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const arriba = async () => { try { return (await fetch(URL + 'api/identidad')).ok; } catch (e) { return false; } };
(async () => {
let malas = 0;
// 1) servidor para las pruebas de interfaz (latido largo: no se cierra entre pruebas). Se arranca justo antes de la primera
//    prueba que lo necesita: si nadie se conecta en 5 minutos, el servidor se apaga solo (así funciona el «un clic»).
let servidor = null;
const asegurarServidor = async () => {
  if (await arriba()) return;
  servidor = spawn('python3', [path.join(APP, 'ejecutar_app.py')], { cwd: APP, env: Object.assign({}, process.env, { SIN_NAVEGADOR: '1', LATIDO_SEG: '900' }), stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await arriba()); i++) await esperar(250);
};
for (const [nombre, args] of PRUEBAS) {
  if (args.includes(URL)) await asegurarServidor();
  const r = spawnSync('node', [path.join(dir, args[0]), ...args.slice(1)], { encoding: 'utf8', timeout: 1800000, maxBuffer: 1 << 26 });
  const ok = r.status === 0; if (!ok) malas++;
  console.log(`${ok ? 'PASA ' : 'FALLA'} (código ${r.status})  ${nombre}`);
  if (!ok) console.log((r.stdout || '').split('\n').filter((l) => /FALLA|ERR|Error/.test(l)).slice(0, 6).map((l) => '      ' + l.trim()).join('\n') + '\n      ' + (r.stderr || '').split('\n').slice(0, 3).join('\n      '));
}
if (servidor) { servidor.kill(); for (let i = 0; i < 40 && (await arriba()); i++) await esperar(250); }
// 2) el «un clic» de verdad: lanzar Ejecutar_App.sh (como un doble clic), con latido corto,
//    y comprobar que la ventana abierta mantiene la app y que al cerrarla se cierra sola
const lanza = spawnSync('bash', [path.join(APP, 'Ejecutar_App.sh')], { cwd: APP, env: Object.assign({}, process.env, { LATIDO_SEG: '12', SIN_NAVEGADOR: '1' }), encoding: 'utf8' });
const okLanza = lanza.status === 0;
if (!okLanza) malas++;
console.log(`${okLanza ? 'PASA ' : 'FALLA'} (código ${lanza.status})  doble clic: el lanzador arranca la app`);
if (okLanza) {
  const r = spawnSync('node', [path.join(__dirname, 'e2e_un_clic.js'), URL], { encoding: 'utf8', timeout: 600000 });
  if (r.status !== 0) malas++;
  console.log(`${r.status === 0 ? 'PASA ' : 'FALLA'} (código ${r.status})  ventana abierta mantiene la app; al cerrarla se cierra sola`);
}
console.log(malas ? `${malas} prueba(s) fallaron` : `Todas las pruebas pasan (${PRUEBAS.length + 1})`);
process.exit(malas ? 1 : 0);
})();
