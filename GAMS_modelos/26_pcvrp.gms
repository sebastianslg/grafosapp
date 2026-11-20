$title PCVRP: VRP con beneficios (prize-collecting)
$onText
===============================================================================================
 26 · PCVRP · VRP con beneficios (prize-collecting)
-----------------------------------------------------------------------------------------------
 No es obligatorio visitar a todos: cada cliente aporta un beneficio y se visitan solo los
 rentables. Maximiza beneficio recogido − costo de distancia, con capacidad Q y flota limitada.
 PROBLEMA DE EJEMPLO:
 CVRP-10 con beneficios de 45 a 180 por cliente, costo 1 $/km, Q = 15 y solo K = 2 vehículos (no
 caben los 38 de demanda).
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 26_pcvrp.gms
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
   pr(i) 'premio (beneficio) por visitar' / d 0, c1 90, c2 75, c3 120, c4 165, c5 180, c6 105, c7 60, c8 135, c9 150, c10 45 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Parameter dist(i,j) 'distancia euclidiana (también tiempo de viaje)';
dist(i,j) = sqrt(sqr(cx(i) - cx(j)) + sqr(cy(i) - cy(j)));
Scalar K 'vehículos disponibles' / 2 /, cpk 'costo por unidad de distancia' / 1 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si se recorre el arco i -> j', y(i) 'vale 1 si se visita el cliente';
Positive Variable ql(i) 'carga acumulada';
Free Variable z 'beneficio neto';
x.fx(i,i) = 0; y.fx('d') = 1;
Equations obj, sale(i), entra(i), flota, balDep, carga(i,j), cargaMin(i), cargaMax(i);
obj..           z =e= sum(c, pr(c)*y(c)) - cpk*sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= y(i);
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= y(j);
flota..         sum(c, x('d',c)) =l= K;
balDep..        sum(c, x('d',c)) =e= sum(c, x(c,'d'));
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));
cargaMin(i)$c(i).. ql(i) =g= dem(i)*y(i);
cargaMax(i)$c(i).. ql(i) =l= Q*y(i);
Equations arcoY1(i,j) 'solo arcos entre clientes visitados', arcoY2(i,j), capTot 'la demanda atendida cabe en la flota';
arcoY1(i,j)$(c(i) and c(j) and not sameas(i,j)).. x(i,j) =l= y(i);
arcoY2(i,j)$(c(i) and c(j) and not sameas(i,j)).. x(i,j) =l= y(j);
capTot.. sum(c, dem(c)*y(c)) =l= K*Q;
Model pcvrp / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve pcvrp using mip maximizing z;
Scalar premio 'beneficio recogido', costo 'costo de distancia';
premio = sum(c, pr(c)*y.l(c)); costo = cpk*sum((i,j), dist(i,j)*x.l(i,j));

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
display z.l, premio, costo, y.l, ruta, largo, cargaR;
