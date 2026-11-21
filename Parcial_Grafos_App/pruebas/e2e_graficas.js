/* Prueba de interfaz: simulación (reloj que avanza, flota en vivo, visitas), Gantt con agenda, gráficas (distancia,
   capacidad, jornada, convergencia, historial), análisis de sensibilidad, variantes nuevas, atajos y «Copiar resumen».
   Uso: node pruebas/e2e_graficas.js http://127.0.0.1:8765   (con ejecutar_app.py en marcha). Sale con código 1 si algo falla. */
const { chromium } = require('playwright');
(async () => {
  const url = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 920 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console ' + m.text()); });
  let fallas = 0; const chk = (n, ok, extra) => { if (!ok) fallas++; console.log((ok ? 'OK    ' : 'FALLA ') + n + (extra ? '  ' + extra : '')); };
  const listo = () => p.waitForFunction(() => !document.getElementById('bResolver').disabled, null, { timeout: 240000 });
  await p.goto(url + '/'); await p.waitForFunction(() => /HiGHS/.test(document.getElementById('pMotor').innerText), null, { timeout: 60000 });
  await p.evaluate(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('parcial-grafos:historial:')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* */ } });

  // 1) VRPTW con el atajo Ctrl+Enter
  await p.selectOption('#problema', 'vrp'); await p.selectOption('#vrpVar', 'vrptw'); await p.fill('#tiempo', '15');
  await p.locator('#tiempo').press('Control+Enter');
  await p.waitForTimeout(1500); chk('Ctrl+Enter inicia la resolución', await p.$eval('#bResolver', (x) => x.disabled));
  await p.waitForFunction(() => document.querySelector('#vivo svg.miniconv'), null, { timeout: 30000 }).catch(() => {});
  chk('gráfica en vivo de mejor solución y cota mientras resuelve', !!(await p.$('#vivo svg.miniconv')));
  await listo(); await p.waitForTimeout(1500);

  // 2) simulación
  const r1 = await p.$eval('#sReloj', (x) => x.textContent).catch(() => '');
  await p.waitForTimeout(2500);
  const r2 = await p.$eval('#sReloj', (x) => x.textContent).catch(() => '');
  chk('el reloj de la simulación avanza', /^\d\d:\d\d$/.test(r1) && r1 !== r2, r1 + ' → ' + r2);
  chk('panel «Flota en vivo» con estado de cada vehículo', /Flota en vivo/.test(await p.innerText('#simflota').catch(() => '')) && (await p.$$('#simflota .sf-fila')).length >= 1);
  await p.click('#sVel'); await p.click('#sVel'); chk('velocidad de reproducción cambia', /4×/.test(await p.innerText('#sVel')));
  await p.fill('#sPos', '1000'); await p.dispatchEvent('#sPos', 'input'); await p.waitForTimeout(300);
  const txt = await p.innerText('#sTxt'); const m = /(\d+)\/(\d+) atendidos/.exec(txt);
  chk('al final de la jornada todos los clientes quedan atendidos', m && m[1] === m[2], txt);
  chk('se marcan las visitas en el mapa', (await p.$$('.visita')).length >= 5);
  await p.keyboard.press('Escape'); await p.click('#mapa', { position: { x: 30, y: 300 } }).catch(() => {});
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('Space'); await p.waitForTimeout(300);
  chk('Espacio reproduce o pausa la simulación', await p.evaluate(() => Sim.reproduciendo === true));

  // 3) Gantt y gráficas
  await p.click('#tabsDer button[data-p="gantt"]'); await p.waitForTimeout(400);
  chk('Gantt con viaje y servicio en horas del día', (await p.$$('.g-pista i.g-v')).length > 5 && (await p.$$('.g-pista i.g-s')).length > 3 && /\d\d:\d\d/.test(await p.innerText('.g-eje')));
  await p.click('#tabsDer button[data-p="graficas"]'); await p.waitForTimeout(800);
  const g = await p.innerText('#contenido');
  chk('gráficas de distancia, capacidad y jornada', /Distancia por ruta/.test(g) && /Uso de la capacidad/.test(g) && /Composición de la jornada/.test(g));
  chk('gráfica de convergencia (mejor solución y cota)', /Convergencia del modelo matemático/.test(g) && !!(await p.$('#sv_conv')));
  chk('historial de corridas registra la corrida', /Historial de corridas/.test(g) && /#1/.test(g));
  const bar = await p.$('.hb-f'); await bar.hover(); await p.waitForTimeout(200);
  chk('tooltip al pasar el cursor por una barra', await p.evaluate(() => { const t = document.querySelector('.tipg'); return !!t && t.classList.contains('vis') && t.textContent.length > 3; }));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('[data-csv="dist"]')]);
  chk('descarga CSV de una gráfica', !!dl);
  chk('sin NaN ni undefined en las gráficas', !/NaN|undefined|Infinity/.test(g));

  // 4) sensibilidad (número de vehículos 2 y 3, 6 s cada uno)
  await p.selectOption('#vrpVar', 'cvrp'); await p.click('#tabsDer button[data-p="graficas"]'); await p.waitForTimeout(500);
  await p.selectOption('#sPar', 'm'); await p.fill('#sVals', '2, 3'); await p.fill('#sT', '6');
  await p.click('#sCorrer'); await listo(); await p.waitForTimeout(800);
  const filas = await p.$$eval('#g_sens table tr', (t) => t.length);
  chk('sensibilidad: un punto por valor, con objetivo', filas === 3 && !!(await p.$('#sv_sens')), 'filas=' + filas);

  // 5) variantes nuevas, cada una resuelta con el modelo matemático
  for (const [id, re] of [['ccvrp', /Suma de las horas de llegada/], ['vrpstw', /Retraso total/], ['dvrpt', /Función objetivo/], ['op', /Función objetivo/], ['ptp', /Función objetivo/], ['cvrpmm', /Ruta más larga/], ['omdvrp', /Función objetivo/]]) {
    // jornada y latencia son modelos más difíciles: más tiempo para hallar la primera solución
    await p.selectOption('#vrpVar', id); await p.fill('#tiempo', id === 'dvrpt' || id === 'ccvrp' ? '30' : '12'); await p.click('#bResolver'); await listo(); await p.waitForTimeout(400);
    const t = await p.innerText('#contenido');
    const okv = re.test(t) && /Ruta|ruta/.test(t) && !/No se halló/.test(t);
    chk('variante nueva ' + id + ' resuelve y muestra su resultado', okv, okv ? '' : t.slice(0, 160).replace(/\s+/g, ' ') + ' | log: ' + (await p.innerText('#log').catch(() => '')).slice(0, 160).replace(/\s+/g, ' '));
  }

  // 6) copiar resumen
  await p.click('#tabsDer button[data-p="resultado"]'); await p.waitForTimeout(300); await p.click('[data-e="copiar"]'); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  chk('«Copiar resumen» pone el resultado en el portapapeles', /Objetivo:/.test(clip) && /Ruta 1/.test(clip));
  // 7) tema oscuro: colores de ruta cambian y se redibuja sin errores
  const c1 = await p.evaluate(() => Mapa.COL[0]); await p.click('#bTema'); await p.waitForTimeout(1500); const c2 = await p.evaluate(() => Mapa.COL[0]);
  chk('el tema cambia la paleta de rutas', c1 !== c2, c1 + ' → ' + c2);
  await p.keyboard.press('?'); await p.waitForTimeout(300); chk('«?» muestra los atajos', /Atajos de teclado/.test(await p.innerText('#hoja'))); await p.keyboard.press('Escape');

  chk('sin errores de página', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fallas ? `${fallas} comprobación(es) fallaron` : 'Todas las comprobaciones de simulación y gráficas pasaron');
  await b.close(); process.exit(fallas ? 1 : 0);
})();
