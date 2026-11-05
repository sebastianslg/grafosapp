/* Simulación del recorrido: vehículos que se mueven por las calles, estelas, clientes atendidos y diagrama de Gantt. */
(function () {
  'use strict';
  const { S, $, esc, fmt, corto, nodo, COL } = window.App;
  const R = 6371000, rad = Math.PI / 180;
  const metros = (a, b) => { const x = (b[1] - a[1]) * rad * Math.cos((a[0] + b[0]) / 2 * rad), y = (b[0] - a[0]) * rad; return Math.hypot(x, y) * R; };
  const ICONOS = {
    tracto: '<path d="M1 14V8h4v6M5 14h2V7h9l3 4h4v3h-1M7 14h9" /><rect x="7" y="9" width="10" height="5" rx="1" fill="#fff" fill-opacity=".35"/><circle cx="4" cy="16.5" r="1.6"/><circle cx="12" cy="16.5" r="1.6"/><circle cx="20" cy="16.5" r="1.6"/>',
    camion: '<rect x="2" y="7" width="12" height="8" rx="1.2" fill="#fff" fill-opacity=".35"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="6" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
    camioneta: '<path d="M2 15v-4l3-3h6l2 3h7v4"/><path d="M13 11h-6" /><circle cx="7" cy="16.5" r="1.8"/><circle cx="17" cy="16.5" r="1.8"/>',
    cartero: '<circle cx="6" cy="16.5" r="2.2"/><circle cx="18" cy="16.5" r="2.2"/><path d="M6 16.5l3-6h5l4 6M9 10.5L8 8h3M14 10.5l-1-3h3"/><rect x="9.5" y="12" width="4" height="2.5" rx=".6" fill="#fff" fill-opacity=".4"/>',
  };
  const tipoIcono = (t) => { t = String(t || '').toLowerCase(); return /tracto|trailer|tráiler/.test(t) ? 'tracto' : /cartero|moto|bici|mensaj/.test(t) ? 'cartero' : /camioneta|pickup|van|furg/.test(t) ? 'camioneta' : 'camion'; };
  const icono = (tipo, color) => `<div class="veh" style="--c:${color}"><svg viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONOS[tipoIcono(tipo)]}</svg></div>`;

  const Sim = {
    rutas: [], w: 0, reproduciendo: false, vel: 1, DUR: 45, ultimo: 0, capa: null, visit: new Set(), seguir: false,
    preparar() {
      this.limpiar(); const r = S.res; if (!r || !['tsp', 'mtsp', 'cvrp', 'flota'].includes(r.kind) || !r.res.rutas || !r.res.rutas.length) return this.barra(false);
      const mapa = Mapa.map; if (!mapa.getPane('p_sim')) mapa.createPane('p_sim').style.zIndex = 640;
      this.capa = L.layerGroup().addTo(mapa); const x = r.res, flota = S.ds.flota || [];
      this.rutas = x.rutas.map((ru, k) => {
        const pts = [], cum = [0], parada = [0];
        ru.forEach((v, q) => {
          const p = [nodo(v).lat, nodo(v).lon]; if (q === 0) { pts.push(p); return; }
          const a = [nodo(ru[q - 1]).lat, nodo(ru[q - 1]).lon], g = Mapa.geom(ru[q - 1], v), tramo = g ? [...g, p] : [p];
          let prev = pts[pts.length - 1]; tramo.forEach((pt) => { cum.push(cum[cum.length - 1] + metros(prev, pt)); pts.push(pt); prev = pt; }); parada.push(cum[cum.length - 1]);
        });
        const tipo = x.info ? x.info[k].tipo : (flota[0] ? flota[0].tipo : 'camión de reparto'), f = flota.find((t) => t.tipo === tipo), vel = x.info ? (f ? +f.vel || 30 : 30) : 1;
        const color = COL[k % COL.length], mk = L.marker(pts[0], { pane: 'p_sim', zIndexOffset: 1000, interactive: false, icon: L.divIcon({ className: '', html: icono(tipo, color), iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(this.capa);
        const estela = L.polyline([pts[0]], { pane: 'p_sim', color, weight: 7, opacity: 0.55, lineCap: 'round', lineJoin: 'round' }).addTo(this.capa);
        return { ru, pts, cum, parada, len: cum[cum.length - 1], vel, tipo, color, mk, estela, k };
      });
      this.tmax = Math.max(...this.rutas.map((q) => (q.len || 1) / q.vel)); this.visit = new Set(); this.w = 0;
      this.nClientes = new Set(this.rutas.flatMap((q) => q.ru.filter((v) => v !== q.ru[0]))).size;
      this.barra(true); this.pintar(0); if (!window.App.reducir()) setTimeout(() => this.play(), 600);
    },
    limpiar() { this.parar(); if (this.capa) { Mapa.map.removeLayer(this.capa); this.capa = null; } this.rutas = []; this.barra(false); },
    barra(on) {
      let b = $('simbar');
      if (!b) { b = document.createElement('div'); b.id = 'simbar'; b.className = 'simbar glass oculto'; document.querySelector('.mapa-wrap').appendChild(b); }
      if (!on) { b.classList.add('oculto'); return; }
      b.classList.remove('oculto');
      b.innerHTML = `<button class="btn mini" id="sPlay" aria-label="Reproducir o pausar"></button><button class="btn gris mini" id="sReset" aria-label="Reiniciar">↺ Reiniciar</button><button class="btn gris mini" id="sVel" title="Velocidad">1×</button>
        <input type="range" id="sPos" min="0" max="1000" value="0" aria-label="Posición de la simulación"><span class="simtxt tabular" id="sTxt"></span><label class="check mini"><input type="checkbox" id="sSeg"> Seguir</label>`;
      $('sPlay').onclick = () => (this.reproduciendo ? this.parar() : this.play());
      $('sReset').onclick = () => { this.w = 0; this.visit.clear(); this.capa && this.capa.eachLayer((l) => l.options && l.options.clase === 'visita' && this.capa.removeLayer(l)); this.pintar(0); this.play(); };
      $('sVel').onclick = () => { const v = [0.5, 1, 2, 4, 8]; this.vel = v[(v.indexOf(this.vel) + 1) % v.length]; $('sVel').textContent = this.vel + '×'; };
      $('sPos').oninput = (e) => { this.parar(); this.w = +e.target.value / 1000 * this.DUR; this.pintar(this.w); };
      $('sSeg').onchange = (e) => (this.seguir = e.target.checked);
      this.icono();
    },
    icono() { const p = $('sPlay'); if (p) p.innerHTML = this.reproduciendo ? '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>Pausar' : '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>Reproducir'; },
    play() { if (!this.rutas.length) return; if (this.w >= this.DUR) { this.w = 0; this.visit.clear(); } this.reproduciendo = true; this.ultimo = performance.now(); this.icono(); const paso = (t) => { if (!this.reproduciendo) return; this.w = Math.min(this.DUR, this.w + (t - this.ultimo) / 1000 * this.vel); this.ultimo = t; this.pintar(this.w); if (this.w >= this.DUR) { this.parar(); return; } this.raf = requestAnimationFrame(paso); }; this.raf = requestAnimationFrame(paso); },
    parar() { this.reproduciendo = false; cancelAnimationFrame(this.raf); this.icono(); },
    pintar(w) {
      const vt = w / this.DUR * this.tmax; let atendidos = 0, recorrido = 0, fin = 0;
      this.rutas.forEach((q) => {
        const dist = Math.min(q.len, vt * q.vel), c = q.cum; let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= dist) lo = m; else hi = m - 1; }
        const a = q.pts[lo], b = q.pts[Math.min(lo + 1, q.pts.length - 1)], f = c[lo + 1] > c[lo] ? (dist - c[lo]) / (c[lo + 1] - c[lo]) : 0, pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        q.mk.setLatLng(pos); q.estela.setLatLngs(q.pts.slice(0, lo + 1).concat([pos]));
        q.ru.forEach((v, i) => { if (i > 0 && !(i === q.ru.length - 1 && v === q.ru[0]) && q.parada[i] <= dist + 1e-6) { atendidos += 1; const id = q.k + ':' + i; if (!this.visit.has(id)) { this.visit.add(id); L.circleMarker([nodo(v).lat, nodo(v).lon], { pane: 'p_sim', radius: 11, color: '#fff', weight: 2, fillColor: '#34c759', fillOpacity: 0.95, clase: 'visita', interactive: false }).addTo(this.capa); } } });
        recorrido += (dist / (q.len || 1)) * (S.res.res.dists ? S.res.res.dists[q.k] : 0); if (dist >= q.len) fin++;
        if (this.seguir && q === this.rutas[S.rutaSel || 0]) Mapa.map.panTo(pos, { animate: false });
      });
      const tx = $('sTxt'); if (tx) tx.textContent = `${atendidos}/${this.nClientes} atendidos · ${fmt(recorrido, 1)} ${S.ds.unidad} · ${fin}/${this.rutas.length} vehículo(s) en destino`;
      const ps = $('sPos'); if (ps && this.reproduciendo) ps.value = Math.round(w / this.DUR * 1000);
    },
  };
  window.Sim = Sim;

  /* ---------- Diagrama de Gantt ---------- */
  function pGantt(el) {
    const r = S.res, u = S.ds.unidad;
    if (!r || r.ds !== S.clave || !['tsp', 'mtsp', 'cvrp', 'flota'].includes(r.kind) || !r.res.rutas) { el.innerHTML = '<div class="aviso info">Resuelva un TSP o m-TSP para ver el diagrama de Gantt de cada vehículo.</div>'; return; }
    const x = r.res, flota = S.ds.flota || [], D = S.ds.D, filas = x.rutas.map((ru, k) => {
      const tipo = x.info ? x.info[k].tipo : 'Vehículo', f = flota.find((t) => t.tipo === tipo), vel = x.info ? (f ? +f.vel || 30 : 30) : 1; let ac = 0;
      const seg = ru.slice(1).map((v, q) => { const d = D[ru[q]][v], t = d / vel; const s = { de: ru[q], a: v, t0: ac, t1: ac + t, d }; ac += t; return s; }); return { k, tipo, seg, total: ac, vel };
    });
    const T = Math.max(...filas.map((f) => f.total)) || 1, kmh = !!x.info;
    let h = `<h3 style="margin-bottom:6px">Gantt de las rutas</h3><p class="nota">Cada barra es un vehículo; cada bloque, un tramo hacia un cliente. ${kmh ? 'La escala es el tiempo de viaje (distancia ÷ velocidad del tipo de vehículo).' : 'La escala es la distancia recorrida.'} Pase el cursor por un bloque para ver el detalle.</p><div class="gantt">`;
    filas.forEach((f) => { h += `<div class="g-fila"><div class="g-et"><span class="punto" style="background:${COL[f.k % COL.length]}"></span>Ruta ${f.k + 1}<small>${esc(f.tipo)}</small></div><div class="g-pista">` +
      f.seg.map((s) => `<i style="left:${s.t0 / T * 100}%;width:${(s.t1 - s.t0) / T * 100}%;background:${COL[f.k % COL.length]}" title="${esc(corto(s.de))} → ${esc(corto(s.a))} · ${fmt(s.d, 1)} ${u}">${(s.t1 - s.t0) / T > 0.045 ? `<b>${esc(corto(s.a))}</b>` : ""}</i>`).join('') + `</div><div class="g-fin tabular">${kmh ? fmt(f.total, 2) + ' h' : fmt(f.total, 1) + ' ' + u}</div></div>`; });
    el.innerHTML = h + '</div><div class="g-eje"><span>0</span><span>' + (kmh ? fmt(T / 2, 2) + ' h' : fmt(T / 2, 1)) + '</span><span>' + (kmh ? fmt(T, 2) + ' h' : fmt(T, 1) + ' ' + u) + '</span></div>';
  }
  window.App.paneles.push({ id: 'gantt', titulo: 'Gantt', render: pGantt });
})();
