/* Generador de código GAMS para las variantes de VRP (modelo de flujo por vehículo, MTZ).
   El código se genera con los datos de la instancia I. Nota: el modelo equivalente se resuelve y verifica en la
   aplicación con HiGHS; el texto GAMS no se ejecuta aquí (requiere licencia de GAMS). */
(function (root) {
  'use strict';
  const nm = (i) => 'n' + i, num = (x) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(4)));
  function tabla(D, idx, nombre, tit, oc) {
    const L = ['Table ' + nombre + '(i,j) ' + "'" + tit + "'", '        ' + idx.map((j) => nm(j).padStart(8)).join('')];
    idx.forEach((i) => L.push(nm(i).padEnd(8) + idx.map((j) => (i === j || !isFinite(D[i][j]) ? '0' : num(D[i][j])).padStart(8)).join('')));
    return L.join('\n') + ';';
  }
  function generar(I, id, o) {
    o = o || {}; const f = I.f || {}, mode = f.mode || 'entrega', n = I.D.length, all = Array.from({ length: n }, (_, i) => i), veh = I.veh, m = veh.length, cl = I.cust, obj = f.obj || 'costo';
    const cap = veh.some((v) => isFinite(v.cap)), vt = f.vt && f.vt.usar, fijos = veh.some((v) => v.fijo), limD = veh.some((v) => isFinite(v.Lmax)), stops = veh.some((v) => v.lstops);
    const maxo = f.objetivo === 'maximo', abierto = !!f.open, pairs = I.pairs || [], loc = !!f.locDepot, opc = obj === 'profit' || obj === 'top';
    const L = [];
    L.push('$title ' + (id || 'VRP') + ' - modelo de flujo por vehículo (MILP)', '$onText', 'Generado por la herramienta. Resolver con:  gams modelo.gms', '$offText', '');
    if (!o.soloModelo) {
      L.push('Sets', '  i  nodos   / ' + all.map(nm).join(', ') + ' /', '  c(i) \'clientes\' / ' + cl.map(nm).join(', ') + ' /', '  dep(i) \'depósitos\' / ' + I.depots.map(nm).join(', ') + ' /', '  k  vehículos / ' + veh.map((_, q) => 'v' + (q + 1)).join(', ') + ' /',
        '  kd(k,i) \'depósito de cada vehículo\' / ' + veh.map((v, q) => 'v' + (q + 1) + '.' + nm(v.depot)).join(', ') + ' /;', 'Alias (i,j);', '');
      L.push(tabla(I.D, all, 'dist', 'distancia entre nodos'), '');
      L.push('Parameters', '  cu(k) \'costo por km\' / ' + veh.map((v, q) => 'v' + (q + 1) + ' ' + num(v.costoKm)).join(', ') + ' /');
      if (cap) L.push('  Q(k) \'capacidad\' / ' + veh.map((v, q) => 'v' + (q + 1) + ' ' + (isFinite(v.cap) ? num(v.cap) : '99999')).join(', ') + ' /');
      if (fijos) L.push('  fx(k) \'costo fijo\' / ' + veh.map((v, q) => 'v' + (q + 1) + ' ' + num(v.fijo || 0)).join(', ') + ' /');
      if (limD) L.push('  Lmax(k) \'distancia máx.\' / ' + veh.map((v, q) => 'v' + (q + 1) + ' ' + (isFinite(v.Lmax) ? num(v.Lmax) : '99999')).join(', ') + ' /');
      L.push("  vel(k) 'velocidad en km por hora' / " + veh.map((v, q) => 'v' + (q + 1) + ' ' + num(v.vel)).join(', ') + ' /');
      L.push('  w(i) \'demanda a entregar\' / ' + cl.map((i) => nm(i) + ' ' + num(I.w[i])).join(', ') + ' /');
      if (mode === 'backhaul' || mode === 'spd' || mode === 'pd') L.push('  r(i) \'cantidad a recoger\' / ' + cl.map((i) => nm(i) + ' ' + num(I.r[i])).join(', ') + ' /');
      if (opc) L.push('  prem(i) \'premio\' / ' + cl.map((i) => nm(i) + ' ' + num(I.prize[i])).join(', ') + ' /');
      if (loc) L.push('  fa(i) \'costo de abrir el depósito\' / ' + I.depots.map((d) => nm(d) + ' ' + num((f.openCost || {})[d] || 0)).join(', ') + ' /');
      if (vt) L.push('  ae(i) \'inicio de ventana (h)\' / ' + cl.map((i) => nm(i) + ' ' + num(f.vt.a[i])).join(', ') + ' /', '  be(i) \'fin de ventana (h)\' / ' + cl.map((i) => nm(i) + ' ' + num(f.vt.b[i])).join(', ') + ' /');
      L.push('  ;');
      if (vt) L.push('Scalars  t0 \'hora de salida\' /' + num(f.vt.inicio) + '/, srv \'servicio (h)\' /' + num(f.vt.servicio) + '/, Mt \'big-M\' /200/;');
      if (pairs.length) L.push('Set pd(i,j) \'pares recoger-entregar\' / ' + pairs.map(([p, d]) => nm(p) + '.' + nm(d)).join(', ') + ' /;');
      if (mode === 'backhaul') L.push("Set bh(i) 'clientes backhaul' / " + cl.filter((i) => I.r[i] > 0 && !(I.w[i] > 0)).map(nm).join(', ') + ' /;', "Set lh(i) 'clientes linehaul'; lh(c) = yes; lh(bh) = no;");
      L.push('');
    }
    // costos de arco
    L.push("Set arco(i,j,k) 'arcos permitidos';", 'arco(i,j,k)$(ord(i)<>ord(j) and (c(i) or kd(k,i)) and (c(j) or kd(k,j))) = yes;');
    if (mode === 'backhaul') L.push('arco(i,j,k)$(bh(i) and lh(j)) = no;', 'arco(i,j,k)$(kd(k,i) and bh(j)) = no;');
    L.push("Parameter cr(i,j,k) 'costo del arco';", 'cr(i,j,k)$arco(i,j,k) = cu(k)*dist(i,j);');
    if (abierto) L.push('cr(i,j,k)$(arco(i,j,k) and kd(k,j)) = 0;   * ruta abierta: regresar no cuesta');
    L.push('', 'Binary Variables x(i,j,k), y(i,k), v(k);');
    if (loc) L.push('Binary Variable op(i);');
    if (mode === 'split') L.push("Positive Variable q(i,k) 'entrega del vehículo k al cliente i';", "Positive Variable u(i,k) 'orden de visita (MTZ por vehículo)';"); else L.push("Positive Variable u(i) 'orden de visita (MTZ)';");
    if (mode === 'spd' || mode === 'pd') L.push("Positive Variable l(i) 'carga al salir del cliente';");
    if (vt) L.push("Positive Variable t(i) 'hora de llegada';");
    L.push('Variable z;' + (maxo ? '\nPositive Variable zmax;' : ''), '');
    L.push('Equations fo, visita(i), entra(i,k), sale(i,k), parte(k), vuelve(k), usa(i,k), dos(i,j,k)' + (mode === 'split' ? ', mtz(i,j,k)' : ', mtz(i,j)') + ';');
    L.push('x.fx(i,j,k)$(not arco(i,j,k)) = 0;');
    // objetivo
    let ob = 'sum((i,j,k)$arco(i,j,k), cr(i,j,k)*x(i,j,k))';
    if (fijos) ob += ' + sum(k, fx(k)*v(k))'; if (loc) ob += ' + sum(dep, fa(dep)*op(dep))';
    if (maxo) ob = 'zmax + 0.001*(' + ob + ')'; if (obj === 'profit') ob += ' - sum((c,k), prem(c)*y(c,k))'; if (obj === 'top') ob = '0.0001*(' + ob + ') - sum((c,k), prem(c)*y(c,k))';
    L.push('fo.. z =e= ' + ob + ';');
    L.push(mode === 'split' ? 'visita(c).. sum(k, y(c,k)) =g= 1;' : (opc ? 'visita(c).. sum(k, y(c,k)) =l= 1;' : 'visita(c).. sum(k, y(c,k)) =e= 1;'));
    L.push('entra(c,k).. sum(j$arco(j,c,k), x(j,c,k)) =e= y(c,k);', 'sale(c,k).. sum(j$arco(c,j,k), x(c,j,k)) =e= y(c,k);', 'parte(k).. sum((i,j)$(kd(k,i) and c(j)), x(i,j,k)) =e= v(k);', 'vuelve(k).. sum((i,j)$(c(i) and kd(k,j)), x(i,j,k)) =e= v(k);', 'usa(c,k).. y(c,k) =l= v(k);');
    L.push('dos(i,j,k)$(c(i) and c(j) and ord(i)<ord(j)).. x(i,j,k) + x(j,i,k) =l= y(i,k);');
    if (mode === 'split') L.push('mtz(i,j,k)$(c(i) and c(j) and ord(i)<>ord(j)).. u(i,k) - u(j,k) + card(c)*x(i,j,k) =l= card(c) - 1;', 'u.lo(c,k) = 1; u.up(c,k) = card(c);');
    else L.push('mtz(i,j)$(c(i) and c(j) and ord(i)<>ord(j)).. u(i) - u(j) + card(c)*sum(k, x(i,j,k)) =l= card(c) - 1;', 'u.lo(c) = 1; u.up(c) = card(c);');
    if (f.balanced) L.push('v.lo(k) = 1;', 'Equations bal1(k), bal2(k);', 'bal1(k).. sum(c, y(c,k)) =g= floor(card(c)/card(k))*v(k);', 'bal2(k).. sum(c, y(c,k)) =l= ceil(card(c)/card(k))*v(k);');
    else if (f.lmin >= 1) L.push('v.lo(k) = 1;', 'Equation minr(k);', 'minr(k).. sum(c, y(c,k)) =g= ' + f.lmin + '*v(k);');
    if (stops) L.push('Equation maxp(k);', 'maxp(k).. sum(c, y(c,k)) =l= ' + veh[0].lstops + '*v(k);');
    if (maxo) L.push('Equation mm(k);', 'mm(k).. sum((i,j)$arco(i,j,k), cr(i,j,k)*x(i,j,k)) =l= zmax;');
    if (limD) L.push('Equation lim(k);', 'lim(k).. sum((i,j)$arco(i,j,k), (cr(i,j,k)/cu(k))*x(i,j,k)) =l= Lmax(k)*v(k);');
    if (loc) L.push('Equation abre(k);', 'abre(k).. v(k) =l= sum(i$kd(k,i), op(i));');
    if (cap && (mode === 'entrega' || mode === 'backhaul' || mode === 'spd')) L.push('Equation cap(k);', 'cap(k).. sum(c, w(c)*y(c,k)) =l= Q(k)*v(k);');
    if (mode === 'backhaul') L.push('Equation capb(k);', 'capb(k).. sum(c, r(c)*y(c,k)) =l= Q(k)*v(k);');
    if (mode === 'split') L.push('Equations ent(i,k), tot(i), capq(k);', 'ent(c,k).. q(c,k) =l= w(c)*y(c,k);', 'tot(c).. sum(k, q(c,k)) =e= w(c);', 'capq(k).. sum(c, q(c,k)) =l= Q(k)*v(k);');
    if (mode === 'spd' || mode === 'pd') {
      L.push('Equations carga(i,j), carga0(i,j,k), lcap(i);', "Scalar Ml 'big-M de carga' /" + Math.max(1, I.w.reduce((a, b) => a + b, 0) + I.r.reduce((a, b) => a + b, 0)) + '/;');
      L.push('carga(i,j)$(c(i) and c(j) and ord(i)<>ord(j)).. l(j) =g= l(i) + r(j) - w(j) - Ml*(1 - sum(k, x(i,j,k)));');
      L.push(mode === 'spd' ? 'carga0(i,j,k)$(kd(k,i) and c(j)).. l(j) =g= sum(c, w(c)*y(c,k)) + r(j) - w(j) - Ml*(1 - x(i,j,k));' : 'carga0(i,j,k)$(kd(k,i) and c(j)).. l(j) =g= r(j) - w(j) - Ml*(1 - x(i,j,k));');
      L.push('lcap(c).. l(c) =l= sum(k, Q(k)*y(c,k));');
    }
    if (pairs.length) L.push('Equations mismo(i,j,k), prec(i,j);', 'mismo(i,j,k)$pd(i,j).. y(i,k) =e= y(j,k);', 'prec(i,j)$pd(i,j).. u(j) =g= u(i) + 1;');
    if (vt) L.push('Equations tw0(i,j,k), tw(i,j,k);', 't.lo(c) = ae(c); t.up(c) = be(c);', 'tw0(i,j,k)$(kd(k,i) and c(j)).. t(j) =g= t0 + dist(i,j)/vel(k) - Mt*(1 - x(i,j,k));', 'tw(i,j,k)$(c(i) and c(j) and ord(i)<>ord(j)).. t(j) =g= t(i) + srv + dist(i,j)/vel(k) - Mt*(1 - x(i,j,k));');
    L.push('', 'Model vrp / all /;', 'vrp.optcr = 0;', 'Solve vrp using mip minimizing z;', "Display z.l, x.l;");
    return L.join('\n');
  }
  root.Gams = { generar };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Gams;
})(typeof globalThis !== 'undefined' ? globalThis : this);
