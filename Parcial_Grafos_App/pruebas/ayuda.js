/* Solo pruebas: lector de datos de referencia (reproduce los valores calculados con Python). */
const INF = Infinity;
(function (root) {
  /* ---------- lectura de datos ---------- */
  function haversine(la1, lo1, la2, lo2) {
    const R = 6371.0088, p = Math.PI / 180, dl = (lo2 - lo1) * p, a = Math.sin((la2 - la1) * p / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  const num = (s) => { const t = String(s).trim().replace(',', '.'); if (t === '' || t === '#' || /^(inf|nan|-|∞)$/i.test(t)) return INF; const v = Number(t); return isNaN(v) ? INF : v; };
  function parseTable(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) throw new Error('No hay datos.');
    const f = lines[0], sep = f.includes('\t') ? '\t' : (f.split(';').length > f.split(',').length ? ';' : ',');
    return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
  }
  /* devuelve {D, ids, nombres, coords|null, tipo} */
  function cargar(text, opt) {
    const rows = parseTable(text), head = rows[0].map((h) => h.toLowerCase());
    const find = (...al) => head.findIndex((h) => al.includes(h));
    const cLat = find('lat', 'latitud', 'latitude'), cLon = find('lon', 'lng', 'long', 'longitud', 'longitude');
    const cO = find('origen', 'desde', 'from', 'source'), cD = find('destino', 'hasta', 'to', 'target'), cC = find('costo', 'coste', 'cost', 'peso', 'distancia', 'weight', 'km');
    if (cO >= 0 && cD >= 0 && cC >= 0) {
      const ids = [], pos = new Map();
      const g = (x) => { if (!pos.has(x)) { pos.set(x, ids.length); ids.push(x); } return pos.get(x); };
      rows.slice(1).forEach((r) => { g(r[cO]); g(r[cD]); });
      const n = ids.length, D = Array.from({ length: n }, () => new Array(n).fill(INF));
      rows.slice(1).forEach((r) => { const i = pos.get(r[cO]), j = pos.get(r[cD]), c = num(r[cC]); D[i][j] = c; if (!opt.dirigido) D[j][i] = c; });
      for (let i = 0; i < n; i++) D[i][i] = INF;
      return { D, ids, nombres: null, coords: null, tipo: 'aristas' };
    }
    if (cLat >= 0 && cLon >= 0) {
      const cId = find('id', 'nodo', 'node', 'n', '#'), cN = find('nombre', 'name', 'ciudad', 'tienda', 'city');
      const body = rows.slice(1), n = body.length;
      const lat = body.map((r) => Number(r[cLat].replace(',', '.'))), lon = body.map((r) => Number(r[cLon].replace(',', '.')));
      const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? INF :
        (opt.metrica === 'euclidiana' ? Math.hypot(lat[i] - lat[j], lon[i] - lon[j]) : haversine(lat[i], lon[i], lat[j], lon[j])) * opt.factor));
      return { D, ids: body.map((r, i) => (cId >= 0 ? r[cId] : String(i + 1))), nombres: cN >= 0 ? body.map((r) => r[cN]) : null, coords: lat.map((a, i) => [a, lon[i]]), tipo: 'coordenadas' };
    }
    // matriz cuadrada
    const n = rows.length - 1, conEtq = rows[0].length === n + 1 || (rows[0].length === n && isNaN(Number(rows[1][0])));
    let ids, body;
    if (conEtq) { ids = rows[0].slice(rows[0].length - n); body = rows.slice(1).map((r) => r.slice(r.length - n)); }
    else { ids = Array.from({ length: rows.length }, (_, i) => String(i + 1)); body = rows; }
    const m = body.length;
    if (body.some((r) => r.length !== m)) throw new Error('La matriz no es cuadrada (' + m + ' filas, ' + body[0].length + ' columnas).');
    const D = body.map((r, i) => r.map((c, j) => (i === j ? INF : num(c))));
    return { D, ids, nombres: null, coords: null, tipo: 'matriz' };
  }



  root.Ayuda = { cargar, haversine };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Ayuda;
})(globalThis);
