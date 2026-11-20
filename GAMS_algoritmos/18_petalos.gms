$title Algoritmo de pétalos: generación de rutas + partición de conjuntos (MIP)
$onText
===============================================================================
 18_petalos · Algoritmo de pétalos: generación de rutas + partición de conjuntos (MIP)
-------------------------------------------------------------------------------
 Ordena los clientes por ángulo alrededor del depósito y genera todos los «pétalos»: tramos consecutivos
 (circulares) de clientes con carga <= Q, recorridos en orden angular. Después un modelo de partición de
 conjuntos (MIP) elige los pétalos que cubren a cada cliente exactamente una vez con costo mínimo.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 18_petalos.gms
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

* ---- ángulos y orden angular ----
Parameter ang(i) 'ángulo respecto al depósito', ordA(p) 'cliente en cada posición angular';
ang(i)$(ord(i) > 1) = arctan2(cy(i) - cy('d'), cx(i) - cx('d'));
Scalar cntA;
loop(i$(ord(i) > 1),
   cntA = 1 + sum(j$(ord(j) > 1 and (ang(j) < ang(i) or (ang(j) = ang(i) and ord(j) < ord(i)))), 1);
   ordA(p)$(ord(p) = cntA) = ord(i) - 1;
);
* ---- generación de pétalos ----
Set rt 'pétalos candidatos' / rt1*rt60 /, lg 'largo del pétalo' / g1*g10 /;
Parameter cubre(rt,i) 'el pétalo visita al cliente', costoR(rt) 'distancia del pétalo', iniR(rt), largoR(rt), cargaR(rt);
Scalar nrt / 0 /, carg, cr, prev, cl, ini;
loop(pa,
   ini = ord(pa); carg = 0; cr = 0; prev = 0;
   loop(lg,
      cl = sum(p$(ord(p) = mod(ini + ord(lg) - 2, card(p)) + 1), ordA(p));
      carg = carg + sum(i$(ord(i) = cl + 1), dem(i));
      if (carg <= Q and ord(lg) <= card(p),
         cr = cr + sum((i,j)$(ord(i) = prev + 1 and ord(j) = cl + 1), dist(i,j)); prev = cl;
         nrt = nrt + 1;
         loop(rt$(ord(rt) = nrt),
            iniR(rt) = ini; largoR(rt) = ord(lg); cargaR(rt) = carg;
            costoR(rt) = cr + sum(i$(ord(i) = cl + 1), dist(i,'d'));
            loop(pb$(ord(pb) <= ord(lg)),
               cubre(rt,i)$(ord(i) = sum(p$(ord(p) = mod(ini + ord(pb) - 2, card(p)) + 1), ordA(p)) + 1) = 1;
            );
         );
      );
   );
);
* ---- partición de conjuntos ----
Binary Variable zr(rt) 'se usa el pétalo';
Free Variable zp 'costo total';
Equations objP, cubrir(i);
objP..                  zp =e= sum(rt$(ord(rt) <= nrt), costoR(rt)*zr(rt));
cubrir(i)$(ord(i) > 1).. sum(rt$(ord(rt) <= nrt), cubre(rt,i)*zr(rt)) =e= 1;
zr.fx(rt)$(ord(rt) > nrt) = 0;
Model particion / objP, cubrir /;
option optcr = 0;
solve particion using mip minimizing zp;
* tour gigante con los pétalos elegidos (para el reporte común)
Scalar posT / 0 /;
loop(rt$(zr.l(rt) > 0.5),
   loop(pb$(ord(pb) <= largoR(rt)),
      posT = posT + 1;
      tr(p)$(ord(p) = posT) = sum(pa$(ord(pa) = mod(iniR(rt) + ord(pb) - 2, card(p)) + 1), ordA(pa));
   );
);
display ordA, nrt, costoR, cargaR, zr.l, zp.l;

* ------------------------------- REPORTE FINAL -------------------------------
Set rs 'rutas' / r1*r6 /;
Parameter RTc(rs,p) 'cliente en cada posición, por ruta', carga(rs) 'carga de la ruta', dr(rs) 'distancia de la ruta';
Scalar costo_final, gap_pct 'brecha frente al óptimo (%)';
Scalar nr / 0 /;
loop(rt$(zr.l(rt) > 0.5),
   nr = nr + 1;
   loop(rs$(ord(rs) = nr),
      loop(pb$(ord(pb) <= largoR(rt)), RTc(rs,pb) = sum(pa$(ord(pa) = mod(iniR(rt) + ord(pb) - 2, card(p)) + 1), ordA(pa)); );
      carga(rs) = cargaR(rt); dr(rs) = costoR(rt);
   );
);
costo_final = sum(rs, dr(rs));
gap_pct = 100*(costo_final - zopt)/zopt;
option decimals = 2;
display tr, RTc, carga, dr, costo_final, gap_pct;
