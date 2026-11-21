/* Prueba del «un clic»: con la ventana abierta la app sigue viva (latidos); al cerrar la ventana se cierra sola.
   Requiere que la app esté en marcha con LATIDO_SEG corto (p. ej. LATIDO_SEG=12 ./Ejecutar_App.sh).
   Uso: node pruebas/e2e_un_clic.js http://127.0.0.1:8765 */
const { chromium } = require('playwright');
const vivo = async (url) => { try { const r = await fetch(url + 'api/identidad'); return r.ok; } catch (e) { return false; } };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8765/';
  let fallas = 0; const chk = (n, ok) => { if (!ok) fallas++; console.log((ok ? 'OK    ' : 'FALLA ') + n); };
  let arriba = false; for (let i = 0; i < 80 && !arriba; i++) { arriba = await vivo(url); if (!arriba) await esperar(250); }
  chk('la app responde al lanzarla (el lanzador no espera al servidor)', arriba);
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  await p.goto(url);
  await p.waitForFunction(() => /HiGHS/.test(document.getElementById('pMotor').innerText), null, { timeout: 60000 });
  await esperar(20000);                     // más que LATIDO_SEG: solo sigue viva si la ventana late
  chk('con la ventana abierta la app sigue activa (latidos)', await vivo(url));
  await b.close();                          // cerrar la ventana
  await esperar(25000);
  chk('al cerrar la ventana la app se cierra sola', !(await vivo(url)));
  console.log(fallas ? `${fallas} comprobación(es) fallaron` : 'Un clic: abre, se mantiene y se cierra sola');
  process.exit(fallas ? 1 : 0);
})();
