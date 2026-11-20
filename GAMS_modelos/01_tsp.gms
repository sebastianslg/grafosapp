$title TSP: Problema del agente viajero
$onText
===============================================================================================
 01 · TSP · Problema del agente viajero
-----------------------------------------------------------------------------------------------
 Un único vehículo sale del depósito, visita una vez a cada uno de los 10 clientes y regresa,
 minimizando la distancia total. Formulación de Miller-Tucker-Zemlin (MTZ) para eliminar
 subtours.
 PROBLEMA DE EJEMPLO:
 Depósito d y 10 clientes (instancia CVRP-10); sin capacidad. Distancias euclidianas.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 01_tsp.gms
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
   dem(i) 'demanda' / d 0, c1 4, c2 3, c3 5, c4 4, c5 3, c6 5, c7 4, c8 3, c9 5, c10 2 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Parameter dist(i,j) 'distancia euclidiana (también tiempo de viaje)';
dist(i,j) = sqrt(sqr(cx(i) - cx(j)) + sqr(cy(i) - cy(j)));

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si se recorre el arco i -> j';
Positive Variable u(i) 'posición del nodo en el recorrido (MTZ)';
Free Variable z 'distancia total';
x.fx(i,i) = 0;
Equations obj 'distancia total', sale(i) 'sale una vez de cada nodo', entra(i) 'entra una vez a cada nodo',
          mtz(i,j) 'eliminación de subtours (MTZ)';
obj..       z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)..   sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)..  sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
mtz(i,j)$(c(i) and c(j) and not sameas(i,j)).. u(i) - u(j) + card(c)*x(i,j) =l= card(c) - 1;
u.lo(c) = 1; u.up(c) = card(c);
Model tsp / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve tsp using mip minimizing z;

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

option decimals = 2;
display z.l, x.l, u.l, ruta, largo;
