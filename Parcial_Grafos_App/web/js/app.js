/* Núcleo de la interfaz: estado, solver, problemas, resultados, hojas modales, importar y exportar. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const INF = Infinity, COL = Mapa.COL;
  const S = { clave: 'cali', sets: {}, ds: null, res: null, panel: 'resultado', worker: null, motor: null, puedeInstalar: false, corriendo: false, corrId: 0, sel: { origen: 0, destino: 0 },
    rutaSel: 0, sucio: null, factor: 1, modo: null, colores: null, tenue: null, pendiente: null, simetrica: true };
  const fmt = (v, d = 3) => (isFinite(v) ? Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nodo = (i) => S.ds.nodos[i];
  const etq = (i) => (nodo(i).tipo === 'dc' ? `CD · ${nodo(i).nombre}` : `${nodo(i).id} · ${nodo(i).nombre}`);
  const corto = (i) => (nodo(i).tipo === 'dc' ? 'CD' : String(nodo(i).id));
  const idx = (v) => S.ds.nodos.findIndex((n) => String(n.id) === String(v));
  const reducir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chip = (t) => { $('chipMapa').textContent = t; };

  const App = window.App = { S, $, esc, fmt, nodo, etq, corto, idx, chip, COL, paneles: [], reducir };

  /* ================= control segmentado con indicador deslizante ================= */
  App.indicador = (nav) => { const sel = nav.querySelector('[aria-selected="true"]'), ind = nav.querySelector('.ind'); if (!sel || !ind) return; ind.style.width = sel.offsetWidth + 'px'; ind.style.transform = `translateX(${sel.offsetLeft}px)`; };
  App.segmentado = (nav, alCambiar) => {
    nav.addEventListener('click', (e) => { const b = e.target.closest('button[role="tab"]'); if (!b) return; nav.querySelectorAll('button[role="tab"]').forEach((x) => x.setAttribute('aria-selected', x === b)); App.indicador(nav); alCambiar(b); });
    new ResizeObserver(() => App.indicador(nav)).observe(nav); requestAnimationFrame(() => App.indicador(nav));
  };

  /* ================= tema ================= */
  const tema = (t) => { if (t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('parcial-grafos:tema', t); } catch (e) { /* */ } } };
  try { tema(localStorage.getItem('parcial-grafos:tema')); } catch (e) { /* */ }
  $('bTema').onclick = () => { const o = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; tema(o ? 'light' : 'dark'); };

  /* ================= hoja modal y menú ================= */
  App.hoja = (html, alAccion) => {
    const h = $('hoja'); h.innerHTML = html; $('velo').classList.add('abierto');
    h.onclick = (e) => { const b = e.target.closest('[data-x]'); if (b && alAccion) alAccion(b.dataset.x, h); };
    const f = h.querySelector('input,select,button'); f && f.focus();
  };
  App.cerrarHoja = () => $('velo').classList.remove('abierto');
  $('velo').onclick = (e) => { if (e.target === $('velo')) App.cerrarHoja(); };
  App.menu = (btn, items, alElegir, lado) => {
    const m = $('menuExp'), r = btn.getBoundingClientRect();
    m.innerHTML = items.map((it) => (it === '-' ? '<hr>' : `<button role="menuitem" data-a="${it[0]}">${it[1]}</button>`)).join('');
    m.style.top = r.bottom + 8 + 'px'; m.style.right = lado === 'izq' ? 'auto' : innerWidth - r.right + 'px'; m.style.left = lado === 'izq' ? r.left + 'px' : 'auto'; m.classList.add('abierto');
    m.onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) { App.cerrarMenu(); alElegir(b.dataset.a); } };
  };
  App.cerrarMenu = () => $('menuExp').classList.remove('abierto');
  document.addEventListener('click', (e) => { if (!e.target.closest('#menuExp') && !e.target.closest('[data-menu]')) App.cerrarMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { App.cerrarHoja(); App.cerrarMenu(); App.cancelarModo && App.cancelarModo(); } });

  /* ================= solver (worker) ================= */
  const pill = (estado, texto) => { const p = $('pMotor'); p.className = 'pill ' + estado; p.querySelector('span').textContent = texto; };
  App.crearWorker = () => {
    if (S.worker) S.worker.terminate();
    const forzar = new URLSearchParams(location.search).get('motor') || 'auto';
    const w = new Worker('js/worker.js'); S.worker = w; S.motor = null; pill('', 'Iniciando solver…');
    w.onmessage = (e) => {
      const d = e.data;
      if (d.tipo === 'listo') {
        S.motor = d.motor; S.puedeInstalar = !!d.puedeInstalar;
        pill(d.motor ? 'ok' : 'mal', d.motor === 'wasm' ? 'HiGHS · en el navegador' : d.motor === 'servidor' ? 'HiGHS · Python local' : 'Solver no disponible');
        if (!d.motor) ofrecerInstalar(d.detalle);
      } else if (d.tipo === 'log') logLinea(d.s);
      else if (d.tipo === 'fin') terminar(d.res);
      else if (d.tipo === 'error') terminarError(d.msg);
    };
    w.postMessage({ tipo: 'iniciar', motor: forzar });
  };
  $('pMotor').onclick = () => { if (!S.motor) ofrecerInstalar(''); };
  function ofrecerInstalar(detalle) {
    App.hoja(`<h3>El solver no pudo iniciar</h3><p class="nota">El navegador no pudo ejecutar el solver incluido (WebAssembly)${detalle ? ': ' + esc(detalle) : ''}.</p>
      <p>Puede instalar <b>highspy</b> (el mismo solver HiGHS, para Python) con <code>pip</code>. Se hace una sola vez y requiere internet.</p>
      <div class="acc"><button class="btn gris" data-x="cerrar">Ahora no</button>${S.puedeInstalar ? '<button class="btn" data-x="instalar">Instalar y continuar</button>' : ''}</div><div id="msgInst" class="nota"></div>`,
      async (x, h) => {
        if (x === 'cerrar') return App.cerrarHoja();
        if (x === 'instalar') {
          h.querySelector('#msgInst').textContent = 'Instalando highspy… (puede tardar un minuto)'; h.querySelectorAll('button').forEach((b) => (b.disabled = true));
          try { const r = await (await fetch('/api/instalar_solver', { method: 'POST', body: '{}' })).json(); if (r.ok) { App.cerrarHoja(); App.crearWorker(); } else h.querySelector('#msgInst').textContent = 'No se pudo instalar: ' + r.salida; } catch (e) { h.querySelector('#msgInst').textContent = 'Error: ' + e.message; }
        }
      });
  }
  const logLinea = (s) => { const l = $('log'); l.classList.remove('oculto'); l.textContent += s + '\n'; l.scrollTop = 1e9; };
  App.log = logLinea;
  App.ocupado = (on) => { S.corriendo = on; $('bResolver').disabled = on; $('bDetener').disabled = !on; $('prog').classList.toggle('oculto', !on); document.querySelectorAll('[data-run]').forEach((b) => (b.disabled = on)); };

  /* lanzar(kind, opt, titulo, extra, datos): extra se conserva con el resultado; datos viaja al solver */
  App.lanzar = (kind, opt, titulo, extra, datos) => {
    if (S.corriendo) return;
    if (!S.motor) { if (S.worker) ofrecerInstalar(''); return; }
    $('log').textContent = ''; $('log').classList.remove('oculto'); App.ocupado(true);
    S.corrId++; S.pendiente = { kind, opt, titulo, extra: extra || {}, t0: performance.now() };
    S.worker.postMessage(Object.assign({ tipo: 'resolver', id: S.corrId, kind, D: S.ds.D, cap: S.ds.cap, opt }, datos || {}));
  };
  function terminarError(msg) { App.ocupado(false); logLinea('Error: ' + msg); S.res = null; App.renderPanel(); }
  async function terminar(res) {
    App.ocupado(false); const p = S.pendiente; if (!p) return;
    if (p.extra && p.extra.cd && App.resultadoCd) { $('log').classList.add('oculto'); await App.resultadoCd(p, res); return; }
    S.res = { kind: p.kind, opt: p.opt, titulo: p.titulo, res, extra: p.extra, ds: S.clave }; S.rutaSel = 0; S.celda = null;
    $('log').classList.add('oculto'); App.setPanel('resultado');
    if (p.kind === 'ubicar') { App.dibujarUbicarNodos(); return; }
    await dibujarResultado();
  }

  /* ================= tarjeta Problema ================= */
  const PROBLEMAS = [
    ['Rutas', [['tsp', 'TSP · un viajante (pesos = 1)'], ['mtsp', 'm-TSP · flota, pesos, balance y ventanas']]],
    ['Caminos y árboles', [['camino', 'Camino mínimo (origen → destino)'], ['desde', 'Caminos mínimos desde un origen'], ['arbol', 'Árbol de valor mínimo']]],
    ['Flujos y recorridos', [['flujomax', 'Flujo máximo'], ['flujocosto', 'Flujo de costo mínimo'], ['cartero', 'Cartero chino (recorrer todas las aristas)']]],
    ['Localización en los nodos', [['pmediana', 'p-mediana'], ['pcentro', 'p-centro'], ['cobertura', 'Cobertura de conjuntos']]],
    ['Otros', [['libre', 'Modelo propio (formato LP)']]],
  ];
  const CAMPOS = {
    tsp: ['modo', 'origen', 'destino', 'metodo', 'tiempo'], mtsp: ['origen', 'flota', 'balanceado', 'abierto', 'lminmax', 'objetivo', 'vt', 'metodo', 'tiempo'],
    camino: ['origen', 'destino'], desde: ['origen'], arbol: ['origen', 'tiempo'], flujomax: ['origen', 'destino'], flujocosto: [], cartero: [],
    pmediana: ['p', 'ponderar', 'tiempo'], pcentro: ['p', 'tiempo'], cobertura: ['radio', 'tiempo'], libre: ['lp', 'tiempo'],
  };
  const ETQ_ORIGEN = { tsp: 'Origen', mtsp: 'Depósito', camino: 'Origen', desde: 'Origen', arbol: 'Raíz', flujomax: 'Fuente' };
  const AYUDA = {
    flujomax: 'Las capacidades se editan en la pestaña <b>Aristas</b>. Sin capacidad, una arista no tiene límite.',
    flujocosto: 'Defina el <b>balance</b> de cada nodo en <b>Nodos</b>: positivo = oferta, negativo = demanda (la suma debe ser 0). Costos y capacidades, en <b>Aristas</b>.',
    cartero: 'Recorrido cerrado de costo mínimo que cubre todas las aristas (el grafo debe ser conexo).',
    mtsp: 'Los <b>pesos</b> de nodos y aristas, y las <b>franjas horarias</b>, se editan en <b>Nodos</b> y <b>Aristas</b> (solo con m-TSP). Con capacidad 0 el vehículo no tiene límite.',
    tsp: 'En el TSP el peso de todos los nodos y aristas es <b>1</b> (no llevan carga).',
    pmediana: 'Elige p nodos que minimizan la distancia (ponderada por demanda) de todos los nodos al más cercano.',
    pcentro: 'Elige p nodos que minimizan la mayor distancia de un nodo al más cercano.',
    cobertura: 'Mínimo de nodos para que todos queden a una distancia no mayor que el radio.',
    libre: 'Escriba cualquier modelo lineal o entero en formato LP (CPLEX). Ejemplo abajo.',
  };
  const LP_EJEMPLO = 'Maximize\n obj: 3 x + 2 y\nSubject To\n c1: x + y <= 4\n c2: x + 3 y <= 6\nBounds\n 0 <= x <= 3\nGeneral\n x y\nEnd';
  function construirProblema() {
    $('cProblema').innerHTML = `<h2>Problema <span class="nota" id="tTitulo"></span></h2>
      <div class="fila"><label class="campo">Tipo de problema<select id="problema">${PROBLEMAS.map(([g, l]) => `<optgroup label="${g}">${l.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</optgroup>`).join('')}</select></label></div>
      <div class="fila" data-c="modo"><label class="campo">Recorrido del TSP<select id="modo"><option value="ciclo">Circuito (regresa al origen)</option><option value="abierto">Camino abierto desde el origen</option><option value="fijo">Camino de origen a destino</option><option value="libre">Camino libre</option></select></label></div>
      <div class="fila"><label class="campo" data-c="origen" id="fOrigen"><span id="tOrigen">Origen</span><select id="origen"></select></label><label class="campo" data-c="destino" id="fDestino">Destino<select id="destino"></select></label></div>
      <div class="fila" data-c="flota"><div style="flex-basis:100%"><div class="nota" style="margin-bottom:4px"><b>Flota</b> · vehículos por tipo</div><div id="flotaTabla"></div></div></div>
      <div class="fila" data-c="balanceado"><label class="check"><input type="checkbox" id="balanceado"> Balanceado (reparte los clientes por igual entre las rutas)</label><label class="check" data-c="abierto"><input type="checkbox" id="abierto"> Abierto (las rutas no regresan al depósito)</label></div>
      <div class="fila" data-c="lminmax"><label class="campo">Mín. clientes por ruta<input id="lmin" type="number" min="0" value="1"></label><label class="campo">Máx. clientes por ruta (0 = sin límite)<input id="lmax" type="number" min="0" value="0"></label></div>
      <div class="fila" data-c="objetivo"><label class="campo">Objetivo<select id="objetivo"><option value="suma">Mínimo costo total</option><option value="maximo">Minimizar la ruta más costosa</option></select></label></div>
      <div class="fila" data-c="vt"><label class="check"><input type="checkbox" id="vtUsar"> Usar ventanas de tiempo (franja horaria de cada cliente)</label><label class="campo">Salida del depósito<input id="vtIni" type="time" value="08:00"></label><label class="campo">Servicio por cliente (min)<input id="vtServ" type="number" min="0" value="10"></label></div>
      <div class="fila" data-c="p"><label class="campo" data-c="p">Cantidad de nodos (p)<input id="p" type="number" min="1" value="2"></label></div>
      <div class="fila" data-c="radio"><label class="campo">Radio de cobertura<input id="radio" type="number" min="0" value="1500"></label></div>
      <div class="fila" data-c="ponderar"><label class="check"><input type="checkbox" id="ponderar"> Ponderar por la demanda de cada nodo</label></div>
      <div class="fila" data-c="lp"><label class="campo" style="flex-basis:100%">Modelo en formato LP<textarea id="lp" rows="9" spellcheck="false" style="font:12px/1.4 var(--mono)">${LP_EJEMPLO}</textarea></label></div>
      <div class="fila" data-c="metodo"><label class="campo">Eliminación de subtours<select id="metodo"><option value="mtz">MTZ · fórmulas del curso (un solo modelo)</option><option value="dfj">Cortes DFJ (más rápido, por iteraciones)</option></select></label></div>
      <div class="fila" data-c="tiempo"><label class="campo">Tiempo máximo (s)<input id="tiempo" type="number" min="5" value="120"></label></div>
      <p class="nota" id="ayudaProb" style="margin:0 0 10px"></p>
      <div style="display:flex; gap:8px"><button class="btn" id="bResolver"><svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>Resolver</button><button class="btn gris" id="bDetener" disabled>Detener</button></div>
      <div class="barra-prog oculto" id="prog"><i></i></div><div class="log oculto" id="log"></div>`;
    $('problema').onchange = App.camposProblema; $('modo').onchange = App.camposProblema; $('metodo').onchange = (e) => { S.ds.metodo = e.target.value; Datos.guardar(S.ds); }; $('balanceado').onchange = (e) => { S.ds.balanceado = e.target.checked; Datos.guardar(S.ds); App.camposProblema(); }; $('vtUsar').onchange = (e) => { S.ds.vt.usar = e.target.checked; Datos.guardar(S.ds); if (S.panel === 'nodos') App.renderPanel(); }; $('vtIni').onchange = (e) => { S.ds.vt.inicio = App.horas(e.target.value); Datos.guardar(S.ds); }; $('vtServ').onchange = (e) => { S.ds.vt.servicio = Math.max(0, +e.target.value || 0); Datos.guardar(S.ds); }; $('origen').onchange = App.pintarSeleccion; $('destino').onchange = App.pintarSeleccion;
    $('bResolver').onclick = () => { const p = parametros(); if (p) App.lanzar(p.kind, p.opt, p.titulo, p.extra, p.datos); };
    $('bDetener').onclick = () => { if (!S.corriendo) return; App.ocupado(false); logLinea('Detenido por el usuario.'); App.crearWorker(); };
  }
  App.llenarSelects = () => {
    const opts = S.ds.nodos.map((n, i) => `<option value="${i}">${esc(etq(i))}</option>`).join('');
    ['origen', 'destino'].forEach((id) => { const prev = $(id).value; $(id).innerHTML = opts; if (prev !== '' && +prev < S.ds.nodos.length) $(id).value = prev; });
  };
  App.horas = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60; };
  App.hhmm = (x) => { x = Math.max(0, x); let h = Math.floor(x + 1e-9), m = Math.round((x - h) * 60); if (m === 60) { m = 0; h++; } return String(h % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
  App.modoPesos = () => !!$('problema') && $('problema').value === 'mtsp';   // los pesos solo se editan en m-TSP; en TSP valen 1
  App.camposProblema = () => {
    const p = $('problema').value, modo = $('modo').value, vis = new Set(CAMPOS[p]);
    if (p === 'tsp' && modo !== 'fijo') vis.delete('destino'); if (p === 'tsp' && modo === 'libre') vis.delete('origen');
    if (p === 'mtsp' && $('balanceado').checked) vis.delete('lminmax');
    document.querySelectorAll('#cProblema [data-c]').forEach((el) => el.classList.toggle('oculto', !vis.has(el.dataset.c)));
    $('tOrigen').textContent = ETQ_ORIGEN[p] || 'Origen'; $('ayudaProb').innerHTML = AYUDA[p] || '';
    $('balanceado').checked = !!S.ds.balanceado; $('metodo').value = S.ds.metodo; $('vtUsar').checked = !!S.ds.vt.usar; $('vtIni').value = App.hhmm(S.ds.vt.inicio); $('vtServ').value = S.ds.vt.servicio;
    if (p === 'mtsp') App.renderFlota();
    if (['tsp', 'mtsp'].includes(p)) { const d = Datos.dcIdx(S.ds); if (d >= 0 && S.ultimoProblema !== p) $('origen').value = d; }
    if (S.ultimoProblema !== p && ['nodos', 'aristas', 'modelo'].includes(S.panel)) setTimeout(() => App.renderPanel(), 0);
    S.ultimoProblema = p; App.pintarSeleccion();
  };
  App.renderFlota = () => {
    const f = S.ds.flota, c = $('flotaTabla');
    c.innerHTML = `<table class="flota"><tr><th>Tipo</th><th>Cant.</th><th>Capac.</th><th>Costo/km</th><th>km/h</th></tr>` + f.map((t, i) => `<tr><td><input data-i="${i}" data-f="tipo" value="${esc(t.tipo)}"></td><td><input data-i="${i}" data-f="n" type="number" min="0" max="20" value="${t.n}"></td><td><input data-i="${i}" data-f="cap" type="number" min="0" value="${t.cap}"></td><td><input data-i="${i}" data-f="costoKm" type="number" min="0" step="0.1" value="${t.costoKm}"></td><td><input data-i="${i}" data-f="vel" type="number" min="1" value="${t.vel}"></td></tr>`).join('') + `</table><div class="nota" id="flotaTot"></div>`;
    const tot = () => { const n = f.reduce((a, t) => a + (+t.n || 0), 0); $('flotaTot').textContent = `${n} vehículo(s) en total · capacidad 0 = sin límite`; }; tot();
    c.querySelectorAll('input').forEach((i) => (i.onchange = () => { const t = f[+i.dataset.i], k = i.dataset.f; t[k] = k === 'tipo' ? i.value : Math.max(0, +i.value || 0); Datos.guardar(S.ds); tot(); }));
  };
  App.pintarSeleccion = () => {
    const o = +$('origen').value, d = +$('destino').value, usa = !$('fDestino').classList.contains('oculto');
    S.sel = { origen: o, destino: d }; Mapa.estiloNodos({ deposito: o, seleccion: usa ? [o, d] : [o], colores: S.colores, tenue: S.tenue });
  };
  const aviso = (t) => { $('log').classList.remove('oculto'); $('log').textContent = '⚠ ' + t; return null; };
  App.aviso = aviso;
  const distCompletas = () => { const D = S.ds.D, n = D.length, big = 1e6; return D.map((f, i) => f.map((v, j) => (i === j ? 0 : (isFinite(v) ? v : big)))); };
  function parametros() {
    const p = $('problema').value, o = +$('origen').value, d = +$('destino').value, n = S.ds.nodos.length, tiempo = Math.max(5, +$('tiempo').value || 120);
    const ds = S.ds;
    if (n < 2) return aviso('Agregue nodos primero (herramienta «Agregar nodos» o pestaña Nodos).');
    if (p === 'tsp') {
      if (n < 3) return aviso('El TSP necesita al menos 3 nodos.'); const modo = $('modo').value;
      if (modo === 'fijo' && o === d) return aviso('El destino debe ser distinto del origen.');
      return { kind: 'tsp', opt: { modo, origen: modo === 'libre' ? 0 : o, fin: d, tiempo, brecha: 1e-6, metodo: ds.metodo }, titulo: 'TSP · ' + { ciclo: 'circuito', abierto: 'camino abierto', fijo: `camino de ${corto(o)} a ${corto(d)}`, libre: 'camino libre' }[modo] };
    }
    if (p === 'mtsp') {
      const veh = ds.flota.flatMap((t) => Array.from({ length: Math.round(+t.n || 0) }, () => ({ tipo: t.tipo, cap: t.cap > 0 ? +t.cap : Infinity, costoKm: +t.costoKm || 1, vel: +t.vel || 30, fijo: 0 })));
      const m = veh.length, nc = n - 1, bal = $('balanceado').checked, abierto = $('abierto').checked, obj = $('objetivo').value;
      if (m < 1) return aviso('Defina al menos 1 vehículo en la flota (cantidad).'); if (m >= n) return aviso(`Hay más vehículos (${m}) que clientes (${nc}).`);
      const lmin = Math.max(0, +$('lmin').value || 0), lmax = Math.max(0, +$('lmax').value || 0);
      if (!bal && (lmin * m > nc || (lmax && lmax * m < nc))) return aviso(`Los límites por ruta son imposibles para ${nc} clientes y ${m} vehículos.`);
      const peso = ds.nodos.map((x) => +x.peso || 1), pesoArco = ds.pesoArista, usaVt = $('vtUsar').checked;
      const sumW = peso.reduce((a, v, i) => a + (i === o ? 0 : v), 0), tipos = new Set(veh.map((v) => v.tipo)), pesosUno = peso.every((v, i) => i === o || Math.abs(v - 1) < 1e-9) && (!pesoArco || pesoArco.every((f, i) => f.every((v, j) => i === j || !isFinite(v) || Math.abs(v - 1) < 1e-9)));
      const simple = tipos.size === 1 && veh.every((v) => v.cap >= sumW - 1e-9) && pesosUno && !usaVt;
      const tit = `m-TSP · ${m} vehículo(s)` + (bal ? ' · balanceado' : '') + (abierto ? ' · abierto' : '') + (usaVt ? ' · con ventanas' : '') + (obj === 'maximo' ? ' · ruta más costosa mínima' : '');
      if (simple && m >= 2) return { kind: 'mtsp', opt: { m, deposito: o, lmin: bal ? Math.max(1, Math.floor(nc / m)) : Math.max(1, lmin), lmax: bal ? Math.ceil(nc / m) : lmax, objetivo: obj, abierto, tiempo, brecha: 1e-6, metodo: ds.metodo }, titulo: tit };
      const vt = usaVt ? { usar: true, inicio: ds.vt.inicio, servicio: (+ds.vt.servicio || 0) / 60, a: ds.nodos.map((x) => (x.vtOn ? x.vtA : 0)), b: ds.nodos.map((x) => (x.vtOn ? x.vtB : 48)) } : null;
      return { kind: 'flota', opt: { deposito: o, vehiculos: veh, peso, pesoArco, balanceado: bal, lmin, lmax, abierto, objetivo: obj, vt, tiempo, brecha: 1e-6, metodo: ds.metodo }, titulo: tit };
    }
    if (p === 'camino') { if (o === d) return aviso('El destino debe ser distinto del origen.'); return { kind: 'camino', opt: { origen: o, destino: d }, titulo: `Camino mínimo ${corto(o)} → ${corto(d)}` }; }
    if (p === 'desde') return { kind: 'desde', opt: { origenes: [o] }, titulo: `Caminos mínimos desde ${corto(o)}`, extra: { cols: null } };
    if (p === 'arbol') return { kind: 'arbol', opt: { raiz: o, tiempo }, titulo: `Árbol de valor mínimo · raíz ${corto(o)}` };
    if (p === 'flujomax') { if (o === d) return aviso('La fuente y el sumidero deben ser distintos.'); return { kind: 'flujomax', opt: { origen: o, destino: d, tiempo }, titulo: `Flujo máximo ${corto(o)} → ${corto(d)}` }; }
    if (p === 'flujocosto') { const b = ds.nodos.map((x) => +x.balance || 0); if (!b.some((v) => v !== 0)) return aviso('Defina el balance de los nodos en la pestaña Nodos (oferta +, demanda −).'); return { kind: 'flujocosto', opt: { balance: b, tiempo }, titulo: 'Flujo de costo mínimo' }; }
    if (p === 'cartero') return { kind: 'cartero', opt: { dirigido: ds.dirigido, tiempo }, titulo: 'Cartero chino' };
    if (p === 'pmediana' || p === 'pcentro' || p === 'cobertura') {
      const dist = distCompletas(), pesos = $('ponderar').checked ? ds.nodos.map((x) => (x.extra > 0 ? x.extra : 1)) : null, pp = +$('p').value || 1;
      const tipo = { pmediana: 'mediana', pcentro: 'centro', cobertura: 'cobertura' }[p];
      return { kind: 'ubicar', opt: { tipo, p: pp, pesos, radio: +$('radio').value, tiempo }, datos: { dist }, extra: { nodosComoCandidatos: true }, titulo: { mediana: `p-mediana (p = ${pp})`, centro: `p-centro (p = ${pp})`, cobertura: `Cobertura · radio ${$('radio').value}` }[tipo] };
    }
    if (p === 'libre') return { kind: 'libre', opt: { tiempo }, datos: { lp: $('lp').value }, titulo: 'Modelo propio (LP)' };
  }

  /* ================= dibujo del resultado en el mapa ================= */
  function grupos() {
    const r = S.res; if (!r) return [];
    const x = r.res;
    if (r.kind === 'arbol') return [{ color: COL[1], pares: x.aristas.map(([i, j]) => [i, j]), flechas: false, peso: 3.5 }];
    if (r.kind === 'flujomax' || r.kind === 'flujocosto') { const mx = Math.max(...x.flujos.map((f) => f[2])); return x.flujos.map((f) => ({ color: f[3] && isFinite(f[3]) && f[2] >= f[3] - 1e-6 ? COL[0] : COL[1], pares: [[f[0], f[1]]], flechas: true, peso: 2.5 + 5 * f[2] / mx, tip: `flujo ${fmt(f[2], 2)}${isFinite(f[3]) ? ' / ' + fmt(f[3], 2) : ''}` })); }
    if (r.kind === 'cartero') return x.aristas.map((a) => ({ color: a[3] > 1 ? COL[4] : COL[1], pares: [[a[0], a[1]]], flechas: false, peso: a[3] > 1 ? 5 : 3, tip: `recorrida ${a[3]} ${a[3] > 1 ? 'veces' : 'vez'}` }));
    if (x.rutas && x.rutas.length) return x.rutas.map((ru, k) => ({ color: COL[k % COL.length], pares: ru.slice(1).map((v, q) => [ru[q], v]), flechas: true }));
    return [];
  }
  async function dibujarResultado() {
    const g = grupos(), r0 = S.res;
    if (!g.length) { Mapa.limpiarRutas(); S.colores = null; S.tenue = null; App.pintarSeleccion(); App.renderLeyenda(null); return; }
    const todos = g.flatMap((x) => x.pares);
    const usarCalles = todos.length <= 140;
    if (usarCalles) { chip('Trazando calles…'); await Mapa.asegurar(todos, (a, b) => chip(`Trazando calles… ${a}/${b}`)); if (S.res !== r0) return; }
    const { sinGeom, total } = Mapa.dibujar(usarCalles ? g : g.map((x) => Object.assign({}, x, { pares: x.pares })));
    chip(sinGeom ? `${total - sinGeom} de ${total} tramos por calles · ${sinGeom} en línea recta (sin conexión a OSRM)` : `${total} tramos trazados por las calles`);
    const colores = {}, usados = new Set();
    g.forEach((x) => x.pares.forEach(([i, j]) => { usados.add(i); usados.add(j); colores[i] = colores[i] || x.color; colores[j] = colores[j] || x.color; }));
    const dep = ['mtsp', 'cvrp', 'flota'].includes(r0.kind) ? r0.opt.deposito : (r0.res.rutas && r0.res.rutas[0] ? r0.res.rutas[0][0] : r0.opt.raiz);
    S.colores = colores; if (dep !== undefined) delete colores[dep];
    S.tenue = new Set(S.ds.nodos.map((_, i) => i).filter((i) => !usados.has(i)));
    Mapa.estiloNodos({ deposito: dep, seleccion: null, colores, tenue: S.tenue });
    App.renderLeyenda(g); Mapa.ajustar([...usados]);
  }
  App.dibujarResultado = dibujarResultado;
  App.renderLeyenda = (g) => {
    const l = $('leyenda'); if (!g || !g.length || !['tsp', 'mtsp', 'cvrp', 'flota'].includes(S.res.kind)) { l.classList.add('oculto'); return; }
    l.classList.remove('oculto'); l.innerHTML = g.map((x, k) => `<div><span class="punto" style="background:${x.color}"></span>Ruta ${k + 1} · ${fmt(S.res.res.dists[k], 1)} ${S.ds.unidad}</div>`).join('');
  };
  App.limpiarResultado = () => { S.res = null; S.colores = null; S.tenue = null; Mapa.limpiarRutas(); $('leyenda').classList.add('oculto'); if (S.panel === 'resultado') App.renderPanel(); App.pintarSeleccion(); };

  /* ================= panel derecho ================= */
  App.paneles.push({ id: 'resultado', titulo: 'Resultado', render: pResultado });
  App.construirPaneles = () => {
    const nav = $('tabsDer'); nav.innerHTML = '<span class="ind"></span>' + App.paneles.map((p) => `<button role="tab" data-p="${p.id}" aria-selected="${p.id === S.panel}">${p.titulo}</button>`).join('');
    App.indicador(nav);
  };
  App.setPanel = (p) => { S.panel = p; const nav = $('tabsDer'); nav.querySelectorAll('button[role="tab"]').forEach((b) => b.setAttribute('aria-selected', b.dataset.p === p)); App.indicador(nav); App.renderPanel(); };
  App.renderPanel = () => {
    const c = $('contenido'); c.innerHTML = ''; const pan = App.paneles.find((x) => x.id === S.panel) || App.paneles[0];
    const div = document.createElement('div'); div.className = 'entra'; c.appendChild(div); pan.render(div); App.alRenderPanel && App.alRenderPanel(S.panel);
  };
  const kpis = (items) => '<div class="kpis">' + items.map(([v, l, cls]) => `<div class="kpi ${cls || ''}"><b class="tabular">${v}</b><span>${l}</span></div>`).join('') + '</div>';
  const estadoKpi = (res) => { const opt = String(res.estado).startsWith('óptimo'); return [opt ? 'Óptimo probado' : esc(String(res.estado).startsWith('límite') ? 'Límite de tiempo' : res.estado), 'Estado', opt ? 'estado ok' : 'estado aviso']; };
  App.kpis = kpis; App.estadoKpi = estadoKpi;
  function pasos(ru, lleg) {
    let ac = 0; return `<table><tr><th>#</th><th>Nodo</th><th>Nombre</th><th>Tramo</th><th>Acum.</th>${lleg ? '<th>Llegada</th>' : ''}</tr>` + ru.map((v, j) => { const t = j ? S.ds.D[ru[j - 1]][v] : 0; ac += t; return `<tr><td>${j}</td><td>${esc(corto(v))}</td><td>${esc(nodo(v).nombre)}</td><td class="tabular">${j ? fmt(t) : ''}</td><td class="tabular">${fmt(ac)}</td>${lleg ? `<td class="tabular">${lleg[j] == null ? '' : App.hhmm(lleg[j])}</td>` : ''}</tr>`; }).join('') + '</table>';
  }
  function pResultado(el) {
    const r = S.res;
    if (!r || r.ds !== S.clave) { el.innerHTML = `<div class="aviso info">Elija un problema y pulse <b>Resolver</b>${S.ds.parcial ? `, o use los atajos de <b>${esc(S.ds.titulo)}</b>` : ''}. El resultado aparece aquí y sobre el mapa.</div><p class="nota">Todo se resuelve con optimización exacta (programación lineal / entera mixta), sin algoritmos de grafos ni heurísticas. Para ubicar el <b>centro de distribución</b> óptimo, abra la pestaña <b>CD</b>.</p>`; return; }
    const x = r.res, u = S.ds.unidad; let h = `<h3 style="margin-bottom:10px">${esc(r.titulo)}</h3>`;
    const hay = x.rutas?.length || x.aristas?.length || x.flujos?.length || x.dist || x.abiertas || x.valores;
    if (!hay || x.objetivo === undefined && !x.dist) { el.innerHTML = h + `<div class="aviso error">${esc(x.estado)}. No se obtuvo una solución; revise los datos o aumente el tiempo.</div>`; return; }
    const brecha = String(x.estado).startsWith('óptimo') ? '0 %' : (x.gap == null ? 'n/d' : (x.gap * 100).toFixed(2) + ' %');
    const t = fmt(x.seg || 0, 2) + ' s';
    if (r.kind === 'tsp' || r.kind === 'mtsp' || r.kind === 'cvrp') {
      const items = [estadoKpi(x), [fmt(x.objetivo) + ' ' + u, r.kind === 'mtsp' && r.opt.objetivo === 'maximo' ? 'Ruta más larga' : 'Distancia total'], [brecha, 'Brecha de optimalidad'], [t, 'Tiempo de cálculo']];
      if (r.kind === 'mtsp') items.splice(2, 0, [fmt(x.total) + ' ' + u, 'Suma de las rutas']);
      h += kpis(items);
      h += `<table><tr><th>Ruta</th><th>Recorrido</th><th>Paradas</th>${r.kind === 'cvrp' ? '<th>Carga</th>' : ''}<th>${u}</th></tr>` + x.rutas.map((ru, k) => { const dep = ru[0]; const n = ru.filter((v, q) => !(q === 0 || (q === ru.length - 1 && v === dep))).length;
        return `<tr class="clic ${k === S.rutaSel ? 'activa' : ''}" data-k="${k}"><td><span class="punto" style="background:${COL[k % COL.length]}"></span>${x.rutas.length > 1 ? k + 1 : ''}</td><td class="recorrido">${ru.map((v) => `<span title="${esc(nodo(v).nombre)}">${esc(corto(v))}</span>`).join(' → ')}</td><td>${n}</td>${r.kind === 'cvrp' ? `<td class="tabular">${fmt(x.cargas[k], 0)}/${x.capacidad}</td>` : ''}<td class="tabular">${fmt(x.dists[k])}</td></tr>`; }).join('') + '</table>';
      h += `<div class="sep"></div><h3 style="font-size:15px;margin-bottom:6px">Detalle · ruta ${x.rutas.length > 1 ? S.rutaSel + 1 : ''}</h3>` + pasos(x.rutas[S.rutaSel]);
    } else if (r.kind === 'flota') {
      h += kpis([estadoKpi(x), [fmt(x.totalCosto, 2), 'Costo total' + (r.opt.objetivo === 'maximo' ? ' · ruta más costosa ' + fmt(x.objetivo, 2) : '')], [fmt(x.total) + ' ' + u, 'Distancia total'], [x.rutas.length + ' de ' + r.opt.vehiculos.length, 'Vehículos usados'], [fmt(x.seg || 0, 2) + ' s', 'Tiempo de cálculo']]);
      h += `<table><tr><th>Ruta</th><th>Vehículo</th><th>Recorrido</th><th>Carga</th><th>${u}</th><th>Costo</th></tr>` + x.rutas.map((ru, k) => `<tr class="clic ${k === S.rutaSel ? 'activa' : ''}" data-k="${k}"><td><span class="punto" style="background:${COL[k % COL.length]}"></span>${k + 1}</td><td>${esc(x.info[k].tipo)}</td><td class="recorrido">${ru.map((v) => `<span title="${esc(nodo(v).nombre)}">${esc(corto(v))}</span>`).join(' → ')}</td><td class="tabular">${fmt(x.info[k].carga, 1)}${isFinite(x.info[k].cap) ? '/' + x.info[k].cap : ''}</td><td class="tabular">${fmt(x.dists[k])}</td><td class="tabular">${fmt(x.info[k].costo, 2)}</td></tr>`).join('') + '</table>';
      h += `<div class="sep"></div><h3 style="font-size:15px;margin-bottom:6px">Detalle · ruta ${S.rutaSel + 1} (${esc(x.info[S.rutaSel].tipo)})</h3>` + pasos(x.rutas[S.rutaSel], x.info[S.rutaSel].llegadas);
    } else if (r.kind === 'camino') {
      h += kpis([estadoKpi(x), [fmt(x.objetivo) + ' ' + u, 'Distancia mínima'], [x.rutas[0].length - 1, 'Tramos'], [t, 'Tiempo de cálculo']]) + pasos(x.rutas[0]);
      const dir = S.ds.D[x.rutas[0][0]][x.rutas[0].at(-1)];
      if (isFinite(dir) && x.rutas[0].length > 2) h += `<p class="nota">El arco directo cuesta ${fmt(dir)} ${u}; la ruta óptima es ${fmt(dir - x.objetivo)} ${u} más corta.</p>`;
    } else if (r.kind === 'arbol') {
      h += kpis([estadoKpi(x), [fmt(x.objetivo) + ' ' + u, 'Costo total del árbol'], [x.aristas.length, 'Aristas'], [t, 'Tiempo de cálculo']]);
      h += `<table><tr><th>Desde</th><th>Hasta</th><th>${u}</th></tr>` + [...x.aristas].sort((a, b) => b[2] - a[2]).map(([i, j, c]) => `<tr class="clic" data-i="${i}" data-j="${j}"><td>${esc(etq(i))}</td><td>${esc(etq(j))}</td><td class="tabular">${fmt(c)}</td></tr>`).join('') + '</table>';
    } else if (r.kind === 'desde') {
      const cols = r.extra.cols || S.ds.nodos.map((_, i) => i), orig = x.origenes;
      h += kpis([estadoKpi(x), [orig.length + ' × ' + cols.length, 'Pares resueltos'], [t, 'Tiempo de cálculo']]);
      h += `<p class="nota">Cada celda es la distancia mínima (${u}) hallada con un programa lineal de flujo. Pulse una celda para ver el camino por las calles. En verde, el destino más cercano de cada origen.</p>`;
      h += '<div class="matriz-wrap"><table class="matriz"><tr><th></th>' + cols.map((c) => `<th title="${esc(nodo(c).nombre)}">${esc(corto(c))}</th>`).join('') + '</tr>';
      orig.forEach((s, k) => { const mejor = Math.min(...cols.filter((c) => c !== s).map((c) => x.dist[k][c])); h += `<tr><td title="${esc(nodo(s).nombre)}">${esc(corto(s))}</td>` + cols.map((c) => `<td class="celda ${c !== s && x.dist[k][c] === mejor ? 'mejor' : ''} ${r.celda && r.celda[0] === k && r.celda[1] === c ? 'sel' : ''}" data-k="${k}" data-c="${c}">${s === c ? '·' : fmt(x.dist[k][c], 1)}</td>`).join('') + '</tr>'; });
      h += '</table></div>';
    } else if (r.kind === 'flujomax' || r.kind === 'flujocosto') {
      h += kpis([estadoKpi(x), [fmt(x.objetivo) + (r.kind === 'flujocosto' ? ' ' + u : ''), r.kind === 'flujomax' ? 'Flujo máximo' : 'Costo mínimo'], [x.flujos.length, 'Aristas con flujo'], [t, 'Tiempo de cálculo']]);
      h += `<table><tr><th>Desde</th><th>Hasta</th><th>Flujo</th><th>Capacidad</th></tr>` + x.flujos.map((f) => `<tr class="clic" data-i="${f[0]}" data-j="${f[1]}"><td>${esc(etq(f[0]))}</td><td>${esc(etq(f[1]))}</td><td class="tabular">${fmt(f[2], 2)}</td><td class="tabular">${isFinite(f[3]) ? fmt(f[3], 2) + (f[2] >= f[3] - 1e-6 ? ' · saturada' : '') : '∞'}</td></tr>`).join('') + '</table><p class="nota">En rojo, aristas saturadas (cuello de botella).</p>';
    } else if (r.kind === 'cartero') {
      h += kpis([estadoKpi(x), [fmt(x.objetivo) + ' ' + u, 'Recorrido mínimo'], [fmt(x.extra) + ' ' + u, 'Repetido (extra)'], [t, 'Tiempo de cálculo']]);
      const rep = x.aristas.filter((a) => a[3] > 1);
      h += `<p class="nota">Las aristas suman ${fmt(x.base)} ${u}; ${rep.length ? 'se repiten ' + rep.length + ' (en naranja)' : 'el grafo ya es euleriano: no se repite ninguna'}.</p>`;
      if (rep.length) h += `<table><tr><th>Desde</th><th>Hasta</th><th>Veces</th><th>${u}</th></tr>` + rep.map((a) => `<tr class="clic" data-i="${a[0]}" data-j="${a[1]}"><td>${esc(etq(a[0]))}</td><td>${esc(etq(a[1]))}</td><td>${a[3]}</td><td class="tabular">${fmt(a[2])}</td></tr>`).join('') + '</table>';
    } else if (r.kind === 'ubicar') {
      const nom = (j) => etq(j);
      h += kpis([estadoKpi(x), [fmt(x.objetivo, 2), 'Objetivo'], [x.abiertas.length, 'Nodos elegidos'], [t, 'Tiempo de cálculo']]);
      h += `<p><b>Elegidos:</b> ${x.abiertas.map((j) => `<span class="chipn">${esc(nom(j))}</span>`).join(' ')}</p><p class="nota">Distancia total ponderada ${fmt(x.transporte, 1)} · mayor distancia ${fmt(x.maxd, 1)} ${u}.</p>`;
      h += `<table><tr><th>Nodo</th><th>Atendido desde</th><th>${u}</th></tr>` + x.asign.map(([i, j, d]) => `<tr><td>${esc(etq(i))}</td><td>${esc(corto(j))}</td><td class="tabular">${fmt(d, 1)}</td></tr>`).join('') + '</table>';
    } else if (r.kind === 'libre') {
      h += kpis([estadoKpi(x), [fmt(x.objetivo, 4), 'Valor óptimo'], [t, 'Tiempo de cálculo']]);
      h += `<table><tr><th>Variable</th><th>Valor</th></tr>` + x.valores.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="tabular">${fmt(v, 4)}</td></tr>`).join('') + '</table>';
    }
    h += `<div class="sep"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec mini" data-e="csv">Resultado CSV</button><button class="btn sec mini" data-e="geojson">GeoJSON</button><button class="btn sec mini" data-e="xlsx">Excel</button></div>`;
    el.innerHTML = h;
    el.querySelectorAll('tr.clic[data-k]').forEach((tr) => (tr.onclick = () => { S.rutaSel = +tr.dataset.k; Mapa.resaltar(S.rutaSel); App.renderPanel(); }));
    el.querySelectorAll('tr.clic[data-i]').forEach((tr) => (tr.onclick = () => Mapa.ajustar([+tr.dataset.i, +tr.dataset.j])));
    el.querySelectorAll('.celda').forEach((td) => (td.onclick = () => caminoDeCelda(+td.dataset.k, +td.dataset.c)));
    el.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => exportar(b.dataset.e)));
  }
  async function caminoDeCelda(k, c) {
    const r = S.res; if (!r || !r.res.origenes) return; const s = r.res.origenes[k]; if (s === c) return;
    const ruta = Solver.traza(r.res.pred[k], s, c); if (!ruta) return;
    r.celda = [k, c]; App.renderPanel(); chip('Trazando calles…');
    const pares = ruta.slice(1).map((v, q) => [ruta[q], v]); await Mapa.asegurar(pares); if (S.res !== r) return;
    const { sinGeom } = Mapa.dibujar([{ color: COL[1], pares, flechas: true }]);
    chip(`Camino ${corto(s)} → ${corto(c)}: ${fmt(r.res.dist[k][c], 1)} ${S.ds.unidad} · ${ruta.map((v) => corto(v)).join(' → ')}` + (sinGeom ? ' (sin conexión a OSRM: línea recta)' : ''));
    const used = new Set(ruta); S.colores = Object.fromEntries(ruta.map((v) => [v, COL[1]])); delete S.colores[s]; S.tenue = new Set(S.ds.nodos.map((_, i) => i).filter((i) => !used.has(i)));
    Mapa.estiloNodos({ deposito: s, colores: S.colores, tenue: S.tenue }); Mapa.ajustar(ruta); App.renderLeyenda(null);
  }

  /* ================= exportar ================= */
  async function exportar(que) {
    const ds = S.ds, r = S.res && S.res.ds === S.clave ? S.res.res : null, base = ds.clave;
    const csvf = (n, f) => Datos.descargar(`${base}_${n}.csv`, Datos.csv(f), 'text/csv');
    if (que === 'nodos') csvf('nodos', Datos.filasNodos(ds)); else if (que === 'matriz') csvf('matriz', Datos.filasMatriz(ds)); else if (que === 'aristas') csvf('aristas', Datos.filasAristas(ds));
    else if (que === 'candidatos') csvf('candidatos', Datos.filasCandidatos(ds));
    else if (que === 'json') Datos.descargar(base + '_proyecto.json', JSON.stringify(Datos.serializar(ds)), 'application/json');
    else if (que === 'csv') csvf('resultado', Datos.filasResultado(ds, r));
    else if (que === 'geojson') Datos.descargar(base + '_resultado.geojson', Datos.geojson(ds, r, (i, j) => Mapa.geom(i, j)), 'application/geo+json');
    else if (que === 'anylogistix') { const a = Datos.anylogistix(ds); Datos.descargar(base + '_anylogistix_instalaciones.csv', Datos.csv(a.fac), 'text/csv'); setTimeout(() => Datos.descargar(base + '_anylogistix_clientes.csv', Datos.csv(a.cli), 'text/csv'), 300); }
    else if (que === 'pdf') window.print();
    else if (que === 'xlsx') {
      const hojas = [{ nombre: 'Nodos', filas: Datos.filasNodos(ds) }, { nombre: 'Matriz', filas: Datos.filasMatriz(ds).map((f) => f.map((v) => (v === '#' ? '' : v))) }, { nombre: 'Aristas', filas: Datos.filasAristas(ds) }];
      if (ds.candidatos.length) hojas.push({ nombre: 'Candidatos', filas: Datos.filasCandidatos(ds) });
      if (r) hojas.push({ nombre: 'Resultado', filas: [[S.res.titulo], [], ...Datos.filasResultado(ds, r)] });
      try { const resp = await fetch('/api/xlsx', { method: 'POST', body: JSON.stringify({ hojas }) }); if (!resp.ok) throw new Error('El servidor no pudo crear el Excel'); Datos.descargar(base + '_libro.xlsx', await resp.blob()); }
      catch (e) { chip('No se pudo crear el Excel: ' + e.message); }
    }
  }
  $('bExportar').dataset.menu = '1';
  $('bExportar').onclick = (e) => { e.stopPropagation(); App.menu($('bExportar'), [['xlsx', 'Libro de Excel (nodos, matriz, aristas, resultado)'], ['json', 'Proyecto completo (.json, con imagen y área)'], '-', ['nodos', 'Nodos (CSV)'], ['aristas', 'Aristas (CSV)'], ['matriz', 'Matriz de distancias (CSV)'], ['candidatos', 'Candidatos a CD (CSV)'], ['anylogistix', 'anyLogistix: instalaciones y clientes (2 CSV)'], '-', ['csv', 'Resultado (CSV)'], ['geojson', 'Resultado sobre el mapa (GeoJSON)'], ['pdf', 'Imprimir / guardar informe (PDF)']], exportar); };
  App.exportar = exportar;

  /* ================= importar ================= */
  $('bImportar').onclick = () => App.hoja(`<h3>Importar datos</h3><p class="nota">Formatos: <b>CSV, TSV, TXT, Excel (.xlsx) o JSON</b> (proyecto). Se detecta si el archivo trae <b>nodos</b> (lat, lon, también latitude/longitude de anyLogistix), una <b>matriz</b> de distancias o <b>aristas</b> (origen, destino, costo, capacidad).</p>
    <div class="dropzona" id="dz">Arrastre aquí el archivo o <button class="btn sec mini" id="bElegir">elija uno</button></div><div class="acc"><button class="btn gris" data-x="c">Cerrar</button></div>`, (x) => x === 'c' && App.cerrarHoja());
  document.addEventListener('click', (e) => { if (e.target.id === 'bElegir') $('archivo').click(); });
  $('archivo').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await procesarArchivo(f); };
  ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, async (e) => { if (!e.dataTransfer) return; e.preventDefault(); const dz = $('dz'); if (ev === 'dragover') { dz && dz.classList.add('sobre'); return; } dz && dz.classList.remove('sobre'); const f = e.dataTransfer.files[0]; if (f) await procesarArchivo(f); }));
  async function procesarArchivo(file) {
    try {
      const l = await Datos.leerArchivo(file); const plan = { nodos: null, matriz: null, aristas: null, nombre: file.name, proyecto: null };
      if (l.tipo === 'json') {
        const j = l.json;
        if (j.nodos && j.D) plan.proyecto = j; else if (j.nodos) plan.nodos = j.nodos.map((n, i) => ({ id: n.id ?? i + 1, nombre: n.nombre ?? 'Nodo ' + (i + 1), lat: +n.lat, lon: +n.lon, extra: n.extra ?? 0, tipo: n.tipo === 'dc' ? 'dc' : 'cliente' }));
      } else l.hojas.forEach((h) => { if (!h.filas.length) return; const t = Datos.detectar(h.filas); try { if (t === 'nodos' && !plan.nodos) plan.nodos = Datos.filasANodos(h.filas); else if (t === 'aristas' && !plan.aristas) plan.aristas = Datos.filasAAristas(h.filas); else if (t === 'matriz' && !plan.matriz && h.filas.length > 2) plan.matriz = Datos.filasAMatriz(h.filas); } catch (err) { plan.error = err.message; } });
      mostrarPlan(plan);
    } catch (err) { App.hoja(`<h3>No se pudo leer el archivo</h3><p class="nota">${esc(err.message)}</p><div class="acc"><button class="btn" data-x="c">Cerrar</button></div>`, () => App.cerrarHoja()); }
  }
  function mostrarPlan(p) {
    const partes = [];
    if (p.proyecto) partes.push(`un <b>proyecto completo</b> (${p.proyecto.nodos.length} nodos)`); if (p.nodos) partes.push(`<b>${p.nodos.length} nodos</b> con coordenadas`); if (p.matriz) partes.push(`una <b>matriz ${p.matriz.D.length} × ${p.matriz.D.length}</b>`); if (p.aristas) partes.push(`<b>${p.aristas.length} aristas</b>`);
    if (!partes.length) return App.hoja(`<h3>No reconozco el contenido</h3><p class="nota">${esc(p.error || 'Use encabezados como id, nombre, lat, lon; origen, destino, costo; o una matriz con etiquetas.')}</p><div class="acc"><button class="btn" data-x="c">Cerrar</button></div>`, () => App.cerrarHoja());
    const n = S.ds.nodos.length, solo = !p.nodos && !p.proyecto && p.matriz && p.matriz.D.length === n;
    const accion = p.proyecto ? 'Se cargará el proyecto con su grafo, candidatos, área e imagen.' : solo ? `Se reemplazará solo la <b>matriz de distancias</b> (los ${n} nodos se conservan).` : p.nodos ? `Se importarán los <b>nodos</b>${p.matriz && p.matriz.D.length === p.nodos.length ? ' y la <b>matriz</b>' : '; las distancias se calcularán con la <b>matriz euclidiana</b>'}${p.aristas ? ' y las <b>aristas</b>' : ''}.` : 'Los nodos sin coordenadas se ubicarán en círculo alrededor del centro del mapa.';
    App.hoja(`<h3>${esc(p.nombre)}</h3><p>Se detectó ${partes.join(', ')}.</p><p class="nota">${accion}</p>
      <div class="fila"><label class="campo">Destino<select id="impDestino"><option value="nuevo">Crear un proyecto nuevo</option><option value="este">Reemplazar «${esc(S.ds.titulo)}»</option></select></label><label class="campo">Escala (si hay que calcular la matriz euclidiana)<input id="impFactor" type="number" step="0.05" value="${S.factor}"></label></div>
      <div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn" data-x="ok">Aplicar</button></div>`, (x, h) => {
      if (x !== 'ok') return App.cerrarHoja(); S.factor = +h.querySelector('#impFactor').value || 1; const dest = h.querySelector('#impDestino').value; App.cerrarHoja(); aplicarPlan(p, dest); });
  }
  function aplicarPlan(p, dest) {
    const ds = S.ds, c = ds.centro, circulo = (k, i) => { const a = 2 * Math.PI * i / k; return [c[0] + 0.02 * Math.cos(a), c[1] + 0.02 * Math.sin(a)]; };
    let nodos = p.nodos, D = null, cap = null;
    if (p.proyecto) { const j = p.proyecto; nodos = j.nodos; D = Datos.aInf(j.D); cap = j.cap; }
    else {
      if (p.matriz) { D = p.matriz.D; if (!nodos) nodos = D.length === ds.nodos.length ? ds.nodos : p.matriz.ids.map((id, i) => ({ id, nombre: 'Nodo ' + id, lat: circulo(D.length, i)[0], lon: circulo(D.length, i)[1], extra: 0 })); }
      else if (p.aristas && !nodos) {
        const ids = [...new Set(p.aristas.flatMap((e) => [e[0], e[1]]))]; nodos = ids.every((id) => idx(id) >= 0) ? ds.nodos : ids.map((id, i) => ({ id, nombre: 'Nodo ' + id, lat: circulo(ids.length, i)[0], lon: circulo(ids.length, i)[1], extra: 0 }));
      }
      if (nodos && !D) D = p.aristas ? nodos.map(() => nodos.map(() => INF)) : Datos.matrizEuclidiana(nodos, S.factor, ds.centro[0]);
      if (p.aristas && nodos) { const pos = (id) => nodos.findIndex((n) => String(n.id) === String(id)); p.aristas.forEach(([a, b, w, k]) => { const i = pos(a), j = pos(b); if (i >= 0 && j >= 0) { D[i][j] = w; D[j][i] = w; if (isFinite(k)) { cap = cap || nodos.map(() => nodos.map(() => INF)); cap[i][j] = k; cap[j][i] = k; } } }); }
    }
    if (!nodos || !D || D.length !== nodos.length) return App.hoja('<h3>Datos inconsistentes</h3><p class="nota">El número de nodos no coincide con el tamaño de la matriz.</p><div class="acc"><button class="btn" data-x="c">Cerrar</button></div>', () => App.cerrarHoja());
    nodos = nodos.map((n) => Object.assign({ extra: 0, balance: 0, fijo: 0, peso: 1, tipo: 'cliente' }, n)); D = D.map((f, i) => f.map((v, j) => (i === j ? INF : v)));
    const centro = nodos.length ? [nodos.reduce((a, n) => a + n.lat, 0) / nodos.length, nodos.reduce((a, n) => a + n.lon, 0) / nodos.length] : ds.centro;
    if (dest === 'nuevo') {
      const nuevo = Datos.nuevo({ titulo: p.proyecto ? p.proyecto.titulo || p.nombre : p.nombre.replace(/\.[a-z]+$/i, ''), centro, zoom: 12, modoDist: 'euclidiana' });
      Object.assign(nuevo, { nodos, D, cap: cap ? Datos.aInf(cap) : null, grafoRalo: !!p.aristas }); if (p.proyecto) Object.assign(nuevo, { candidatos: p.proyecto.candidatos || [], area: p.proyecto.area || null, fondo: p.proyecto.fondo || null, base: p.proyecto.base || 'calles', dirigido: !!p.proyecto.dirigido, factor: p.proyecto.factor || 1.3 });
      Datos.normalizar(nuevo); Datos.guardar(nuevo); Datos.registrar(nuevo); S.sets[nuevo.clave] = nuevo; App.proyectosRender(); App.cambiarTab(nuevo.clave); return;
    }
    ds.nodos = nodos; ds.D = D; ds.cap = cap ? Datos.aInf(cap) : ds.cap; if (p.proyecto) Object.assign(ds, { candidatos: p.proyecto.candidatos || [], area: p.proyecto.area || null, fondo: p.proyecto.fondo || null });
    Datos.normalizar(ds); Datos.guardar(ds); App.cargarProyectoEnVista(); chip(`Datos importados: ${ds.nodos.length} nodos`);
  }

  /* ================= arranque ================= */
  App.arrancar = async () => {
    construirProblema(); App.construirBusqueda();
    Mapa.iniciar('mapa', (e) => { if (e === 'mapa-offline') chip('Sin conexión: el mapa base no está disponible, pero los nodos y las rutas sí'); });
    try { S.sets.cali = await Datos.cargar('cali'); S.sets.cali.parcial = true; S.sets.china = await Datos.cargar('china'); S.sets.china.parcial = true; for (const p of Datos.listar()) { const d = await Datos.cargar(p.clave); if (d) S.sets[p.clave] = d; } }
    catch (e) { chip('No se pudieron cargar los datos: ' + e.message); return; }
    App.construirPaneles(); App.segmentado($('tabsDer'), (b) => { S.panel = b.dataset.p; App.renderPanel(); });
    App.crearWorker(); App.proyectosRender();
    const q = new URLSearchParams(location.search).get('tab'); App.cambiarTab(S.sets[q] ? q : 'cali');
  };
})();
