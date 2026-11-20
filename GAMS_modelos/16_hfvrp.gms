$title HFVRP: VRP con flota heterogénea
$onText
===============================================================================================
 16 · HFVRP · VRP con flota heterogénea
-----------------------------------------------------------------------------------------------
 La flota tiene tipos de vehículo con capacidad y costo por kilómetro distintos y una cantidad
 limitada de cada tipo. Se decide qué tipo cubre cada ruta. Índice t de tipo en lugar de índice
 de vehículo (menos simetría).
 PROBLEMA DE EJEMPLO:
 Instancia CVRP-10; 2 camiones grandes (Q = 20, 1,3 $/km) y 2 pequeños (Q = 10, 0,8 $/km).
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 16_hfvrp.gms
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
Set t 'tipos de vehículo' / grande, pequeno /;
Parameter
   capT(t) 'capacidad del tipo' / grande 20, pequeno 10 /
   cpk(t)  'costo por unidad de distancia' / grande 1.3, pequeno 0.8 /
   fijo(t) 'costo fijo por vehículo usado' / grande 0, pequeno 0 /
   nveh(t) 'vehículos disponibles del tipo' / grande 2, pequeno 2 /;
Scalar Qmax 'mayor capacidad'; Qmax = smax(t, capT(t));

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j,t) 'vale 1 si un vehículo del tipo t recorre el arco i -> j';
Positive Variable ql(i) 'carga acumulada al salir del cliente i';
Free Variable z 'costo total';
x.fx(i,i,t) = 0;
Equations obj 'costo fijo + costo variable', visita(j) 'cada cliente se visita una vez', flujo(i,t) 'conservación de flujo por tipo',
          disp(t) 'vehículos disponibles por tipo', carga(i,j) 'carga acumulada (MTZ)', capac(j) 'capacidad del tipo que visita j';
obj..   z =e= sum((c,t), fijo(t)*x('d',c,t)) + sum((i,j,t), cpk(t)*dist(i,j)*x(i,j,t));
visita(j)$c(j).. sum((i,t)$(not sameas(i,j)), x(i,j,t)) =e= 1;
flujo(i,t)..     sum(j$(not sameas(i,j)), x(i,j,t)) =e= sum(j$(not sameas(i,j)), x(j,i,t));
disp(t)..        sum(c, x('d',c,t)) =l= nveh(t);
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Qmax*(1 - sum(t, x(i,j,t)));
capac(j)$c(j)..  ql(j) =l= sum((i,t)$(not sameas(i,j)), capT(t)*x(i,j,t));
ql.lo(c) = dem(c); ql.up(c) = Qmax;
Model hfvrp / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve hfvrp using mip minimizing z;

* ------------------------------------- REPORTE: rutas reconstruidas desde x.l ------------------
Set r 'rutas' / r1*r8 /, s 'paradas' / s1*s12 /;
Parameter ruta(r,s) 'cliente visitado en cada parada (número de cliente)', largo(r) 'distancia de la ruta',
          cargaR(r) 'carga entregada en la ruta';
Scalar nr 'número de rutas' / 0 /, act 'nodo actual (ord)', sig 'nodo siguiente (ord)', np 'parada';
loop((g,h)$((sameas(g,'d')) and c(h) and sum(t, x.l(g,h,t)) > 0.5),
   nr = nr + 1; act = ord(h); np = 0;
   largo(r)$(ord(r) = nr) = dist(g,h);
   while(sum(i$(ord(i) = act), 1$c(i)) > 0,
      np = np + 1;
      ruta(r,s)$(ord(r) = nr and ord(s) = np) = sum(i$(ord(i) = act), ord(i)) - card(i) + card(c);
      cargaR(r)$(ord(r) = nr) = cargaR(r) + sum(i$(ord(i) = act), dem(i));
      sig = sum((i,j)$(ord(i) = act and sum(t, x.l(i,j,t)) > 0.5), ord(j));
      largo(r)$(ord(r) = nr) = largo(r) + sum((i,j)$(ord(i) = act and ord(j) = sig), dist(i,j));
      act = sig;
   );
);
Parameter tipoR(r,t) 'tipo de vehículo de cada ruta';
nr = 0;
loop((h,t)$(c(h) and x.l('d',h,t) > 0.5), nr = nr + 1; tipoR(r,t)$(ord(r) = nr) = 1; );

option decimals = 2;
display z.l, ruta, largo, cargaR, tipoR;
