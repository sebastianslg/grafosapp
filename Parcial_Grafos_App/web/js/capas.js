/* Capas del mapa: búsqueda de lugares, mapa base, imagen de fondo y área de estudio (delimitación). */
(function () {
  'use strict';
  const { S, $, esc, fmt, nodo, chip } = App;
  const BASES_ETQ = { calles: 'Calles', satelite: 'Satélite', topo: 'Topográfico', ninguno: 'Sin mapa' };
  S.resBusqueda = []; S.editarFondo = false;

  /* ================= búsqueda ================= */
  function construirBusqueda() {
    $('cBusca').innerHTML = `<h2>Buscar en el mapa</h2>
      <form id="fBusca" class="busca"><input id="bq" placeholder="Dirección, barrio, ciudad, lugar…" autocomplete="off" aria-label="Buscar en el mapa"><button class="btn" type="submit">Buscar</button></form>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="bAcotar"> Buscar solo dentro del área (o de la vista actual)</label><div id="bRes"></div>`;
    $('fBusca').onsubmit = (e) => { e.preventDefault(); buscar(); };
  }
  async function buscar() {
    const q = $('bq').value.trim(); if (!q) return; const res = $('bRes'); res.innerHTML = '<p class="nota">Buscando…</p>';
    const ds = S.ds, v = Mapa.vista(); let vb = null;
    if ($('bAcotar').checked) { if (ds.area && ds.area.length > 2) { const b = Datos.bboxArea(ds.area); vb = [b[1], b[0], b[3], b[2]]; } else vb = [v.w, v.s, v.e, v.n]; }
    try {
      const r = await fetch('/api/buscar', { method: 'POST', body: JSON.stringify({ q, viewbox: vb, acotar: !!vb, limite: 6 }) }), d = await r.json();
      if (!r.ok) throw new Error(d.error || 'La búsqueda falló');
      S.resBusqueda = d.resultados; Mapa.marcarBusqueda(d.resultados, (k) => resaltarRes(k));
      if (!d.resultados.length) { res.innerHTML = '<p class="nota">Sin resultados' + (vb ? ' dentro del área. Pruebe sin acotar.' : '.') + '</p>'; return; }
      res.innerHTML = d.resultados.map((r, k) => `<div class="res" data-k="${k}"><div class="rn"><b>${k + 1}</b> ${esc(r.nombre)}</div><div class="rb"><button class="btn mini" data-a="ir">Ir</button><button class="btn mini sec" data-a="nodo">+ Nodo</button><button class="btn mini sec" data-a="cd">CD aquí</button><button class="btn mini gris" data-a="area">Usar como área</button></div></div>`).join('') + '<button class="btn mini gris" id="bLimpiar" style="margin-top:6px">Limpiar resultados</button>';
      res.querySelectorAll('.res [data-a]').forEach((b) => (b.onclick = () => accionRes(+b.closest('.res').dataset.k, b.dataset.a)));
      $('bLimpiar').onclick = () => { S.resBusqueda = []; Mapa.limpiarBusqueda(); res.innerHTML = ''; };
      Mapa.map.flyToBounds(L.latLngBounds(d.resultados.map((x) => [x.lat, x.lon])).pad(0.4), { duration: App.reducir() ? 0 : 0.9, maxZoom: 16 });
    } catch (e) { res.innerHTML = `<p class="nota">No se pudo buscar (${esc(e.message)}). La búsqueda necesita internet.</p>`; }
  }
  function resaltarRes(k) { const el = document.querySelector(`#bRes .res[data-k="${k}"]`); if (el) { document.querySelectorAll('#bRes .res').forEach((x) => x.classList.remove('activa')); el.classList.add('activa'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
  async function accionRes(k, a) {
    const r = S.resBusqueda[k]; if (!r) return; const corto = r.nombre.split(',')[0];
    if (a === 'ir') Mapa.map.flyTo([r.lat, r.lon], Math.max(Mapa.map.getZoom(), 16), { duration: App.reducir() ? 0 : 0.9 });
    else if (a === 'nodo') await App.agregarNodoEn(r.lat, r.lon, corto);
    else if (a === 'cd') await App.colocarDc(r.lat, r.lon);
    else if (a === 'area') { const [s, n, w, e] = r.bbox; if (Math.abs(n - s) < 1e-4 || Math.abs(e - w) < 1e-4) return chip('Ese resultado es un punto: dibuje el área a mano o pruebe con una ciudad o barrio'); fijarArea([[s, w], [s, e], [n, e], [n, w]]); Mapa.map.flyToBounds([[s, w], [n, e]], { duration: App.reducir() ? 0 : 0.9 }); }
  }

  /* ================= área de estudio ================= */
  let pts = [];
  function fijarArea(area) {
    const ds = S.ds; ds.area = area && area.length >= 3 ? area.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]) : null; Datos.guardar(ds); Mapa.limpiarTmp(); App.montarExtras();
    if (S.panel === 'mapa') App.renderPanel(); if (ds.area) chip(`Área definida: ${fmt(Datos.superficieKm2(ds.area), 2)} km² · ${dentroFuera().dentro} de ${ds.nodos.length} nodos dentro`); else chip('Área borrada');
  }
  App.fijarArea = fijarArea;
  const dentroFuera = () => { const ds = S.ds; if (!ds.area) return { dentro: ds.nodos.length, fuera: 0, idx: [] }; const f = ds.nodos.map((n, i) => (Datos.dentro(ds.area, n.lat, n.lon) ? -1 : i)).filter((i) => i >= 0); return { dentro: ds.nodos.length - f.length, fuera: f.length, idx: f }; };
  App.alEditarArea = (k, lat, lon) => { const a = S.ds.area.map((p) => p.slice()); if (lat === null) a.splice(k, 1); else a[k] = [lat, lon]; fijarArea(a); };
  const cerrarPoligono = () => { if (pts.length >= 3) { const a = pts; pts = []; App.cancelarModo(); fijarArea(a); } else chip('Un polígono necesita al menos 3 puntos'); };
  App.modos.area = {
    texto: 'Haga clic para marcar los vértices del área · doble clic o Enter para cerrarla · Esc cancela',
    click(ll) { const p = [+ll.lat.toFixed(6), +ll.lng.toFixed(6)]; if (pts.length >= 3 && Mapa.map.distance(ll, pts[0]) < 12 * (40075016 / 256 / 2 ** Mapa.map.getZoom())) return cerrarPoligono(); pts.push(p); Mapa.tmp(pts, false); },
    dbl() { cerrarPoligono(); }, alSalir() { pts = []; },
  };
  App.modos.rect = {
    texto: 'Haga clic en una esquina y luego en la esquina opuesta · Esc cancela',
    click(ll) { if (!pts.length) { pts = [[ll.lat, ll.lng]]; Mapa.tmp(pts, false); return; } const [a] = pts, s = Math.min(a[0], ll.lat), n = Math.max(a[0], ll.lat), w = Math.min(a[1], ll.lng), e = Math.max(a[1], ll.lng); pts = []; App.cancelarModo(); fijarArea([[s, w], [s, e], [n, e], [n, w]]); },
    alSalir() { pts = []; },
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.modo === 'area' && document.activeElement === document.body) cerrarPoligono(); });

  /* ================= imagen de fondo ================= */
  async function cargarImagen(file) {
    try {
      const img = await Datos.leerImagen(file, 1800), v = Mapa.vista(), c = v.centro, cosl = Math.cos(c.lat * Math.PI / 180), aspecto = img.ancho / img.alto;
      let h = (v.n - v.s) * 0.7, w = h * aspecto / cosl; if (w > (v.e - v.w) * 0.7) { w = (v.e - v.w) * 0.7; h = w * cosl / aspecto; }
      S.ds.fondo = { src: img.src, bounds: [[c.lat - h / 2, c.lng - w / 2], [c.lat + h / 2, c.lng + w / 2]], opacidad: 0.6, ancho: img.ancho, alto: img.alto, nombre: file.name };
      S.editarFondo = true; const ok = Datos.guardar(S.ds); App.montarExtras(); App.renderPanel();
      chip(ok ? 'Imagen colocada: arrastre las esquinas y el centro para ubicarla sobre el mapa' : 'Imagen colocada, pero es muy grande para guardarse al cerrar: use una más pequeña o guarde el proyecto (.json)');
    } catch (e) { chip('No se pudo leer la imagen: ' + e.message); }
  }
  App.alEditarFondo = (b) => { S.ds.fondo.bounds = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]; Datos.guardar(S.ds); const f = document.getElementById('fbN'); if (f) actualizarCajas(); };
  const actualizarCajas = () => { const [[s, w], [n, e]] = S.ds.fondo.bounds; $('fbN').value = n.toFixed(6); $('fbS').value = s.toFixed(6); $('fbE').value = e.toFixed(6); $('fbW').value = w.toFixed(6); };

  /* ================= panel Mapa ================= */
  function pMapa(el) {
    const ds = S.ds, f = ds.fondo, a = ds.area, df = dentroFuera();
    el.innerHTML = `<h3 style="font-size:15px;margin-bottom:8px">Mapa base</h3>
      <div class="segmentado peq" id="sBase" style="flex-wrap:wrap">${Object.entries(BASES_ETQ).map(([k, t]) => `<button role="tab" data-b="${k}" aria-selected="${ds.base === k}" style="position:relative">${t}</button>`).join('')}</div>
      <div class="sep"></div><h3 style="font-size:15px;margin-bottom:6px">Imagen de fondo</h3>
      <p class="nota">Coloque un plano, una foto aérea o un croquis y úselo de fondo para construir el grafo. Con «Sin mapa» la imagen queda como único fondo.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn mini" id="fElegir">${f ? 'Cambiar imagen…' : 'Elegir imagen…'}</button>${f ? `<button class="btn mini sec" id="fAjustar">Ajustar a la vista</button><button class="btn mini ${S.editarFondo ? '' : 'gris'}" id="fEditar">${S.editarFondo ? 'Terminar de ubicar' : 'Ubicar / escalar'}</button><button class="btn mini peligro" id="fQuitar">Quitar</button>` : ''}</div>
      <input type="file" id="fArchivo" accept="image/*" class="oculto">
      ${f ? `<label class="campo" style="margin-bottom:8px">Opacidad (${Math.round((f.opacidad ?? 0.6) * 100)} %)<input type="range" id="fOp" min="0.05" max="1" step="0.05" value="${f.opacidad ?? 0.6}"></label>
      <div class="fila"><label class="campo">Norte (lat)<input id="fbN" inputmode="decimal"></label><label class="campo">Sur (lat)<input id="fbS" inputmode="decimal"></label><label class="campo">Este (lon)<input id="fbE" inputmode="decimal"></label><label class="campo">Oeste (lon)<input id="fbW" inputmode="decimal"></label></div><p class="nota">Arrastre las esquinas para escalar y el cuadro central para mover; o escriba los límites exactos.</p>` : ''}
      <div class="sep"></div><h3 style="font-size:15px;margin-bottom:6px">Área de estudio (delimitar)</h3>
      <p class="nota">Delimite la zona de trabajo. Se usa para acotar la búsqueda, generar candidatos a centro de distribución y revisar qué nodos quedan dentro.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn mini ${S.modo === 'area' ? '' : 'sec'}" id="zPol">Dibujar polígono</button><button class="btn mini ${S.modo === 'rect' ? '' : 'sec'}" id="zRect">Rectángulo</button><button class="btn mini sec" id="zVista">Usar la vista actual</button>${a ? '<button class="btn mini peligro" id="zBorrar">Borrar área</button>' : ''}</div>
      ${a ? `<div class="kpis"><div class="kpi"><b>${fmt(Datos.superficieKm2(a), 2)}</b><span>km² · ${a.length} vértices</span></div><div class="kpi ${df.fuera ? 'aviso' : 'ok'}"><b>${df.dentro} / ${ds.nodos.length}</b><span>nodos dentro</span></div></div>${df.fuera ? `<div class="aviso">${df.fuera} nodo(s) fuera del área. <button class="btn mini peligro" id="zQuitar">Quitar los de fuera</button></div>` : ''}<p class="nota">Arrastre los vértices para ajustar el área; clic derecho sobre uno lo elimina.</p>` : '<p class="nota">Sin área definida.</p>'}`;
    el.querySelectorAll('#sBase [data-b]').forEach((b) => (b.onclick = () => { ds.base = b.dataset.b; Datos.guardar(ds); Mapa.setBase(ds.base); App.renderPanel(); }));
    $('fElegir').onclick = () => $('fArchivo').click(); $('fArchivo').onchange = (e) => { const x = e.target.files[0]; e.target.value = ''; if (x) cargarImagen(x); };
    if (f) {
      actualizarCajas();
      $('fOp').oninput = (e) => { f.opacidad = +e.target.value; Mapa.opacidadFondo(f.opacidad); e.target.parentElement.firstChild.textContent = `Opacidad (${Math.round(f.opacidad * 100)} %)`; }; $('fOp').onchange = () => Datos.guardar(ds);
      $('fQuitar').onclick = () => { ds.fondo = null; S.editarFondo = false; Datos.guardar(ds); App.montarExtras(); App.renderPanel(); };
      $('fEditar').onclick = () => { S.editarFondo = !S.editarFondo; App.montarExtras(); App.renderPanel(); };
      $('fAjustar').onclick = () => { const v = Mapa.vista(), cosl = Math.cos(v.centro.lat * Math.PI / 180), asp = f.ancho / f.alto; let h = (v.n - v.s) * 0.9, w = h * asp / cosl; if (w > (v.e - v.w) * 0.9) { w = (v.e - v.w) * 0.9; h = w * cosl / asp; } f.bounds = [[v.centro.lat - h / 2, v.centro.lng - w / 2], [v.centro.lat + h / 2, v.centro.lng + w / 2]]; Datos.guardar(ds); App.montarExtras(); actualizarCajas(); };
      ['fbN', 'fbS', 'fbE', 'fbW'].forEach((id) => ($(id).onchange = () => { const n = +$('fbN').value, s = +$('fbS').value, e = +$('fbE').value, w = +$('fbW').value; if (n > s && e > w) { f.bounds = [[s, w], [n, e]]; Datos.guardar(ds); App.montarExtras(); } else actualizarCajas(); }));
    }
    $('zPol').onclick = () => App.modoActivar('area'); $('zRect').onclick = () => App.modoActivar('rect');
    $('zVista').onclick = () => { const v = Mapa.vista(), dy = (v.n - v.s) * 0.1, dx = (v.e - v.w) * 0.1; fijarArea([[v.s + dy, v.w + dx], [v.s + dy, v.e - dx], [v.n - dy, v.e - dx], [v.n - dy, v.w + dx]]); };
    if (a) { $('zBorrar').onclick = () => fijarArea(null); if ($('zQuitar')) $('zQuitar').onclick = () => App.hoja(`<h3>¿Quitar ${df.fuera} nodo(s) fuera del área?</h3><p class="nota">Se eliminan con sus aristas y distancias.</p><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn peligro" data-x="ok">Quitar</button></div>`, (x) => { App.cerrarHoja(); if (x !== 'ok') return; [...df.idx].sort((p, q) => q - p).forEach((i) => Datos.quitarNodo(ds, i)); Mapa.montar(ds, App.callbacksMapa); App.llenarSelects(); App.huboCambio(); }); }
  }
  App.paneles.push({ id: 'mapa', titulo: 'Mapa', render: pMapa });
  App.alRenderPanel = (p) => { const ed = p === 'mapa'; if (ed !== S.vertEdit) { S.vertEdit = ed; if (S.ds) App.montarExtras(); } };

  App.construirBusqueda = construirBusqueda;
})();
