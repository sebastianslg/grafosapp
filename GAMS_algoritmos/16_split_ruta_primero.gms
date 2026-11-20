$title Ruta primero, agrupa después: TSP gigante + Split (Beasley)
$onText
===============================================================================
 16_split_ruta_primero · Ruta primero, agrupa después: TSP gigante + Split (Beasley)
-------------------------------------------------------------------------------
 Fase 1 (ruta primero): resuelve el TSP de todos los clientes con un modelo MIP (MTZ) y obtiene un tour
 gigante. Fase 2 (agrupa después): el procedimiento Split corta el tour en rutas factibles de forma ÓPTIMA para
 ese orden, como un camino más corto (programación dinámica de Bellman) en un grafo auxiliar acíclico.
 Problema de ejemplo: CVRP-10 (1 depósito, 10 clientes, capacidad Q = 15).
 EJECUCIÓN: abrir el archivo en GAMS Studio y pulsar «Run» (F9), o por consola:
            gams 16_split_ruta_primero.gms
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

* ---- FASE 1: TSP gigante (MIP) ----
Binary Variable x(i,j) 'arco del tour gigante';
Positive Variable u(i) 'posición en el tour (MTZ)';
Free Variable zt 'longitud del tour gigante';
x.fx(i,i) = 0;
Equations objT, saleT(i), entraT(i), mtzT(i,j);
objT..     zt =e= sum((i,j), dist(i,j)*x(i,j));
saleT(i).. sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entraT(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
mtzT(i,j)$(ord(i) > 1 and ord(j) > 1 and not sameas(i,j)).. u(i) - u(j) + (card(i)-1)*x(i,j) =l= card(i) - 2;
u.lo(i)$(ord(i) > 1) = 1; u.up(i)$(ord(i) > 1) = card(i) - 1;
Model tspG / objT, saleT, entraT, mtzT /;
option optcr = 0;
solve tspG using mip minimizing zt;
* tour gigante: se sigue x desde el depósito
Scalar act / 1 /;
loop(p,
   act = sum((i,j)$(ord(i) = act and x.l(i,j) > 0.5), ord(j));
   tr(p) = act - 1;
);
* ---- FASE 2: SPLIT (Bellman sobre el grafo auxiliar 0..10) ----
Set v 'nodos del grafo auxiliar' / v0*v10 /;
Alias (v,va,vb);
Parameter Vc(v) 'costo mínimo para atender los primeros clientes del tour', pred(v) 'corte anterior',
          arcoA(v,v) 'costo de la ruta que atiende tr(a+1..b)';
Scalar carg, cr, nodoA;
Vc(v) = 1e9; Vc('v0') = 0;
loop(va,
   carg = 0; cr = 0; nodoA = 0;
   loop(vb$(ord(vb) > ord(va)),
      cn = sum(p$(ord(p) = ord(vb) - 1), tr(p));
      carg = carg + sum(i$(ord(i) = cn+1), dem(i));
      if (carg <= Q,
         cr = cr + sum((i,j)$(ord(i) = nodoA+1 and ord(j) = cn+1), dist(i,j));
         nodoA = cn;
         arcoA(va,vb) = cr + sum(i$(ord(i) = cn+1), dist(i,'d'));
         if (Vc(va) + arcoA(va,vb) < Vc(vb) - 1e-9, Vc(vb) = Vc(va) + arcoA(va,vb); pred(vb) = ord(va) - 1; );
      );
   );
);
Scalar costoSplit 'costo de la partición óptima'; costoSplit = Vc('v10');
display zt.l, tr, Vc, pred, costoSplit;

* ------------------------------- REPORTE FINAL -------------------------------
Set rs 'rutas' / r1*r6 /;
Parameter RTc(rs,p) 'cliente en cada posición, por ruta', carga(rs) 'carga de la ruta', dr(rs) 'distancia de la ruta';
Scalar costo_final, gap_pct 'brecha frente al óptimo (%)';
* rutas a partir de los cortes óptimos (pred), de atrás hacia adelante
Scalar fin, ini, nr / 0 /, kr;
fin = 10;
while (fin > 0, nr = nr + 1; fin = sum(v$(ord(v) = fin + 1), pred(v)); );
fin = 10; kr = nr;
while (fin > 0,
   ini = sum(v$(ord(v) = fin + 1), pred(v));
   RTc(rs,p)$(ord(rs) = kr and ord(p) > ini and ord(p) <= fin) = tr(p);
   carga(rs)$(ord(rs) = kr) = sum((p,i)$(ord(p) > ini and ord(p) <= fin and ord(i) = tr(p) + 1), dem(i));
   dr(rs)$(ord(rs) = kr) = sum((va,vb)$(ord(va) = ini + 1 and ord(vb) = fin + 1), arcoA(va,vb));
   fin = ini; kr = kr - 1;
);
costo_final = sum(rs, dr(rs));
gap_pct = 100*(costo_final - zopt)/zopt;
option decimals = 2;
display tr, RTc, carga, dr, costo_final, gap_pct;
