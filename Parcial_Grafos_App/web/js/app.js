/* Interfaz: pestañas Cali / China, problema, resultados, mapa, nodos, matriz, importar y exportar. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const INF = Infinity, COL = Mapa.COL;
  const S = { clave: 'cali', sets: {}, ds: null, res: null, panel: 'resultado', worker: null, motor: null, puedeInstalar: false, corriendo: false, corrId: 0, sel: { origen: 0, destino: 0 }, rutaSel: 0, sucio: null, factor: 1.3 };
  const fmt = (v, d = 3) => (isFinite(v) ? Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nodo = (i) => S.ds.nodos[i];
  const etq = (i) => `${nodo(i).id} · ${nodo(i).nombre}`;
  const idx = (v) => S.ds.nodos.findIndex((n) => String(n.id) === String(v));
  const reducir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= indicador deslizante de los controles segmentados ================= */
  function indicador(nav) {
    const sel = nav.querySelector('[aria-selected="true"]'), ind = nav.querySelector('.ind'); if (!sel || !ind) return;
    ind.style.width = sel.offsetWidth + 'px'; ind.style.transform = `translateX(${sel.offsetLeft}px)`;
  }
  function segmentado(nav, alCambiar) {
    nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; nav.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b)); indicador(nav); alCambiar(b); });
    new ResizeObserver(() => indicador(nav)).observe(nav); requestAnimationFrame(() => indicador(nav));
  }

  /* ================= tema ================= */
  function tema(t) { if (t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('parcial-grafos:tema', t); } catch (e) { /* */ } } }
  (function () { try { tema(localStorage.getItem('parcial-grafos:tema')); } catch (e) { /* */ } })();
  $('bTema').onclick = () => { const oscuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; tema(oscuro ? 'light' : 'dark'); };

  /* ================= solver (worker) ================= */
  function pill(estado, texto) { const p = $('pMotor'); p.className = 'pill ' + estado; p.querySelector('span').textContent = texto; }
  function crearWorker() {
    if (S.worker) S.worker.terminate();
    const forzar = new URLSearchParams(location.search).get('motor') || 'auto';
    const w = new Worker('js/worker.js'); S.worker = w; S.motor = null; pill('', 'Iniciando solver…');
    w.onmessage = (e) => {
      const d = e.data;
      if (d.tipo === 'listo') {
        S.motor = d.motor; S.puedeInstalar = !!d.puedeInstalar;
        if (d.motor === 'wasm') pill('ok', 'HiGHS · en el navegador');
        else if (d.motor === 'servidor') pill('ok', 'HiGHS · Python local');
        else pill('mal', 'Solver no disponible');
        if (!d.motor) ofrecerInstalar(d.detalle);
      } else if (d.tipo === 'log') logLinea(d.s);
      else if (d.tipo === 'fin') terminar(d.res);
      else if (d.tipo === 'error') { terminarError(d.msg); }
    };
    w.postMessage({ tipo: 'iniciar', motor: forzar });
  }
  $('pMotor').onclick = () => { if (!S.motor) ofrecerInstalar(''); };
  function ofrecerInstalar(detalle) {
    hoja(`<h3>El solver no pudo iniciar</h3><p class="nota">El navegador no pudo ejecutar el solver incluido (WebAssembly)${detalle ? ': ' + esc(detalle) : ''}.</p>
      <p>Puede instalar <b>highspy</b> (el mismo solver HiGHS, para Python) con <code>pip</code>. Se hace una sola vez y requiere internet.</p>
      <div class="acc"><button class="btn gris" data-x="cerrar">Ahora no</button>${S.puedeInstalar ? '<button class="btn" data-x="instalar">Instalar y continuar</button>' : ''}</div><div id="msgInst" class="nota"></div>`,
      async (x, h) => {
        if (x === 'cerrar') return cerrarHoja();
        if (x === 'instalar') {
          h.querySelector('#msgInst').textContent = 'Instalando highspy… (puede tardar un minuto)'; h.querySelectorAll('button').forEach((b) => (b.disabled = true));
          try { const r = await (await fetch('/api/instalar_solver', { method: 'POST', body: '{}' })).json(); if (r.ok) { cerrarHoja(); crearWorker(); } else h.querySelector('#msgInst').textContent = 'No se pudo instalar: ' + r.salida; } catch (e) { h.querySelector('#msgInst').textContent = 'Error: ' + e.message; }
        }
      });
  }

  /* ================= tarjeta Problema ================= */
  function llenarSelects() {
    const opts = S.ds.nodos.map((n, i) => `<option value="${i}">${esc(n.id)} · ${esc(n.nombre)}</option>`).join('');
    ['origen', 'destino'].forEach((id) => { const prev = $(id).value; $(id).innerHTML = opts; if (prev !== '' && +prev < S.ds.nodos.length) $(id).value = prev; });
  }
  function camposProblema() {
    const p = $('problema').value, modo = $('modo').value;
    $('fModo').classList.toggle('oculto', p !== 'tsp');
    $('fMtsp').classList.toggle('oculto', p !== 'mtsp');
    $('fOrigen').classList.toggle('oculto', p === 'tsp' && modo === 'libre');
    $('fDestino').classList.toggle('oculto', !(p === 'camino' || (p === 'tsp' && modo === 'fijo')));
    $('fOrigen').firstChild.textContent = { tsp: 'Origen ', mtsp: 'Depósito ', camino: 'Origen ', desde: 'Origen ', arbol: 'Raíz ' }[p];
    pintarSeleccion();
  }
  ['problema', 'modo'].forEach((id) => ($(id).onchange = camposProblema));
  ['origen', 'destino'].forEach((id) => ($(id).onchange = pintarSeleccion));
  function pintarSeleccion() {
    const p = $('problema').value, o = +$('origen').value, d = +$('destino').value, usa = !$('fDestino').classList.contains('oculto');
    S.sel = { origen: o, destino: d };
    Mapa.estiloNodos({ deposito: o, seleccion: usa ? [o, d] : [o], colores: S.colores, tenue: S.tenue });
  }
  function logLinea(s) { const l = $('log'); l.classList.remove('oculto'); l.textContent += s + '\n'; l.scrollTop = 1e9; }
  function ocupado(on) { S.corriendo = on; $('bResolver').disabled = on; $('bDetener').disabled = !on; $('prog').classList.toggle('oculto', !on); document.querySelectorAll('[data-run]').forEach((b) => (b.disabled = on)); }

  function lanzar(kind, opt, titulo, extra) {
    if (S.corriendo) return;
    if (!S.motor) { if (S.worker) ofrecerInstalar(''); return; }
    $('log').textContent = ''; $('log').classList.remove('oculto'); ocupado(true);
    S.corrId++; S.pendiente = { kind, opt, titulo, extra: extra || {}, t0: performance.now() };
    S.worker.postMessage({ tipo: 'resolver', id: S.corrId, kind, D: S.ds.D, opt });
  }
  function parametros() {
    const p = $('problema').value, o = +$('origen').value, d = +$('destino').value, tiempo = Math.max(5, +$('tiempo').value || 120), n = S.ds.nodos.length;
    const lmin = Math.max(1, +$('lmin').value || 1), lmax = Math.max(0, +$('lmax').value || 0), m = +$('m').value;
    if (p === 'tsp') { const modo = $('modo').value; if (modo === 'fijo' && o === d) return aviso('El destino debe ser distinto del origen.'); return { kind: 'tsp', opt: { modo, origen: modo === 'libre' ? 0 : o, fin: d, tiempo, brecha: 1e-6 }, titulo: 'TSP · ' + { ciclo: 'circuito', abierto: 'camino abierto', fijo: 'camino de ' + nodo(o).id + ' a ' + nodo(d).id, libre: 'camino libre' }[modo] }; }
    if (p === 'mtsp') {
      if (!(m >= 2 && m < n)) return aviso(`El número de viajantes debe estar entre 2 y ${n - 1}.`);
      if (lmin * m > n - 1 || (lmax && lmax * m < n - 1)) return aviso(`Los límites por ruta son imposibles para ${n - 1} clientes y ${m} viajantes.`);
      return { kind: 'mtsp', opt: { m, deposito: o, lmin, lmax, objetivo: $('objetivo').value, abierto: $('abierto').checked, tiempo, brecha: 1e-6 }, titulo: `m-TSP · ${m} viajantes` + (lmax || lmin > 1 ? ` · ${lmin}–${lmax || '∞'} por ruta` : '') + ($('objetivo').value === 'maximo' ? ' · ruta más larga mínima' : '') };
    }
    if (p === 'camino') { if (o === d) return aviso('El destino debe ser distinto del origen.'); return { kind: 'camino', opt: { origen: o, destino: d }, titulo: `Camino mínimo ${nodo(o).id} → ${nodo(d).id}` }; }
    if (p === 'desde') return { kind: 'desde', opt: { origenes: [o] }, titulo: `Caminos mínimos desde ${nodo(o).id}`, extra: { cols: null } };
    if (p === 'arbol') return { kind: 'arbol', opt: { raiz: o, tiempo }, titulo: `Árbol de valor mínimo · raíz ${nodo(o).id}` };
  }
  function aviso(t) { $('log').classList.remove('oculto'); $('log').textContent = '⚠ ' + t; return null; }
  $('bResolver').onclick = () => { const p = parametros(); if (p) lanzar(p.kind, p.opt, p.titulo, p.extra); };
  $('bDetener').onclick = () => { if (!S.corriendo) return; ocupado(false); logLinea('Detenido por el usuario.'); crearWorker(); };

  function terminarError(msg) { ocupado(false); logLinea('Error: ' + msg); S.res = null; renderPanel(); }
  async function terminar(res) {
    ocupado(false); const p = S.pendiente; if (!p) return;
    S.res = { kind: p.kind, opt: p.opt, titulo: p.titulo, res, extra: p.extra, ds: S.clave }; S.rutaSel = 0;
    $('log').classList.add('oculto'); setPanel('resultado');
    if (p.kind === 'tsp' || p.kind === 'mtsp') await dibujarResultado();
    else if (p.kind === 'camino' || p.kind === 'arbol') await dibujarResultado();
    else { Mapa.limpiarRutas(); S.colores = null; S.tenue = null; pintarSeleccion(); renderLeyenda(null); }
  }

  /* ================= dibujo del resultado en el mapa ================= */
  function grupos() {
    const r = S.res; if (!r) return [];
    if (r.kind === 'arbol') return [{ color: COL[1], pares: r.res.aristas.map(([i, j]) => [i, j]), flechas: false, peso: 3.5 }];
    if (r.res.rutas && r.res.rutas.length) return r.res.rutas.map((ru, k) => ({ color: COL[k % COL.length], pares: ru.slice(1).map((v, q) => [ru[q], v]), flechas: true }));
    return [];
  }
  async function dibujarResultado() {
    const g = grupos(), r0 = S.res; if (!g.length) return;
    const todos = g.flatMap((x) => x.pares);
    const chip = $('chipMapa'); chip.textContent = 'Trazando calles…';
    await Mapa.asegurar(todos, (a, b) => (chip.textContent = `Trazando calles… ${a}/${b}`));
    if (S.res !== r0) return;   // los datos cambiaron mientras se trazaban las calles
    const { sinGeom, total } = Mapa.dibujar(g);
    chip.textContent = sinGeom ? `${total - sinGeom} de ${total} tramos por calles · ${sinGeom} en línea recta (sin conexión a OSRM)` : `${total} tramos trazados por las calles`;
    const colores = {}, usados = new Set();
    g.forEach((x, k) => x.pares.forEach(([i, j]) => { usados.add(i); usados.add(j); colores[i] = colores[i] || x.color; colores[j] = colores[j] || x.color; }));
    const dep = S.res.kind === 'mtsp' ? S.res.opt.deposito : (S.res.res.rutas && S.res.res.rutas[0] ? S.res.res.rutas[0][0] : S.res.opt.raiz);
    S.colores = colores; if (dep !== undefined) delete colores[dep];
    S.tenue = new Set(S.ds.nodos.map((_, i) => i).filter((i) => !usados.has(i)));
    Mapa.estiloNodos({ deposito: dep, seleccion: null, colores, tenue: S.tenue });
    renderLeyenda(g); Mapa.ajustar([...usados]);
  }
  function renderLeyenda(g) {
    const l = $('leyenda'); if (!g || !g.length || S.res.kind === 'arbol') { l.classList.add('oculto'); return; }
    l.classList.remove('oculto'); l.innerHTML = g.map((x, k) => `<div><span class="punto" style="background:${x.color}"></span>Ruta ${k + 1} · ${fmt(S.res.res.dists[k], 1)} ${S.ds.unidad}</div>`).join('');
  }

  /* ================= panel derecho ================= */
  function setPanel(p) { S.panel = p; const nav = $('tabsDer'); nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.p === p)); indicador(nav); renderPanel(); }
  segmentado($('tabsDer'), (b) => { S.panel = b.dataset.p; renderPanel(); });
  function renderPanel() {
    const c = $('contenido'); c.innerHTML = ''; const fn = { resultado: pResultado, nodos: pNodos, matriz: pMatriz }[S.panel];
    const div = document.createElement('div'); div.className = 'entra'; c.appendChild(div); fn(div);
  }

  /* ---------- Resultado ---------- */
  function kpis(items) { return '<div class="kpis">' + items.map(([v, l, cls]) => `<div class="kpi ${cls || ''}"><b class="tabular">${v}</b><span>${l}</span></div>`).join('') + '</div>'; }
  function estadoKpi(res) { const opt = res.estado === 'óptimo'; return [opt ? 'Óptimo probado' : esc(res.estado.startsWith('límite') ? 'Límite de tiempo' : res.estado), 'Estado', opt ? 'estado ok' : 'estado aviso']; }
  function pasos(ru) {
    let ac = 0; return `<table><tr><th>#</th><th>Nodo</th><th>Nombre</th><th>Tramo</th><th>Acum.</th></tr>` + ru.map((v, j) => { const t = j ? S.ds.D[ru[j - 1]][v] : 0; ac += t; return `<tr><td>${j}</td><td>${esc(nodo(v).id)}</td><td>${esc(nodo(v).nombre)}</td><td class="tabular">${j ? fmt(t) : ''}</td><td class="tabular">${fmt(ac)}</td></tr>`; }).join('') + '</table>';
  }
  function pResultado(el) {
    const r = S.res;
    if (!r || r.ds !== S.clave) { el.innerHTML = `<div class="aviso info">Elija un problema y pulse <b>Resolver</b>, o use los atajos de <b>${esc(S.ds.titulo)}</b> a la izquierda. El resultado aparece aquí y sobre el mapa.</div><p class="nota">Todos los problemas se resuelven con optimización exacta (programación lineal / entera mixta), sin algoritmos de grafos ni heurísticas.</p>`; return; }
    const x = r.res, u = S.ds.unidad; let h = `<h3 style="margin-bottom:10px">${esc(r.titulo)}</h3>`;
    if (!x.rutas?.length && !x.aristas?.length && !x.dist) { el.innerHTML = h + `<div class="aviso error">${esc(x.estado)}. No se obtuvo una solución; revise que los datos permitan el recorrido o aumente el tiempo.</div>`; return; }
    const brecha = x.estado === 'óptimo' ? '0 %' : (x.gap == null ? 'n/d' : (x.gap * 100).toFixed(2) + ' %');
    if (r.kind === 'tsp' || r.kind === 'mtsp') {
      const items = [estadoKpi(x), [fmt(x.objetivo) + ' ' + u, r.kind === 'mtsp' && r.opt.objetivo === 'maximo' ? 'Ruta más larga' : 'Distancia total'], [brecha, 'Brecha de optimalidad'], [fmt(x.seg, 2) + ' s', 'Tiempo de cálculo']];
      if (r.kind === 'mtsp') items.splice(2, 0, [fmt(x.total) + ' ' + u, 'Suma de las rutas']);
      h += kpis(items);
      h += `<table><tr><th>Ruta</th><th>Recorrido</th><th>Paradas</th><th>${u}</th></tr>` + x.rutas.map((ru, k) => { const dep = ru[0]; const n = ru.filter((v, q) => !(q === 0 || (q === ru.length - 1 && v === dep))).length;
        return `<tr class="clic ${k === S.rutaSel ? 'activa' : ''}" data-k="${k}"><td><span class="punto" style="background:${COL[k % COL.length]}"></span>${x.rutas.length > 1 ? k + 1 : ''}</td><td class="recorrido">${ru.map((v) => `<span title="${esc(nodo(v).nombre)}">${esc(nodo(v).id)}</span>`).join(' → ')}</td><td>${n}</td><td class="tabular">${fmt(x.dists[k])}</td></tr>`; }).join('') + '</table>';
      h += `<div class="sep"></div><h3 style="font-size:15px;margin-bottom:6px">Detalle · ruta ${x.rutas.length > 1 ? S.rutaSel + 1 : ''}</h3>` + pasos(x.rutas[S.rutaSel]);
    } else if (r.kind === 'camino') {
      h += kpis([estadoKpi(x), [fmt(x.objetivo) + ' ' + u, 'Distancia mínima'], [x.rutas[0].length - 1, 'Tramos'], [fmt(x.seg, 2) + ' s', 'Tiempo de cálculo']]) + pasos(x.rutas[0]);
      const direct = S.ds.D[x.rutas[0][0]][x.rutas[0].at(-1)];
      if (isFinite(direct) && x.rutas[0].length > 2) h += `<p class="nota">El arco directo cuesta ${fmt(direct)} ${u}; la ruta óptima es ${fmt(direct - x.objetivo)} ${u} más corta.</p>`;
    } else if (r.kind === 'arbol') {
      h += kpis([estadoKpi(x), [fmt(x.objetivo) + ' ' + u, 'Costo total del árbol'], [x.aristas.length, 'Aristas'], [fmt(x.seg, 2) + ' s', 'Tiempo de cálculo']]);
      h += `<table><tr><th>Desde</th><th>Hasta</th><th>${u}</th></tr>` + [...x.aristas].sort((a, b) => b[2] - a[2]).map(([i, j, c]) => `<tr class="clic" data-i="${i}" data-j="${j}"><td>${esc(etq(i))}</td><td>${esc(etq(j))}</td><td class="tabular">${fmt(c)}</td></tr>`).join('') + '</table>';
    } else if (r.kind === 'desde') {
      const cols = r.extra.cols || S.ds.nodos.map((_, i) => i), orig = x.origenes;
      h += kpis([estadoKpi(x), [orig.length + ' × ' + cols.length, 'Pares resueltos'], [fmt(x.seg, 2) + ' s', 'Tiempo de cálculo']]);
      h += `<p class="nota">Cada celda es la distancia mínima (${u}) hallada con un programa lineal de flujo. Pulse una celda para ver el camino por las calles. En verde, el destino más cercano de cada origen.</p>`;
      h += '<div class="matriz-wrap"><table class="matriz"><tr><th></th>' + cols.map((c) => `<th title="${esc(nodo(c).nombre)}">${esc(nodo(c).id)}</th>`).join('') + '</tr>';
      orig.forEach((s, k) => { const mejor = Math.min(...cols.filter((c) => c !== s).map((c) => x.dist[k][c])); h += `<tr><td title="${esc(nodo(s).nombre)}">${esc(nodo(s).id)}</td>` + cols.map((c) => `<td class="celda ${c !== s && x.dist[k][c] === mejor ? 'mejor' : ''} ${r.celda && r.celda[0] === k && r.celda[1] === c ? 'sel' : ''}" data-k="${k}" data-c="${c}">${s === c ? '·' : fmt(x.dist[k][c], 1)}</td>`).join('') + '</tr>'; });
      h += '</table></div>';
    }
    h += `<div class="sep"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec mini" data-e="csv">Resultado CSV</button><button class="btn sec mini" data-e="geojson">GeoJSON</button><button class="btn sec mini" data-e="xlsx">Excel</button></div>`;
    el.innerHTML = h;
    el.querySelectorAll('tr.clic[data-k]').forEach((tr) => (tr.onclick = () => { S.rutaSel = +tr.dataset.k; Mapa.resaltar(S.rutaSel); renderPanel(); }));
    el.querySelectorAll('tr.clic[data-i]').forEach((tr) => (tr.onclick = () => Mapa.ajustar([+tr.dataset.i, +tr.dataset.j])));
    el.querySelectorAll('.celda').forEach((td) => (td.onclick = () => caminoDeCelda(+td.dataset.k, +td.dataset.c)));
    el.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => exportar(b.dataset.e)));
  }
  async function caminoDeCelda(k, c) {
    const r = S.res; if (!r || !r.res.origenes) return; const s = r.res.origenes[k]; if (s === c) return;
    const ruta = Solver.traza(r.res.pred[k], s, c); if (!ruta) return;
    r.celda = [k, c]; r.rutaCelda = ruta; renderPanel();
    const chip = $('chipMapa'); chip.textContent = 'Trazando calles…';
    const pares = ruta.slice(1).map((v, q) => [ruta[q], v]); await Mapa.asegurar(pares);
    if (S.res !== r) return;
    const { sinGeom, total } = Mapa.dibujar([{ color: COL[1], pares, flechas: true }]);
    chip.textContent = `Camino ${nodo(s).id} → ${nodo(c).id}: ${fmt(r.res.dist[k][c], 1)} ${S.ds.unidad} · ${ruta.map((v) => nodo(v).id).join(' → ')}` + (sinGeom ? ' (sin conexión a OSRM: línea recta)' : '');
    const used = new Set(ruta); S.colores = Object.fromEntries(ruta.map((v) => [v, COL[1]])); delete S.colores[s]; S.tenue = new Set(S.ds.nodos.map((_, i) => i).filter((i) => !used.has(i)));
    Mapa.estiloNodos({ deposito: s, colores: S.colores, tenue: S.tenue }); Mapa.ajustar(ruta); renderLeyenda(null);
  }

  /* ---------- Nodos (editable) ---------- */
  function pNodos(el) {
    const ds = S.ds, extra = ds.clave === 'china' ? 'Población (M)' : 'Demanda';
    let h = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center"><button class="btn sec mini" id="bAgregar">+ Agregar nodo</button><label class="check" style="flex:none"><input type="checkbox" id="chkMover" ${Mapa.editar ? 'checked' : ''}> Mover nodos en el mapa</label></div>`;
    if (S.sucio) h += `<div class="aviso">Cambió ${esc(S.sucio)}. Las distancias <b>no se recalculan solas</b>.<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center"><label class="campo" style="flex-direction:row;align-items:center;gap:6px">Factor<input id="fFactor" type="number" step="0.05" min="0.5" value="${S.factor}" style="width:70px"></label><button class="btn mini" id="bRecRecta">Línea recta × factor</button><button class="btn mini sec" id="bRecOsrm">Por carretera (OSRM)</button><button class="btn mini gris" id="bIgnorar">Ignorar</button></div></div>`;
    h += `<table><tr><th>ID</th><th>Nombre</th><th>Lat</th><th>Lon</th><th>${extra}</th><th></th></tr>` + ds.nodos.map((n, i) => `<tr><td><b>${esc(n.id)}</b></td><td><input data-i="${i}" data-f="nombre" value="${esc(n.nombre)}"></td><td><input data-i="${i}" data-f="lat" value="${n.lat}" inputmode="decimal" style="width:86px"></td><td><input data-i="${i}" data-f="lon" value="${n.lon}" inputmode="decimal" style="width:86px"></td><td><input data-i="${i}" data-f="extra" value="${n.extra}" inputmode="decimal" style="width:62px"></td><td><button class="btn mini peligro" data-del="${i}" aria-label="Eliminar nodo">✕</button></td></tr>`).join('') + '</table>';
    h += `<div class="sep"></div><button class="btn mini gris" id="bRestaurar">Restaurar datos originales</button>`;
    el.innerHTML = h;
    el.querySelectorAll('input[data-i]').forEach((inp) => (inp.onchange = () => editarNodo(+inp.dataset.i, inp.dataset.f, inp.value, inp)));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => eliminarNodo(+b.dataset.del)));
    $('bAgregar') && ($('bAgregar').onclick = agregarNodo);
    $('chkMover').onchange = (e) => Mapa.setEditar(e.target.checked);
    $('bRestaurar').onclick = restaurarOriginal;
    if ($('bRecRecta')) { $('bRecRecta').onclick = () => { S.factor = +$('fFactor').value || 1.3; recalcular('recta'); }; $('bRecOsrm').onclick = () => recalcular('osrm'); $('bIgnorar').onclick = () => { S.sucio = null; renderPanel(); }; }
  }
  function editarNodo(i, f, v, inp) {
    const n = nodo(i);
    if (f === 'nombre') n.nombre = v; else { const x = Number(String(v).replace(',', '.')); if (!isFinite(x) || (f === 'lat' && Math.abs(x) > 90) || (f === 'lon' && Math.abs(x) > 180)) { inp.value = n[f]; return; } n[f] = x; }
    Datos.guardar(S.ds); Mapa.actualizarNodo(i); llenarSelects();
    if (f === 'lat' || f === 'lon') { S.sucio = 'la posición de un nodo'; renderPanel(); }
  }
  function agregarNodo() {
    const ds = S.ds, c = Mapa.map.getCenter(), id = Math.max(...ds.nodos.map((n) => +n.id || 0)) + 1;
    ds.nodos.push({ id, nombre: 'Nodo nuevo ' + id, lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), extra: 0 });
    const n = ds.nodos.length - 1; ds.D.forEach((f) => f.push(INF)); ds.D.push(Array(n + 1).fill(INF));
    for (let j = 0; j < n; j++) { const d = Datos.haversine(ds.nodos[n].lat, ds.nodos[n].lon, ds.nodos[j].lat, ds.nodos[j].lon) * S.factor; ds.D[n][j] = d; ds.D[j][n] = d; }
    Datos.guardar(ds); S.res = null; montarNodos(); llenarSelects(); S.sucio = 'la lista de nodos (distancias nuevas: línea recta × ' + S.factor + ')'; renderPanel();
  }
  function eliminarNodo(i) {
    if (S.ds.nodos.length <= 3) return hoja('<h3>No se puede eliminar</h3><p class="nota">Se necesitan al menos 3 nodos.</p><div class="acc"><button class="btn" data-x="c">Entendido</button></div>', (x) => cerrarHoja());
    hoja(`<h3>¿Eliminar el nodo ${esc(nodo(i).id)}?</h3><p class="nota">${esc(nodo(i).nombre)}. Se quitan también sus distancias de la matriz.</p><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn peligro" data-x="ok">Eliminar</button></div>`, (x) => {
      cerrarHoja(); if (x !== 'ok') return; const ds = S.ds; ds.nodos.splice(i, 1); ds.D.splice(i, 1); ds.D.forEach((f) => f.splice(i, 1)); Datos.guardar(ds); S.res = null; montarNodos(); llenarSelects(); renderPanel(); Mapa.limpiarRutas(); });
  }
  function restaurarOriginal() {
    hoja('<h3>¿Restaurar los datos originales?</h3><p class="nota">Se descartan los cambios hechos en nodos y distancias de este conjunto.</p><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn" data-x="ok">Restaurar</button></div>', (x) => {
      cerrarHoja(); if (x !== 'ok') return; Datos.restaurar(S.ds); S.res = null; S.sucio = null; montarNodos(); llenarSelects(); Mapa.limpiarRutas(); Mapa.ajustar(); renderPanel(); renderParcial(); });
  }
  async function recalcular(modo) {
    const ds = S.ds;
    if (modo === 'recta') { ds.D = Datos.matrizHaversine(ds.nodos, S.factor); }
    else {
      $('chipMapa').textContent = 'Consultando distancias por carretera…';
      try { const r = await fetch('/api/matriz', { method: 'POST', body: JSON.stringify({ puntos: ds.nodos.map((n) => [n.lat, n.lon]) }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); ds.D = Datos.aInf(d.D); }
      catch (e) { $('chipMapa').textContent = 'Sin conexión a OSRM: ' + e.message; return; }
    }
    Datos.guardar(ds); S.sucio = null; S.res = null; Mapa.limpiarRutas(); $('chipMapa').textContent = 'Distancias recalculadas'; renderPanel();
  }

  /* ---------- Matriz (editable) ---------- */
  function pMatriz(el) {
    const ds = S.ds, n = ds.nodos.length;
    el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><label class="check" style="flex:none"><input type="checkbox" id="chkSim" ${S.simetrica === false ? '' : 'checked'}> Mantener simétrica</label><span class="nota">Edite una celda; <b>#</b> = no hay arco.</span></div><div class="matriz-wrap"><table class="matriz"><tr><th></th>${ds.nodos.map((x) => `<th title="${esc(x.nombre)}">${esc(x.id)}</th>`).join('')}</tr>${ds.D.map((f, i) => `<tr><td title="${esc(ds.nodos[i].nombre)}">${esc(ds.nodos[i].id)}</td>${f.map((v, j) => (i === j ? '<td class="diag"></td>' : `<td><input data-i="${i}" data-j="${j}" value="${isFinite(v) ? v : '#'}" inputmode="decimal"></td>`)).join('')}</tr>`).join('')}</table></div>`;
    $('chkSim').onchange = (e) => (S.simetrica = e.target.checked);
    el.querySelectorAll('input[data-i]').forEach((inp) => (inp.onchange = () => {
      const i = +inp.dataset.i, j = +inp.dataset.j, v = Datos.num(inp.value); inp.value = isFinite(v) ? v : '#'; ds.D[i][j] = v;
      if (S.simetrica !== false) { ds.D[j][i] = v; const o = el.querySelector(`input[data-i="${j}"][data-j="${i}"]`); if (o) o.value = inp.value; }
      Datos.guardar(ds); S.res = null; $('chipMapa').textContent = 'Matriz editada: vuelva a resolver';
    }));
  }

  /* ================= atajos del parcial por conjunto ================= */
  function renderParcial() {
    const c = $('cParcial'), ds = S.ds; c.classList.remove('oculto');
    if (S.clave === 'china') {
      const opt = (a, b) => ds.nodos.filter((n) => n.id >= a && n.id <= b).map((n) => `<option value="${n.id}">${n.id} · ${esc(n.nombre)}</option>`).join('');
      c.innerHTML = `<h2>Parcial · Punto 1</h2><p class="nota" style="margin-top:-4px">Camino mínimo con origen en el Top 1–10 y destino en el Top 15–25; árbol con origen en el Top 11–20.</p>
        <div class="fila"><label class="campo">Origen (Top 1–10)<select id="pO">${opt(1, 10)}</select></label><label class="campo">Destino (Top 15–25)<select id="pD">${opt(15, 25)}</select></label></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn mini" data-run id="pCamino">Camino mínimo</button><button class="btn mini sec" data-run id="pMatrizBtn">Matriz 10 × 11</button></div><div class="sep"></div>
        <div class="fila"><label class="campo">Raíz del árbol (Top 11–20)<select id="pR">${opt(11, 20)}</select></label></div>
        <button class="btn mini" data-run id="pArbol">Árbol de valor mínimo</button><div class="sep"></div>
        <p class="nota">Complementos con el mismo modelo:</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn mini sec" data-run id="pTsp">TSP circuito</button><button class="btn mini sec" data-run id="pMtsp">m-TSP · 2</button></div>`;
      $('pO').value = '2'; $('pD').value = '25'; $('pR').value = '11';
      $('pCamino').onclick = () => { const o = idx($('pO').value), d = idx($('pD').value); lanzar('camino', { origen: o, destino: d }, `Camino mínimo ${nodo(o).id} → ${nodo(d).id}`); };
      $('pMatrizBtn').onclick = () => { const orig = ds.nodos.map((n, i) => i).filter((i) => nodo(i).id >= 1 && nodo(i).id <= 10), cols = ds.nodos.map((n, i) => i).filter((i) => nodo(i).id >= 15 && nodo(i).id <= 25); lanzar('desde', { origenes: orig }, 'Caminos mínimos · origen Top 1–10 → destino Top 15–25', { cols }); };
      $('pArbol').onclick = () => { const r = idx($('pR').value); lanzar('arbol', { raiz: r, tiempo: 180 }, `Árbol de valor mínimo · raíz ${nodo(r).id}`); };
      $('pTsp').onclick = () => lanzar('tsp', { modo: 'ciclo', origen: idx(1), tiempo: 120, brecha: 1e-6 }, 'TSP · circuito desde ' + nodo(idx(1)).id);
      $('pMtsp').onclick = () => lanzar('mtsp', { m: 2, deposito: idx(1), lmin: 1, lmax: 0, objetivo: 'suma', abierto: false, tiempo: 120, brecha: 1e-6 }, 'm-TSP · 2 viajantes');
    } else {
      const dep = 0, rapido = (m, lmin, lmax, obj, tit) => () => lanzar('mtsp', { m, deposito: dep, lmin, lmax, objetivo: obj || 'suma', abierto: false, tiempo: 180, brecha: 1e-6 }, tit);
      c.innerHTML = `<h2>Parcial · Punto 2</h2><p class="nota" style="margin-top:-4px">Recorrido de supervisores por las 25 tiendas ARA desde el centro de distribución (nodo 0, provisional: ajuste sus coordenadas en «Nodos»).</p>
        <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn sec" data-run id="c1">TSP · 1 supervisor (circuito)</button>
        <button class="btn sec" data-run id="c2">m-TSP · 2 supervisores, sin límites</button>
        <button class="btn sec" data-run id="c3">m-TSP · 2 supervisores, 12 y 13 tiendas</button>
        <button class="btn sec" data-run id="c4">m-TSP · 3 supervisores, 8 y 9 tiendas</button>
        <button class="btn sec" data-run id="c5">m-TSP · 2 supervisores, ruta más larga mínima</button></div>
        <p class="nota" style="margin-top:10px">Sin límites por ruta, el óptimo puede dejar casi todas las tiendas a un solo supervisor; los límites balancean la carga.</p>`;
      $('c1').onclick = () => lanzar('tsp', { modo: 'ciclo', origen: dep, tiempo: 120, brecha: 1e-6 }, 'TSP · 1 supervisor (circuito)');
      $('c2').onclick = rapido(2, 1, 0, 'suma', 'm-TSP · 2 supervisores, sin límites'); $('c3').onclick = rapido(2, 12, 13, 'suma', 'm-TSP · 2 supervisores · 12–13 tiendas');
      $('c4').onclick = rapido(3, 8, 9, 'suma', 'm-TSP · 3 supervisores · 8–9 tiendas'); $('c5').onclick = rapido(2, 1, 0, 'maximo', 'm-TSP · 2 supervisores · ruta más larga mínima');
    }
    c.querySelectorAll('.btn').forEach((b) => (b.disabled = S.corriendo));
  }

  /* ================= hoja modal, menú ================= */
  function hoja(html, alAccion) {
    const h = $('hoja'); h.innerHTML = html; $('velo').classList.add('abierto');
    h.onclick = (e) => { const b = e.target.closest('[data-x]'); if (b && alAccion) alAccion(b.dataset.x, h); };
    const f = h.querySelector('button,input'); f && f.focus();
  }
  function cerrarHoja() { $('velo').classList.remove('abierto'); }
  $('velo').onclick = (e) => { if (e.target === $('velo')) cerrarHoja(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarHoja(); cerrarMenu(); } });

  function abrirMenu(btn, items) {
    const m = $('menuExp'), r = btn.getBoundingClientRect();
    m.innerHTML = items.map((it) => (it === '-' ? '<hr>' : `<button role="menuitem" data-a="${it[0]}">${it[1]}</button>`)).join('');
    m.style.top = r.bottom + 8 + 'px'; m.style.right = innerWidth - r.right + 'px'; m.classList.add('abierto');
    m.onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) { cerrarMenu(); exportar(b.dataset.a); } };
  }
  function cerrarMenu() { $('menuExp').classList.remove('abierto'); }
  document.addEventListener('click', (e) => { if (!e.target.closest('#menuExp') && !e.target.closest('#bExportar')) cerrarMenu(); });
  $('bExportar').onclick = (e) => { e.stopPropagation(); abrirMenu($('bExportar'), [['xlsx', 'Libro de Excel (nodos, matriz, resultado)'], '-', ['nodos', 'Nodos (CSV)'], ['matriz', 'Matriz de distancias (CSV)'], ['json', 'Datos completos (JSON)'], '-', ['csv', 'Resultado (CSV)'], ['geojson', 'Resultado sobre el mapa (GeoJSON)'], ['pdf', 'Imprimir / guardar informe (PDF)']]); };

  async function exportar(que) {
    const ds = S.ds, r = S.res && S.res.ds === S.clave ? S.res.res : null, base = ds.clave;
    if (que === 'nodos') Datos.descargar(base + '_nodos.csv', Datos.csv(Datos.filasNodos(ds)), 'text/csv');
    else if (que === 'matriz') Datos.descargar(base + '_matriz.csv', Datos.csv(Datos.filasMatriz(ds)), 'text/csv');
    else if (que === 'json') Datos.descargar(base + '_datos.json', JSON.stringify({ clave: ds.clave, titulo: ds.titulo, unidad: ds.unidad, nodos: ds.nodos, D: Datos.aNull(ds.D) }, null, 1), 'application/json');
    else if (que === 'csv') Datos.descargar(base + '_resultado.csv', Datos.csv(Datos.filasResultado(ds, r)), 'text/csv');
    else if (que === 'geojson') Datos.descargar(base + '_resultado.geojson', Datos.geojson(ds, r, (i, j) => Mapa.geom(i, j)), 'application/geo+json');
    else if (que === 'pdf') window.print();
    else if (que === 'xlsx') {
      const hojas = [{ nombre: 'Nodos', filas: Datos.filasNodos(ds) }, { nombre: 'Matriz', filas: Datos.filasMatriz(ds).map((f) => f.map((v) => (v === '#' ? '' : v))) }];
      if (r) hojas.push({ nombre: 'Resultado', filas: [[S.res.titulo], [], ...Datos.filasResultado(ds, r)] });
      try { const resp = await fetch('/api/xlsx', { method: 'POST', body: JSON.stringify({ hojas }) }); if (!resp.ok) throw new Error('El servidor no pudo crear el Excel'); Datos.descargar(base + '_libro.xlsx', await resp.blob()); }
      catch (e) { $('chipMapa').textContent = 'No se pudo crear el Excel: ' + e.message; }
    }
  }

  /* ================= importar ================= */
  $('bImportar').onclick = () => hoja(`<h3>Importar datos</h3><p class="nota">Reemplaza o complementa «${esc(S.ds.titulo)}». Formatos: <b>CSV, TSV, TXT, Excel (.xlsx) o JSON</b>. Se detecta si el archivo trae <b>nodos</b> (lat, lon), una <b>matriz</b> de distancias o una lista de <b>aristas</b> (origen, destino, costo).</p>
    <div class="dropzona" id="dz">Arrastre aquí el archivo o <button class="btn sec mini" id="bElegir">elija uno</button></div><div class="acc"><button class="btn gris" data-x="c">Cerrar</button></div>`, (x) => x === 'c' && cerrarHoja());
  document.addEventListener('click', (e) => { if (e.target.id === 'bElegir') $('archivo').click(); });
  $('archivo').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await procesarArchivo(f); };
  ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, async (e) => { if (!e.dataTransfer) return; e.preventDefault(); const dz = $('dz'); if (ev === 'dragover') { dz && dz.classList.add('sobre'); return; } dz && dz.classList.remove('sobre'); const f = e.dataTransfer.files[0]; if (f) await procesarArchivo(f); }));

  async function procesarArchivo(file) {
    try {
      const l = await Datos.leerArchivo(file); const plan = { nodos: null, matriz: null, aristas: null, nombre: file.name };
      if (l.tipo === 'json') { const j = l.json; if (j.nodos) plan.nodos = j.nodos.map((n, i) => ({ id: n.id ?? i + 1, nombre: n.nombre ?? 'Nodo ' + (i + 1), lat: +n.lat, lon: +n.lon, extra: n.extra ?? 0 })); if (j.D) plan.matriz = { ids: (plan.nodos || []).map((n) => n.id), D: Datos.aInf(j.D) }; }
      else l.hojas.forEach((h) => { if (!h.filas.length) return; const t = Datos.detectar(h.filas); try { if (t === 'nodos' && !plan.nodos) plan.nodos = Datos.filasANodos(h.filas); else if (t === 'aristas' && !plan.aristas) plan.aristas = Datos.filasAAristas(h.filas, false); else if (t === 'matriz' && !plan.matriz && h.filas.length > 2) plan.matriz = Datos.filasAMatriz(h.filas); } catch (err) { plan.error = err.message; } });
      mostrarPlan(plan);
    } catch (err) { hoja(`<h3>No se pudo leer el archivo</h3><p class="nota">${esc(err.message)}</p><div class="acc"><button class="btn" data-x="c">Cerrar</button></div>`, () => cerrarHoja()); }
  }
  function mostrarPlan(p) {
    const partes = [];
    if (p.nodos) partes.push(`<b>${p.nodos.length} nodos</b> con coordenadas`); if (p.matriz) partes.push(`una <b>matriz ${p.matriz.D.length} × ${p.matriz.D.length}</b>`); if (p.aristas) partes.push(`<b>${p.aristas.length} aristas</b>`);
    if (!partes.length) return hoja(`<h3>No reconozco el contenido</h3><p class="nota">${esc(p.error || 'Use encabezados como id, nombre, lat, lon; origen, destino, costo; o una matriz con etiquetas.')}</p><div class="acc"><button class="btn" data-x="c">Cerrar</button></div>`, () => cerrarHoja());
    const n = S.ds.nodos.length, solo = !p.nodos && p.matriz && p.matriz.D.length === n;
    const accion = solo ? `Se reemplazará solo la <b>matriz de distancias</b> (los ${n} nodos se conservan).` : p.nodos ? `Se reemplazarán los <b>nodos</b>${p.matriz && p.matriz.D.length === p.nodos.length ? ' y la <b>matriz</b>' : '; las distancias se calcularán en <b>línea recta × factor</b>'}.` : 'Se creará un conjunto nuevo; los nodos sin coordenadas se ubicarán en círculo alrededor del centro del mapa.';
    hoja(`<h3>${esc(p.nombre)}</h3><p>Se detectó ${partes.join(', ')}.</p><p class="nota">${accion}</p><div class="fila"><label class="campo">Factor de rodeo (si hay que calcular distancias)<input id="impFactor" type="number" step="0.05" value="${S.factor}"></label></div><div class="acc"><button class="btn gris" data-x="c">Cancelar</button><button class="btn" data-x="ok">Aplicar</button></div>`, (x, h) => {
      if (x !== 'ok') return cerrarHoja(); S.factor = +h.querySelector('#impFactor').value || 1.3; aplicarPlan(p); cerrarHoja(); });
  }
  function aplicarPlan(p) {
    const ds = S.ds, c = ds.centro;
    const circulo = (k, i) => { const a = 2 * Math.PI * i / k; return [c[0] + 1.5 * Math.cos(a), c[1] + 1.5 * Math.sin(a)]; };
    let nodos = p.nodos, D = null;
    if (p.matriz) { D = p.matriz.D; if (!nodos) { if (D.length === ds.nodos.length) nodos = ds.nodos; else nodos = p.matriz.ids.map((id, i) => ({ id, nombre: 'Nodo ' + id, lat: circulo(D.length, i)[0], lon: circulo(D.length, i)[1], extra: 0 })); } }
    else if (p.aristas && !nodos) {
      const ids = [...new Set(p.aristas.flatMap((e) => [e[0], e[1]]))]; const conocidos = ids.every((id) => idx(id) >= 0);
      nodos = conocidos ? ds.nodos : ids.map((id, i) => ({ id, nombre: 'Nodo ' + id, lat: circulo(ids.length, i)[0], lon: circulo(ids.length, i)[1], extra: 0 }));
      D = nodos.map(() => nodos.map(() => INF)); const pos = (id) => nodos.findIndex((n) => String(n.id) === String(id));
      p.aristas.forEach(([a, b, w]) => { const i = pos(a), j = pos(b); if (i >= 0 && j >= 0) { D[i][j] = w; D[j][i] = w; } });
    }
    if (nodos && !D) D = Datos.matrizHaversine(nodos, S.factor);
    if (!nodos || !D || D.length !== nodos.length) return hoja('<h3>Datos inconsistentes</h3><p class="nota">El número de nodos no coincide con el tamaño de la matriz.</p><div class="acc"><button class="btn" data-x="c">Cerrar</button></div>', () => cerrarHoja());
    ds.nodos = nodos.map((n) => ({ ...n })); ds.D = D.map((f, i) => f.map((v, j) => (i === j ? INF : v)));
    Datos.guardar(ds); S.res = null; S.sucio = null; montarNodos(); llenarSelects(); Mapa.limpiarRutas(); Mapa.ajustar(); renderPanel(); renderParcial(); $('chipMapa').textContent = `Datos importados: ${ds.nodos.length} nodos`;
  }

  /* ================= pestañas Cali / China ================= */
  function montarNodos() {
    Mapa.montar(S.ds, {
      click: (i, mk) => Mapa.abrirPopup(i, `<b>${esc(nodo(i).id)} · ${esc(nodo(i).nombre)}</b><div class="nota">${nodo(i).lat.toFixed(5)}, ${nodo(i).lon.toFixed(5)}</div><div class="acc"><button class="btn mini" data-s="o">Origen</button><button class="btn mini sec" data-s="d">Destino</button><button class="btn mini gris" data-s="e">Editar</button></div>`, (pop) => pop.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { mk.closePopup(); if (b.dataset.s === 'o') { $('origen').value = i; pintarSeleccion(); } else if (b.dataset.s === 'd') { $('destino').value = i; pintarSeleccion(); } else { setPanel('nodos'); } }))),
      mover: (i, lat, lon) => { const n = nodo(i); n.lat = +lat.toFixed(5); n.lon = +lon.toFixed(5); Datos.guardar(S.ds); S.sucio = 'la posición del nodo ' + n.id; if (S.panel === 'nodos') renderPanel(); },
    });
    S.colores = null; S.tenue = null;
  }
  async function cambiarTab(clave) {
    if (S.corriendo) { S.worker.terminate(); ocupado(false); crearWorker(); }
    S.clave = clave; S.ds = S.sets[clave]; S.res = null; S.sucio = null; S.rutaSel = 0; S.simetrica = undefined;
    $('tTitulo').textContent = ''; document.title = S.ds.titulo + ' · Parcial de Grafos';
    llenarSelects(); $('origen').value = idx(S.ds.origen_defecto) >= 0 ? idx(S.ds.origen_defecto) : 0; $('destino').value = S.ds.nodos.length - 1; $('m').value = 2;
    montarNodos(); Mapa.limpiarRutas(); $('leyenda').classList.add('oculto'); Mapa.map.setView(S.ds.centro, S.ds.zoom); setTimeout(() => Mapa.ajustar(), 80);
    $('chipMapa').textContent = S.ds.subtitulo; camposProblema(); renderParcial(); setPanel('resultado');
    document.querySelectorAll('.col.izq .tarjeta, .panel-der').forEach((t, i) => { t.classList.remove('entra'); void t.offsetWidth; t.style.setProperty('--i', i + 1); t.classList.add('entra'); });
  }
  segmentado($('tabs'), (b) => cambiarTab(b.dataset.tab));
  $('bAjustar').onclick = () => { if (S.res && S.res.ds === S.clave && S.colores) Mapa.ajustar(Object.keys(S.colores).map(Number).concat(S.res.opt.deposito !== undefined ? [S.res.opt.deposito] : [])); else Mapa.ajustar(); };

  /* ================= arranque ================= */
  (async function () {
    Mapa.iniciar('mapa', (e, n) => { if (e === 'mapa-offline') $('chipMapa').textContent = 'Sin conexión: el mapa base no está disponible, pero los nodos y las rutas sí'; });
    try { S.sets.cali = await Datos.cargar('cali'); S.sets.china = await Datos.cargar('china'); }
    catch (e) { $('chipMapa').textContent = 'No se pudieron cargar los datos: ' + e.message; return; }
    crearWorker();
    const inicial = new URLSearchParams(location.search).get('tab') === 'china' ? 'china' : 'cali';
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === inicial)); indicador($('tabs'));
    cambiarTab(inicial);
  })();
  window.__S = S; // para depuración
})();
