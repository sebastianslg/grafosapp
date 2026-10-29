const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.argv[2] + '?motor=servidor'); await p.waitForTimeout(2500);
  await p.click('#tabsDer [data-p="modelo"]'); console.log('TSP:', (await p.innerText('#contenido')).slice(0, 120).replace(/\n/g, ' '));
  await p.selectOption('#problema', 'mtsp'); await p.waitForTimeout(500); console.log('mTSP:', (await p.innerText('#contenido')).slice(0, 90).replace(/\n/g, ' '), '| método:', await p.inputValue('#metodo'));
  await p.screenshot({ path: process.argv[3] }); console.log('errores', errs); await b.close(); })();
