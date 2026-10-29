const { chromium } = require('playwright');
(async () => {
  const [,, url, dir] = process.argv; const b = await chromium.launch();
  for (const [w, h, n] of [[1100, 800, 'tablet'], [420, 900, 'movil']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto(url + '?motor=servidor'); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${dir}/vista_${n}.png` }); await p.close();
  }
  await b.close();
})();
