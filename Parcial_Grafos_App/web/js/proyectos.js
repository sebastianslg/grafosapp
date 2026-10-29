/* Proyectos: pestañas (Cali, China y los propios), proyecto nuevo, duplicar, renombrar y atajos del parcial. */
(function () {
  'use strict';
  const { S, $, esc, fmt, nodo, idx, corto, chip } = App;

  App.proyectosRender = () => {
    const nav = $('tabs'), items = [['cali', 'ARA Cali'], ['china', 'China Top 25'], ...Datos.listar().filter((p) => S.sets[p.clave]).map((p) => [p.clave, p.titulo])];
    nav.innerHTML = '<span class="ind"></span>' + items.map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${k === S.clave}">${esc(t)}</button>`).join('') + '<button class="mas" id="bMas" title="Nuevo proyecto" aria-label="Nuevo proyecto">+</button>';
    requestAnimationFrame(() => App.indicador(nav)); $('bMas').onclick = nuevoProyecto;
  };
  App.segmentado($('tabs'), (b) => App.cambiarTab(b.dataset.tab));

  App.cambiarTab = (clave) => {
    if (S.corriendo) { S.worker.terminate(); App.ocupado(false); App.crearWorker(); }
    App.cancelarModo && App.cancelarModo();
    S.clave = clave; S.ds = S.sets[clave]; S.res = null; S.sucio = null; S.rutaSel = 0; S.colores = null; S.tenue = null; S.celda = null; S.ultimoProblema = null;
    $('tabs').querySelectorAll('button[role="tab"]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === clave)); App.indicador($('tabs'));
    document.title = S.ds.titulo + ' · Parcial de Grafos'; Mapa.setBase(S.ds.base);
    App.cargarProyectoEnVista(true);
    document.querySelectorAll('.col.izq .tarjeta, .panel-der').forEach((t, i) => { t.classList.remove('entra'); void t.offsetWidth; t.style.setProperty('--i', i + 1); t.classList.add('entra'); });
  };

  App.cargarProyectoEnVista = (ajustar) => {
    const ds = S.ds; S.res = null; S.ubic = null; S.celda = null;   // los índices del resultado anterior ya no valen
    App.llenarSelects();
    const d0 = ds.origen_defecto !== undefined ? idx(ds.origen_defecto) : 0, dc = Datos.dcIdx(ds);
    $('origen').value = dc >= 0 ? dc : (d0 >= 0 ? d0 : 0); $('destino').value = Math.max(0, ds.nodos.length - 1);
    Mapa.montar(ds, App.callbacksMapa); App.montarExtras(); Mapa.limpiarRutas(); $('leyenda').classList.add('oculto'); S.colores = null; S.tenue = null;
    Mapa.map.setView(ds.centro, ds.zoom); if (ajustar && ds.nodos.length) setTimeout(() => Mapa.ajustar(), 80);
    chip(ds.subtitulo || ds.titulo); App.camposProblema(); renderParcial(); App.setPanel(S.panel === 'resultado' || !App.paneles.find((p) => p.id === S.panel) ? 'resultado' : S.panel);
    App.actualizarHerramientas && App.actualizarHerramientas();
  };
  App.montarExtras = () => {   // candidatos, área, imagen y aristas del proyecto actual
    const ds = S.ds;
    Mapa.montarCandidatos(ds.candidatos, App.callbacksCandidatos); Mapa.dibujarArea(ds.area, S.panel === 'mapa', App.alEditarArea); Mapa.ponerFondo(ds.fondo, S.panel === 'mapa' && S.editarFondo, App.alEditarFondo);
    App.pintarAristas && App.pintarAristas();
  };

  /* ---------- proyecto nuevo ---------- */
  function nuevoProyecto() {
    const v = Mapa.vista();
    App.hoja(`<h3>Proyecto nuevo</h3><p class="nota">Construya su propio grafo sobre el mapa y resuélvalo con optimización.</p>
      <div class="fila"><label class="campo" style="flex-basis:100%">Nombre<input id="npNombre" value="Mi proyecto"></label></div>
      <div class="fila"><label class="campo">Empezar con<select id="npPlantilla"><option value="blanco">Grafo en blanco</option><option value="cd">Centro de distribución y 6 clientes</option><option value="copia">Copia de «${esc(S.ds.titulo)}»</option></select></label>
        <label class="campo">Matriz de distancias<select id="npDist"><option value="euclidiana">Euclidiana (km)</option><option value="carretera">Por carretera (OSRM, requiere internet)</option></select></label></div>
      <div class="fila"><label class="campo" style="flex-basis:100%">Lugar de inicio (opcional: ciudad, dirección…)<input id="npLugar" placeholder="p. ej. Medellín, Colombia · vacío = vista actual del mapa"></label></div>
      <div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn" data-x="ok">Crear</button></div><div class="nota" id="npMsg"></div>`, async (x, h) => {
      if (x !== 'ok') return App.cerrarHoja();
      const nombre = h.querySelector('#npNombre').value.trim() || 'Proyecto nuevo', pl = h.querySelector('#npPlantilla').value, lugar = h.querySelector('#npLugar').value.trim();
      let centro = [v.centro.lat, v.centro.lng], zoom = Math.max(11, Math.min(15, Math.round(v.zoom)));
      if (lugar) { h.querySelector('#npMsg').textContent = 'Buscando el lugar…'; try { const r = (await (await fetch('/api/buscar', { method: 'POST', body: JSON.stringify({ q: lugar, limite: 1 }) })).json()).resultados[0]; if (r) { centro = [r.lat, r.lon]; zoom = 13; } else { h.querySelector('#npMsg').textContent = 'No se encontró ese lugar; se usa la vista actual.'; } } catch (e) { h.querySelector('#npMsg').textContent = 'Sin conexión para buscar el lugar; se usa la vista actual.'; } }
      const ds = Datos.nuevo({ titulo: nombre, centro, zoom, plantilla: pl === 'cd' ? 'cd' : null, modoDist: h.querySelector('#npDist').value, base: S.ds.base, copiaDe: pl === 'copia' ? S.ds : null });
      S.sets[ds.clave] = ds; App.cerrarHoja(); App.proyectosRender(); App.cambiarTab(ds.clave);
      chip(pl === 'blanco' ? 'Proyecto en blanco: use «Agregar nodos» y «Conectar» en Herramientas' : 'Proyecto creado');
    });
  }
  App.nuevoProyecto = nuevoProyecto;
  $('bProyecto').dataset.menu = '1';
  $('bProyecto').onclick = (e) => {
    e.stopPropagation(); const u = S.ds.usuario;
    App.menu($('bProyecto'), [['nuevo', 'Nuevo proyecto…'], ['dup', 'Duplicar este proyecto'], ...(u ? [['ren', 'Renombrar…'], ['del', 'Eliminar este proyecto']] : []), '-', ['exp', 'Guardar proyecto (.json)'], ['imp', 'Importar archivo…']], (a) => {
      if (a === 'nuevo') nuevoProyecto();
      else if (a === 'dup') { const c = Datos.nuevo({ titulo: S.ds.titulo + ' (copia)', centro: S.ds.centro, zoom: S.ds.zoom, copiaDe: S.ds }); S.sets[c.clave] = c; App.proyectosRender(); App.cambiarTab(c.clave); }
      else if (a === 'ren') App.hoja(`<h3>Renombrar proyecto</h3><div class="fila"><label class="campo" style="flex-basis:100%">Nombre<input id="rnNombre" value="${esc(S.ds.titulo)}"></label></div><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn" data-x="ok">Guardar</button></div>`, (x, h) => { if (x === 'ok') { S.ds.titulo = h.querySelector('#rnNombre').value.trim() || S.ds.titulo; Datos.guardar(S.ds); Datos.registrar(S.ds); App.proyectosRender(); } App.cerrarHoja(); });
      else if (a === 'del') App.hoja(`<h3>¿Eliminar «${esc(S.ds.titulo)}»?</h3><p class="nota">Se borran sus nodos, aristas, candidatos, área e imagen. Esta acción no se puede deshacer (exporte antes el proyecto si quiere conservarlo).</p><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn peligro" data-x="ok">Eliminar</button></div>`, (x) => { App.cerrarHoja(); if (x !== 'ok') return; Datos.eliminar(S.clave); delete S.sets[S.clave]; App.proyectosRender(); App.cambiarTab('cali'); });
      else if (a === 'exp') App.exportar('json');
      else if (a === 'imp') $('bImportar').click();
    });
  };

  /* ---------- atajos del parcial ---------- */
  function renderParcial() {
    const c = $('cParcial'), ds = S.ds;
    if (!ds.parcial) { c.classList.add('oculto'); c.innerHTML = ''; return; }
    c.classList.remove('oculto');
    if (S.clave === 'china') {
      const opt = (a, b) => ds.nodos.filter((n) => n.id >= a && n.id <= b).map((n) => `<option value="${n.id}">${n.id} · ${esc(n.nombre)}</option>`).join('');
      c.innerHTML = `<h2>Parcial · Punto 1</h2><p class="nota" style="margin-top:-4px">Camino mínimo con origen en el Top 1–10 y destino en el Top 15–25; árbol con origen en el Top 11–20.</p>
        <div class="fila"><label class="campo">Origen (Top 1–10)<select id="pO">${opt(1, 10)}</select></label><label class="campo">Destino (Top 15–25)<select id="pD">${opt(15, 25)}</select></label></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn mini" data-run id="pCamino">Camino mínimo</button><button class="btn mini sec" data-run id="pMatrizBtn">Matriz 10 × 11</button></div><div class="sep"></div>
        <div class="fila"><label class="campo">Raíz del árbol (Top 11–20)<select id="pR">${opt(11, 20)}</select></label></div>
        <button class="btn mini" data-run id="pArbol">Árbol de valor mínimo</button><div class="sep"></div>
        <p class="nota">Complementos con el mismo modelo:</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn mini sec" data-run id="pTsp">TSP circuito</button><button class="btn mini sec" data-run id="pMtsp">m-TSP · 2</button></div>`;
      $('pO').value = '2'; $('pD').value = '25'; $('pR').value = '11';
      $('pCamino').onclick = () => { const o = idx($('pO').value), d = idx($('pD').value); App.lanzar('camino', { origen: o, destino: d }, `Camino mínimo ${corto(o)} → ${corto(d)}`); };
      $('pMatrizBtn').onclick = () => { const orig = ds.nodos.map((n, i) => i).filter((i) => nodo(i).id >= 1 && nodo(i).id <= 10), cols = ds.nodos.map((n, i) => i).filter((i) => nodo(i).id >= 15 && nodo(i).id <= 25); App.lanzar('desde', { origenes: orig }, 'Caminos mínimos · origen Top 1–10 → destino Top 15–25', { cols }); };
      $('pArbol').onclick = () => { const r = idx($('pR').value); App.lanzar('arbol', { raiz: r, tiempo: 180 }, `Árbol de valor mínimo · raíz ${corto(r)}`); };
      $('pTsp').onclick = () => App.lanzar('tsp', { modo: 'ciclo', origen: idx(1), tiempo: 120, brecha: 1e-6 }, 'TSP · circuito desde ' + corto(idx(1)));
      $('pMtsp').onclick = () => App.lanzar('mtsp', { m: 2, deposito: idx(1), lmin: 1, lmax: 0, objetivo: 'suma', abierto: false, tiempo: 120, brecha: 1e-6 }, 'm-TSP · 2 viajantes');
    } else {
      const dep = () => Math.max(0, Datos.dcIdx(S.ds)), mt = (m, lmin, lmax, obj, tit) => () => App.lanzar('mtsp', { m, deposito: dep(), lmin, lmax, objetivo: obj || 'suma', abierto: false, tiempo: 180, brecha: 1e-6 }, tit);
      c.innerHTML = `<h2>Parcial · Punto 2</h2><p class="nota" style="margin-top:-4px">Recorrido de supervisores por las 25 tiendas ARA desde el <b>centro de distribución</b>. El CD no es un dato: <b>arrástrelo</b> a donde quiera o pida la ubicación óptima en la pestaña <b>CD</b>.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn sec" data-run id="c1">TSP · 1 supervisor (circuito)</button>
        <button class="btn sec" data-run id="c2">m-TSP · 2 supervisores, sin límites</button>
        <button class="btn sec" data-run id="c3">m-TSP · 2 supervisores, 12 y 13 tiendas</button>
        <button class="btn sec" data-run id="c4">m-TSP · 3 supervisores, 8 y 9 tiendas</button>
        <button class="btn sec" data-run id="c5">m-TSP · 2 supervisores, ruta más larga mínima</button></div>
        <p class="nota" style="margin-top:10px">Sin límites por ruta, el óptimo puede dejar casi todas las tiendas a un solo supervisor; los límites balancean la carga.</p>`;
      $('c1').onclick = () => App.lanzar('tsp', { modo: 'ciclo', origen: dep(), tiempo: 120, brecha: 1e-6 }, 'TSP · 1 supervisor (circuito)');
      $('c2').onclick = mt(2, 1, 0, 'suma', 'm-TSP · 2 supervisores, sin límites'); $('c3').onclick = mt(2, 12, 13, 'suma', 'm-TSP · 2 supervisores · 12–13 tiendas');
      $('c4').onclick = mt(3, 8, 9, 'suma', 'm-TSP · 3 supervisores · 8–9 tiendas'); $('c5').onclick = mt(2, 1, 0, 'maximo', 'm-TSP · 2 supervisores · ruta más larga mínima');
    }
    c.querySelectorAll('.btn').forEach((b) => (b.disabled = S.corriendo));
  }
  App.renderParcial = renderParcial;
})();
