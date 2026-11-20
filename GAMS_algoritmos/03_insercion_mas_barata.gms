$title Inserción más barata (heurística constructiva)
$onText
===============================================================================
 03_insercion_mas_barata · Inserción más barata (heurística constructiva)
-------------------------------------------------------------------------------
 En cada paso inserta el cliente y la posición cuyo incremento de costo
 c(i,k) + c(k,j) - c(i,j) es menor, respetando la capacidad; abre una ruta nueva si hace falta.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 03_insercion_mas_barata.gms
 SALIDA:    revisar el archivo .lst (instrucciones «display»).
===============================================================================
$offText

* ---------------------------- DATOS DEL PROBLEMA -----------------------------
Set i 'nodos: depósito d y clientes c1..c10' / d, c1*c10 /;
Alias (i,j);
Parameter
   cx(i)  'coordenada x' / d 48, c1 18, c2 38, c3 62, c4 88, c5 92, c6 78, c7 52, c8 28, c9 8, c10 14 /
   cy(i)  'coordenada y' / d 52, c1 82, c2 92, c3 84, c4 72, c5 46, c6 18, c7 8, c8 16, c9 38, c10 64 /
   dem(i) 'demanda'      / d 0, c1 4, c2 3, c3 5, c4 4, c5 3, c6 5, c7 4, c8 3, c9 5, c10 2 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Scalar zopt 'costo óptimo conocido (modelo exacto, archivo 12)' / 425.0513 /;
Parameter dist(i,j) 'distancia euclidiana';
dist(i,j) = sqrt( sqr(cx(i)-cx(j)) + sqr(cy(i)-cy(j)) );

* ------------- REPRESENTACIÓN: tour gigante dividido por capacidad ------------
Set p 'posiciones del tour' / p1*p10 /;
Alias (p,pa,pb,pq);
Parameter tr(p)  'tour: número de cliente en cada posición'
          trE(p) 'tour que se evalúa'
          trB(p) 'mejor tour vecino'
          rr(p)  'ruta a la que pertenece cada posición';
Scalar cst 'costo del tour evaluado', ld 'carga acumulada', pv 'nodo previo (0 = depósito)',
       cn 'cliente actual', dn 'demanda del cliente', rn 'número de ruta', nev 'evaluaciones de costo' / 0 /;

* ---- INSERCIÓN MÁS BARATA: inserta, en cada paso, el cliente/posición de menor incremento ----
Set kc 'clientes' / k1*k10 /, ro 'rutas' / ro1*ro5 /, sp 'posición dentro de la ruta' / sp1*sp10 /, st 'pasos' / st1*st10 /;
Parameter demk(kc) 'demanda', pend(kc) 'cliente pendiente de insertar',
          rtn(ro,sp) 'cliente en cada posición de la ruta (0 = vacía)', rtT(ro,sp) 'copia temporal',
          lnr(ro) 'clientes por ruta', lcr(ro) 'carga por ruta',
          okk(kc,ro,sp) 'inserción factible', dl(kc,ro,sp) 'incremento de costo',
          traza(st,*) 'traza: cliente, ruta, posición e incremento';
Scalar rnew 'primera ruta vacía', dm 'menor incremento', key, kk 'cliente elegido', rsel 'ruta elegida', ssel 'posición elegida', wp;
demk(kc) = sum(i$(ord(i) = ord(kc) + 1), dem(i));
pend(kc) = 1;
loop(st,
   rnew = 1 + sum(ro$(lnr(ro) > 0), 1);
   okk(kc,ro,sp) = 0;
   okk(kc,ro,sp)$(pend(kc) = 1 and ord(ro) <= rnew and ord(sp) <= lnr(ro) + 1 and lcr(ro) + demk(kc) <= Q) = 1;
   dl(kc,ro,sp) = 0;
   dl(kc,ro,sp)$okk(kc,ro,sp) =   sum((i,j)$(ord(i) = rtn(ro,sp-1) + 1 and ord(j) = ord(kc) + 1), dist(i,j))
                                + sum((i,j)$(ord(i) = ord(kc) + 1 and ord(j) = rtn(ro,sp) + 1), dist(i,j))
                                - sum((i,j)$(ord(i) = rtn(ro,sp-1) + 1 and ord(j) = rtn(ro,sp) + 1), dist(i,j));
   dm  = smin((kc,ro,sp)$okk(kc,ro,sp), dl(kc,ro,sp));
   key = smin((kc,ro,sp)$(okk(kc,ro,sp) and dl(kc,ro,sp) = dm), 10000*ord(kc) + 100*ord(ro) + ord(sp));
   kk = floor(key/10000); rsel = floor(mod(key,10000)/100); ssel = mod(key,100);
   rtT(ro,sp) = rtn(ro,sp);
   rtn(ro,sp)$(ord(ro) = rsel and ord(sp) > ssel and ord(sp) <= lnr(ro) + 1) = rtT(ro,sp-1);
   rtn(ro,sp)$(ord(ro) = rsel and ord(sp) = ssel) = kk;
   lcr(ro)$(ord(ro) = rsel) = lcr(ro) + sum(kc$(ord(kc) = kk), demk(kc));
   lnr(ro)$(ord(ro) = rsel) = lnr(ro) + 1;
   pend(kc)$(ord(kc) = kk) = 0;
   traza(st,'cliente') = kk; traza(st,'ruta') = rsel; traza(st,'posición') = ssel; traza(st,'incremento') = dm;
);
* se concatenan las rutas para obtener el tour que usa el reporte
wp = 0;
loop(ro,
   loop(sp$(ord(sp) <= lnr(ro)),
      wp = wp + 1;
      tr(p)$(ord(p) = wp) = rtn(ro,sp);
   );
);
display rtn, lcr, traza;

* ------------------------------- REPORTE FINAL -------------------------------
Set rs 'rutas' / r1*r6 /;
Parameter RTc(rs,p) 'cliente en cada posición, por ruta', carga(rs) 'carga de la ruta', dr(rs) 'distancia de la ruta';
Scalar costo_final, gap_pct 'brecha frente al óptimo (%)';
ld = 0; pv = 0; rn = 1;
loop(p,
   cn = tr(p); dn = sum(i$(ord(i) = cn+1), dem(i));
   if (ld + dn > Q,
      dr(rs)$(ord(rs) = rn) = dr(rs) + sum(i$(ord(i) = pv+1), dist(i,'d'));
      pv = 0; ld = 0; rn = rn + 1;
   );
   dr(rs)$(ord(rs) = rn) = dr(rs) + sum((i,j)$(ord(i) = pv+1 and ord(j) = cn+1), dist(i,j));
   ld = ld + dn; pv = cn;
   carga(rs)$(ord(rs) = rn) = ld;
   RTc(rs,p)$(ord(rs) = rn) = cn;
);
dr(rs)$(ord(rs) = rn) = dr(rs) + sum(i$(ord(i) = pv+1), dist(i,'d'));
costo_final = sum(rs, dr(rs));
gap_pct = 100*(costo_final - zopt)/zopt;
option decimals = 2;
display tr, RTc, carga, dr, costo_final, gap_pct;
display nev;
