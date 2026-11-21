* CVRP min-max (ruta más larga mínima) (Min-Max Capacitated VRP)
* CVRP que minimiza el costo de la ruta más costosa: reparte la jornada entre los vehículos.
* Instancia CVRP-10 del curso. Generado con el exportador de la app (web/js/gams.js),
* el mismo modelo que la app resuelve con HiGHS; verificado con el intérprete gamsx (mismo óptimo).
$title CVRP min-max (ruta más larga mínima) - modelo de flujo por vehiculo (MILP)
$onText
Generado por la app Parcial de Grafos con los datos del proyecto. Es el mismo modelo que la app resuelve con HiGHS.
Ejecutar en GAMS Studio (F9) o con:  gams archivo.gms
$offText

Sets
  i      'nodos'      / d, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10 /
  c(i)   'clientes'   / c1, c2, c3, c4, c5, c6, c7, c8, c9, c10 /
  dep(i) 'depositos'  / d /
  k      'vehiculos'  / v1, v2, v3, v4, v5 /
  kd(k,i) 'deposito de cada vehiculo' / v1.d, v2.d, v3.d, v4.d, v5.d /;
Alias (i,j);

Table dist(i,j) 'distancia entre nodos'
                 d        c1        c2        c3        c4        c5        c6        c7        c8        c9       c10
d                0 42.426407 41.231056 34.928498  44.72136 44.407207 45.343136 44.181444 41.182521  42.37924 36.055513
c1       42.426407         0  22.36068 44.045431 70.710678 82.292162 87.726849 81.437092 66.753277 45.122057 18.439089
c2       41.231056  22.36068         0 25.298221 53.851648 70.936591 84.118963 85.158675 76.655072 61.773781 36.878178
c3       34.928498 44.045431 25.298221         0 28.635642 48.414874 67.911707 76.655072 76.026311 70.936591        52
c4        44.72136 70.710678 53.851648 28.635642         0 26.305893 54.918121 73.430239 82.073138 86.925255 74.431176
c5       44.407207 82.292162 70.936591 48.414874 26.305893         0 31.304952 55.172457 70.682388 84.380092 80.049984
c6       45.343136 87.726849 84.118963 67.911707 54.918121 31.304952         0 27.856777 50.039984 72.801099 78.816242
c7       44.181444 81.437092 85.158675 76.655072 73.430239 55.172457 27.856777         0 25.298221 53.254108 67.675697
c8       41.182521 66.753277 76.655072 76.026311 82.073138 70.682388 50.039984 25.298221         0 29.732137        50
c9        42.37924 45.122057 61.773781 70.936591 86.925255 84.380092 72.801099 53.254108 29.732137         0 26.683328
c10      36.055513 18.439089 36.878178        52 74.431176 80.049984 78.816242 67.675697        50 26.683328         0;

Parameters
  cu(k) 'costo por unidad de distancia' / v1 1, v2 1, v3 1, v4 1, v5 1 /
  Q(k) 'capacidad' / v1 15, v2 15, v3 15, v4 15, v5 15 /
  vel(k) 'velocidad (distancia por hora)' / v1 1, v2 1, v3 1, v4 1, v5 1 /
  w(i) 'demanda a entregar' / c1 4, c2 3, c3 5, c4 4, c5 3, c6 5, c7 4, c8 3, c9 5, c10 2 /
  ;

Set arco(i,j,k) 'arcos permitidos';
arco(i,j,k)$(ord(i) <> ord(j) and (c(i) or kd(k,i)) and (c(j) or kd(k,j))) = yes;
Parameter dr(i,j,k) 'distancia del arco', cr(i,j,k) 'costo del arco';
dr(i,j,k)$arco(i,j,k) = dist(i,j);
cr(i,j,k) = cu(k)*dr(i,j,k);

Binary Variables x(i,j,k) 'el vehiculo k recorre el arco i-j', y(i,k) 'el vehiculo k visita al cliente i', v(k) 'el vehiculo k se usa';
y.fx(dep,k) = 0;
x.fx(i,j,k)$(not arco(i,j,k)) = 0;
Positive Variable u(i) 'orden de visita (MTZ)';
Free Variable z 'funcion objetivo';
Positive Variable zmax 'costo de la ruta mas costosa';

Equation fo 'funcion objetivo';
fo.. z =e= zmax + 0.001*sum((i,j,k)$arco(i,j,k), cr(i,j,k)*x(i,j,k));
Equation visita(c) 'cada cliente se atiende';
visita(c).. sum(k, y(c,k)) =e= 1;
Equation entra(c,k) 'llega un arco al cliente visitado';
entra(c,k).. sum(j$arco(j,c,k), x(j,c,k)) =e= y(c,k);
Equation sale(c,k) 'sale un arco del cliente visitado';
sale(c,k).. sum(j$arco(c,j,k), x(c,j,k)) =e= y(c,k);
Equation parte(k) 'el vehiculo usado sale de su deposito';
parte(k).. sum((i,j)$(kd(k,i) and arco(i,j,k)), x(i,j,k)) =e= v(k);
Equation vuelve(k) 'y regresa a su deposito';
vuelve(k).. sum((i,j)$(kd(k,j) and arco(i,j,k)), x(i,j,k)) =e= v(k);
Equation usa(c,k) 'solo visita si se usa';
usa(c,k).. y(c,k) =l= v(k);
Equation dos(i,j,k) 'sin ciclos de dos clientes';
dos(i,j,k)$(c(i) and c(j) and ord(i) < ord(j) and arco(i,j,k) and arco(j,i,k)).. x(i,j,k) + x(j,i,k) =l= y(i,k);
Equation mtz(i,j) 'eliminacion de subtours MTZ';
mtz(i,j)$(c(i) and c(j) and ord(i) <> ord(j)).. u(i) - u(j) + card(c)*sum(k$arco(i,j,k), x(i,j,k)) =l= card(c) - 1;
u.lo(c) = 1; u.up(c) = card(c);
Equation mm(k) 'zmax acota el costo de cada ruta';
mm(k).. sum((i,j)$arco(i,j,k), cr(i,j,k)*x(i,j,k)) =l= zmax;
Equation capv(k) 'capacidad del vehiculo';
capv(k).. sum(c, w(c)*y(c,k)) =l= Q(k)*v(k);
Set idk(k) 'vehiculo identico al anterior (ruptura de simetria)' / v2, v3, v4, v5 /;
Equation sim(i,k) 'ruptura de simetria entre vehiculos identicos';
sim(i,k)$(c(i) and idk(k)).. y(i,k) =l= sum(j$(c(j) and ord(j) < ord(i)), y(j,k-1));
Equation capt 'la flota usada cubre la demanda total';
capt.. sum(k, Q(k)*v(k)) =g= sum(c, w(c));

Model vrp / fo, visita, entra, sale, parte, vuelve, usa, dos, mtz, mm, capv, sim, capt /;
option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
solve vrp using mip minimizing z;

Parameter distRuta(k) 'distancia recorrida por cada vehiculo', usado(k,i,j) 'arcos de cada ruta (1 = se recorre)';
distRuta(k) = sum((i,j)$arco(i,j,k), dr(i,j,k)*x.l(i,j,k));
usado(k,i,j)$(arco(i,j,k) and x.l(i,j,k) > 0.5) = 1;
Display z.l, v.l, distRuta, usado;
