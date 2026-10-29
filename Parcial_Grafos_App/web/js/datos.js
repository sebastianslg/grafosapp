/* Datos: carga, edición persistente, importación y exportación. */
(function (root) {
  'use strict';
  const INF = Infinity, R = 6371.0088;
  const KEY = (k) => 'parcial-grafos:v1:' + k;

  const haversine = (a, b, c, d) => { const p = Math.PI / 180, h = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const aInf = (D) => D.map((f, i) => f.map((v, j) => (i === j || v === null || v === undefined || !isFinite(v) ? INF : v)));
  const aNull = (D) => D.map((f) => f.map((v) => (isFinite(v) ? v : null)));

  async function cargar(clave) {
    const ds = await (await fetch('datos/' + clave + '.json')).json();
    ds.D = aInf(ds.D); ds.editado = false;
    ds.original = { nodos: JSON.parse(JSON.stringify(ds.nodos)), D: aNull(ds.D) };
    try {
      const g = JSON.parse(localStorage.getItem(KEY(clave)) || 'null');
      if (g && g.nodos && g.D && g.nodos.length === g.D.length) { ds.nodos = g.nodos; ds.D = aInf(g.D); ds.editado = true; if (g.origen_defecto !== undefined) ds.origen_defecto = g.origen_defecto; }
    } catch (e) { /* sin almacenamiento */ }
    return ds;
  }
  function guardar(ds) {
    ds.editado = true;
    try { localStorage.setItem(KEY(ds.clave), JSON.stringify({ nodos: ds.nodos, D: aNull(ds.D), origen_defecto: ds.origen_defecto })); } catch (e) { /* sin almacenamiento */ }
  }
  function restaurar(ds) {
    try { localStorage.removeItem(KEY(ds.clave)); } catch (e) { /* */ }
    ds.nodos = JSON.parse(JSON.stringify(ds.original.nodos)); ds.D = aInf(ds.original.D); ds.editado = false;
  }

  function matrizHaversine(nodos, factor) {
    return nodos.map((a, i) => nodos.map((b, j) => (i === j ? INF : haversine(a.lat, a.lon, b.lat, b.lon) * factor)));
  }

  /* ---------- lectura de tablas ---------- */
  function parseTexto(texto) {
    const lineas = texto.replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    if (!lineas.length) throw new Error('El archivo está vacío.');
    const f = lineas[0], sep = f.includes('\t') ? '\t' : (f.split(';').length > f.split(',').length ? ';' : ',');
    const filas = lineas.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))), ancho = Math.max(...filas.map((f) => f.length));
    return filas.map((f) => f.concat(Array(ancho - f.length).fill('')));
  }
  const num = (s) => { const t = String(s).trim().replace(',', '.'); if (t === '' || t === '#' || /^(inf|nan|-|∞|null)$/i.test(t)) return INF; const v = Number(t); return isNaN(v) ? INF : v; };
  const esNum = (s) => s !== '' && !isNaN(Number(String(s).replace(',', '.')));
  const buscar = (cab, ...alias) => cab.findIndex((h) => alias.includes(h));

  /* Detecta qué contiene una tabla: nodos (lat/lon), aristas (origen/destino/costo) o matriz. */
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
    const cE = buscar(cab, 'demanda', 'demand', 'poblacion_millones', 'poblacion', 'población', 'extra');
    return rows.slice(1).map((r, i) => ({
      id: cId >= 0 && esNum(r[cId]) ? Number(r[cId]) : i + 1, nombre: cN >= 0 ? r[cN] : 'Nodo ' + (i + 1),
      lat: Number(String(r[cLat]).replace(',', '.')), lon: Number(String(r[cLon]).replace(',', '.')), extra: cE >= 0 ? num(r[cE]) === INF ? 0 : num(r[cE]) : 0,
    })).filter((n) => isFinite(n.lat) && isFinite(n.lon));
  }
  function filasAMatriz(rows) {
    const n = rows.length - 1;
    const conEtq = rows[0].length === n + 1 || (rows[0].length === n && !esNum(rows[1][0]));
    let ids, body;
    if (conEtq) { ids = rows[0].slice(rows[0].length - n); body = rows.slice(1).map((r) => r.slice(r.length - n)); }
    else { ids = Array.from({ length: rows.length }, (_, i) => String(i + 1)); body = rows; }
    if (body.some((r) => r.length !== body.length)) throw new Error('La matriz no es cuadrada (' + body.length + ' filas, ' + body[0].length + ' columnas).');
    return { ids: ids.map((x) => (esNum(x) ? Number(x) : x)), D: body.map((r, i) => r.map((c, j) => (i === j ? INF : num(c)))) };
  }
  function filasAAristas(rows, dirigido) {
    const cab = rows[0].map((h) => String(h).toLowerCase().trim());
    const cO = buscar(cab, 'origen', 'desde', 'from', 'source'), cD = buscar(cab, 'destino', 'hasta', 'to', 'target');
    const cC = buscar(cab, 'costo', 'coste', 'cost', 'peso', 'distancia', 'distance', 'weight', 'km', 'valor');
    if (cC < 0) throw new Error('Falta la columna de costo (costo, distancia, peso…).');
    return rows.slice(1).map((r) => [esNum(r[cO]) ? Number(r[cO]) : r[cO], esNum(r[cD]) ? Number(r[cD]) : r[cD], num(r[cC])]).filter((e) => isFinite(e[2]));
  }

  /* ---------- exportación ---------- */
  const csv = (filas) => '﻿' + filas.map((f) => f.map((c) => { const s = c === null || c === undefined ? '' : String(c); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  const filasNodos = (ds) => [['id', 'nombre', 'lat', 'lon', ds.clave === 'china' ? 'poblacion_millones' : 'demanda'], ...ds.nodos.map((n) => [n.id, n.nombre, n.lat, n.lon, n.extra])];
  const filasMatriz = (ds) => [[''].concat(ds.nodos.map((n) => n.id)), ...ds.D.map((f, i) => [ds.nodos[i].id].concat(f.map((v) => (isFinite(v) ? v : '#'))))];
  function filasResultado(ds, r) {
    if (!r) return [['Sin resultado']];
    const e = (i) => ds.nodos[i].id, out = [];
    if (r.aristas && r.aristas.length) { out.push(['desde', 'hasta', 'nombre_desde', 'nombre_hasta', 'costo']); r.aristas.forEach(([i, j, c]) => out.push([e(i), e(j), ds.nodos[i].nombre, ds.nodos[j].nombre, c])); return out; }
    if (r.rutas && r.rutas.length) {
      out.push(['ruta', 'orden', 'nodo', 'nombre', 'tramo', 'acumulado']);
      r.rutas.forEach((ru, k) => { let ac = 0; ru.forEach((v, j) => { const t = j ? ds.D[ru[j - 1]][v] : 0; ac += t; out.push([k + 1, j, e(v), ds.nodos[v].nombre, +t.toFixed(4), +ac.toFixed(4)]); }); });
      return out;
    }
    if (r.dist) { out.push(['origen'].concat(ds.nodos.map((n) => n.id))); r.origenes.forEach((s, k) => out.push([e(s)].concat(r.dist[k].map((v) => (isFinite(v) ? +v.toFixed(3) : ''))))); return out; }
    return [['Sin datos']];
  }
  function geojson(ds, r, geoms) {
    const feats = ds.nodos.map((n) => ({ type: 'Feature', properties: { id: n.id, nombre: n.nombre }, geometry: { type: 'Point', coordinates: [n.lon, n.lat] } }));
    const tramos = [];
    if (r && r.rutas) r.rutas.forEach((ru, k) => { for (let j = 0; j < ru.length - 1; j++) tramos.push([k + 1, ru[j], ru[j + 1]]); });
    if (r && r.aristas) r.aristas.forEach(([i, j]) => tramos.push([0, i, j]));
    tramos.forEach(([k, i, j]) => {
      const g = geoms && geoms(i, j);
      const coords = (g || [[ds.nodos[i].lat, ds.nodos[i].lon], [ds.nodos[j].lat, ds.nodos[j].lon]]).map((p) => [p[1], p[0]]);
      feats.push({ type: 'Feature', properties: { ruta: k, desde: ds.nodos[i].id, hasta: ds.nodos[j].id, km: ds.D[i][j], calles: !!g }, geometry: { type: 'LineString', coordinates: coords } });
    });
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

  root.Datos = { INF, cargar, guardar, restaurar, aInf, aNull, haversine, matrizHaversine, parseTexto, detectar, filasANodos, filasAMatriz, filasAAristas,
    csv, filasNodos, filasMatriz, filasResultado, geojson, descargar, leerArchivo, num, esNum };
})(window);
