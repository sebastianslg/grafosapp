/* Prueba de «parar cuando yo decida»: resuelve un CVRP grande con el modelo exacto, para a los 25 s y comprueba que
   aparece el mejor valor, la cota y la brecha de la mejor solución encontrada.
   Uso: node pruebas/e2e_parar.js http://127.0.0.1:8765 */
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8765';
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  let fallas = 0; const chk = (n, ok, extra) => { if (!ok) fallas++; console.log((ok ? 'OK    ' : 'FALLA ') + n + (extra ? '  ' + extra : '')); };
  await p.goto(url + '?motor=servidor');
  await p.waitForFunction(() => /HiGHS/.test(document.getElementById('pMotor').innerText), null, { timeout: 60000 });
  await p.selectOption('#problema', 'vrp'); await p.selectOption('#vrpVar', 'vrptw'); await p.selectOption('#vrpMetodo', 'exacto');
  await p.fill('#tiempo', '300');
  await p.click('#bResolver');
  await p.waitForTimeout(25000);
  const vivo = await p.innerText('#vivo').catch(() => '');
  const mejorOk = /mejor solución/.test(vivo) && !/^\s*—/m.test(vivo.split('\n')[0] || '');
  chk('durante la corrida el panel «vivo» muestra la mejor solución', mejorOk, vivo.replace(/\n+/g, ' | ').slice(0, 160));
  chk('y la mejor cota (límite teórico)', /mejor cota/.test(vivo) && /\d/.test(vivo.split('mejor cota')[0].slice(-40)), '');
  await p.click('#bParar');
  await p.waitForFunction(() => /detenido por el usuario|Detenido por usted/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
  const fin = await p.innerText('body');
  chk('al parar queda el mejor resultado encontrado', /detenido por el usuario|Detenido por usted/.test(fin));
  chk('y se muestra la brecha de esa solución', /Brecha \(gap\)/.test(fin));
  console.log(fallas ? `${fallas} comprobación(es) fallaron` : 'Parar y progreso verificados');
  await b.close(); process.exit(fallas ? 1 : 0);
})();
