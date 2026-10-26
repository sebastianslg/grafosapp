const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + process.argv[2]);
  await p.click('#bEjemplo');
  console.log('datos:', await p.textContent('#estadoDatos'));
  const resolver = async (tipo, extra = {}) => {
    await p.selectOption('#tipo', tipo);
    for (const [k, v] of Object.entries(extra)) { if (typeof v === 'boolean') await p.setChecked('#' + k, v); else if (k === 'objetivo') await p.selectOption('#' + k, v); else await p.fill('#' + k, String(v)); }
    await p.click('#bResolver');
    await p.waitForFunction(() => !document.getElementById('bResolver').disabled, null, { timeout: 150000 });
    const cards = await p.$$eval('#cards .k', (a) => a.map((e) => e.innerText.replace(/\n/g, ': ')));
    const filas = await p.$$eval('#tabla tr', (a) => a.length - 1);
    console.log(tipo, JSON.stringify(extra), '=>', cards.join(' | '), '| rutas:', filas);
  };
  await resolver('tsp:ciclo');
  await resolver('tsp:abierto');
  await p.selectOption('#tipo', 'tsp:fijo'); await p.selectOption('#destino', '14'); await resolver('tsp:fijo');
  await resolver('tsp:libre');
  await resolver('mtsp', { m: 3, lmin: 1, lmax: 0 });
  await resolver('mtsp', { m: 3, lmin: 4, lmax: 5 });
  await resolver('mtsp', { m: 3, lmin: 1, lmax: 0, objetivo: 'maximo' });
  await p.screenshot({ path: process.argv[3], fullPage: true });
  console.log('errores de página:', errs);
  await b.close();
})();
