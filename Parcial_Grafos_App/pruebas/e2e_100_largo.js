/* Corrida larga en el navegador con 100 clientes y DFJ: muestra cómo evolucionan la mejor solución, la cota y la brecha.
   Uso: node pruebas/e2e_100_largo.js [url] [archivo.csv] [segundos] */
const { chromium } = require('playwright');
const url = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, ''), csv = process.argv[3], T = +(process.argv[4] || 400);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto(url + '/'); await p.waitForFunction(() => document.getElementById('pMotor').classList.contains('ok'), null, { timeout: 60000 });
  await p.evaluate(() => { const d = document.getElementById('avanzado'); if (d) d.open = true; });   // métodos y «sin límite» están en «Opciones avanzadas»
  await p.click('#bImportar'); await p.setInputFiles('#archivo', csv); await p.waitForTimeout(1200); await p.click('[data-x="ok"]'); await p.waitForTimeout(2500);
  await p.selectOption('#problema', 'vrp'); await p.selectOption('#vrpVar', 'cvrp'); await p.selectOption('#vrpMetodo', 'exacto'); await p.selectOption('#metodo', 'dfj');
  await p.fill('#tiempo', String(T)); await p.fill('#vrpM', '5');
  await p.fill('#flotaTabla input[data-f="cap"]', '80'); await p.dispatchEvent('#flotaTabla input[data-f="cap"]', 'change');
  await p.fill('#flotaTabla input[data-f="n"]', '5'); await p.dispatchEvent('#flotaTabla input[data-f="n"]', 'change');
  const t0 = Date.now(); await p.click('#bResolver');
  while ((Date.now() - t0) / 1000 < T + 60) {
    await p.waitForTimeout(60000);
    const v = await p.evaluate(() => { const e = document.getElementById('vivo'); return e ? e.innerText.replace(/\s+/g, ' ') : ''; });
    console.log(((Date.now() - t0) / 1000).toFixed(0) + ' s |', v.slice(0, 200));
    if (!(await p.evaluate(() => App.S.corriendo))) break;
  }
  await p.waitForFunction(() => !App.S.corriendo, null, { timeout: 120000 }).catch(() => console.log('sigue corriendo'));
  await p.waitForTimeout(2000);
  console.log('FINAL:', JSON.stringify(await p.evaluate(() => { const r = App.S.res && App.S.res.res; return r && { objetivo: r.objetivo, cota: r.cota, gap: r.gap, estado: r.estado, rutas: r.rutas && r.rutas.length }; })));
  await b.close();
})();
