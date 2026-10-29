/* Mapa: nodos, rutas trazadas por las calles (OSRM / OpenStreetMap) y animación de dibujo. */
(function (root) {
  'use strict';
  const COL = ['#ff3b30', '#007aff', '#34c759', '#af52de', '#ff9500', '#5ac8fa', '#ff2d55', '#a2845e', '#30b0c7', '#ffcc00', '#5856d6', '#8e8e93'];
  const reducir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const key = (a, b, c, d) => `${a.toFixed(5)},${b.toFixed(5)}>${c.toFixed(5)},${d.toFixed(5)}`;

  const M = {
    COL, map: null, capaNodos: null, capaRutas: null, marcadores: [], cache: {}, ds: null, cb: {}, editar: false, fallosTiles: 0, sinCalles: 0,
    capasRuta: [],

    iniciar(id, onEstado) {
      this.onEstado = onEstado || (() => {});
      this.map = L.map(id, { zoomControl: true, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5, preferCanvas: false }).setView([20, 0], 2);
      const t = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, attribution: 'Tiles © Esri · Datos de rutas © OpenStreetMap, OSRM' });
      t.on('tileerror', () => { if (++this.fallosTiles === 6) this.onEstado('mapa-offline'); });
      t.on('tileload', () => { if (this.fallosTiles) { this.fallosTiles = 0; this.onEstado('mapa-ok'); } });
      t.addTo(this.map);
      this.capaRutas = L.layerGroup().addTo(this.map);
      this.capaNodos = L.layerGroup().addTo(this.map);
      fetch('/datos/cache_rutas.json').then((r) => r.json()).then((c) => { this.cache = c; this.onEstado('cache', Object.keys(c).length); }).catch(() => {});
      return this.map;
    },

    /* ---------- nodos ---------- */
    montar(ds, cb) {
      this.ds = ds; this.cb = cb || {};
      this.capaNodos.clearLayers(); this.marcadores = [];
      ds.nodos.forEach((n, i) => {
        const mk = L.marker([n.lat, n.lon], { icon: L.divIcon({ className: '', html: `<div class="nodo">${n.id}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }), draggable: this.editar, keyboard: true, riseOnHover: true, title: n.nombre });
        mk.bindTooltip(`${n.id} · ${n.nombre}`, { direction: 'top', offset: [0, -10] });
        mk.on('click', () => this.cb.click && this.cb.click(i, mk));
        mk.on('dragend', () => { const p = mk.getLatLng(); this.cb.mover && this.cb.mover(i, p.lat, p.lng); });
        mk.addTo(this.capaNodos); this.marcadores.push(mk);
      });
    },
    ajustar(idx) {
      const pts = (idx || this.ds.nodos.map((_, i) => i)).map((i) => [this.ds.nodos[i].lat, this.ds.nodos[i].lon]);
      if (pts.length) this.map.flyToBounds(L.latLngBounds(pts).pad(0.12), { duration: reducir() ? 0 : 0.9, easeLinearity: 0.2, maxZoom: 15 });
    },
    setEditar(on) { this.editar = on; this.marcadores.forEach((m) => (on ? m.dragging.enable() : m.dragging.disable())); },
    estiloNodos({ deposito, seleccion, colores, tenue }) {
      this.marcadores.forEach((m, i) => {
        const el = m.getElement() && m.getElement().firstChild; if (!el) return;
        el.className = 'nodo' + (i === deposito ? ' dep' : '') + (seleccion && seleccion.includes(i) ? ' sel' : '') + (colores && colores[i] ? ' uso' : '') + (tenue && tenue.has(i) ? ' tenue' : '');
        el.style.background = colores && colores[i] ? colores[i] : ''; if (colores && colores[i]) el.style.borderColor = '#fff'; else el.style.borderColor = '';
      });
    },
    actualizarNodo(i) { const n = this.ds.nodos[i], m = this.marcadores[i]; m.setLatLng([n.lat, n.lon]); m.setTooltipContent(`${n.id} · ${n.nombre}`); const el = m.getElement(); if (el) el.firstChild.textContent = n.id; },
    abrirPopup(i, html, enlazar) { const m = this.marcadores[i]; m.bindPopup(html, { closeButton: false, offset: [0, -6] }).openPopup(); const p = m.getPopup().getElement(); if (p && enlazar) enlazar(p); },

    /* ---------- trazado por calles ---------- */
    geom(i, j) { const a = this.ds.nodos[i], b = this.ds.nodos[j]; return this.cache[key(a.lat, a.lon, b.lat, b.lon)] || null; },
    async asegurar(pares, progreso) {
      const faltan = [], vistos = new Set();
      for (const [i, j] of pares) {
        const a = this.ds.nodos[i], b = this.ds.nodos[j], k = key(a.lat, a.lon, b.lat, b.lon);
        if (!this.cache[k] && !vistos.has(k)) { vistos.add(k); faltan.push([a.lat, a.lon, b.lat, b.lon, k]); }
      }
      this.sinCalles = 0;
      for (let p = 0; p < faltan.length; p += 24) {
        const lote = faltan.slice(p, p + 24);
        try {
          const r = await fetch('/api/rutas', { method: 'POST', body: JSON.stringify({ tramos: lote.map((t) => t.slice(0, 4)) }) });
          const d = await r.json();
          d.geometrias.forEach((g, q) => { if (g) this.cache[lote[q][4]] = g; });
        } catch (e) { /* sin servidor/conexión */ }
        if (progreso) progreso(Math.min(p + 24, faltan.length), faltan.length);
      }
      return faltan.length;
    },

    limpiarRutas() { this.capaRutas.clearLayers(); this.capasRuta = []; },
    /* grupos: [{color, pares:[[i,j],...], flechas:bool, peso}] */
    dibujar(grupos) {
      this.limpiarRutas();
      let sinGeom = 0, total = 0; const animar = [];
      grupos.forEach((g, gi) => {
        const capas = []; let seg = [], ultimo = -1;
        const vaciar = () => { if (seg.length > 1) { const pl = L.polyline(seg, { color: g.color, weight: g.peso || 4.5, opacity: 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(this.capaRutas); capas.push(pl); animar.push([pl, gi]); } seg = []; };
        g.pares.forEach(([i, j]) => {
          total++; if (i !== ultimo) vaciar();   // tramos no consecutivos (árbol): no unirlos con una recta
          ultimo = j;
          const a = this.ds.nodos[i], b = this.ds.nodos[j], geo = this.geom(i, j);
          if (geo) {
            if (!seg.length) seg.push([a.lat, a.lon]);
            geo.forEach((p) => seg.push(p)); seg.push([b.lat, b.lon]);
            if (g.flechas) this.flecha(geo, g.color);
          } else {
            sinGeom++; vaciar();
            capas.push(L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: g.color, weight: 3, opacity: 0.85, dashArray: '2 8', lineCap: 'round' }).addTo(this.capaRutas));
            if (g.flechas) this.flecha([[a.lat, a.lon], [b.lat, b.lon]], g.color);
          }
        });
        vaciar(); this.capasRuta.push({ capas, color: g.color });
      });
      if (!reducir()) requestAnimationFrame(() => animar.forEach(([pl, gi]) => {
        const p = pl.getElement(); if (!p || !p.getTotalLength) return; const L0 = p.getTotalLength();
        p.style.strokeDasharray = L0; p.style.strokeDashoffset = L0; p.classList.add('ruta-anim'); p.style.transitionDelay = (gi * 0.12) + 's';
        requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = 0; }));
        setTimeout(() => { p.style.strokeDasharray = ''; p.classList.remove('ruta-anim'); }, 1500 + gi * 120);
      }));
      return { sinGeom, total };
    },
    flecha(geo, color) {
      if (geo.length < 2) return; const k = Math.floor((geo.length - 1) / 2), a = geo[k], b = geo[k + 1] || geo[k];
      const dx = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), dy = b[0] - a[0], grados = Math.atan2(dx, dy) * 180 / Math.PI;
      L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { interactive: false, icon: L.divIcon({ className: '', html: `<div class="flecha" style="--c:${color};transform:rotate(${grados}deg)">▲</div>`, iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(this.capaRutas);
    },
    resaltar(k) {
      this.capasRuta.forEach((r, i) => r.capas.forEach((c) => c.setStyle({ opacity: k === null || k === i ? 0.95 : 0.18, weight: k === i ? 6.5 : 4.5 })));
      if (k !== null && this.capasRuta[k] && this.capasRuta[k].capas.length) { const b = L.featureGroup(this.capasRuta[k].capas).getBounds(); if (b.isValid()) this.map.flyToBounds(b.pad(0.18), { duration: reducir() ? 0 : 0.8, maxZoom: 15 }); }
    },
  };
  root.Mapa = M;
})(window);
