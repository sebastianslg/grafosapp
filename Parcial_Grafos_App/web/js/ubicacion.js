/* Ubicación del centro de distribución: lo decide usted (colocar / arrastrar) o se pide la posición óptima. */
(function () {
  'use strict';
  const { S, $, esc, fmt, nodo, etq, corto, chip, COL } = App;
  const INF = Infinity;
  S.ubic = null;
  const OBJETIVOS = [
    ['ruta1', 'Mínimo recorrido de 1 supervisor (TSP exacto desde cada candidato)'],
    ['rutam', 'Mínimo recorrido de varios supervisores (m-TSP exacto)'],
    ['mediana', 'Mínima distancia total a los clientes (1 CD)'],
    ['centro', 'Mínima distancia al cliente más lejano (1 CD)'],
    ['pmed', 'Varios CD · p-mediana (distancia total mínima)'],
    ['pcen', 'Varios CD · p-centro (cliente más lejano mínimo)'],
    ['fijo', 'Varios CD · costo fijo + transporte (localización con costo fijo)'],
    ['cob', 'Cobertura: mínimo de CD para cubrir a todos dentro de un radio'],
  ];
  const VIS = { ruta1: ['top', 'dist'], rutam: ['m', 'top', 'dist'], mediana: ['pond', 'dist'], centro: ['dist'], pmed: ['p', 'pond', 'dist'], pcen: ['p', 'dist'], fijo: ['tc', 'p0', 'pond', 'dist'], cob: ['radio', 'dist'] };

  /* ================= candidatos ================= */
  App.modos.cand = {
    texto: 'Haga clic en el mapa para agregar candidatos a centro de distribución · Esc para terminar',
    click(ll) { S.ds.candidatos.push({ nombre: 'Candidato ' + (S.ds.candidatos.length + 1), lat: +ll.lat.toFixed(6), lon: +ll.lng.toFixed(6), fijo: 0 }); cambiaronCand(); },
  };
  const cambiaronCand = () => { Datos.guardar(S.ds); Mapa.montarCandidatos(S.ds.candidatos, App.callbacksCandidatos); if (S.panel === 'cd') App.renderPanel(); };
  App.candidatoClick = (k, mk) => {
    const c = S.ds.candidatos[k]; mk.unbindPopup(); mk.bindPopup(`<b>${esc(c.nombre)}</b><div class="nota">${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}</div><div class="acc"><button class="btn mini" data-s="cd">CD aquí</button><button class="btn mini peligro" data-s="x">Quitar</button></div>`, { closeButton: false }).openPopup();
    mk.getPopup().getElement().querySelectorAll('[data-s]').forEach((b) => (b.onclick = async () => { mk.closePopup(); if (b.dataset.s === 'cd') await App.colocarDc(c.lat, c.lon); else { S.ds.candidatos.splice(k, 1); cambiaronCand(); } }));
  };
  function generarCuadricula(filas, cols) {
    const ds = S.ds; let s, w, n, e;
    if (ds.area && ds.area.length > 2) { const b = Datos.bboxArea(ds.area); [s, w, n, e] = b; }
    else { const cl = Datos.clientes(ds).map((i) => nodo(i)); if (!cl.length) return 0; const la = cl.map((x) => x.lat), lo = cl.map((x) => x.lon); s = Math.min(...la); n = Math.max(...la); w = Math.min(...lo); e = Math.max(...lo); const py = (n - s) * 0.15 || 0.005, px = (e - w) * 0.15 || 0.005; s -= py; n += py; w -= px; e += px; }
    const nuevos = [];
    for (let i = 0; i < filas; i++) for (let j = 0; j < cols; j++) {
      const lat = filas === 1 ? (s + n) / 2 : s + (n - s) * i / (filas - 1), lon = cols === 1 ? (w + e) / 2 : w + (e - w) * j / (cols - 1);
      if (ds.area && ds.area.length > 2 && !Datos.dentro(ds.area, lat, lon)) continue;
      nuevos.push({ nombre: 'Candidato ' + (ds.candidatos.length + nuevos.length + 1), lat: +lat.toFixed(6), lon: +lon.toFixed(6), fijo: 0 });
    }
    ds.candidatos.push(...nuevos); cambiaronCand(); return nuevos.length;
  }

  /* ================= panel CD ================= */
  function pCd(el) {
    const ds = S.ds, k = Datos.dcIdx(ds), dc = k >= 0 ? nodo(k) : null, nc = ds.candidatos.length, u = S.ubic;
    const obj = S.objCd || 'ruta1';
    let h = `<h3 style="font-size:15px;margin-bottom:6px">Centro de distribución</h3>
      <p class="nota" style="margin:0 0 8px">El CD <b>no es un dato de entrada</b>: usted decide dónde va. Arrastre el marcador <b>CD</b> en el mapa, use «Mover el CD» en Herramientas, búsquelo por dirección, o pida la ubicación óptima abajo. Las distancias se recalculan solas.</p>`;
    h += dc ? `<div class="fila"><label class="campo">Latitud<input id="dLat" value="${dc.lat}" inputmode="decimal"></label><label class="campo">Longitud<input id="dLon" value="${dc.lon}" inputmode="decimal"></label></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn mini" id="dAplicar">Mover a estas coordenadas</button><button class="btn mini sec" id="dClic">Colocar con un clic</button><button class="btn mini gris" id="dQuitar">Dejar de ser CD</button></div>`
      : `<div class="aviso info">Este proyecto no tiene centro de distribución.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn mini" id="dClic">Colocar con un clic</button><button class="btn mini sec" id="dCentro">Crear en el centro del mapa</button></div>`;
    h += `<div class="sep"></div><h3 style="font-size:15px;margin-bottom:6px">Ubicación óptima</h3>
      <div class="fila"><label class="campo" style="flex-basis:100%">¿Qué quiere optimizar?<select id="uObj">${OBJETIVOS.map(([v, t]) => `<option value="${v}" ${v === obj ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="fila" id="uPar">
        <label class="campo" data-v="m">Supervisores (m)<input id="uM" type="number" min="2" value="2"></label><label class="campo" data-v="m">Mín. por ruta<input id="uLmin" type="number" min="1" value="1"></label><label class="campo" data-v="m">Máx. por ruta (0 = sin límite)<input id="uLmax" type="number" min="0" value="0"></label>
        <label class="campo" data-v="p">Cantidad de CD (p)<input id="uP" type="number" min="1" value="2"></label><label class="campo" data-v="p0">Máx. de CD (0 = libre)<input id="uP0" type="number" min="0" value="0"></label><label class="campo" data-v="radio">Radio de cobertura (km)<input id="uRadio" type="number" min="0" step="0.5" value="5"></label>
        <label class="campo" data-v="tc">Costo por unidad·km<input id="uTc" type="number" min="0" step="0.1" value="1"></label><label class="campo" data-v="top">Candidatos a evaluar (los mejores por cercanía)<input id="uTop" type="number" min="1" value="12"></label>
        <label class="campo" data-v="dist">Distancias candidato → cliente<select id="uDist"><option value="carretera" ${ds.modoDist === 'carretera' ? 'selected' : ''}>Por carretera (OSRM)</option><option value="recta" ${ds.modoDist !== 'carretera' ? 'selected' : ''}>Línea recta × ${ds.factor}</option></select></label>
        <label class="check" data-v="pond"><input type="checkbox" id="uPond" checked> Ponderar por la demanda de cada cliente</label></div>
      <p class="nota">Candidatos: <b>${nc}</b> ${nc ? '(rombos violeta en el mapa)' : '— genere o marque algunos'}${ds.area ? ' · se generan dentro del área definida' : ' · sin área: se usa el rectángulo de los clientes (+15 %)'}</p>
      <div class="fila"><label class="campo">Filas<input id="gF" type="number" min="1" max="15" value="6"></label><label class="campo">Columnas<input id="gC" type="number" min="1" max="15" value="6"></label></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn mini sec" id="gGen">Generar cuadrícula</button><button class="btn mini ${S.modo === 'cand' ? '' : 'sec'}" id="gClic">Agregar con clic</button><button class="btn mini sec" id="gCli">Usar los clientes</button>${nc ? '<button class="btn mini peligro" id="gBorrar">Borrar</button>' : ''}</div>
      <button class="btn" id="uCalc" data-run style="width:100%;justify-content:center" ${S.corriendo ? 'disabled' : ''}>Calcular la mejor ubicación</button>`;
    h += '<div id="uRes"></div>';
    if (nc && nc <= 40) h += `<div class="sep"></div><details><summary class="nota" style="cursor:pointer">Candidatos (${nc}) · nombre y costo fijo</summary><table><tr><th>#</th><th>Nombre</th><th>Costo fijo</th><th></th></tr>${ds.candidatos.map((c, q) => `<tr><td>${q + 1}</td><td><input data-q="${q}" data-f="nombre" value="${esc(c.nombre)}"></td><td><input data-q="${q}" data-f="fijo" value="${c.fijo || 0}" inputmode="decimal" style="width:70px"></td><td><button class="btn mini peligro" data-qd="${q}">✕</button></td></tr>`).join('')}</table></details>`;
    el.innerHTML = h;
    visibles(); $('uObj').onchange = (e) => { S.objCd = e.target.value; visibles(); };
    if ($('dAplicar')) { $('dAplicar').onclick = () => { const la = +$('dLat').value, lo = +$('dLon').value; if (isFinite(la) && isFinite(lo)) App.colocarDc(la, lo); }; $('dQuitar').onclick = () => { nodo(k).tipo = 'cliente'; Mapa.montar(ds, App.callbacksMapa); App.llenarSelects(); App.huboCambio(); }; }
    $('dClic').onclick = () => App.modoActivar('dc');
    if ($('dCentro')) $('dCentro').onclick = () => { const c = Mapa.map.getCenter(); App.colocarDc(c.lat, c.lng); };
    $('gGen').onclick = () => { const n = generarCuadricula(Math.max(1, +$('gF').value | 0), Math.max(1, +$('gC').value | 0)); chip(n ? `${n} candidatos generados` : 'No se generó ninguno (agregue clientes o ajuste el área)'); };
    $('gClic').onclick = () => App.modoActivar('cand');
    $('gCli').onclick = () => { Datos.clientes(ds).forEach((i) => ds.candidatos.push({ nombre: 'En ' + nodo(i).nombre, lat: nodo(i).lat, lon: nodo(i).lon, fijo: 0 })); cambiaronCand(); };
    if ($('gBorrar')) $('gBorrar').onclick = () => { ds.candidatos = []; S.ubic = null; cambiaronCand(); Mapa.dibujarLineas([]); };
    $('uCalc').onclick = calcular;
    el.querySelectorAll('input[data-q]').forEach((i) => (i.onchange = () => { const c = ds.candidatos[+i.dataset.q]; if (i.dataset.f === 'nombre') c.nombre = i.value; else c.fijo = Number(i.value.replace(',', '.')) || 0; Datos.guardar(ds); }));
    el.querySelectorAll('[data-qd]').forEach((b) => (b.onclick = () => { ds.candidatos.splice(+b.dataset.qd, 1); cambiaronCand(); }));
    if (u && u.ds === S.clave) resultadoHtml($('uRes'), u);
  }
  function visibles() { const v = new Set(VIS[$('uObj').value]); document.querySelectorAll('#uPar [data-v]').forEach((e) => e.classList.toggle('oculto', !v.has(e.dataset.v))); }

  /* ================= cálculo ================= */
  async function calcular() {
    if (S.corriendo) return;
    const ds = S.ds, cand = ds.candidatos, cl = Datos.clientes(ds), obj = $('uObj').value;
    const msg = (t) => { $('uRes').innerHTML = `<div class="aviso" style="margin-top:10px">${t}</div>`; };
    if (cl.length < 2) return msg('Se necesitan al menos 2 clientes.'); if (!cand.length) return msg('Genere o marque candidatos a centro de distribución primero.');
    if (!S.motor) return App.aviso('El solver no está listo.');
    const modo = $('uDist').value, ptsC = cand.map((c) => [c.lat, c.lon]), ptsK = cl.map((i) => [nodo(i).lat, nodo(i).lon]);
    if (cl.length > 90) return msg('Con más de 90 clientes use distancias en línea recta (límite del servicio de rutas).');
    $('uRes').innerHTML = '<p class="nota" style="margin-top:10px">Calculando distancias de los candidatos…</p>'; chip('Calculando distancias de los candidatos…');
    const a = await App.distancias(ptsC, ptsK, modo), b = a.via === 'carretera' ? await App.distancias(ptsK, ptsC, modo) : a;
    const dist = ptsC.map((_, q) => ptsK.map((__, i) => (b === a ? a.D[q][i] : (a.D[q][i] + b.D[i][q]) / 2)));
    const via = a.via === 'carretera' ? 'por carretera' : a.via === 'recta*' ? 'en línea recta (sin conexión a OSRM)' : 'en línea recta';
    const pesos = $('uPond').checked ? cl.map((i) => (nodo(i).extra > 0 ? nodo(i).extra : 1)) : null, dc = Datos.dcIdx(ds);
    const base = { cd: true, tipo: obj, clientes: cl, cand: cand.map((c) => Object.assign({}, c)), dist, via, ds: S.clave };
    if (obj === 'ruta1' || obj === 'rutam') {
      const Dcl = cl.map((i) => cl.map((j) => (i === j ? INF : ds.D[i][j]))), ida = dist.map((f) => f.slice());
      let actual = -1; if (dc >= 0) { ida.push(cl.map((j) => (ds.D[dc][j] + ds.D[j][dc]) / 2)); actual = ida.length - 1; }
      const m = +$('uM').value || 2;
      if (obj === 'rutam' && !(m >= 2 && m < cl.length)) return msg(`Supervisores entre 2 y ${cl.length - 1}.`);
      App.lanzar('ubicarruta', { Dcl, ida, modo: obj === 'ruta1' ? 'tsp' : 'mtsp', m, lmin: +$('uLmin').value || 1, lmax: +$('uLmax').value || 0, objetivo: 'suma', top: Math.max(1, +$('uTop').value || 12), tiempoCand: obj === 'ruta1' ? 30 : 60, actual },
        'Ubicación óptima del CD · ' + (obj === 'ruta1' ? 'TSP' : `${m}-TSP`), Object.assign(base, { actual, tieneActual: dc >= 0 }), {});
    } else {
      const tipo = { mediana: 'mediana', centro: 'centro', pmed: 'mediana', pcen: 'centro', fijo: 'fijo', cob: 'cobertura' }[obj], p = { mediana: 1, centro: 1, pmed: +$('uP').value || 2, pcen: +$('uP').value || 2, fijo: +$('uP0').value || 0, cob: 0 }[obj];
      const tc = +$('uTc').value || 1, w = (pesos || cl.map(() => 1)).map((x) => x * (obj === 'fijo' ? tc : 1));
      App.lanzar('ubicar', { tipo, p, pesos: obj === 'fijo' || pesos ? w : null, fijos: cand.map((c) => c.fijo || 0), radio: +$('uRadio').value, tiempo: 120 }, 'Ubicación óptima · ' + OBJETIVOS.find((o) => o[0] === obj)[1], base, { dist });
    }
  }

  /* ================= resultado ================= */
  App.resultadoCd = async (p, res) => {
    S.ubic = Object.assign({}, p.extra, { res, t0: p.t0 }); S.panelRetorno = 'cd'; App.setPanel('cd'); await dibujarCd(S.ubic, 0);
  };
  const nombreCand = (q, u) => (q === u.actual && u.actual >= 0 && q >= u.cand.length ? 'CD actual' : (u.cand[q].nombre || 'Candidato ' + (q + 1)));
  function resultadoHtml(el, u) {
    const r = u.res, un = S.ds.unidad;
    if (u.tipo === 'ruta1' || u.tipo === 'rutam') {
      if (!r.mejor) { el.innerHTML = `<div class="aviso error" style="margin-top:10px">${esc(r.estado)}</div>`; return; }
      const act = r.ranking.find((f) => f.k === u.actual && u.actual >= 0), mej = r.mejor, sel = u.sel ?? 0;
      let h = '<div class="sep"></div>' + App.kpis([[fmt(mej.objetivo) + ' ' + un, 'Mejor recorrido'], [nombreCand(mej.k, u), 'CD óptimo'], ...(act ? [[fmt(act.objetivo - mej.objetivo) + ' ' + un, 'Ahorro frente al CD actual'], [fmt(100 * (act.objetivo - mej.objetivo) / act.objetivo, 1) + ' %', 'Ahorro relativo']] : [[r.evaluados + ' de ' + r.total, 'Candidatos evaluados'], [fmt(r.seg, 1) + ' s', 'Tiempo de cálculo']])]);
      h += `<p class="nota">Cada candidato se resuelve con el ${u.tipo === 'ruta1' ? 'TSP' : 'm-TSP'} <b>exacto</b> (distancias ${esc(u.via)}). Se evaluaron los ${r.evaluados} más cercanos al centro de gravedad.</p>`;
      h += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn" id="uMover">Mover el CD al mejor candidato</button></div>`;
      h += `<table><tr><th>#</th><th>Candidato</th><th>${un}</th><th></th></tr>` + r.ranking.map((f, q) => `<tr class="clic ${q === sel ? 'activa' : ''}" data-q="${q}"><td>${q + 1}</td><td>${esc(nombreCand(f.k, u))}</td><td class="tabular">${f.objetivo === null ? '—' : fmt(f.objetivo)}</td><td>${f.k < u.cand.length ? `<button class="btn mini sec" data-uso="${f.k}">CD aquí</button>` : ''}</td></tr>`).join('') + '</table>';
      el.innerHTML = h;
      $('uMover').onclick = () => { const c = u.cand[mej.k]; if (c) App.colocarDc(c.lat, c.lon); else chip('El mejor es la posición actual del CD'); };
      el.querySelectorAll('tr.clic').forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('button')) return; u.sel = +tr.dataset.q; dibujarCd(u, u.sel); resultadoHtml(el, u); }));
      el.querySelectorAll('[data-uso]').forEach((b) => (b.onclick = () => { const c = u.cand[+b.dataset.uso]; App.colocarDc(c.lat, c.lon); }));
    } else {
      if (!r.abiertas || !r.abiertas.length) { el.innerHTML = `<div class="aviso error" style="margin-top:10px">${esc(r.estado)}</div>`; return; }
      const cuenta = r.abiertas.map((j) => r.asign.filter((a) => a[1] === j).length);
      let h = '<div class="sep"></div>' + App.kpis([[r.abiertas.length, 'CD elegidos'], [fmt(r.transporte, 1) + (u.tipo === 'fijo' ? '' : ' ' + un), 'Transporte ponderado'], [fmt(r.maxd, 2) + ' ' + un, 'Cliente más lejano'], ...(u.tipo === 'fijo' ? [[fmt(r.fijo, 1), 'Costo fijo total']] : [[fmt(r.seg, 1) + ' s', 'Tiempo de cálculo']])]);
      h += `<p class="nota">Estado: ${esc(r.estado)} · distancias ${esc(u.via)}.</p><table><tr><th>CD elegido</th><th>Clientes</th><th></th></tr>` + r.abiertas.map((j, q) => `<tr class="clic" data-j="${j}"><td><span class="punto" style="background:${COL[q % COL.length]}"></span>${esc(nombreCand(j, u))}</td><td>${cuenta[q]}</td><td><button class="btn mini sec" data-uso="${j}">CD aquí</button></td></tr>`).join('') + '</table>';
      h += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${r.abiertas.length === 1 ? '<button class="btn" id="uMover">Mover el CD aquí</button>' : '<button class="btn" id="uAbrir">Crear estos CD como nodos</button>'}</div>`;
      el.innerHTML = h;
      if ($('uMover')) $('uMover').onclick = () => { const c = u.cand[r.abiertas[0]]; App.colocarDc(c.lat, c.lon); };
      if ($('uAbrir')) $('uAbrir').onclick = async () => { for (const j of r.abiertas) { const c = u.cand[j], k = Datos.agregarNodo(S.ds, { nombre: 'CD ' + (c.nombre || ''), lat: c.lat, lon: c.lon, tipo: 'dc' }); await App.recalcularNodo(k); } Mapa.montar(S.ds, App.callbacksMapa); App.llenarSelects(); App.huboCambio(); chip(`${r.abiertas.length} centros de distribución creados`); };
      el.querySelectorAll('[data-uso]').forEach((b) => (b.onclick = () => { const c = u.cand[+b.dataset.uso]; App.colocarDc(c.lat, c.lon); }));
      el.querySelectorAll('tr.clic').forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('button')) return; const c = u.cand[+tr.dataset.j]; Mapa.map.flyTo([c.lat, c.lon], Math.max(Mapa.map.getZoom(), 13), { duration: App.reducir() ? 0 : 0.7 }); }));
    }
  }
  async function dibujarCd(u, sel) {
    const r = u.res, ds = S.ds;
    if (u.tipo === 'ruta1' || u.tipo === 'rutam') {
      if (!r.mejor) return; const f = r.ranking[sel] || r.mejor;
      const punto = (e) => (e === 0 ? (f.k < u.cand.length ? [u.cand[f.k].lat, u.cand[f.k].lon] : [nodo(Datos.dcIdx(ds)).lat, nodo(Datos.dcIdx(ds)).lon]) : [nodo(u.clientes[e - 1]).lat, nodo(u.clientes[e - 1]).lon]);
      const grupos = f.rutas.map((ru, k) => ({ color: COL[k % COL.length], pares: ru.slice(1).map((v, q) => [punto(ru[q]), punto(v)]), flechas: true }));
      chip('Trazando calles…'); await Mapa.asegurarPuntos(grupos.flatMap((g) => g.pares.map((p) => p)));
      const { sinGeom } = Mapa.dibujar(grupos); chip(`CD «${nombreCand(f.k, u)}» · recorrido ${fmt(f.objetivo)} ${ds.unidad}` + (sinGeom ? ' · algunos tramos en línea recta' : ''));
      Mapa.estiloCandidatos([f.k]); const col = {}; f.rutas.forEach((ru, k) => ru.forEach((e) => { if (e > 0) col[u.clientes[e - 1]] = COL[k % COL.length]; })); S.colores = col; S.tenue = null; Mapa.estiloNodos({ colores: col });
      Mapa.dibujarLineas([]); Mapa.ajustar(u.clientes, f.k < u.cand.length ? [[u.cand[f.k].lat, u.cand[f.k].lon]] : []);
    } else {
      Mapa.limpiarRutas(); Mapa.estiloCandidatos(r.abiertas);
      const lineas = r.asign.map(([i, j, d]) => ({ a: [nodo(u.clientes[i]).lat, nodo(u.clientes[i]).lon], b: [u.cand[j].lat, u.cand[j].lon], color: COL[r.abiertas.indexOf(j) % COL.length], peso: 2, opacidad: 0.85 }));
      Mapa.dibujarLineas(lineas); const col = {}; r.asign.forEach(([i, j]) => (col[u.clientes[i]] = COL[r.abiertas.indexOf(j) % COL.length])); S.colores = col; S.tenue = null; Mapa.estiloNodos({ colores: col });
      chip(`${r.abiertas.length} CD elegido(s) · líneas punteadas = a qué CD va cada cliente`); Mapa.ajustar(u.clientes, r.abiertas.map((j) => [u.cand[j].lat, u.cand[j].lon]));
    }
  }
  /* p-mediana / p-centro / cobertura sobre los propios nodos (desde la tarjeta Problema) */
  App.dibujarUbicarNodos = () => {
    const r = S.res.res; Mapa.limpiarRutas(); const col = {};
    const lineas = r.asign.map(([i, j]) => { col[i] = COL[r.abiertas.indexOf(j) % COL.length]; return { a: [nodo(i).lat, nodo(i).lon], b: [nodo(j).lat, nodo(j).lon], color: col[i], peso: 2, opacidad: 0.85 }; });
    Mapa.dibujarLineas(lineas); S.colores = col; S.tenue = null; Mapa.estiloNodos({ colores: col, seleccion: r.abiertas }); chip(`${r.abiertas.length} nodo(s) elegido(s): ${r.abiertas.map(corto).join(', ')}`); Mapa.ajustar();
  };
  App.paneles.push({ id: 'cd', titulo: 'CD', render: pCd });
})();
