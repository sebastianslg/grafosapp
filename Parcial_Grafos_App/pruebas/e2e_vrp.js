/* Prueba de interfaz del VRP: métodos disponibles, informe por corrida, MinVeh en dos fases, avisos de SDVRP y comparación.
   Uso: node pruebas/e2e_vrp.js http://127.0.0.1:8765   (con ejecutar_app.py en marcha). Sale con código 1 si algo falla. */
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8765';
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  let fallas = 0; const chk = (n, ok, extra) => { if (!ok) fallas++; console.log((ok ? 'OK    ' : 'FALLA ') + n + (extra ? '  ' + extra : '')); };
  await p.goto(url + '?motor=servidor');
  await p.waitForFunction(() => /HiGHS/.test(document.getElementById('pMotor').innerText), null, { timeout: 60000 });
  await p.selectOption('#problema', 'vrp'); await p.waitForTimeout(800);
  const metodos = await p.$$eval('#vrpMetodo option', (o) => o.map((x) => x.value));
  chk('solo modelo exacto y comparación (sin heurísticas independientes)', JSON.stringify(metodos) === '["exacto","comparar"]', JSON.stringify(metodos));
  await p.fill('#tiempo', '40');
  // 1) MinVeh en dos fases: informe con flota mínima
  await p.selectOption('#vrpVar', 'minveh'); await p.click('#bResolver');
  await p.waitForFunction(() => /Informe de la corrida/.test(document.body.innerText), null, { timeout: 240000 }).catch(() => {});
  let txt = await p.innerText('body');
  chk('MinVeh muestra flota mínima', /Flota mínima \(fase 1\)/.test(txt));
  chk('MinVeh muestra el informe de la corrida', /Informe de la corrida/.test(txt));
  chk('la función objetivo de MinVeh es distancia (no un costo fijo gigante)', !/\b\d{5,}[.,]\d+/.test((txt.match(/Función objetivo[^\n]*\n?[^\n]*/) || [''])[0]));
  // 2) SDVRP: el comparar avisa que no hay heurísticas
  await p.selectOption('#vrpVar', 'sdvrp'); await p.selectOption('#vrpMetodo', 'comparar'); await p.waitForTimeout(400);
  await p.click('#bResolver'); await p.waitForTimeout(3000);
  txt = await p.innerText('body');
  chk('SDVRP en comparar avisa que solo tiene modelo matemático', /entrega dividida \(SDVRP\) solo se resuelve con el modelo matemático/.test(txt));
  // 3) CVRP comparado: tabla con brecha de cada método
  await p.selectOption('#vrpVar', 'cvrp'); await p.selectOption('#vrpMetodo', 'comparar'); await p.waitForTimeout(400);
  await p.click('#bResolver');
  await p.waitForFunction(() => /Comparación de métodos/.test(document.body.innerText), null, { timeout: 240000 }).catch(() => {});
  txt = await p.innerText('body');
  chk('comparación de métodos con brecha por método', /Comparación de métodos/.test(txt) && /Modelo matemático \(MILP\)/.test(txt));
  chk('sin errores de página', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fallas ? `${fallas} comprobación(es) fallaron` : 'Todas las comprobaciones de interfaz pasaron');
  await b.close(); process.exit(fallas ? 1 : 0);
})();
