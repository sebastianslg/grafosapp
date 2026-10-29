/* Datos: proyectos (Cali, China y los propios), grafo editable, persistencia, importación y exportación. */
(function (root) {
  'use strict';
  const INF = Infinity, R = 6371.0088;
  const KEY = (k) => 'parcial-grafos:v2:' + k, IDX = 'parcial-grafos:v2:proyectos';

  /* distancia EUCLIDIANA entre dos puntos: coordenadas proyectadas a un plano en km (x = lon·111,32·cos φ0, y = lat·110,574) */
  const euclid = (a, b, c, d, lat0) => { const kx = 111.32 * Math.cos((lat0 ?? (a + c) / 2) * Math.PI / 180), ky = 110.574; return Math.hypot((d - b) * kx, (c - a) * ky); };
  const aInf = (D) => D.map((f, i) => f.map((v, j) => (i === j || v === null || v === undefined || !isFinite(v) ? INF : v)));
  const aNull = (D) => (D ? D.map((f) => f.map((v) => (isFinite(v) ? v : null))) : null);
  const capInf = (C) => (C ? C.map((f) => f.map((v) => (v === null || v === undefined ? INF : v))) : null);

  /* ---------- modelo ---------- */
  function normalizar(ds) {
    ds.nodos.forEach((n) => { n.extra = n.extra || 0; n.balance = n.balance || 0; n.fijo = n.fijo || 0; n.tipo = n.tipo === 'dc' ? 'dc' : 'cliente'; n.peso = n.peso > 0 ? n.peso : 1; n.vtOn = !!n.vtOn; n.vtA = n.vtA ?? 8; n.vtB = n.vtB ?? 18; });
    ds.pesoArista = ds.pesoArista ? capInf(ds.pesoArista) : null;
    ds.vt = Object.assign({ usar: false, inicio: 8, servicio: 10 }, ds.vt || {});
    ds.flota = ds.flota && ds.flota.length ? ds.flota : [{ tipo: 'camión de reparto', n: 2, cap: 15, costoKm: 1, vel: 30 }, { tipo: 'tractocamión', n: 0, cap: 34, costoKm: 2.4, vel: 50 }];
    ds.balanceado = !!ds.balanceado; ds.metodo = ds.metodo === 'dfj' ? 'dfj' : 'mtz';
    ds.candidatos = ds.candidatos || []; ds.area = ds.area || null; ds.fondo = ds.fondo || null; ds.base = ds.base || 'calles';
    ds.dirigido = !!ds.dirigido; ds.factor = ds.factor || 1; ds.modoDist = (!ds.modoDist || ds.modoDist === 'recta') ? 'euclidiana' : ds.modoDist; ds.cap = ds.cap ? capInf(ds.cap) : null;
    ds.unidad = ds.unidad || 'km'; ds.centro = ds.centro || [ds.nodos[0].lat, ds.nodos[0].lon]; ds.zoom = ds.zoom || 12;
    return ds;
  }
  const dcIdx = (ds) => ds.nodos.findIndex((n) => n.tipo === 'dc');
  const clientes = (ds) => ds.nodos.map((n, i) => i).filter((i) => ds.nodos[i].tipo !== 'dc');
  const serializar = (ds) => ({ clave: ds.clave, titulo: ds.titulo, subtitulo: ds.subtitulo, unidad: ds.unidad, centro: ds.centro, zoom: ds.zoom, origen_defecto: ds.origen_defecto,
    nodos: ds.nodos, D: aNull(ds.D), cap: aNull(ds.cap), dirigido: ds.dirigido, factor: ds.factor, modoDist: ds.modoDist, pesoArista: aNull(ds.pesoArista), vt: ds.vt, flota: ds.flota, balanceado: ds.balanceado, metodo: ds.metodo, candidatos: ds.candidatos, area: ds.area, fondo: ds.fondo, base: ds.base, usuario: !!ds.usuario, grafoRalo: !!ds.grafoRalo });

  async function cargar(clave) {
    let ds = null;
    const g = (() => { try { return JSON.parse(localStorage.getItem(KEY(clave)) || 'null'); } catch (e) { return null; } })();
    if (clave === 'cali' || clave === 'china') {
      const orig = await (await fetch('datos/' + clave + '.json')).json();
      orig.D = aInf(orig.D); normalizar(orig); orig.original = { nodos: JSON.parse(JSON.stringify(orig.nodos)), D: aNull(orig.D) };
      ds = orig;
      if (g && g.nodos && g.D && g.nodos.length === g.D.length) { Object.assign(ds, g, { original: orig.original }); ds.D = aInf(g.D); ds.editado = true; }
    } else if (g) { ds = Object.assign({}, g); ds.D = aInf(g.D); ds.usuario = true; }
    if (ds) { normalizar(ds); ds.completo = completo(ds); }
    return ds;
  }
  const completo = (ds) => { const n = ds.nodos.length; let c = 0; ds.D.forEach((f) => f.forEach((v) => { if (isFinite(v)) c++; })); return c >= 0.9 * n * (n - 1); };
  function guardar(ds) {
    ds.editado = true; ds.completo = completo(ds);
    try { localStorage.setItem(KEY(ds.clave), JSON.stringify(serializar(ds))); return true; }
    catch (e) { return false; }   // sin almacenamiento o imagen demasiado grande
  }
  function restaurar(ds) {
    try { localStorage.removeItem(KEY(ds.clave)); } catch (e) { /* */ }
    ds.nodos = JSON.parse(JSON.stringify(ds.original.nodos)); ds.D = aInf(ds.original.D); ds.cap = null; ds.candidatos = []; ds.area = null; ds.fondo = null; ds.editado = false; normalizar(ds);
  }
  /* proyectos propios */
  function listar() { try { return JSON.parse(localStorage.getItem(IDX) || '[]'); } catch (e) { return []; } }
  function registrar(ds) { const l = listar().filter((p) => p.clave !== ds.clave); l.push({ clave: ds.clave, titulo: ds.titulo }); try { localStorage.setItem(IDX, JSON.stringify(l)); } catch (e) { /* */ } }
  function eliminar(clave) { try { localStorage.removeItem(KEY(clave)); localStorage.setItem(IDX, JSON.stringify(listar().filter((p) => p.clave !== clave))); } catch (e) { /* */ } }
  function nuevo({ titulo, centro, zoom, plantilla, base, modoDist, copiaDe }) {
    const clave = 'p' + Date.now().toString(36);
    let ds;
    if (copiaDe) { ds = JSON.parse(JSON.stringify(serializar(copiaDe))); ds.D = aInf(ds.D); ds.cap = ds.cap ? capInf(ds.cap) : null; delete ds.original; }
    else {
      ds = { nodos: [], D: [], cap: null, candidatos: [], area: null, fondo: null, dirigido: false };
      if (plantilla === 'cd') {
        const c = centro, off = 0.012, pts = [[0, 0], [off, off], [off, -off], [-off, off], [-off, -off], [off * 1.6, 0], [-off * 1.6, 0]];
        ds.nodos = pts.map(([a, b], i) => ({ id: i, nombre: i ? 'Cliente ' + i : 'Centro de distribución', lat: +(c[0] + a).toFixed(5), lon: +(c[1] + b).toFixed(5), extra: i ? 10 : 0, tipo: i ? 'cliente' : 'dc' }));
        ds.D = ds.nodos.map((a, i) => ds.nodos.map((b, j) => (i === j ? INF : euclid(a.lat, a.lon, b.lat, b.lon, c[0]))));
      }
    }
    Object.assign(ds, { clave, titulo: titulo || 'Proyecto nuevo', subtitulo: 'Proyecto propio', centro, zoom: zoom || 13, base: base || 'calles', modoDist: modoDist || 'euclidiana', usuario: true, grafoRalo: !plantilla && !copiaDe, origen_defecto: ds.nodos.length ? ds.nodos[0].id : 0 });
    normalizar(ds); ds.completo = completo(ds); guardar(ds); registrar(ds); return ds;
  }

  /* ---------- grafo: nodos y aristas ---------- */
  function agregarNodo(ds, n) {
    const id = Math.max(-1, ...ds.nodos.map((x) => (isFinite(+x.id) ? +x.id : -1))) + 1;
    const nodo = Object.assign({ id, nombre: 'Nodo ' + id, lat: 0, lon: 0, extra: 0, balance: 0, fijo: 0, tipo: 'cliente' }, n);
    ds.nodos.push(nodo); const k = ds.nodos.length - 1;
    ds.D.forEach((f) => f.push(INF)); ds.D.push(Array(k + 1).fill(INF));
    if (ds.cap) { ds.cap.forEach((f) => f.push(INF)); ds.cap.push(Array(k + 1).fill(INF)); }
    if (ds.pesoArista) { ds.pesoArista.forEach((f) => f.push(1)); ds.pesoArista.push(Array(k + 1).fill(1)); }
    return k;
  }
  function quitarNodo(ds, i) {
    ds.nodos.splice(i, 1); ds.D.splice(i, 1); ds.D.forEach((f) => f.splice(i, 1));
    if (ds.cap) { ds.cap.splice(i, 1); ds.cap.forEach((f) => f.splice(i, 1)); }
    if (ds.pesoArista) { ds.pesoArista.splice(i, 1); ds.pesoArista.forEach((f) => f.splice(i, 1)); }
  }
  function ponerArista(ds, i, j, costo, cap) {
    ds.D[i][j] = costo; if (!ds.dirigido) ds.D[j][i] = costo;
    if (cap !== undefined) { if (!ds.cap) ds.cap = ds.D.map((f) => f.map(() => INF)); ds.cap[i][j] = cap; if (!ds.dirigido) ds.cap[j][i] = cap; }
  }
  function ponerPesoArista(ds, i, j, w) { if (!ds.pesoArista) ds.pesoArista = ds.D.map((f) => f.map(() => 1)); ds.pesoArista[i][j] = w; if (!ds.dirigido) ds.pesoArista[j][i] = w; }
  function quitarArista(ds, i, j) { ds.D[i][j] = INF; if (!ds.dirigido) ds.D[j][i] = INF; if (ds.cap) { ds.cap[i][j] = INF; if (!ds.dirigido) ds.cap[j][i] = INF; } }
  function aristas(ds) {
    const out = [], n = ds.nodos.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j || !isFinite(ds.D[i][j])) continue;
      if (!ds.dirigido && j < i && isFinite(ds.D[j][i])) continue;
      out.push({ i, j, costo: ds.D[i][j], cap: ds.cap ? ds.cap[i][j] : INF });
    }
    return out;
  }
  function estadisticas(ds) {
    const a = aristas(ds); if (!a.length) return { nodos: ds.nodos.length, aristas: 0, min: null, max: null };
    let mn = a[0], mx = a[0]; a.forEach((x) => { if (x.costo < mn.costo) mn = x; if (x.costo > mx.costo) mx = x; });
    return { nodos: ds.nodos.length, aristas: a.length, min: mn, max: mx };
  }
  function matrizEuclidiana(nodos, escala, lat0) {
    const l0 = lat0 ?? (nodos.length ? nodos.reduce((t, n) => t + n.lat, 0) / nodos.length : 0);
    return nodos.map((a, i) => nodos.map((b, j) => (i === j ? INF : euclid(a.lat, a.lon, b.lat, b.lon, l0) * (escala || 1))));
  }
  /* área (polígono lat/lon): contiene punto, bbox y superficie aproximada en km² */
  function dentro(area, lat, lon) {
    let c = false;
    for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
      const [yi, xi] = area[i], [yj, xj] = area[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const bboxArea = (area) => { const la = area.map((p) => p[0]), lo = area.map((p) => p[1]); return [Math.min(...la), Math.min(...lo), Math.max(...la), Math.max(...lo)]; };
  function superficieKm2(area) {
    const c = area.reduce((a, p) => a + p[0], 0) / area.length, kx = 111.32 * Math.cos(c * Math.PI / 180), ky = 110.574; let s = 0;
    for (let i = 0; i < area.length; i++) { const [y1, x1] = area[i], [y2, x2] = area[(i + 1) % area.length]; s += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky); }
    return Math.abs(s) / 2;
  }

  /* ---------- lectura de tablas ---------- */
  function parseTexto(texto) {
    const lineas = texto.replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    if (!lineas.length) throw new Error('El archivo está vacío.');
    const f = lineas[0], sep = f.includes('\t') ? '\t' : (f.split(';').length > f.split(',').length ? ';' : ',');
    const filas = lineas.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))), ancho = Math.max(...filas.map((x) => x.length));
    return filas.map((x) => x.concat(Array(ancho - x.length).fill('')));
  }
  const num = (s) => { const t = String(s).trim().replace(',', '.'); if (t === '' || t === '#' || /^(inf|nan|-|∞|null)$/i.test(t)) return INF; const v = Number(t); return isNaN(v) ? INF : v; };
  const esNum = (s) => s !== '' && !isNaN(Number(String(s).replace(',', '.')));
  const buscar = (cab, ...alias) => cab.findIndex((h) => alias.includes(h));
  function detectar(rows) {
    const cab = rows[0].map((h) => String(h).toLowerCase().trim());
    if (buscar(cab, 'origen', 'desde', 'from', 'source') >= 0 && buscar(cab, 'destino', 'hasta', 'to', 'target') >= 0) return 'aristas';
    if (buscar(cab, 'lat', 'latitud', 'latitude') >= 0 && buscar(cab, 'lon', 'lng', 'long', 'longitud', 'longitude') >= 0) return 'nodos';
    return 'matriz';
  }
  function filasANodos(rows) {
    const cab = rows[0].map((h) => String(h).toLowerCase().trim());
    const cLat = buscar(cab, 'lat', 'latitud', 'latitude'), cLon = buscar(cab, 'lon', 'lng', 'long', 'longitud', 'longitude');
    const cId = buscar(cab, 'id', 'nodo', 'node', 'n', '#', 'top'), cN = buscar(cab, 'nombre', 'name', 'ciudad', 'tienda', 'city', 'etiqueta', 'label');
    const cE = buscar(cab, 'demanda', 'demand', 'poblacion_millones', 'poblacion', 'población', 'extra'), cT = buscar(cab, 'tipo', 'type', 'rol'), cB = buscar(cab, 'balance', 'oferta');
    return rows.slice(1).map((r, i) => ({
      id: cId >= 0 && esNum(r[cId]) ? Number(r[cId]) : i + 1, nombre: cN >= 0 ? r[cN] : 'Nodo ' + (i + 1),
      lat: Number(String(r[cLat]).replace(',', '.')), lon: Number(String(r[cLon]).replace(',', '.')), extra: cE >= 0 ? (num(r[cE]) === INF ? 0 : num(r[cE])) : 0,
      balance: cB >= 0 ? (num(r[cB]) === INF ? 0 : num(r[cB])) : 0, tipo: cT >= 0 && /^(dc|cd|centro|deposito|depósito|facility)/i.test(r[cT]) ? 'dc' : 'cliente',
    })).filter((n) => isFinite(n.lat) && isFinite(n.lon));
  }
  function filasAMatriz(rows) {
    const n = rows.length - 1, conEtq = rows[0].length === n + 1 || (rows[0].length === n && !esNum(rows[1][0]));
    let ids, body;
    if (conEtq) { ids = rows[0].slice(rows[0].length - n); body = rows.slice(1).map((r) => r.slice(r.length - n)); }
    else { ids = Array.from({ length: rows.length }, (_, i) => String(i + 1)); body = rows; }
    if (body.some((r) => r.length !== body.length)) throw new Error('La matriz no es cuadrada (' + body.length + ' filas, ' + body[0].length + ' columnas).');
    return { ids: ids.map((x) => (esNum(x) ? Number(x) : x)), D: body.map((r, i) => r.map((c, j) => (i === j ? INF : num(c)))) };
  }
  function filasAAristas(rows) {
    const cab = rows[0].map((h) => String(h).toLowerCase().trim());
    const cO = buscar(cab, 'origen', 'desde', 'from', 'source'), cD = buscar(cab, 'destino', 'hasta', 'to', 'target');
    const cC = buscar(cab, 'costo', 'coste', 'cost', 'peso', 'distancia', 'distance', 'weight', 'km', 'valor'), cK = buscar(cab, 'capacidad', 'capacity', 'cap');
    if (cC < 0) throw new Error('Falta la columna de costo (costo, distancia, peso…).');
    return rows.slice(1).map((r) => [esNum(r[cO]) ? Number(r[cO]) : r[cO], esNum(r[cD]) ? Number(r[cD]) : r[cD], num(r[cC]), cK >= 0 ? num(r[cK]) : INF]).filter((e) => isFinite(e[2]));
  }

  /* ---------- exportación ---------- */
  const csv = (filas) => '﻿' + filas.map((f) => f.map((c) => { const s = c === null || c === undefined ? '' : String(c); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  const filasNodos = (ds) => [['id', 'nombre', 'lat', 'lon', 'tipo', 'demanda', 'balance'], ...ds.nodos.map((n) => [n.id, n.nombre, n.lat, n.lon, n.tipo === 'dc' ? 'dc' : 'cliente', n.extra, n.balance])];
  const filasMatriz = (ds) => [[''].concat(ds.nodos.map((n) => n.id)), ...ds.D.map((f, i) => [ds.nodos[i].id].concat(f.map((v) => (isFinite(v) ? v : '#'))))];
  const filasAristas = (ds) => [['origen', 'destino', 'costo', 'capacidad'], ...aristas(ds).map((a) => [ds.nodos[a.i].id, ds.nodos[a.j].id, a.costo, isFinite(a.cap) ? a.cap : ''])];
  const filasCandidatos = (ds) => [['nombre', 'lat', 'lon', 'costo_fijo'], ...ds.candidatos.map((c) => [c.nombre, c.lat, c.lon, c.fijo || 0])];
  /* anyLogistix (Greenfield / Network Optimization): instalaciones y clientes en CSV */
  function anylogistix(ds) {
    const fac = [['id', 'nombre', 'latitud', 'longitud', 'tipo', 'costo_fijo']];
    ds.nodos.filter((n) => n.tipo === 'dc').forEach((n) => fac.push([n.id, n.nombre, n.lat, n.lon, 'centro de distribución', n.fijo || 0]));
    ds.candidatos.forEach((c, k) => fac.push(['C' + (k + 1), c.nombre, c.lat, c.lon, 'candidato', c.fijo || 0]));
    const cli = [['id', 'nombre', 'latitud', 'longitud', 'demanda']];
    ds.nodos.filter((n) => n.tipo !== 'dc').forEach((n) => cli.push([n.id, n.nombre, n.lat, n.lon, n.extra || 0]));
    return { fac, cli };
  }
  function filasResultado(ds, r) {
    if (!r) return [['Sin resultado']];
    const e = (i) => ds.nodos[i].id, out = [];
    if (r.flujos && r.flujos.length) { out.push(['desde', 'hasta', 'flujo', 'capacidad']); r.flujos.forEach((f) => out.push([e(f[0]), e(f[1]), +f[2].toFixed(6), isFinite(f[3]) ? f[3] : ''])); return out; }
    if (r.aristas && r.aristas.length) { out.push(['desde', 'hasta', 'nombre_desde', 'nombre_hasta', 'costo', 'veces']); r.aristas.forEach((a) => out.push([e(a[0]), e(a[1]), ds.nodos[a[0]].nombre, ds.nodos[a[1]].nombre, a[2], a[3] === undefined ? '' : a[3]])); return out; }
    if (r.rutas && r.rutas.length) {
      out.push(['ruta', 'orden', 'nodo', 'nombre', 'tramo', 'acumulado']);
      r.rutas.forEach((ru, k) => { let ac = 0; ru.forEach((v, j) => { const t = j ? ds.D[ru[j - 1]][v] : 0; ac += t; out.push([k + 1, j, e(v), ds.nodos[v].nombre, +t.toFixed(4), +ac.toFixed(4)]); }); });
      return out;
    }
    if (r.dist) { out.push(['origen'].concat(ds.nodos.map((n) => n.id))); r.origenes.forEach((s, k) => out.push([e(s)].concat(r.dist[k].map((v) => (isFinite(v) ? +v.toFixed(3) : ''))))); return out; }
    if (r.valores) return [['variable', 'valor'], ...r.valores];
    return [['Sin datos']];
  }
  function geojson(ds, r, geoms) {
    const feats = ds.nodos.map((n) => ({ type: 'Feature', properties: { id: n.id, nombre: n.nombre, tipo: n.tipo }, geometry: { type: 'Point', coordinates: [n.lon, n.lat] } }));
    const tramos = [];
    if (r && r.rutas) r.rutas.forEach((ru, k) => { for (let j = 0; j < ru.length - 1; j++) tramos.push([k + 1, ru[j], ru[j + 1]]); });
    if (r && r.aristas) r.aristas.forEach((a) => tramos.push([0, a[0], a[1]]));
    if (r && r.flujos) r.flujos.forEach((a) => tramos.push([0, a[0], a[1]]));
    tramos.forEach(([k, i, j]) => {
      const g = geoms && geoms(i, j);
      const coords = (g || [[ds.nodos[i].lat, ds.nodos[i].lon], [ds.nodos[j].lat, ds.nodos[j].lon]]).map((p) => [p[1], p[0]]);
      feats.push({ type: 'Feature', properties: { ruta: k, desde: ds.nodos[i].id, hasta: ds.nodos[j].id, km: ds.D[i][j], calles: !!g }, geometry: { type: 'LineString', coordinates: coords } });
    });
    if (ds.area) feats.push({ type: 'Feature', properties: { tipo: 'area' }, geometry: { type: 'Polygon', coordinates: [ds.area.concat([ds.area[0]]).map((p) => [p[1], p[0]])] } });
    return JSON.stringify({ type: 'FeatureCollection', features: feats });
  }
  function descargar(nombre, contenido, tipo) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo || 'text/plain' }));
    a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function leerArchivo(file) {
    const nombre = file.name.toLowerCase();
    if (nombre.endsWith('.xlsx')) {
      const b64 = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = mal; r.readAsDataURL(file); });
      const r = await fetch('/api/leer', { method: 'POST', body: JSON.stringify({ contenido: b64 }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'No se pudo leer el Excel.');
      return { tipo: 'hojas', hojas: d.hojas };
    }
    const texto = await file.text();
    if (nombre.endsWith('.json')) return { tipo: 'json', json: JSON.parse(texto) };
    return { tipo: 'hojas', hojas: [{ nombre: file.name, filas: parseTexto(texto) }] };
  }
  /* imagen → data URL reducida (para no llenar el almacenamiento) */
  function leerImagen(file, maximo) {
    return new Promise((ok, mal) => {
      const r = new FileReader();
      r.onerror = mal;
      r.onload = () => {
        const img = new Image();
        img.onerror = () => mal(new Error('No es una imagen válida.'));
        img.onload = () => {
          const k = Math.min(1, (maximo || 1800) / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok({ src: c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85), ancho: c.width, alto: c.height });
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  root.Datos = { INF, cargar, guardar, restaurar, nuevo, listar, registrar, eliminar, serializar, normalizar, completo, dcIdx, clientes, aInf, aNull, euclid, matrizEuclidiana,
    estadisticas, agregarNodo, quitarNodo, ponerPesoArista, ponerArista, quitarArista, aristas, dentro, bboxArea, superficieKm2, parseTexto, detectar, filasANodos, filasAMatriz, filasAAristas,
    csv, filasNodos, filasMatriz, filasAristas, filasCandidatos, anylogistix, filasResultado, geojson, descargar, leerArchivo, leerImagen, num, esNum };
})(window);
