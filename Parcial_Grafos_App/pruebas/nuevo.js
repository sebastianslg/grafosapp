const { chromium } = require('playwright');
(async () => {
  const [,, url, dir] = process.argv;
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto(url + (process.env.MOTOR ? '' : '?motor=servidor')); await p.waitForFunction(() => /HiGHS/.test(document.getElementById('pMotor').innerText), null, { timeout: 30000 }); await p.waitForTimeout(1500);
  const S = (f) => p.evaluate(f); const clickMapa = async (lat, lon) => { const q = await p.evaluate(([la, lo]) => { const c = Mapa.map.latLngToContainerPoint([la, lo]), r = document.getElementById('mapa').getBoundingClientRect(); return [r.left + c.x, r.top + c.y]; }, [lat, lon]); await p.mouse.click(q[0], q[1]); };
  const esperaFin = () => p.waitForFunction(() => !document.getElementById('bResolver').disabled && !document.querySelector('[data-run]:disabled'), null, { timeout: 180000 });
  const kpis = async () => (await p.$$eval('.kpi', a => a.map(e => e.innerText.replace(/\n/g, ': ')))).join(' | ');
  // 1) mover el CD con la herramienta (decisión del usuario) y re-resolver
  const d0 = await S(() => App.S.ds.D[0][1]);
  await p.click('#cHerr [data-m="dc"]'); await clickMapa(3.4, -76.46); await p.waitForFunction(() => /distancias recalculadas/.test(document.getElementById('chipMapa').innerText), null, { timeout: 60000 });
  console.log('1) CD movido:', await S(() => [App.S.ds.nodos[0].lat, App.S.ds.nodos[0].lon]), 'D[0][1]', d0, '→', await S(() => App.S.ds.D[0][1].toFixed(3)), '|', await p.innerText('#chipMapa'));
  await p.keyboard.press('Escape');
  await p.click('#bResolver'); await p.waitForFunction(() => /Distancia total/.test(document.getElementById('contenido').innerText), null, { timeout: 120000 }); console.log('   TSP con el nuevo CD:', await kpis());
  // 2) ubicación óptima del CD con TSP exacto
  await p.click('#tabsDer [data-p="cd"]'); await p.waitForSelector('#gGen'); await p.fill('#gF', '4'); await p.fill('#gC', '4'); await p.click('#gGen'); await p.fill('#uTop', '5');
  console.log('2) candidatos:', await S(() => App.S.ds.candidatos.length)); await p.click('#uCalc');
  await p.waitForFunction(() => /Mejor recorrido/.test(document.getElementById('contenido').innerText), null, { timeout: 240000 });
  console.log('   resultado CD:', await kpis()); await p.waitForTimeout(1800); await p.screenshot({ path: dir + '/cd_optimo.png' });
  const mejor = await S(() => { const u = App.S.ubic; return [u.res.mejor.k, u.res.mejor.objetivo]; }); console.log('   mejor candidato', mejor);
  await p.click('#uMover'); await p.waitForFunction(() => /distancias recalculadas/.test(document.getElementById('chipMapa').innerText), null, { timeout: 60000 });
  await p.click('#tabsDer [data-p="resultado"]'); await p.click('#bResolver'); await p.waitForFunction(() => /Distancia total/.test(document.getElementById('contenido').innerText), null, { timeout: 120000 }); console.log('   TSP con el CD óptimo:', await kpis());
  // 3) búsqueda y área
  await p.fill('#bq', 'Cali, Valle del Cauca'); await p.click('#fBusca button'); await p.waitForSelector('#bRes .res', { timeout: 30000 }); console.log('3) búsqueda:', (await p.$$eval('#bRes .res .rn', a => a.length)), 'resultados');
  await p.click('#bRes .res [data-a="area"]'); await p.waitForTimeout(600); console.log('   área:', await S(() => App.S.ds.area && App.S.ds.area.length), 'vértices |', await p.innerText('#chipMapa'));
  // 4) imagen de fondo
  await p.click('#tabsDer [data-p="mapa"]'); await p.setInputFiles('#fArchivo', dir + '/plano.png'); await p.waitForFunction(() => App.S.ds.fondo, null, { timeout: 10000 }); console.log('4) fondo:', await S(() => App.S.ds.fondo.bounds.map(x => x.map(v => +v.toFixed(3)))));
  await p.click('#sBase [data-b="ninguno"]'); await p.waitForTimeout(700); await p.screenshot({ path: dir + '/fondo.png' });
  // 5) proyecto propio desde cero
  await p.click('#bMas'); await p.fill('#npNombre', 'Mi grafo'); await p.click('#hoja [data-x="ok"]'); await p.waitForFunction(() => App.S.ds.usuario, null, { timeout: 15000 });
  await p.click('#cHerr [data-m="nodo"]'); const base = await S(() => { const c = Mapa.map.getCenter(); return [c.lat, c.lng]; });
  const pts = [[0.004, -0.006], [0.006, 0.004], [-0.003, 0.007], [-0.005, -0.004], [0.0, 0.0]];
  for (const [a, c] of pts) { await clickMapa(base[0] + a, base[1] + c); await p.waitForTimeout(250); }
  await p.keyboard.press('Escape'); console.log('5) nodos del proyecto propio:', await S(() => App.S.ds.nodos.length), '| aristas:', await S(() => Datos.aristas(App.S.ds).length));
  await p.click('#cHerr [data-m="arista"]');
  const idx = await S(() => App.S.ds.nodos.map(n => [n.lat, n.lon]));
  const unir = async (a, c) => { await clickMapa(...idx[a]); await p.waitForTimeout(150); await clickMapa(...idx[c]); await p.waitForTimeout(500); };
  await unir(0, 1); await unir(1, 2); await unir(2, 3); await unir(3, 0); await unir(0, 2); await p.keyboard.press('Escape');
  console.log('   aristas creadas:', await S(() => Datos.aristas(App.S.ds).length), 'costos:', await S(() => Datos.aristas(App.S.ds).map(a => a.costo.toFixed(2)).join(',')));
  await p.selectOption('#problema', 'camino'); await p.selectOption('#origen', '0'); await p.selectOption('#destino', '2'); await p.click('#bResolver'); await p.waitForFunction(() => /Distancia mínima/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 }); console.log('   camino mínimo:', await kpis());
  await p.selectOption('#problema', 'arbol'); await p.click('#bResolver'); await p.waitForFunction(() => /Costo total del árbol/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 }); console.log('   árbol:', await kpis());
  await p.selectOption('#problema', 'cartero'); await p.click('#bResolver'); await p.waitForFunction(() => /Recorrido mínimo/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 }); console.log('   cartero:', await kpis());
  // capacidades en Aristas → flujo máximo
  await p.click('#tabsDer [data-p="aristas"]'); const ks = await p.$$('input[data-f="k"]'); for (let i = 0; i < ks.length; i++) { await ks[i].fill(String(3 + i)); await ks[i].press('Enter'); }
  await p.selectOption('#problema', 'flujomax'); await p.selectOption('#origen', '0'); await p.selectOption('#destino', '2'); await p.click('#bResolver'); await p.waitForFunction(() => /Flujo máximo/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 }); console.log('   flujo máximo:', await kpis());
  // demanda y CVRP
  await p.click('#tabsDer [data-p="nodos"]'); for (let i = 1; i < 4; i++) { await p.fill(`input[data-i="${i}"][data-f="extra"]`, '4'); await p.press(`input[data-i="${i}"][data-f="extra"]`, 'Enter'); }
  await p.selectOption('#problema', 'cvrp'); await p.fill('#capacidad', '8'); await p.fill('#m', '3'); await p.click('#bResolver'); await p.waitForFunction(() => /Carga/.test(document.getElementById('contenido').innerText), null, { timeout: 90000 }); console.log('   CVRP:', await kpis());
  await p.selectOption('#problema', 'pmediana'); await p.click('#bResolver'); await p.waitForFunction(() => /Nodos elegidos/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 }); console.log('   p-mediana:', await kpis());
  await p.selectOption('#problema', 'libre'); await p.click('#bResolver'); await p.waitForFunction(() => /Valor óptimo/.test(document.getElementById('contenido').innerText), null, { timeout: 60000 }); console.log('   modelo libre:', await kpis());
  await p.click('#tabsDer [data-p="resultado"]'); await p.waitForTimeout(800); await p.screenshot({ path: dir + '/proyecto_propio.png' });
  // exportaciones nuevas
  for (const a of ['anylogistix', 'json', 'aristas']) { const [dl] = await Promise.all([p.waitForEvent('download'), (async () => { await p.click('#bExportar'); await p.click(`#menuExp [data-a="${a}"]`); })()]); console.log('   descarga', a, dl.suggestedFilename()); }
  console.log('errores:', errs); await b.close();
})();
