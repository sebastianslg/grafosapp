$title Fisher-Jaikumar: asignación generalizada (GAP) + TSP por grupo
$onText
===============================================================================
 17_fisher_jaikumar · Fisher-Jaikumar: asignación generalizada (GAP) + TSP por grupo
-------------------------------------------------------------------------------
 Agrupa primero, rutea después con programación matemática. (1) Elige K = 3 clientes semilla (el más lejano
 del depósito y, luego, los más alejados de las semillas ya elegidas). (2) Resuelve un problema de asignación
 generalizada (GAP, MIP): cada cliente a una semilla, sin exceder Q, minimizando el costo de inserción.
 (3) Resuelve un TSP (MIP) para cada grupo dentro de un loop de GAMS.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 17_fisher_jaikumar.gms
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

* ---- (1) SEMILLAS ----
Set k 'grupos (vehículos)' / k1*k3 /;
Parameter sem(k) 'número del cliente semilla', ya(i) 'ya es semilla', dmS(i) 'distancia a la semilla más cercana';
Scalar mejorV, mejorI;
loop(k,
   dmS(i)$(ord(i) > 1) = smin(j$(ya(j) = 1 or ord(j) = 1), dist(i,j));
   mejorV = smax(i$(ord(i) > 1 and ya(i) = 0), dmS(i));
   mejorI = smin(i$(ord(i) > 1 and ya(i) = 0 and dmS(i) = mejorV), ord(i));
   sem(k) = mejorI - 1; ya(i)$(ord(i) = mejorI) = 1;
);
* ---- (2) GAP: costo de insertar el cliente i en la ruta d -> semilla -> d ----
Parameter cIns(i,k) 'costo de inserción del cliente en el grupo';
cIns(i,k)$(ord(i) > 1) = sum(j$(ord(j) = sem(k) + 1), dist('d',i) + dist(i,j) - dist('d',j));
Binary Variable y(i,k) 'el cliente i va al grupo k';
Free Variable zg 'costo total de inserción';
Equations objG, unaVez(i), capG(k);
objG..                 zg =e= sum((i,k)$(ord(i) > 1), cIns(i,k)*y(i,k));
unaVez(i)$(ord(i) > 1).. sum(k, y(i,k)) =e= 1;
capG(k)..              sum(i$(ord(i) > 1), dem(i)*y(i,k)) =l= Q;
y.fx(i,k)$(ord(i) = 1) = 0;
Model gap / objG, unaVez, capG /;
option optcr = 0;
solve gap using mip minimizing zg;
* ---- (3) TSP de cada grupo (se resuelve dentro de un loop) ----
Set act(i) 'nodos del grupo que se está ruteando';
Binary Variable xt(i,j) 'arco del TSP del grupo';
Positive Variable ut(i) 'posición (MTZ)';
Free Variable zt 'longitud del TSP del grupo';
Equations objT, saleT(i), entraT(i), mtzT(i,j);
objT..               zt =e= sum((i,j)$(act(i) and act(j)), dist(i,j)*xt(i,j));
saleT(i)$act(i)..    sum(j$(act(j) and not sameas(i,j)), xt(i,j)) =e= 1;
entraT(j)$act(j)..   sum(i$(act(i) and not sameas(i,j)), xt(i,j)) =e= 1;
mtzT(i,j)$(act(i) and act(j) and ord(i) > 1 and ord(j) > 1 and not sameas(i,j)).. ut(i) - ut(j) + card(i)*xt(i,j) =l= card(i) - 1;
xt.fx(i,i) = 0;
Model tspK / objT, saleT, entraT, mtzT /;
Parameter largoK(k) 'distancia del TSP de cada grupo', cargaK(k) 'carga del grupo', ordenK(k,p) 'clientes del grupo en orden';
Scalar actual, npos, ncl, cfin, posT / 0 /;
loop(k,
   act(i) = no; act('d') = yes; act(i)$(ord(i) > 1 and y.l(i,k) > 0.5) = yes;
   xt.lo(i,j) = 0; xt.up(i,j) = 1; xt.fx(i,i) = 0;
   xt.fx(i,j)$(not (act(i) and act(j))) = 0;
   ut.lo(i) = 1; ut.up(i) = card(i);
   solve tspK using mip minimizing zt;
   largoK(k) = zt.l; cargaK(k) = sum(i$act(i), dem(i));
   actual = 1; npos = 0; ncl = sum(i$act(i), 1) - 1;
   loop(p$(ord(p) <= ncl),
      actual = sum((i,j)$(ord(i) = actual and xt.l(i,j) > 0.5), ord(j));
      npos = npos + 1; ordenK(k,p) = actual - 1;
      posT = posT + 1; tr(pa)$(ord(pa) = posT) = actual - 1;
   );
);
cfin = sum(k, largoK(k));
display sem, y.l, largoK, cargaK, ordenK, cfin;

* ------------------------------- REPORTE FINAL -------------------------------
Set rs 'rutas' / r1*r6 /;
Parameter RTc(rs,p) 'cliente en cada posición, por ruta', carga(rs) 'carga de la ruta', dr(rs) 'distancia de la ruta';
Scalar costo_final, gap_pct 'brecha frente al óptimo (%)';
loop((rs,k)$(ord(rs) = ord(k)), RTc(rs,p) = ordenK(k,p); carga(rs) = cargaK(k); dr(rs) = largoK(k); );
costo_final = sum(rs, dr(rs));
gap_pct = 100*(costo_final - zopt)/zopt;
option decimals = 2;
display tr, RTc, carga, dr, costo_final, gap_pct;
