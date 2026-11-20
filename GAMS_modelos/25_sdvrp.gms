$title SDVRP: VRP con entrega dividida
$onText
===============================================================================================
 25 · SDVRP · VRP con entrega dividida
-----------------------------------------------------------------------------------------------
 La demanda de un cliente puede repartirse entre varios vehículos (split delivery). Ahorra
 distancia y vehículos cuando las demandas son grandes respecto a Q. Índice k de vehículo,
 cantidad entregada e(i,k) y MTZ por vehículo. El archivo resuelve también la versión sin
 división para comparar.
 PROBLEMA DE EJEMPLO:
 8 clientes (c1-c8) con demandas grandes de 5 a 9 unidades (total 53) y Q = 15: 4 vehículos.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 25_sdvrp.gms
 SALIDA:    archivo .lst -> sección «display» (función objetivo, variables y rutas reconstruidas).
 SOLVER:    cualquier solver MIP (HiGHS, CPLEX, CBC, Gurobi, XPRESS). Para usar HiGHS (gratuito):
            descomentar la línea «option mip = highs;» más abajo.
===============================================================================================
$offText

* ------------------------------------- DATOS -------------------------------------------------
Set i 'nodos: depósito y clientes' / d, c1*c8 /
    c(i) 'clientes' / c1*c8 /;
Alias (i,j,h,g);
Parameter
   cx(i) 'coordenada x' / d 48, c1 18, c2 38, c3 62, c4 88, c5 92, c6 78, c7 52, c8 28 /
   cy(i) 'coordenada y' / d 52, c1 82, c2 92, c3 84, c4 72, c5 46, c6 18, c7 8, c8 16 /
   dem(i) 'demanda' / d 0, c1 7, c2 5, c3 8, c4 6, c5 7, c6 9, c7 6, c8 5 /;
Scalar Q 'capacidad del vehículo' / 15 /;
Parameter dist(i,j) 'distancia euclidiana (también tiempo de viaje)';
dist(i,j) = sqrt(sqr(cx(i) - cx(j)) + sqr(cy(i) - cy(j)));
Set k 'vehículos' / k1*k4 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j,k) 'vale 1 si el vehículo k recorre el arco i -> j';
Positive Variable e(i,k) 'cantidad que el vehículo k entrega al cliente i', u(i,k) 'orden de visita en la ruta k';
Free Variable z 'distancia total';
x.fx(i,i,k) = 0;
Equations obj, flujo(i,k), salida(k), demanda(i) 'se entrega toda la demanda', soloSiVisita(i,k) 'entrega solo si k visita i',
          capV(k) 'capacidad del vehículo', mtzK(i,j,k) 'subtours por vehículo', unaVisita(i,k) 'cada vehículo visita i a lo sumo una vez';
obj..            z =e= sum((i,j,k), dist(i,j)*x(i,j,k));
flujo(i,k)..     sum(j$(not sameas(i,j)), x(i,j,k)) =e= sum(j$(not sameas(i,j)), x(j,i,k));
salida(k)..      sum(c, x('d',c,k)) =l= 1;
demanda(i)$c(i)..        sum(k, e(i,k)) =e= dem(i);
soloSiVisita(i,k)$c(i).. e(i,k) =l= dem(i)*sum(j$(not sameas(i,j)), x(j,i,k));
unaVisita(i,k)$c(i)..    sum(j$(not sameas(i,j)), x(j,i,k)) =l= 1;
capV(k)..                sum(c, e(c,k)) =l= Q;
mtzK(i,j,k)$(c(i) and c(j) and not sameas(i,j)).. u(j,k) =g= u(i,k) + 1 - card(c)*(1 - x(i,j,k));
u.up(c,k) = card(c);
Model sdvrp / all /;
Equation entera(i,k) 'sin división: entrega toda la demanda o nada';
Binary Variable v(i,k) 'el vehículo k atiende completo a i';
entera(i,k)$c(i).. e(i,k) =e= dem(i)*v(i,k);
Model sinDiv / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
Scalar distSinDiv 'distancia sin división';
solve sinDiv using mip minimizing z;
distSinDiv = z.l;
solve sdvrp using mip minimizing z;
Parameter entrega(i,k) 'cantidad entregada por vehículo'; entrega(c,k) = e.l(c,k);

* ------------------------------------- REPORTE: ruta de cada vehículo ------------------------
Set s 'paradas' / s1*s10 /;
Parameter rutaK(k,s) 'cliente en cada parada del vehículo k', largoK(k) 'distancia del vehículo k', cargaK(k) 'carga del vehículo k';
Scalar act 'nodo actual (ord)', sig 'nodo siguiente (ord)', np 'parada';
loop(k$(sum(c, x.l('d',c,k)) > 0.5),
   np = 0; sig = sum(j$(x.l('d',j,k) > 0.5), ord(j));
   largoK(k) = sum(j$(ord(j) = sig), dist('d',j)); act = sig;
   while(act > 1,
      np = np + 1; rutaK(k,s)$(ord(s) = np) = act - 1;
      sig = sum((i,j)$(ord(i) = act and x.l(i,j,k) > 0.5), ord(j));
      largoK(k) = largoK(k) + sum((i,j)$(ord(i) = act and ord(j) = sig), dist(i,j));
      act = sig;
   );
   cargaK(k) = sum(c, e.l(c,k));
);

option decimals = 2;
display z.l, distSinDiv, entrega, rutaK, largoK, cargaK;
