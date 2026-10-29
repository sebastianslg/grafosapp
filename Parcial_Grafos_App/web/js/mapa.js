/* Mapa: capas base, nodos, centro de distribución, candidatos, aristas, área, imagen de fondo y rutas por las calles. */
(function (root) {
  'use strict';
  const COL = ['#ff3b30', '#007aff', '#34c759', '#af52de', '#ff9500', '#5ac8fa', '#ff2d55', '#a2845e', '#30b0c7', '#ffcc00', '#5856d6', '#8e8e93'];
  const reducir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const key = (a, b, c, d) => `${a.toFixed(5)},${b.toFixed(5)}>${c.toFixed(5)},${d.toFixed(5)}`;
  const BASES = {
    calles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', 'Calles'],
    satelite: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Satélite'],
    topo: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', 'Topográfico'],
  };

  const M = {
    COL, BASES, map: null, ds: null, cb: {}, editar: false, fallosTiles: 0, base: null, capaBase: null, cache: {},
    marcadores: [], marcCand: [], capasRuta: [], fondo: null,

    iniciar(id, onEstado) {
      this.onEstado = onEstado || (() => {});
      const m = this.map = L.map(id, { zoomControl: true, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5, doubleClickZoom: false }).setView([20, 0], 2);
      ['aristas', 'area', 'fondo', 'rutas', 'lineas', 'cand', 'nodos', 'busqueda', 'tmp'].forEach((n, i) => { m.createPane('p_' + n).style.zIndex = 380 + i * 10; });
      this.capas = {};
      ['aristas', 'area', 'fondo', 'rutas', 'lineas', 'cand', 'nodos', 'busqueda', 'tmp'].forEach((n) => { this.capas[n] = L.layerGroup().addTo(m); });
      m.on('click', (e) => this.cb.clickMapa && this.cb.clickMapa(e.latlng, e));
      m.on('dblclick', (e) => this.cb.dblMapa && this.cb.dblMapa(e.latlng));
      m.on('mousemove', (e) => this.cb.moverMapa && this.cb.moverMapa(e.latlng));
      fetch('/datos/cache_rutas.json').then((r) => r.json()).then((c) => { this.cache = c; this.onEstado('cache', Object.keys(c).length); }).catch(() => {});
      return m;
    },
    setBase(nombre) {
      if (this.capaBase) { this.map.removeLayer(this.capaBase); this.capaBase = null; }
      this.base = nombre; this.map.getContainer().classList.toggle('sin-base', !BASES[nombre]);
      if (!BASES[nombre]) return;
      const t = L.tileLayer(BASES[nombre][0], { maxZoom: 18, attribution: 'Tiles © Esri · Rutas © OpenStreetMap, OSRM' });
      this.fallosTiles = 0;
      t.on('tileerror', () => { if (++this.fallosTiles === 6) this.onEstado('mapa-offline'); });
      t.on('tileload', () => { if (this.fallosTiles) { this.fallosTiles = 0; this.onEstado('mapa-ok'); } });
      t.addTo(this.map); t.bringToBack(); this.capaBase = t;
    },
    vista() { const b = this.map.getBounds(); return { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast(), centro: this.map.getCenter(), zoom: this.map.getZoom() }; },
    cursor(c) { this.map.getContainer().style.cursor = c || ''; },

    /* ---------- nodos ---------- */
    montar(ds, cb) {
      this.ds = ds; this.cb = cb || {};
      this.capas.nodos.clearLayers(); this.marcadores = [];
      ds.nodos.forEach((n, i) => {
        const dc = n.tipo === 'dc';
        const mk = L.marker([n.lat, n.lon], { pane: 'p_nodos', icon: dc ? L.divIcon({ className: '', html: '<div class="nodo dcm" title="Centro de distribución">CD</div>', iconSize: [34, 34], iconAnchor: [17, 17] })
            : L.divIcon({ className: '', html: `<div class="nodo">${n.id}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
          draggable: dc || this.editar, keyboard: true, riseOnHover: true, title: n.nombre, zIndexOffset: dc ? 500 : 0 });
        mk.bindTooltip(`${dc ? 'CD · ' : n.id + ' · '}${n.nombre}`, { direction: 'top', offset: [0, dc ? -14 : -10] });
        mk.on('click', (e) => { L.DomEvent.stopPropagation(e); this.cb.click && this.cb.click(i, mk); });
        mk.on('dragend', () => { const p = mk.getLatLng(); (dc ? this.cb.moverDc : this.cb.mover) && (dc ? this.cb.moverDc : this.cb.mover)(i, p.lat, p.lng); });
        mk.addTo(this.capas.nodos); this.marcadores.push(mk);
      });
    },
    ajustar(idx, extra) {
      const pts = (idx || this.ds.nodos.map((_, i) => i)).map((i) => [this.ds.nodos[i].lat, this.ds.nodos[i].lon]).concat(extra || []);
      if (pts.length) this.map.flyToBounds(L.latLngBounds(pts).pad(0.12), { duration: reducir() ? 0 : 0.9, easeLinearity: 0.2, maxZoom: 16 });
    },
    setEditar(on) { this.editar = on; this.ds.nodos.forEach((n, i) => { const d = this.marcadores[i] && this.marcadores[i].dragging; if (d && n.tipo !== 'dc') (on ? d.enable() : d.disable()); }); },
    estiloNodos({ deposito, seleccion, colores, tenue }) {
      this.marcadores.forEach((m, i) => {
        const el = m.getElement() && m.getElement().firstChild; if (!el) return;
        const dc = this.ds.nodos[i] && this.ds.nodos[i].tipo === 'dc';
        el.className = 'nodo' + (dc ? ' dcm' : '') + (i === deposito && !dc ? ' dep' : '') + (seleccion && seleccion.includes(i) ? ' sel' : '') + (colores && colores[i] && !dc ? ' uso' : '') + (tenue && tenue.has(i) ? ' tenue' : '');
        el.style.background = colores && colores[i] && !dc ? colores[i] : ''; el.style.borderColor = colores && colores[i] && !dc ? '#fff' : '';
      });
    },
    actualizarNodo(i) { const n = this.ds.nodos[i], m = this.marcadores[i]; m.setLatLng([n.lat, n.lon]); m.setTooltipContent(`${n.tipo === 'dc' ? 'CD' : n.id} · ${n.nombre}`); const el = m.getElement(); if (el && n.tipo !== 'dc') el.firstChild.textContent = n.id; },
    abrirPopup(i, html, enlazar) { const m = this.marcadores[i]; m.unbindPopup(); m.bindPopup(html, { closeButton: false, offset: [0, -6] }).openPopup(); const p = m.getPopup().getElement(); if (p && enlazar) enlazar(p); },
    popupEn(latlng, html, enlazar) { const p = L.popup({ closeButton: false }).setLatLng(latlng).setContent(html).openOn(this.map); if (enlazar) enlazar(p.getElement()); return p; },

    /* ---------- aristas del grafo ---------- */
    dibujarAristas(lista, dirigido, nombre) {
      this.capas.aristas.clearLayers(); if (!lista) return;
      const inter = lista.length <= 160;
      lista.forEach((a) => {
        const A = this.ds.nodos[a.i], B = this.ds.nodos[a.j];
        const l = L.polyline([[A.lat, A.lon], [B.lat, B.lon]], { pane: 'p_aristas', color: '#8e8e93', weight: 1.6, opacity: 0.6, interactive: inter }).addTo(this.capas.aristas);
        if (inter) l.bindTooltip(`${nombre(a.i)} ${dirigido ? '→' : '—'} ${nombre(a.j)} · ${(+a.costo).toFixed(3)}`, { sticky: true });
        if (dirigido) this.flecha([[A.lat, A.lon], [B.lat, B.lon]], '#8e8e93', this.capas.aristas);
      });
    },
    dibujarLineas(lineas) {
      this.capas.lineas.clearLayers();
      (lineas || []).forEach((l) => L.polyline([l.a, l.b], { pane: 'p_lineas', color: l.color || '#5856d6', weight: l.peso || 1.6, opacity: l.opacidad || 0.75, dashArray: l.dash || '4 6', interactive: false }).addTo(this.capas.lineas));
    },

    /* ---------- candidatos a centro de distribución ---------- */
    montarCandidatos(lista, cb) {
      this.capas.cand.clearLayers(); this.marcCand = [];
      (lista || []).forEach((c, k) => {
        const mk = L.marker([c.lat, c.lon], { pane: 'p_cand', icon: L.divIcon({ className: '', html: `<div class="cand"><i></i></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }), draggable: true, title: c.nombre });
        mk.bindTooltip(`Candidato ${k + 1}${c.nombre ? ' · ' + c.nombre : ''}${c.fijo ? ' · costo fijo ' + c.fijo : ''}`, { direction: 'top', offset: [0, -8] });
        mk.on('click', (e) => { L.DomEvent.stopPropagation(e); cb.click && cb.click(k, mk); });
        mk.on('dragend', () => { const p = mk.getLatLng(); cb.mover && cb.mover(k, p.lat, p.lng); });
        mk.addTo(this.capas.cand); this.marcCand.push(mk);
      });
    },
    estiloCandidatos(mejores, valores) {
      this.marcCand.forEach((m, k) => { const el = m.getElement() && m.getElement().firstChild; if (!el) return; el.className = 'cand' + (mejores && mejores.includes(k) ? ' mejor' : ''); });
    },

    /* ---------- área de estudio ---------- */
    dibujarArea(area, editable, cb) {
      this.capas.area.clearLayers(); if (!area || area.length < 3) return;
      L.polygon(area, { pane: 'p_area', color: '#0a84ff', weight: 2, dashArray: '8 6', fillColor: '#0a84ff', fillOpacity: 0.06, interactive: false }).addTo(this.capas.area);
      if (editable) area.forEach((p, k) => {
        const h = L.marker(p, { pane: 'p_area', icon: L.divIcon({ className: '', html: '<div class="vert"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), draggable: true }).addTo(this.capas.area);
        h.on('dragend', () => { const q = h.getLatLng(); cb && cb(k, q.lat, q.lng); });
        h.on('contextmenu', () => { if (area.length > 3) cb && cb(k, null, null); });
      });
    },
    tmp(pts, cerrado) {
      this.capas.tmp.clearLayers(); if (!pts.length) return;
      L.polyline(cerrado ? pts.concat([pts[0]]) : pts, { pane: 'p_tmp', color: '#0a84ff', weight: 2.5, dashArray: '6 6', interactive: false }).addTo(this.capas.tmp);
      pts.forEach((p) => L.circleMarker(p, { pane: 'p_tmp', radius: 5, color: '#fff', weight: 2, fillColor: '#0a84ff', fillOpacity: 1, interactive: false }).addTo(this.capas.tmp));
    },
    limpiarTmp() { this.capas.tmp.clearLayers(); },

    /* ---------- imagen de fondo ---------- */
    ponerFondo(f, editable, cb) {
      this.capas.fondo.clearLayers(); this.fondo = null; if (!f) return;
      const [[s, w], [n, e]] = f.bounds;
      const ov = L.imageOverlay(f.src, [[s, w], [n, e]], { opacity: f.opacidad ?? 0.6, interactive: false, pane: 'p_fondo' }).addTo(this.capas.fondo);
      this.fondo = ov;
      if (!editable) return;
      const mk = (lat, lon, cls) => L.marker([lat, lon], { pane: 'p_fondo', icon: L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }), draggable: true, zIndexOffset: 800 }).addTo(this.capas.fondo);
      const nw = mk(n, w, 'esq'), se = mk(s, e, 'esq'), c = mk((n + s) / 2, (w + e) / 2, 'esq mov');
      const aplicar = () => { const a = nw.getLatLng(), b = se.getLatLng(); if (a.lat > b.lat && b.lng > a.lng) { ov.setBounds([[b.lat, a.lng], [a.lat, b.lng]]); c.setLatLng([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2]); } };
      nw.on('drag', aplicar); se.on('drag', aplicar);
      nw.on('dragend', () => cb && cb(ov.getBounds())); se.on('dragend', () => cb && cb(ov.getBounds()));
      let c0 = null, b0 = null;
      c.on('dragstart', () => { c0 = c.getLatLng(); b0 = [nw.getLatLng(), se.getLatLng()]; });
      c.on('drag', () => { const p = c.getLatLng(), dy = p.lat - c0.lat, dx = p.lng - c0.lng; nw.setLatLng([b0[0].lat + dy, b0[0].lng + dx]); se.setLatLng([b0[1].lat + dy, b0[1].lng + dx]); aplicar(); });
      c.on('dragend', () => cb && cb(ov.getBounds()));
    },
    opacidadFondo(v) { if (this.fondo) this.fondo.setOpacity(v); },

    /* ---------- búsqueda ---------- */
    marcarBusqueda(res, cb) {
      this.capas.busqueda.clearLayers();
      (res || []).forEach((r, k) => {
        const mk = L.marker([r.lat, r.lon], { pane: 'p_busqueda', icon: L.divIcon({ className: '', html: `<div class="pin">${k + 1}</div>`, iconSize: [24, 30], iconAnchor: [12, 30] }) }).addTo(this.capas.busqueda);
        mk.bindTooltip(r.nombre, { direction: 'top', offset: [0, -28] }); mk.on('click', (e) => { L.DomEvent.stopPropagation(e); cb && cb(k); });
      });
    },
    limpiarBusqueda() { this.capas.busqueda.clearLayers(); },

    /* ---------- trazado por calles ---------- */
    geom(i, j) { const a = this.ds.nodos[i], b = this.ds.nodos[j]; return this.cache[key(a.lat, a.lon, b.lat, b.lon)] || null; },
    geomPuntos(a, b) { return this.cache[key(a[0], a[1], b[0], b[1])] || null; },
    async asegurar(pares, progreso) {
      const pts = pares.map(([i, j]) => [this.ds.nodos[i], this.ds.nodos[j]].map((n) => [n.lat, n.lon]));
      return this.asegurarPuntos(pts, progreso);
    },
    async asegurarPuntos(parejas, progreso) {
      const faltan = [], vistos = new Set();
      for (const [a, b] of parejas) { const k = key(a[0], a[1], b[0], b[1]); if (!this.cache[k] && !vistos.has(k)) { vistos.add(k); faltan.push([a[0], a[1], b[0], b[1], k]); } }
      for (let p = 0; p < faltan.length; p += 24) {
        const lote = faltan.slice(p, p + 24);
        try {
          const r = await fetch('/api/rutas', { method: 'POST', body: JSON.stringify({ tramos: lote.map((t) => t.slice(0, 4)) }) });
          const d = await r.json(); d.geometrias.forEach((g, q) => { if (g) this.cache[lote[q][4]] = g; });
        } catch (e) { /* sin servidor/conexión */ }
        if (progreso) progreso(Math.min(p + 24, faltan.length), faltan.length);
      }
      return faltan.length;
    },
    limpiarRutas() { this.capas.rutas.clearLayers(); this.capas.lineas.clearLayers(); this.capasRuta = []; },
    /* grupos: [{color, pares:[[i,j],...], flechas, peso, opacidad}] — usa el trazado por calles cuando existe */
    dibujar(grupos) {
      this.capas.rutas.clearLayers(); this.capasRuta = [];
      let sinGeom = 0, total = 0; const animar = [];
      const pane = 'p_rutas', capa = this.capas.rutas;
      grupos.forEach((g, gi) => {
        const capas = []; let seg = [], ultimo = '';
        const vaciar = () => { if (seg.length > 1) { const pl = L.polyline(seg, { pane, color: g.color, weight: g.peso || 4.5, opacity: g.opacidad || 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(capa); if (g.tip) pl.bindTooltip(g.tip, { sticky: true }); capas.push(pl); animar.push([pl, gi]); } seg = []; };
        g.pares.forEach((par) => {
          const pts = typeof par[0] === 'number' ? [this.ds.nodos[par[0]], this.ds.nodos[par[1]]].map((n) => [n.lat, n.lon]) : par, [pa, pb] = pts, ka = pa.join(','), kb = pb.join(',');
          total++; if (ka !== ultimo) vaciar(); ultimo = kb;
          const geo = this.geomPuntos(pa, pb);
          if (geo) { if (!seg.length) seg.push(pa); geo.forEach((p) => seg.push(p)); seg.push(pb); if (g.flechas) this.flecha(geo, g.color, capa); }
          else { sinGeom++; vaciar(); const l = L.polyline([pa, pb], { pane, color: g.color, weight: Math.max(2.5, (g.peso || 4.5) - 1.5), opacity: 0.85, dashArray: '2 8', lineCap: 'round' }).addTo(capa); if (g.tip) l.bindTooltip(g.tip, { sticky: true }); capas.push(l); if (g.flechas) this.flecha([pa, pb], g.color, capa); }
        });
        vaciar(); this.capasRuta.push({ capas, color: g.color });
      });
      if (!reducir()) requestAnimationFrame(() => animar.forEach(([pl, gi]) => {
        const p = pl.getElement(); if (!p || !p.getTotalLength) return; const L0 = p.getTotalLength();
        p.style.strokeDasharray = L0; p.style.strokeDashoffset = L0; p.classList.add('ruta-anim'); p.style.transitionDelay = Math.min(gi * 0.12, 1.2) + 's';
        requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = 0; }));
        setTimeout(() => { p.style.strokeDasharray = ''; p.classList.remove('ruta-anim'); }, 1500 + Math.min(gi * 120, 1200));
      }));
      return { sinGeom, total };
    },
    flecha(geo, color, capa) {
      if (geo.length < 2) return; const k = Math.floor((geo.length - 1) / 2), a = geo[k], b = geo[k + 1] || geo[k];
      const dx = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), dy = b[0] - a[0], grados = Math.atan2(dx, dy) * 180 / Math.PI;
      L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { interactive: false, pane: 'p_rutas', icon: L.divIcon({ className: '', html: `<div class="flecha" style="--c:${color};transform:rotate(${grados}deg)">▲</div>`, iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(capa || this.capas.rutas);
    },
    resaltar(k) {
      this.capasRuta.forEach((r, i) => r.capas.forEach((c) => c.setStyle({ opacity: k === null || k === i ? 0.95 : 0.18, weight: k === i ? 6.5 : 4.5 })));
      if (k !== null && this.capasRuta[k] && this.capasRuta[k].capas.length) { const b = L.featureGroup(this.capasRuta[k].capas).getBounds(); if (b.isValid()) this.map.flyToBounds(b.pad(0.18), { duration: reducir() ? 0 : 0.8, maxZoom: 15 }); }
    },
  };
  root.Mapa = M;
})(window);
