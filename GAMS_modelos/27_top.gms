$title TOP: Orienteering por equipos
$onText
===============================================================================================
 27 · TOP · Orienteering por equipos
-----------------------------------------------------------------------------------------------
 m vehículos con una distancia máxima L por ruta maximizan el premio total recogido; no hay costo
 por distancia, el límite es el tiempo. Modela vendedores con jornada fija o visitas turísticas.
 PROBLEMA DE EJEMPLO:
 CVRP-10 con los premios del PCVRP, m = 2 vehículos y L = 160 por ruta.
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams 27_top.gms
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
Scalar m 'vehículos' / 2 /, L 'distancia máxima por ruta' / 160 /;

* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si se recorre el arco i -> j', y(i) 'vale 1 si se visita el cliente';
Positive Variable a(i) 'distancia acumulada al llegar a i';
Free Variable z 'premio total';
x.fx(i,i) = 0;
Equations obj, sale(i), entra(i), flota, balDep, aIni(j), aSig(i,j), largoMax(i);
obj..           z =e= sum(c, pr(c)*y(c));
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= y(i);
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= y(j);
flota..         sum(c, x('d',c)) =l= m;
balDep..        sum(c, x('d',c)) =e= sum(c, x(c,'d'));
aIni(j)$c(j)..  a(j) =g= dist('d',j)*x('d',j);
aSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. a(j) =g= a(i) + dist(i,j) - (L + dist(i,j))*(1 - x(i,j));
largoMax(i)$c(i).. a(i) + dist(i,'d') =l= L + dist(i,'d')*(1 - x(i,'d'));
Equations arcoY1(i,j) 'solo arcos entre clientes visitados', arcoY2(i,j);
arcoY1(i,j)$(c(i) and c(j) and not sameas(i,j)).. x(i,j) =l= y(i);
arcoY2(i,j)$(c(i) and c(j) and not sameas(i,j)).. x(i,j) =l= y(j);
* cota válida: desde cualquier cliente visitado aún hay que volver al depósito
a.up(c) = L - dist(c,'d');
Model top / all /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve top using mip maximizing z;
Scalar distTot 'distancia recorrida'; distTot = sum((i,j), dist(i,j)*x.l(i,j));

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
display z.l, y.l, distTot, ruta, largo;
