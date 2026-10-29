const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [,, url, dir] = process.argv;
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e)); p.on('console', m => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto(url + '?motor=servidor'); await p.waitForFunction(() => document.getElementById('pMotor').innerText.includes('HiGHS'), null, { timeout: 30000 });
  // --- edición de nodos
  await p.click('#tabsDer button[data-p="nodos"]'); await p.waitForSelector('input[data-f="nombre"]');
  await p.fill('input[data-i="1"][data-f="nombre"]', 'Tienda editada'); await p.press('input[data-i="1"][data-f="nombre"]', 'Enter');
  console.log('nombre en estado:', await p.evaluate(() => App.S.ds.nodos[1].nombre));
  await p.fill('input[data-i="1"][data-f="lat"]', '3.40'); await p.press('input[data-i="1"][data-f="lat"]', 'Enter');
  console.log('aviso recálculo:', (await p.innerText('.aviso')).slice(0, 80));
  await p.click('#bRecRecta'); await p.waitForTimeout(300);
  console.log('D[0][1] tras recta:', await p.evaluate(() => App.S.ds.D[0][1].toFixed(3)));
  // --- matriz
  await p.click('#tabsDer button[data-p="matriz"]'); await p.waitForSelector('input[data-i="2"][data-j="3"]');
  await p.fill('input[data-i="2"][data-j="3"]', '99.5'); await p.press('input[data-i="2"][data-j="3"]', 'Enter');
  console.log('matriz simétrica:', await p.evaluate(() => [App.S.ds.D[2][3], App.S.ds.D[3][2]]));
  // --- restaurar
  await p.click('#tabsDer button[data-p="nodos"]'); await p.click('#bRestaurar'); await p.click('#hoja [data-x="ok"]'); await p.waitForTimeout(500);
  console.log('tras restaurar:', await p.evaluate(() => [App.S.ds.nodos.length, App.S.ds.nodos[1].nombre]));
  // --- exportaciones
  await p.click('#cParcial #c1'); await p.waitForFunction(() => /tramos/.test(document.getElementById('chipMapa').innerText), null, { timeout: 120000 });
  const bajar = async (accion, nombre) => { const [dl] = await Promise.all([p.waitForEvent('download'), (async () => { await p.click('#bExportar'); await p.click(`#menuExp [data-a="${accion}"]`); })()]); const f = dir + '/' + nombre; await dl.saveAs(f); console.log('descarga', accion, dl.suggestedFilename(), fs.statSync(f).size, 'bytes'); return f; };
  await bajar('xlsx', 'libro.xlsx'); await bajar('nodos', 'nodos.csv'); await bajar('matriz', 'matriz.csv'); await bajar('csv', 'res.csv'); const gj = await bajar('geojson', 'res.geojson'); await bajar('json', 'datos.json');
  const g = JSON.parse(fs.readFileSync(gj)); console.log('geojson features:', g.features.length, 'con calles:', g.features.filter(f => f.properties.calles).length);
  // --- importar: matriz CSV recortada (tamaño distinto) y nodos con lat/lon
  fs.writeFileSync(dir + '/mini.csv', ',A,B,C,D\nA,#,5,9,4\nB,5,#,2,6\nC,9,2,#,3\nD,4,6,3,#\n');
  await p.click('#bImportar'); await p.setInputFiles('#archivo', dir + '/mini.csv'); await p.waitForSelector('#hoja [data-x="ok"]'); await p.selectOption('#impDestino', 'este');
  console.log('plan:', (await p.innerText('#hoja')).replace(/\n+/g, ' | ').slice(0, 200)); await p.click('#hoja [data-x="ok"]'); await p.waitForTimeout(600);
  console.log('tras importar matriz:', await p.evaluate(() => [App.S.ds.nodos.length, App.S.ds.D[0][1]]));
  await p.click('#problema'); await p.selectOption('#problema', 'tsp'); await p.click('#bResolver'); await p.waitForFunction(() => /Distancia total/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 });
  console.log('TSP del archivo importado:', (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).slice(0, 2).join(' | '));
  // importar el xlsx exportado antes (roundtrip)
  await p.click('#tabsDer button[data-p="nodos"]'); await p.click('#bRestaurar'); await p.click('#hoja [data-x="ok"]'); await p.waitForTimeout(400);
  await p.click('#bImportar'); await p.setInputFiles('#archivo', dir + '/libro.xlsx'); await p.waitForSelector('#hoja [data-x="ok"]'); await p.selectOption('#impDestino', 'este');
  console.log('plan xlsx:', (await p.innerText('#hoja')).replace(/\n+/g, ' | ').slice(0, 160)); await p.click('#hoja [data-x="ok"]'); await p.waitForTimeout(600);
  console.log('tras importar xlsx:', await p.evaluate(() => [App.S.ds.nodos.length, App.S.ds.D[0][1].toFixed(3)]));
  await p.selectOption('#problema', 'tsp'); await p.click('#bResolver'); await p.waitForFunction(() => /Distancia total/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 });
  console.log('TSP tras importar xlsx (esperado 72,048):', (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).slice(1, 2).join(''));
  // --- oscuro y móvil
  await p.click('#tabsDer button[data-p="resultado"]'); await p.click('#bTema'); await p.click('#cParcial #c1'); await p.waitForFunction(() => /tramos/.test(document.getElementById('chipMapa').innerText), null, { timeout: 120000 }); await p.waitForTimeout(1800);
  await p.screenshot({ path: dir + '/oscuro.png' });
  await p.setViewportSize({ width: 420, height: 900 }); await p.waitForTimeout(600); await p.screenshot({ path: dir + '/movil.png', fullPage: false });
  console.log('errores:', errs); await b.close();
})();
