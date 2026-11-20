$title VRPSPD: VRP con entrega y recogida simultáneas
$onText
===============================================================================================
 23 · VRPSPD · VRP con entrega y recogida simultáneas
-----------------------------------------------------------------------------------------------
 Cada cliente recibe una entrega y devuelve una recogida en la misma visita (envases,
 devoluciones). La carga a bordo cambia a lo largo de la ruta: sale con todas las entregas y va
 acumulando recogidas. Formulación de flujo con dos mercancías: D (entregas aún a bordo) y P
 (recogidas a bordo).
 PROBLEMA DE EJEMPLO:
 CVRP-10: entregas = demandas originales y recogidas de 4 a 7 unidades por cliente (total 56); Q
 = 15, K = 5.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 23_vrpspd.gms
 SALIDA:    archivo .lst -> sección «display» (función objetivo, variables y rutas reconstruidas).
 SOLVER:    cualquier solver MIP (HiGHS, CPLEX, CBC, Gurobi, XPRESS). Para usar HiGHS (gratuito):
            descomentar la línea «option mip = highs;» más abajo.
===============================================================================================
$offText

* ------------------------------------- DATOS -------------------------------------------------
Set i 'nodos: depósito y clientes' / d, c1*c10 /
    c(i) 'clientes' / c1*c10 /;
Alias (i,j,h,g);
Parameter
   cx(i) 'coordenada x' / d 48, c1 18, c2 38, c3 62, c4 88, c5 92, c6 78, c7 52, c8 28, c9 8, c10 14 /
   cy(i) 'coordenada y' / d 52, c1 82, c2 92, c3 84, c4 72, c5 46, c6 18, c7 8, c8 16, c9 38, c10 64 /
   dem(i) 'demanda' / d 0, c1 4, c2 3, c3 5, c4 4, c5 3, c6 5, c7 4, c8 3, c9 5, c10 2 /,
   pk(i) 'cantidad recogida' / d 0, c1 5, c2 6, c3 6, c4 7, c5 6, c6 4, c7 5, c8 7, c9 4, c10 6 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Parameter dist(i,j) 'distancia euclidiana (también tiempo de viaje)';
dist(i,j) = sqrt(sqr(cx(i) - cx(j)) + sqr(cy(i) - cy(j)));
Scalar K 'vehículos disponibles' / 5 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si se recorre el arco i -> j';
Positive Variable D(i,j) 'entregas aún a bordo en el arco', P(i,j) 'recogidas a bordo en el arco';
Free Variable z 'distancia total';
x.fx(i,i) = 0;
Equations obj, sale(i), entra(i), flota, balDep, flujoD(i) 'el cliente recibe su entrega', flujoP(i) 'el cliente entrega su recogida',
          capArco(i,j) 'carga a bordo <= Q', salDepP 'nada recogido al salir', llegaDepD 'nada por entregar al volver';
obj..            z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..   sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j)..  sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
flota..          sum(c, x('d',c)) =l= K;
balDep..         sum(c, x('d',c)) =e= sum(c, x(c,'d'));
flujoD(j)$c(j).. sum(i$(not sameas(i,j)), D(i,j)) - sum(h$(not sameas(j,h)), D(j,h)) =e= dem(j);
flujoP(j)$c(j).. sum(h$(not sameas(j,h)), P(j,h)) - sum(i$(not sameas(i,j)), P(i,j)) =e= pk(j);
capArco(i,j)$(not sameas(i,j)).. D(i,j) + P(i,j) =l= Q*x(i,j);
salDepP..        sum(c, P('d',c)) =e= 0;
llegaDepD..      sum(c, D(c,'d')) =e= 0;
Model vrpspd / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve vrpspd using mip minimizing z;

* ------------------------------------- REPORTE: rutas reconstruidas desde x.l ------------------
Set r 'rutas' / r1*r8 /, s 'paradas' / s1*s12 /;
Parameter ruta(r,s) 'cliente visitado en cada parada (número de cliente)', largo(r) 'distancia de la ruta',
          cargaR(r) 'carga entregada en la ruta';
Scalar nr 'número de rutas' / 0 /, act 'nodo actual (ord)', sig 'nodo siguiente (ord)', np 'parada';
loop((g,h)$((sameas(g,'d')) and c(h) and x.l(g,h) > 0.5),
   nr = nr + 1; act = ord(h); np = 0;
   largo(r)$(ord(r) = nr) = dist(g,h);
   while(sum(i$(ord(i) = act), 1$c(i)) > 0,
      np = np + 1;
      ruta(r,s)$(ord(r) = nr and ord(s) = np) = sum(i$(ord(i) = act), ord(i)) - card(i) + card(c);
      cargaR(r)$(ord(r) = nr) = cargaR(r) + sum(i$(ord(i) = act), dem(i));
      sig = sum((i,j)$(ord(i) = act and x.l(i,j) > 0.5), ord(j));
      largo(r)$(ord(r) = nr) = largo(r) + sum((i,j)$(ord(i) = act and ord(j) = sig), dist(i,j));
      act = sig;
   );
);
Parameter abordo(i,j) 'carga a bordo en cada arco usado'; abordo(i,j)$(x.l(i,j) > 0.5) = D.l(i,j) + P.l(i,j);

option decimals = 2;
display z.l, ruta, largo, abordo;
