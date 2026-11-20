$title VRPB: VRP con recogidas en el regreso (backhauls)
$onText
===============================================================================================
 22 · VRPB · VRP con recogidas en el regreso (backhauls)
-----------------------------------------------------------------------------------------------
 Clientes de entrega (linehaul, L) y de recogida (backhaul, B). En cada ruta se atienden primero
 todas las entregas y después las recogidas; ninguna ruta empieza por una recogida. Cargas de
 entrega y de recogida no superan Q por separado.
 PROBLEMA DE EJEMPLO:
 CVRP-10 con c1-c6 de entrega y c7-c10 de recogida (mismas cantidades), Q = 15, K = 5.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 22_vrpb.gms
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
Set L(i) 'clientes de entrega (linehaul)' / c1*c6 /, B(i) 'clientes de recogida (backhaul)' / c7*c10 /;
Scalar K 'vehículos disponibles' / 5 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si se recorre el arco i -> j';
Positive Variable qL(i) 'carga entregada acumulada', qB(i) 'carga recogida acumulada';
Free Variable z 'distancia total';
x.fx(i,i) = 0;
* arcos prohibidos: de una recogida a una entrega y del depósito a una recogida
x.fx(i,j)$(B(i) and L(j)) = 0;
x.fx('d',j)$B(j) = 0;
Equations obj, sale(i), entra(i), flota, balDep, cargaL(i,j) 'carga de entregas (MTZ)', cargaB(i,j) 'carga de recogidas (MTZ)';
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
flota..         sum(c, x('d',c)) =l= K;
balDep..        sum(c, x('d',c)) =e= sum(c, x(c,'d'));
cargaL(i,j)$(L(i) and L(j) and not sameas(i,j)).. qL(j) =g= qL(i) + dem(j) - Q*(1 - x(i,j));
cargaB(i,j)$(B(i) and B(j) and not sameas(i,j)).. qB(j) =g= qB(i) + dem(j) - Q*(1 - x(i,j));
qL.lo(L) = dem(L); qL.up(L) = Q; qB.lo(B) = dem(B); qB.up(B) = Q;
Model vrpb / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve vrpb using mip minimizing z;

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
display z.l, ruta, largo;
