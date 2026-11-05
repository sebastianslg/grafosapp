/* Selector rápido de modelos: TSP, m-TSP, m-TSP balanceado, Open m-TSP y Open m-TSP balanceado. */
(function () {
  'use strict';
  const { S, $ } = window.App;
  const MODELOS = [['tsp', 'TSP', 'Un vehículo, ruta cerrada'], ['mtsp', 'm-TSP', 'Varios vehículos, regresan al depósito'], ['mtspb', 'm-TSP balanceado', 'Cada ruta con igual número de clientes'], ['omtsp', 'Open m-TSP', 'Rutas sin regreso al depósito'], ['omtspb', 'Open m-TSP balanceado', 'Rutas abiertas y equilibradas']];
  function activo() {
    if ($('problema').value === 'tsp') return 'tsp'; if ($('problema').value !== 'mtsp') return null;
    const a = $('abierto').checked, b = $('balanceado').checked; return a ? (b ? 'omtspb' : 'omtsp') : (b ? 'mtspb' : 'mtsp');
  }
  function pintar() { const a = activo(); document.querySelectorAll('#modelos [data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === a)); }
  function elegir(m) {
    const sel = $('problema'); sel.value = m === 'tsp' ? 'tsp' : 'mtsp';
    if (m === 'tsp') { $('modo').value = 'ciclo'; }
    else {
      $('abierto').checked = /^o/.test(m); $('balanceado').checked = /b$/.test(m); S.ds.balanceado = $('balanceado').checked;
      const f = S.ds.flota, tot = f.reduce((a, t) => a + (+t.n || 0), 0); if (tot < 2 && f[0]) { f[0].n = 2; }
    }
    App.camposProblema(); pintar();
  }
  App.construirModelos = () => {
    const c = $('cProblema'); if ($('modelos')) return pintar();
    const d = document.createElement('div'); d.id = 'modelos'; d.className = 'modelos';
    d.innerHTML = '<div class="nota" style="margin-bottom:6px"><b>Modelo</b></div><div class="chips">' + MODELOS.map(([m, t, h]) => `<button class="chipm" data-m="${m}" title="${h}" aria-pressed="false">${t}</button>`).join('') + '</div>';
    c.insertBefore(d, c.querySelector('.fila')); d.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => elegir(b.dataset.m)));
    ['problema', 'abierto', 'balanceado', 'modo'].forEach((id) => $(id).addEventListener('change', pintar)); pintar();
  };
})();
