/* Ejemplos de la exposición: uno por modelo (34, mismos datos que GAMS_modelos/) y uno por algoritmo (18, instancia CVRP-10
   de GAMS_algoritmos/), cada uno en una ciudad distinta. Se cargan como el proyecto «Ejemplo» y se resuelven con el modelo
   matemático (los algoritmos, con «Comparar»: el modelo da el óptimo y el algoritmo se mide contra él).
   Datos: web/datos/ejemplos.json (generado por pruebas/generar_ejemplos.js). */
(function () {
  'use strict';
  const { S, $, esc, fmt } = window.App;
  let EJ = null, actual = null;

  async function datos() { if (!EJ) EJ = await (await fetch('datos/ejemplos.json')).json(); return EJ; }

  async function montar() {
    const c = $('cEjemplos'); if (!c) return; const e = await datos().catch(() => null);
    if (!e) { c.classList.add('oculto'); return; }
    c.innerHTML = `<h2>Ejemplos de la exposición</h2>
      <p class="nota" style="margin-top:-4px">Un ejemplo por modelo y por algoritmo, con los <b>mismos datos de los archivos GAMS</b>, cada uno en un mapa distinto. Se resuelven con el modelo matemático.</p>
      <div class="fila"><label class="campo" style="flex-basis:100%">Ejemplo<select id="ejSel">
        <optgroup label="Modelos (${e.modelos.length}) · GAMS_modelos">${e.modelos.map((m, q) => `<option value="m${q}">${esc(m.archivo.slice(0, 2))} · ${esc(m.nombre)} — ${esc(m.ciudad)}</option>`).join('')}</optgroup>
        <optgroup label="Algoritmos (${e.algoritmos.length}) · GAMS_algoritmos">${e.algoritmos.map((a, q) => `<option value="a${q}">${esc(a.archivo.slice(0, 2))} · ${esc(a.nombre)} — ${esc(a.ciudad)}</option>`).join('')}</optgroup>
      </select></label></div>
      <p class="nota" id="ejInfo" style="margin:-4px 0 10px"></p>
      <button class="btn" id="ejCargar" data-run style="width:100%;justify-content:center">Cargar y resolver</button>`;
    const info = () => { const x = elegido(); $('ejInfo').innerHTML = x.tipo === 'm'
      ? `Archivo <b>${esc(x.e.archivo)}</b> · GAMS: <b>${fmt(x.e.gams, 2)}</b> · ${esc(x.e.ciudad)}`
      : `Archivo <b>${esc(x.e.archivo)}</b> · CVRP-10 · óptimo 425,05 · GAMS: <b>${fmt(x.e.gams, 2)}</b> · ${esc(x.e.ciudad)}`; };
    $('ejSel').onchange = info; info();
    $('ejCargar').onclick = () => cargar(elegido());
  }
  const elegido = () => { const v = $('ejSel').value, q = +v.slice(1); return v[0] === 'm' ? { tipo: 'm', e: EJ.modelos[q] } : { tipo: 'a', e: EJ.algoritmos[q] }; };

  async function cargar(x) {
    if (S.corriendo) return;
    const ds = JSON.parse(JSON.stringify(x.e.ds)); ds.D = Datos.aInf(ds.D); ds.usuario = true; ds.metodoElegido = false;
    Datos.normalizar(ds); ds.ejemplo = true; ds.completo = true; Datos.guardar(ds); Datos.registrar(ds);
    S.sets[ds.clave] = ds; App.proyectosRender(); App.cambiarTab(ds.clave);
    actual = x; const p = x.e.p || {};
    $('problema').value = 'vrp'; App.camposProblema(); if (window.VrpUi) VrpUi.montar();
    $('vrpVar').value = x.tipo === 'm' ? x.e.id : 'cvrp'; $('vrpMetodo').value = x.tipo === 'm' ? 'exacto' : 'comparar'; VrpUi.refrescar();
    $('vrpM').value = p.m || ''; $('vrpL').value = p.Lmax || ''; $('vrpP').value = p.lstops || ''; if ($('vrpT')) $('vrpT').value = p.tmax || ''; if ($('vrpPen')) $('vrpPen').value = p.pen || '';
    $('tiempo').value = x.tipo === 'm' ? 120 : 24; if ($('sinLimite')) $('sinLimite').checked = false;
    App.camposProblema(); VrpUi.refrescar();
    setTimeout(() => { if (!S.corriendo) $('bResolver').click(); }, 150);
  }

  /* nota bajo el resultado: comparación con GAMS (modelos) o con el óptimo (algoritmos) */
  App.notaEjemplo = (r) => {
    if (!actual || !S.ds || !S.ds.ejemplo || !r || r.kind !== 'vrp') return '';
    const x = r.res, e = actual.e;
    if (actual.tipo === 'm') {
      if (r.extra.variante !== e.id || x.objetivo == null) return '';
      const ok = e.app != null && Math.abs(x.objetivo - e.app) <= 1e-3 * Math.max(1, Math.abs(e.app));
      return `<div class="aviso nota-ej ${ok ? "info" : ""}" style="margin:10px 0"><b>Ejemplo de ${esc(e.archivo)}</b> · GAMS reporta <b>${fmt(e.gams, 2)}</b>; la app obtuvo <b>${fmt(x.objetivo, 2)}</b>${ok ? ' → <b>coinciden</b>' : ''}${String(x.estado).startsWith('óptimo') ? '' : ok ? ` (mismo valor; el navegador aún no termina de <b>probar</b> que es óptimo: brecha ${x.gap == null ? 'n/d' : fmt(x.gap * 100, 1) + ' %'}. Con más tiempo, o en GAMS, se prueba)` : ' (aún no es el óptimo probado: dé más tiempo)'}.${e.lectura ? ' ' + esc(e.lectura) : ''}</div>`;
    }
    if (!x.comparacion) return '';
    const fila = x.comparacion.find((c) => c.metodo === e.nombre), ex = x.comparacion.find((c) => c.tipo === 'exacto');
    if (!e.algo) return `<div class="aviso info nota-ej" style="margin:10px 0"><b>${esc(e.archivo)} · Branch and bound</b>: es el propio modelo matemático (HiGHS ramifica y acota). Óptimo ${ex ? fmt(ex.obj, 2) : '425,05'}, igual que GAMS (${fmt(e.gams, 2)}).</div>`;
    if (!fila) return '';
    const gap = ex && fila.factible ? (fila.obj - ex.obj) / Math.max(1e-9, fila.obj) : null;
    return `<div class="aviso info nota-ej" style="margin:10px 0"><b>${esc(e.nombre)}</b> (${esc(e.archivo)}): ${fila.factible ? fmt(fila.obj, 2) : 'sin solución'} frente al óptimo del modelo ${ex ? fmt(ex.obj, 2) : '—'}${gap != null ? ` · brecha ${fmt(gap * 100, 2)} %` : ''} en ${fmt(fila.seg, 1)} s. En GAMS (su propia implementación y semilla) dio ${fmt(e.gams, 2)}. Su fila está resaltada en la tabla.</div>`;
  };
  App.algoEjemplo = () => (actual && actual.tipo === 'a' && S.ds && S.ds.ejemplo ? actual.e.nombre : null);

  App.montarEjemplos = montar;
})();
