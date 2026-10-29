/* Edición del grafo: herramientas del mapa, centro de distribución movible, paneles Nodos, Aristas y Matriz. */
(function () {
  'use strict';
  const { S, $, esc, fmt, nodo, etq, corto, idx, chip } = App;
  const INF = Infinity;
  App.modos = {};   // modo → { texto, click(latlng), dbl(latlng), alSalir() }
  S.autoConectar = null; S.mostrarAristas = null;

  /* ---------- distancias nuevas (línea recta × factor o por carretera) ---------- */
  async function distancias(fuentes, destinos, modo) {   // → matriz [fuentes × destinos] en km
    const ds = S.ds, recta = () => fuentes.map((a) => destinos.map((b) => Datos.euclid(a[0], a[1], b[0], b[1], ds.centro[0]) * ds.factor));
    if ((modo || ds.modoDist) !== 'carretera') return { D: recta(), via: 'recta' };
    try {
      const r = await fetch('/api/matriz', { method: 'POST', body: JSON.stringify({ fuentes, destinos }) }), d = await r.json();
      if (!r.ok || d.D.some((f) => f.some((v) => v === null))) throw new Error(d.error || 'sin ruta');
      return { D: d.D, via: 'carretera' };
    } catch (e) { return { D: recta(), via: 'recta*' }; }
  }
  App.distancias = distancias;
  const aviso = (via) => (via === 'recta*' ? ' (sin conexión a OSRM: distancia euclidiana)' : via === 'recta' ? ' (distancia euclidiana)' : ' (por carretera)');
  const huboCambio = (limpiar = true) => { Datos.guardar(S.ds); if (limpiar) App.limpiarResultado(); App.pintarAristas(); if (['nodos', 'aristas', 'matriz', 'cd'].includes(S.panel)) App.renderPanel(); };
  App.huboCambio = huboCambio;

  /* recalcula la fila y columna de un nodo con el resto (ida y vuelta, promedio) */
  async function recalcularNodo(k) {
    const ds = S.ds, n = ds.nodos[k];
    const otros = ds.nodos.map((_, j) => j).filter((j) => j !== k && (!ds.grafoRalo || isFinite(ds.D[k][j]) || isFinite(ds.D[j][k])));
    if (!otros.length) return 'recta';
    const pts = otros.map((j) => [ds.nodos[j].lat, ds.nodos[j].lon]), yo = [[n.lat, n.lon]];
    const ida = await distancias(yo, pts); let vuelta = ida;
    if (ida.via === 'carretera') { const v = await distancias(pts, yo); if (v.via === 'carretera') vuelta = { D: [v.D.map((f) => f[0])] }; }
    otros.forEach((j, q) => { const v = vuelta === ida ? ida.D[0][q] : (ida.D[0][q] + vuelta.D[0][q]) / 2; ds.D[k][j] = v; ds.D[j][k] = v; });
    return ida.via;
  }
  App.recalcularNodo = recalcularNodo;

  /* ---------- centro de distribución: lo decide el usuario ---------- */
  async function colocarDc(lat, lon, k) {
    const ds = S.ds; lat = +lat.toFixed(6); lon = +lon.toFixed(6);
    if (k === undefined || k < 0) k = Datos.dcIdx(ds);
    if (k < 0) { k = Datos.agregarNodo(ds, { nombre: 'Centro de distribución', lat, lon, tipo: 'dc' }); }
    else { ds.nodos[k].lat = lat; ds.nodos[k].lon = lon; }
    chip('Recalculando las distancias del CD…'); const via = await recalcularNodo(k);
    Datos.guardar(ds); App.limpiarResultado(); Mapa.montar(ds, App.callbacksMapa); App.llenarSelects(); $('origen').value = k; App.pintarAristas();
    chip(`CD en ${lat.toFixed(5)}, ${lon.toFixed(5)} · distancias recalculadas${aviso(via)}. Vuelva a resolver.`);
    if (['nodos', 'aristas', 'matriz', 'cd'].includes(S.panel)) App.renderPanel();
    return k;
  }
  App.colocarDc = colocarDc;

  /* ---------- modos del mapa ---------- */
  App.modoActivar = (m) => {
    if (S.modo === m) return App.cancelarModo();
    App.cancelarModo(true); S.modo = m; const d = App.modos[m]; Mapa.cursor('crosshair'); chip(d.texto); App.actualizarHerramientas();
  };
  App.cancelarModo = (silencioso) => {
    if (!S.modo) return; const d = App.modos[S.modo]; S.modo = null; S.aristaA = null; Mapa.cursor(''); d && d.alSalir && d.alSalir(); Mapa.limpiarTmp(); App.pintarSeleccion && App.pintarSeleccion();
    if (!silencioso) chip(S.ds.subtitulo || S.ds.titulo); App.actualizarHerramientas && App.actualizarHerramientas();
  };
  async function agregarNodoEn(lat, lon, nombre) {
      const ds = S.ds, conectar = S.autoConectar ?? !ds.grafoRalo; const k = Datos.agregarNodo(ds, Object.assign({ lat: +lat.toFixed(6), lon: +lon.toFixed(6) }, nombre ? { nombre } : {}));
      if (conectar && k > 0) { const otros = ds.nodos.map((_, j) => j).filter((j) => j !== k); const r = await distancias([[ds.nodos[k].lat, ds.nodos[k].lon]], otros.map((j) => [ds.nodos[j].lat, ds.nodos[j].lon])); otros.forEach((j, q) => { ds.D[k][j] = r.D[0][q]; ds.D[j][k] = r.D[0][q]; }); chip(`Nodo ${ds.nodos[k].id} agregado y conectado con todos${aviso(r.via)}`); }
      else chip(`Nodo ${ds.nodos[k].id} agregado · use «Conectar nodos» para unirlo`);
      Mapa.montar(ds, App.callbacksMapa); App.llenarSelects(); huboCambio(); App.actualizarHerramientas(); return k;
  }
  App.agregarNodoEn = agregarNodoEn;
  App.modos.nodo = { texto: 'Haga clic en el mapa para agregar un nodo · Esc para terminar', click: (ll) => agregarNodoEn(ll.lat, ll.lng) };
  App.modos.arista = { texto: 'Haga clic en un nodo y luego en otro para unirlos con una arista · Esc para terminar', alSalir() { S.aristaA = null; }, click() { S.aristaA = null; Mapa.estiloNodos({ colores: S.colores, tenue: S.tenue }); chip(App.modos.arista.texto); } };
  App.modos.dc = {
    texto: 'Haga clic donde quiere el centro de distribución (también puede arrastrar el marcador «CD») · Esc para terminar',
    async click(ll) { await colocarDc(ll.lat, ll.lng); },
  };
  async function crearArista(a, b) {
    const ds = S.ds; if (a === b) return;
    const r = await distancias([[nodo(a).lat, nodo(a).lon]], [[nodo(b).lat, nodo(b).lon]]);
    Datos.ponerArista(ds, a, b, +r.D[0][0].toFixed(4)); S.aristaA = null; huboCambio(); Mapa.estiloNodos({ colores: S.colores, tenue: S.tenue });
    chip(`Arista ${corto(a)} ${ds.dirigido ? '→' : '—'} ${corto(b)}: ${fmt(r.D[0][0])} ${ds.unidad}${aviso(r.via)}. Edite el costo en la pestaña Aristas.`);
  }

  /* ---------- callbacks del mapa ---------- */
  App.callbacksMapa = {
    clickMapa(ll) { const m = App.modos[S.modo]; if (m && m.click) m.click(ll); },
    dblMapa(ll) { const m = App.modos[S.modo]; if (m && m.dbl) m.dbl(ll); },
    click(i, mk) {
      if (S.modo === 'arista') {
        if (S.aristaA === null || S.aristaA === undefined) { S.aristaA = i; Mapa.estiloNodos({ seleccion: [i], colores: S.colores, tenue: S.tenue }); chip(`Nodo ${corto(i)} elegido · ahora haga clic en el nodo destino`); }
        else crearArista(S.aristaA, i);
        return;
      }
      const n = nodo(i), dc = n.tipo === 'dc';
      Mapa.abrirPopup(i, `<b>${esc(etq(i))}</b><div class="nota">${n.lat.toFixed(5)}, ${n.lon.toFixed(5)}${n.extra ? ' · demanda ' + n.extra : ''}</div><div class="acc"><button class="btn mini" data-s="o">Origen</button><button class="btn mini sec" data-s="d">Destino</button><button class="btn mini gris" data-s="e">Editar</button><button class="btn mini gris" data-s="t">${dc ? 'Dejar de ser CD' : 'Hacer CD'}</button><button class="btn mini peligro" data-s="x">Quitar</button></div>`, (pop) => pop.querySelectorAll('[data-s]').forEach((b) => (b.onclick = async () => {
        mk.closePopup(); const s = b.dataset.s;
        if (s === 'o') { $('origen').value = i; App.pintarSeleccion(); } else if (s === 'd') { $('destino').value = i; App.pintarSeleccion(); } else if (s === 'e') App.setPanel('nodos');
        else if (s === 't') { n.tipo = dc ? 'cliente' : 'dc'; Mapa.montar(S.ds, App.callbacksMapa); huboCambio(); App.llenarSelects(); }
        else if (s === 'x') quitarNodo(i);
      })));
    },
    mover(i, lat, lon) { const n = nodo(i); n.lat = +lat.toFixed(6); n.lon = +lon.toFixed(6); Datos.guardar(S.ds); S.sucio = 'la posición del nodo ' + corto(i); App.pintarAristas(); if (S.panel === 'nodos') App.renderPanel(); chip('Nodo movido: sus distancias no se recalculan solas (pestaña Nodos)'); },
    moverDc(i, lat, lon) { colocarDc(lat, lon, i); },
  };
  App.callbacksCandidatos = { click: (k, mk) => App.candidatoClick && App.candidatoClick(k, mk), mover: (k, lat, lon) => { S.ds.candidatos[k].lat = +lat.toFixed(6); S.ds.candidatos[k].lon = +lon.toFixed(6); Datos.guardar(S.ds); if (S.panel === 'cd') App.renderPanel(); } };

  function quitarNodo(i) {
    if (S.ds.nodos.length <= 2) return App.hoja('<h3>No se puede quitar</h3><p class="nota">Debe quedar al menos 2 nodos.</p><div class="acc"><button class="btn" data-x="c">Entendido</button></div>', () => App.cerrarHoja());
    App.hoja(`<h3>¿Quitar el nodo ${esc(corto(i))}?</h3><p class="nota">${esc(nodo(i).nombre)}. Se quitan también sus aristas y distancias.</p><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn peligro" data-x="ok">Quitar</button></div>`, (x) => {
      App.cerrarHoja(); if (x !== 'ok') return; Datos.quitarNodo(S.ds, i); Mapa.montar(S.ds, App.callbacksMapa); App.llenarSelects(); huboCambio(); });
  }
  App.quitarNodo = quitarNodo;

  /* ---------- aristas en el mapa ---------- */
  App.actualizarStats = () => {
    const e = $('stats'); if (!e || !S.ds) return; const st = Datos.estadisticas(S.ds), u = S.ds.unidad;
    const ext = (a) => (a ? `${corto(a.i)}${S.ds.dirigido ? '→' : '—'}${corto(a.j)}` : '—');
    e.innerHTML = `<div class="caja"><div><b>${st.nodos}</b><span>Nodos</span></div><div><b>${st.aristas}</b><span>Aristas</span></div></div>
      <div class="caja"><div><b>${st.min ? fmt(st.min.costo, 2) : '—'}</b><span>Arista mínima · ${ext(st.min)}</span></div><div><b>${st.max ? fmt(st.max.costo, 2) : '—'}</b><span>Arista máxima · ${ext(st.max)}</span></div></div>`;
  };
  App.pintarAristas = () => {
    App.actualizarStats();
    const ds = S.ds, mostrar = S.mostrarAristas ?? (!ds.completo && ds.nodos.length > 0);
    if (!mostrar) return Mapa.dibujarAristas(null);
    const l = Datos.aristas(ds); if (l.length > 400) { Mapa.dibujarAristas(null); return; }
    Mapa.dibujarAristas(l, ds.dirigido, corto);
  };

  /* ---------- tarjeta de herramientas ---------- */
  App.actualizarHerramientas = () => {
    const c = $('cHerr'); if (!c) return; const ds = S.ds, dc = Datos.dcIdx(ds);
    const on = (m) => (S.modo === m ? ' on' : '');
    c.innerHTML = `<h2>Herramientas</h2>
      <div class="herr">
        <button class="btn sec h${on('nodo')}" data-m="nodo"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>Agregar nodos</button>
        <button class="btn sec h${on('arista')}" data-m="arista"><svg viewBox="0 0 24 24"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M6.5 16.5 17.5 7.5"/></svg>Conectar nodos</button>
        <button class="btn sec h${on('dc')}" data-m="dc"><svg viewBox="0 0 24 24"><path d="M3 10 12 4l9 6v10H3z"/><path d="M9 20v-6h6v6"/></svg>${dc >= 0 ? 'Mover el CD' : 'Colocar CD'}</button>
        <button class="btn sec h${Mapa.editar ? ' on' : ''}" data-m="mover"><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>Mover nodos</button>
      </div>
      <div class="fila" style="margin-top:10px"><label class="campo">Distancias nuevas<select id="hDist"><option value="euclidiana" ${ds.modoDist !== 'carretera' ? 'selected' : ''}>Euclidiana</option><option value="carretera" ${ds.modoDist === 'carretera' ? 'selected' : ''}>Por carretera (OSRM)</option></select></label><label class="campo">Escala de la matriz<input id="hFactor" type="number" step="0.05" min="0.5" value="${ds.factor}"></label></div>
      <label class="check"><input type="checkbox" id="hAuto" ${(S.autoConectar ?? !ds.grafoRalo) ? 'checked' : ''}> Al agregar un nodo, conectarlo con todos</label>
      <label class="check"><input type="checkbox" id="hDir" ${ds.dirigido ? 'checked' : ''}> Aristas dirigidas (con flecha)</label>
      <label class="check"><input type="checkbox" id="hVer" ${(S.mostrarAristas ?? (!ds.completo && ds.nodos.length > 0)) ? 'checked' : ''}> Mostrar las aristas en el mapa</label>`;
    c.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { const m = b.dataset.m; if (m === 'mover') { Mapa.setEditar(!Mapa.editar); App.actualizarHerramientas(); chip(Mapa.editar ? 'Arrastre los nodos para moverlos' : S.ds.subtitulo || S.ds.titulo); } else App.modoActivar(m); }));
    $('hDist').onchange = (e) => { ds.modoDist = e.target.value; Datos.guardar(ds); }; $('hFactor').onchange = (e) => { ds.factor = +e.target.value || 1; S.factor = ds.factor; Datos.guardar(ds); };
    $('hAuto').onchange = (e) => (S.autoConectar = e.target.checked); $('hDir').onchange = (e) => { ds.dirigido = e.target.checked; Datos.guardar(ds); App.pintarAristas(); }; $('hVer').onchange = (e) => { S.mostrarAristas = e.target.checked; App.pintarAristas(); };
  };

  /* ---------- panel Nodos ---------- */
  function pNodos(el) {
    const ds = S.ds, mt = App.modoPesos(), vt = mt && ds.vt.usar;
    let h = `<div class="nota" style="margin-bottom:8px">${mt ? 'Con <b>m-TSP</b> puede editar el <b>peso</b> (carga) de cada nodo' + (vt ? ' y su <b>franja horaria</b> (marque/desmarque VT)' : '') + '.' : 'Con <b>TSP</b> el peso de todos los nodos es <b>1</b> (no llevan carga): no se edita. Elija m-TSP para cambiarlo.'}</div>`;
    if (vt) h += `<div class="fila" style="align-items:flex-end"><label class="campo">Franja común desde<input id="vtDesde" type="time" value="08:00"></label><label class="campo">hasta<input id="vtHasta" type="time" value="12:00"></label><button class="btn mini" id="vtAplicar">Aplicar a todos</button><button class="btn mini sec" id="vtMarcar">Marcar todos</button><button class="btn mini gris" id="vtDesmarcar">Desmarcar todos</button></div>`;
    if (S.sucio) h += `<div class="aviso">Cambió ${esc(S.sucio)}. Las distancias <b>no se recalculan solas</b>.<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center"><button class="btn mini" id="bRecRecta">Matriz euclidiana</button><button class="btn mini sec" id="bRecOsrm">Por carretera (OSRM)</button><button class="btn mini gris" id="bIgnorar">Ignorar</button></div></div>`;
    h += `<table><tr><th>ID</th><th>Tipo</th><th>Nombre</th><th>Lat</th><th>Lon</th><th>Peso</th><th>Bal.</th>${vt ? '<th>VT</th><th>Desde</th><th>Hasta</th>' : ''}<th></th></tr>` + ds.nodos.map((n, i) => `<tr><td><b>${esc(n.id)}</b></td><td><select data-i="${i}" data-f="tipo" style="min-height:28px;padding:2px 22px 2px 6px"><option value="cliente" ${n.tipo !== 'dc' ? 'selected' : ''}>Cliente</option><option value="dc" ${n.tipo === 'dc' ? 'selected' : ''}>CD</option></select></td><td><input data-i="${i}" data-f="nombre" value="${esc(n.nombre)}"></td><td><input data-i="${i}" data-f="lat" value="${n.lat}" inputmode="decimal" style="width:84px"></td><td><input data-i="${i}" data-f="lon" value="${n.lon}" inputmode="decimal" style="width:84px"></td><td><input data-i="${i}" data-f="peso" value="${mt ? n.peso : 1}" inputmode="decimal" style="width:52px" ${mt ? '' : 'readonly class="bloq" title="En TSP el peso es 1"'}></td><td><input data-i="${i}" data-f="balance" value="${n.balance}" inputmode="decimal" style="width:52px"></td>${vt ? `<td><input type="checkbox" data-i="${i}" data-f="vtOn" ${n.vtOn ? 'checked' : ''}></td><td><input type="time" data-i="${i}" data-f="vtA" value="${App.hhmm(n.vtA)}" ${n.vtOn ? '' : 'disabled'} style="width:96px"></td><td><input type="time" data-i="${i}" data-f="vtB" value="${App.hhmm(n.vtB)}" ${n.vtOn ? '' : 'disabled'} style="width:96px"></td>` : ''}<td><button class="btn mini peligro" data-del="${i}" aria-label="Quitar nodo">✕</button></td></tr>`).join('') + '</table>';
    h += `<div class="sep"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn mini gris" id="bRestaurar">${ds.parcial ? 'Restaurar datos originales' : 'Vaciar proyecto'}</button></div>`;
    el.innerHTML = h;
    el.querySelectorAll('[data-i]').forEach((inp) => (inp.onchange = () => editarNodo(+inp.dataset.i, inp.dataset.f, inp.type === 'checkbox' ? inp.checked : inp.value, inp)));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => quitarNodo(+b.dataset.del)));
    if (vt) {
      const todos = (f) => { ds.nodos.forEach((n, i) => { if (n.tipo !== 'dc') f(n); }); Datos.guardar(ds); App.renderPanel(); };
      $('vtAplicar').onclick = () => todos((n) => { n.vtA = App.horas($('vtDesde').value); n.vtB = App.horas($('vtHasta').value); n.vtOn = true; });
      $('vtMarcar').onclick = () => todos((n) => (n.vtOn = true)); $('vtDesmarcar').onclick = () => todos((n) => (n.vtOn = false));
    }
    $('bRestaurar').onclick = () => App.hoja(ds.parcial ? '<h3>¿Restaurar los datos originales?</h3><p class="nota">Se descartan nodos, distancias, candidatos, área e imagen de este conjunto.</p><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn" data-x="ok">Restaurar</button></div>' : '<h3>¿Vaciar el proyecto?</h3><p class="nota">Se quitan todos los nodos y aristas.</p><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn peligro" data-x="ok">Vaciar</button></div>', (x) => {
      App.cerrarHoja(); if (x !== 'ok') return; if (ds.parcial) Datos.restaurar(ds); else { ds.nodos = []; ds.D = []; ds.cap = null; ds.pesoArista = null; ds.candidatos = []; } S.sucio = null; Datos.guardar(ds); App.limpiarResultado(); App.cargarProyectoEnVista(true); });
    if ($('bRecRecta')) { $('bRecRecta').onclick = () => recalcularTodo('euclidiana'); $('bRecOsrm').onclick = () => recalcularTodo('carretera'); $('bIgnorar').onclick = () => { S.sucio = null; App.renderPanel(); }; }
  }
  function editarNodo(i, f, v, inp) {
    const n = nodo(i);
    if (f === 'nombre') n.nombre = v;
    else if (f === 'tipo') { n.tipo = v === 'dc' ? 'dc' : 'cliente'; Mapa.montar(S.ds, App.callbacksMapa); App.llenarSelects(); }
    else if (f === 'vtOn') { n.vtOn = !!v; Datos.guardar(S.ds); return App.renderPanel(); }
    else if (f === 'vtA' || f === 'vtB') { n[f] = App.horas(v); if (n.vtB < n.vtA) { n.vtB = n.vtA; } Datos.guardar(S.ds); return App.renderPanel(); }
    else if (f === 'peso') { const x = Number(String(v).replace(',', '.')); if (!(x > 0)) { inp.value = n.peso; return; } n.peso = x; Datos.guardar(S.ds); App.limpiarResultado(); return; }
    else { const x = Number(String(v).replace(',', '.')); if (!isFinite(x) || (f === 'lat' && Math.abs(x) > 90) || (f === 'lon' && Math.abs(x) > 180)) { inp.value = n[f]; return; } n[f] = x; }
    Datos.guardar(S.ds); Mapa.actualizarNodo(i); App.llenarSelects(); App.pintarAristas();
    if (f === 'lat' || f === 'lon') { if (n.tipo === 'dc') return colocarDc(n.lat, n.lon, i); S.sucio = 'la posición de un nodo'; App.renderPanel(); }
  }
  async function recalcularTodo(modo) {
    const ds = S.ds, previo = ds.modoDist; ds.modoDist = modo; chip('Calculando distancias…');
    const pts = ds.nodos.map((n) => [n.lat, n.lon]); let via = modo;
    if (modo === 'carretera' && pts.length > 90) { chip('Con más de 90 nodos use la matriz euclidiana (límite del servicio de rutas).'); ds.modoDist = previo; return; }
    const r = await distancias(pts, pts); via = r.via;
    r.D.forEach((f, i) => f.forEach((v, j) => { if (i !== j && (!ds.grafoRalo || isFinite(ds.D[i][j]))) ds.D[i][j] = +v.toFixed(4); }));
    ds.modoDist = via === 'carretera' ? 'carretera' : 'euclidiana'; S.sucio = null; huboCambio(); chip('Matriz recalculada' + aviso(via));
  }

  /* ---------- panel Aristas ---------- */
  function pAristas(el) {
    const ds = S.ds, n = ds.nodos.length, todas = Datos.aristas(ds), filtro = S.filtroArista ?? '', lista = todas.filter((a) => filtro === '' || String(a.i) === String(filtro) || String(a.j) === String(filtro));
    const opts = (sel) => ds.nodos.map((x, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(etq(i))}</option>`).join('');
    let h = `<div class="nota" style="margin-bottom:8px">${todas.length} ${ds.dirigido ? 'arcos' : 'aristas'}${ds.completo ? ' (grafo completo)' : ''}. El <b>costo</b> es la distancia (matriz ${ds.modoDist === 'carretera' ? 'por carretera' : 'euclidiana'}); el <b>peso</b> multiplica el costo en el m-TSP ${App.modoPesos() ? '(editable)' : '— en TSP vale 1, no se edita'}; la <b>capacidad</b> solo se usa en problemas de flujo.</div>
      <div class="fila"><label class="campo">Desde<select id="aDe">${opts('')}</select></label><label class="campo">Hasta<select id="aA">${opts(Math.min(1, n - 1))}</select></label><label class="campo">Costo (vacío = automático)<input id="aC" inputmode="decimal"></label><label class="campo">Capacidad<input id="aK" inputmode="decimal"></label></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn mini" id="aAdd">+ Agregar arista</button><button class="btn mini sec" id="aTodas">Conectar todos con todos</button><button class="btn mini peligro" id="aNinguna">Quitar todas</button></div>
      <div class="fila"><label class="campo">Ver solo las del nodo<select id="aFiltro"><option value="">Todas</option>${opts(filtro)}</select></label></div>`;
    h += `<table><tr><th>Desde</th><th>Hasta</th><th>Costo</th><th>Peso</th><th>Cap.</th><th></th></tr>` + lista.slice(0, 250).map((a) => `<tr><td>${esc(corto(a.i))}</td><td>${esc(corto(a.j))}</td><td><input data-i="${a.i}" data-j="${a.j}" data-f="c" value="${+a.costo.toFixed(4)}" inputmode="decimal" style="width:74px"></td><td><input data-i="${a.i}" data-j="${a.j}" data-f="w" value="${App.modoPesos() && ds.pesoArista ? ds.pesoArista[a.i][a.j] : 1}" inputmode="decimal" style="width:52px" ${App.modoPesos() ? '' : 'readonly class="bloq" title="En TSP el peso es 1"'}></td><td><input data-i="${a.i}" data-j="${a.j}" data-f="k" value="${isFinite(a.cap) ? a.cap : ''}" inputmode="decimal" style="width:60px"></td><td><button class="btn mini peligro" data-del="${a.i},${a.j}" aria-label="Quitar arista">✕</button></td></tr>`).join('') + '</table>' + (lista.length > 250 ? `<p class="nota">Se muestran 250 de ${lista.length}; filtre por nodo.</p>` : '');
    el.innerHTML = h;
    $('aFiltro').onchange = (e) => { S.filtroArista = e.target.value; App.renderPanel(); };
    $('aAdd').onclick = async () => {
      const a = +$('aDe').value, b = +$('aA').value; if (a === b) return chip('Elija dos nodos distintos');
      let c = $('aC').value.trim() === '' ? null : Number($('aC').value.replace(',', '.')); let via = '';
      if (c === null) { const r = await distancias([[nodo(a).lat, nodo(a).lon]], [[nodo(b).lat, nodo(b).lon]]); c = +r.D[0][0].toFixed(4); via = aviso(r.via); }
      const k = $('aK').value.trim() === '' ? INF : Number($('aK').value.replace(',', '.')); Datos.ponerArista(ds, a, b, c, isFinite(k) ? k : (ds.cap ? INF : undefined)); huboCambio(); chip(`Arista ${corto(a)}–${corto(b)}: ${fmt(c)}${via}`);
    };
    $('aTodas').onclick = async () => { chip('Conectando todos con todos…'); const pts = ds.nodos.map((x) => [x.lat, x.lon]), r = await distancias(pts, pts); r.D.forEach((f, i) => f.forEach((v, j) => { if (i !== j) ds.D[i][j] = +v.toFixed(4); })); huboCambio(); chip('Grafo completo' + aviso(r.via)); };
    $('aNinguna').onclick = () => { ds.D.forEach((f, i) => f.forEach((_, j) => (f[j] = INF))); if (ds.cap) ds.cap.forEach((f, i) => f.forEach((_, j) => (f[j] = INF))); huboCambio(); };
    el.querySelectorAll('input[data-f]').forEach((inp) => (inp.onchange = () => {
      const i = +inp.dataset.i, j = +inp.dataset.j;
      if (inp.dataset.f === 'w') { const v = Number(inp.value.replace(',', '.')); if (!(v > 0)) { inp.value = ds.pesoArista ? ds.pesoArista[i][j] : 1; return; } Datos.ponerPesoArista(ds, i, j, v); Datos.guardar(ds); App.limpiarResultado(); return; }
      if (inp.dataset.f === 'c') { const v = Number(inp.value.replace(',', '.')); if (!isFinite(v) || v < 0) { inp.value = ds.D[i][j]; return; } Datos.ponerArista(ds, i, j, v); }
      else { const v = inp.value.trim() === '' ? INF : Number(inp.value.replace(',', '.')); if (isNaN(v) || v < 0) { inp.value = ''; return; } Datos.ponerArista(ds, i, j, ds.D[i][j], v); }
      Datos.guardar(ds); App.limpiarResultado();
    }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { const [i, j] = b.dataset.del.split(',').map(Number); Datos.quitarArista(ds, i, j); huboCambio(); }));
  }

  /* ---------- panel Matriz ---------- */
  function pMatriz(el) {
    const ds = S.ds;
    const orig = ds.parcial ? '<option value="original">Carretera (datos originales del parcial)</option>' : '';
    el.innerHTML = `<div class="fila"><label class="campo" style="flex-basis:100%">Tipo de matriz de distancias<select id="tipoMatriz"><option value="euclidiana" ${ds.modoDist !== 'carretera' ? 'selected' : ''}>Euclidiana (km sobre el plano de las coordenadas)</option>${orig}<option value="carretera" ${ds.modoDist === 'carretera' ? 'selected' : ''}>Por carretera (OSRM, requiere internet)</option></select></label></div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><label class="check" style="flex:none"><input type="checkbox" id="chkSim" ${S.simetrica !== false ? 'checked' : ''}> Mantener simétrica</label><span class="nota">Edite una celda; <b>#</b> = no hay arco.</span></div><div class="matriz-wrap"><table class="matriz"><tr><th></th>${ds.nodos.map((x) => `<th title="${esc(x.nombre)}">${esc(x.tipo === 'dc' ? 'CD' : x.id)}</th>`).join('')}</tr>${ds.D.map((f, i) => `<tr><td title="${esc(ds.nodos[i].nombre)}">${esc(ds.nodos[i].tipo === 'dc' ? 'CD' : ds.nodos[i].id)}</td>${f.map((v, j) => (i === j ? '<td class="diag"></td>' : `<td><input data-i="${i}" data-j="${j}" value="${isFinite(v) ? v : '#'}" inputmode="decimal"></td>`)).join('')}</tr>`).join('')}</table></div>`;
    $('tipoMatriz').onchange = (e) => { const v = e.target.value; if (v === 'original') { ds.D = Datos.aInf(ds.original.D); ds.modoDist = 'carretera'; Datos.guardar(ds); App.huboCambio(); chip('Matriz original por carretera restaurada'); } else recalcularTodo(v); };
    $('chkSim').onchange = (e) => (S.simetrica = e.target.checked);
    el.querySelectorAll('input[data-i]').forEach((inp) => (inp.onchange = () => {
      const i = +inp.dataset.i, j = +inp.dataset.j, v = Datos.num(inp.value); inp.value = isFinite(v) ? v : '#'; ds.D[i][j] = v;
      if (S.simetrica !== false) { ds.D[j][i] = v; const o = el.querySelector(`input[data-i="${j}"][data-j="${i}"]`); if (o) o.value = inp.value; }
      Datos.guardar(ds); S.res = null; Mapa.limpiarRutas(); App.pintarAristas(); chip('Matriz editada: vuelva a resolver');
    }));
  }

  App.paneles.push({ id: 'nodos', titulo: 'Nodos', render: pNodos }, { id: 'aristas', titulo: 'Aristas', render: pAristas }, { id: 'matriz', titulo: 'Matriz', render: pMatriz });
})();
