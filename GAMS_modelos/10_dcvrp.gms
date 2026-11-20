$title DCVRP: VRP con capacidad y distancia máxima
$onText
===============================================================================================
 10 · DCVRP · VRP con capacidad y distancia máxima
-----------------------------------------------------------------------------------------------
 CVRP en el que además ninguna ruta puede superar una distancia (o duración) máxima L, por
 jornada laboral o autonomía del vehículo. a(i) acumula la distancia de la ruta hasta i.
 PROBLEMA DE EJEMPLO:
 Instancia CVRP-10, Q = 15, K = 5 y L = 150 (en el CVRP una ruta mide 151,1: deja de ser
 factible).
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 10_dcvrp.gms
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
Scalar K 'vehículos disponibles' / 5 /, L 'distancia máxima por ruta' / 150 /, BigM / 1000 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si un vehículo recorre el arco i -> j';
Positive Variable ql(i) 'carga acumulada al salir del cliente i';
Free Variable z 'función objetivo';
x.fx(i,i) = 0;
Equations obj 'distancia total', sale(i) 'un sucesor por cliente', entra(i) 'un predecesor por cliente',
          flota 'a lo sumo K vehículos', balDep 'salen tantos como regresan', carga(i,j) 'carga acumulada (MTZ)';
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
flota..         sum(c, x('d',c)) =l= K;
balDep..        sum(c, x('d',c)) =e= sum(c, x(c,'d'));
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));
ql.lo(c) = dem(c); ql.up(c) = Q;
Positive Variable a(i) 'distancia acumulada al llegar a i';
Equations aIni(j), aSig(i,j), largoMax(i) 'la ruta (con el regreso) no supera L';
aIni(j)$c(j).. a(j) =g= dist('d',j)*x('d',j);
aSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. a(j) =g= a(i) + dist(i,j) - BigM*(1 - x(i,j));
largoMax(i)$c(i).. a(i) + dist(i,'d') =l= L + BigM*(1 - x(i,'d'));
Model dcvrp / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve dcvrp using mip minimizing z;

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
display z.l, a.l, ruta, largo, cargaR;
