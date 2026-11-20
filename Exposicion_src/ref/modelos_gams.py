"""Genera los 27 modelos VRP en GAMS (carpeta GAMS_modelos/) sobre la instancia común CVRP-10 y sus variantes de datos.
Cada modelo es un archivo autocontenido: datos, modelo, solve y reporte de rutas."""
import os, textwrap
from instancia import COORD, DEM

SAL = os.path.join(os.path.dirname(__file__), '..', '..', 'GAMS_modelos')
CLI = [f'c{k}' for k in range(1, 11)]

# ----------------------------------------------------------------------------- bloques comunes
def cab(num, sigla, nombre, desc, ejemplo, extra_nota=''):
    lineas = textwrap.wrap(desc, 96)
    ej = textwrap.wrap(ejemplo, 96)
    s = f"""$title {sigla}: {nombre}
$onText
===============================================================================================
 {num} · {sigla} · {nombre}
-----------------------------------------------------------------------------------------------
""" + '\n'.join(' ' + l for l in lines_or(lineas)) + """
 PROBLEMA DE EJEMPLO:
""" + '\n'.join(' ' + l for l in ej) + f"""
 EJECUCIÓN: abrir en GAMS Studio y pulsar Run (F9), o por consola:  gams {num}_{sigla.lower().replace('-', '_')}.gms
 SALIDA:    archivo .lst -> sección «display» (función objetivo, variables y rutas reconstruidas).
 SOLVER:    cualquier solver MIP (HiGHS, CPLEX, CBC, Gurobi, XPRESS). Para usar HiGHS (gratuito):
            descomentar la línea «option mip = highs;» más abajo.{extra_nota}
===============================================================================================
$offText
"""
    return s

def lines_or(l): return l if l else ['']

def fmt_par(nombre, texto, vals, dom='i'):
    items = ', '.join(f'{k} {v:g}' for k, v in vals)
    return f"   {nombre}({dom}) '{texto}' / {items} /"

NODOS = ['d'] + CLI
def coords(nodos=None, coord=None):
    nodos = nodos or NODOS; coord = coord or {n: COORD[k] for k, n in enumerate(NODOS)}
    return [(n, coord[n][0]) for n in nodos], [(n, coord[n][1]) for n in nodos]

def datos_base(Q=15, nodos=None, coord=None, dem=None, extra_par='', clientes=None, titulo_i=None):
    nodos = nodos or NODOS; clientes = clientes or [n for n in nodos if n.startswith('c')]
    dem = dem or {n: DEM[k] for k, n in enumerate(NODOS)}
    xs, ys = coords(nodos, coord)
    ds = [(n, dem.get(n, 0)) for n in nodos]
    deps = [n for n in nodos if not n.startswith('c')]
    cl = rango(clientes)
    s = f"""
* ------------------------------------- DATOS -------------------------------------------------
Set i '{titulo_i or 'nodos: depósito y clientes'}' / {', '.join(deps)}, {cl} /
    c(i) 'clientes' / {cl} /;
Alias (i,j,h,g);
Parameter
{fmt_par('cx', 'coordenada x', xs)}
{fmt_par('cy', 'coordenada y', ys)}
{fmt_par('dem', 'demanda', ds)}{extra_par};
Scalar Q 'capacidad del vehículo' / {Q:g} /;
Parameter dist(i,j) 'distancia euclidiana (también tiempo de viaje)';
dist(i,j) = sqrt(sqr(cx(i) - cx(j)) + sqr(cy(i) - cy(j)));
"""
    return s

def rango(cl):
    nums = [int(x[1:]) for x in cl]
    if nums == list(range(nums[0], nums[-1] + 1)): return f'c{nums[0]}*c{nums[-1]}'
    return ', '.join(cl)

SOLVE = """option optcr = 0, optca = 0, reslim = 600;
* option mip = highs;
"""

def reporte2(var='x', idx='', inicio="sameas(g,'d')", cond_ini=None, extra=''):
    """reconstruye las rutas de una variable de 2 índices x(i,j) (o x(i,j,t) sumando el tercer índice idx)"""
    xs = f"{var}.l(g,h)" if not idx else f"sum({idx}, {var}.l(g,h,{idx}))"
    xij = f"{var}.l(i,j)" if not idx else f"sum({idx}, {var}.l(i,j,{idx}))"
    return f"""
* ------------------------------------- REPORTE: rutas reconstruidas desde x.l ------------------
Set r 'rutas' / r1*r8 /, s 'paradas' / s1*s12 /;
Parameter ruta(r,s) 'cliente visitado en cada parada (número de cliente)', largo(r) 'distancia de la ruta',
          cargaR(r) 'carga entregada en la ruta';
Scalar nr 'número de rutas' / 0 /, act 'nodo actual (ord)', sig 'nodo siguiente (ord)', np 'parada';
loop((g,h)$(({cond_ini or inicio}) and c(h) and {xs} > 0.5),
   nr = nr + 1; act = ord(h); np = 0;
   largo(r)$(ord(r) = nr) = dist(g,h);
   while(sum(i$(ord(i) = act), 1$c(i)) > 0,
      np = np + 1;
      ruta(r,s)$(ord(r) = nr and ord(s) = np) = sum(i$(ord(i) = act), ord(i)) - card(i) + card(c);
      cargaR(r)$(ord(r) = nr) = cargaR(r) + sum(i$(ord(i) = act), dem(i));
      sig = sum((i,j)$(ord(i) = act and {xij} > 0.5), ord(j));
      largo(r)$(ord(r) = nr) = largo(r) + sum((i,j)$(ord(i) = act and ord(j) = sig), dist(i,j));
      act = sig;
   );
);{extra}
"""

M = []   # lista de modelos

def modelo(**kw): M.append(kw); return kw

# =============================================================================================
# 1-7  UN VEHÍCULO Y VARIOS VIAJANTES
# =============================================================================================
TSP_VARS = """
* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si se recorre el arco i -> j';
Positive Variable u(i) 'posición del nodo en el recorrido (MTZ)';
Free Variable z 'distancia total';
x.fx(i,i) = 0;
"""

modelo(id='tsp', num='01', sigla='TSP', nombre='Problema del agente viajero', fam='Un vehículo', clase=True,
 desc='Un único vehículo sale del depósito, visita una vez a cada uno de los 10 clientes y regresa, minimizando la distancia total. Formulación de Miller-Tucker-Zemlin (MTZ) para eliminar subtours.',
 ej='Depósito d y 10 clientes (instancia CVRP-10); sin capacidad. Distancias euclidianas.',
 datos=datos_base(),
 modelo=TSP_VARS + """Equations obj 'distancia total', sale(i) 'sale una vez de cada nodo', entra(i) 'entra una vez a cada nodo',
          mtz(i,j) 'eliminación de subtours (MTZ)';
obj..       z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)..   sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)..  sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
mtz(i,j)$(c(i) and c(j) and not sameas(i,j)).. u(i) - u(j) + card(c)*x(i,j) =l= card(c) - 1;
u.lo(c) = 1; u.up(c) = card(c);
Model tsp / all /;
""" + SOLVE + "solve tsp using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, x.l, u.l, ruta, largo;')

modelo(id='otsp', num='02', sigla='OTSP', nombre='TSP abierto (camino hamiltoniano)', fam='Un vehículo',
 desc='Como el TSP, pero el vehículo no regresa al depósito: el recorrido termina en el último cliente. Útil cuando el conductor termina el turno en su casa o el vehículo es de un tercero.',
 ej='Depósito d y 10 clientes de la instancia CVRP-10; se prohíben los arcos que regresan a d.',
 datos=datos_base(),
 modelo=TSP_VARS + """Equations obj, saleDep 'sale una vez del depósito', entra(i) 'cada cliente recibe un arco',
          sale(i) 'cada cliente tiene a lo sumo un sucesor', arcos 'el camino tiene card(c) arcos', mtz(i,j);
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
saleDep..       sum(c, x('d',c)) =e= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =l= 1;
arcos..         sum((i,j), x(i,j)) =e= card(c);
mtz(i,j)$(c(i) and c(j) and not sameas(i,j)).. u(i) - u(j) + card(c)*x(i,j) =l= card(c) - 1;
x.fx(i,'d') = 0;
u.lo(c) = 1; u.up(c) = card(c);
Model otsp / all /;
""" + SOLVE + "solve otsp using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, x.l, ruta, largo;')

MTSP_BASE = """Equations obj, saleDep 'salen m viajantes', entraDep 'regresan m viajantes', sale(i), entra(i), mtz(i,j);
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
saleDep..       sum(c, x('d',c)) =e= m;
entraDep..      sum(c, x(c,'d')) =e= m;
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
mtz(i,j)$(c(i) and c(j) and not sameas(i,j)).. u(i) - u(j) + card(c)*x(i,j) =l= card(c) - 1;
u.lo(c) = 1; u.up(c) = card(c);
"""

modelo(id='mtsp', num='03', sigla='mTSP', nombre='Problema de múltiples viajantes', fam='Varios viajantes', clase=True,
 desc='m = 3 viajantes salen del mismo depósito; cada cliente es visitado por uno solo y cada viajante visita al menos un cliente. Minimiza la distancia total.',
 ej='Instancia CVRP-10 sin capacidad, m = 3 viajantes.',
 datos=datos_base() + "Scalar m 'número de viajantes' / 3 /;\n",
 modelo=TSP_VARS + MTSP_BASE + "Model mtsp / all /;\n" + SOLVE + "solve mtsp using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, ruta, largo;')

CONT = """Positive Variable f(i) 'número de clientes visitados en la ruta hasta i (contador exacto)';
Equations cIni(j) 'el primer cliente tiene f = 1', cIni2(j), cSig(i,j) 'f aumenta en 1 por arco', cSig2(i,j);
cIni(j)$c(j)..  f(j) =l= 1 + card(c)*(1 - x('d',j));
cIni2(j)$c(j).. f(j) =g= 1 - card(c)*(1 - x('d',j));
cSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. f(j) =g= f(i) + 1 - card(c)*(1 - x(i,j));
cSig2(i,j)$(c(i) and c(j) and not sameas(i,j)).. f(j) =l= f(i) + 1 + card(c)*(1 - x(i,j));
f.lo(c) = 1; f.up(c) = Umax;
"""

modelo(id='mtspb', num='04', sigla='BmTSP', nombre='mTSP balanceado', fam='Varios viajantes',
 desc='mTSP en el que todas las rutas atienden casi el mismo número de clientes: entre Lmin = ⌊n/m⌋ y Umax = ⌈n/m⌉. Reparte la carga de trabajo de forma equitativa.',
 ej='Instancia CVRP-10, m = 3 viajantes, cada ruta con 3 o 4 clientes.',
 datos=datos_base() + "Scalar m 'número de viajantes' / 3 /;\nScalar Lmin 'mínimo de clientes por ruta', Umax 'máximo de clientes por ruta';\nLmin = floor(card(c)/m); Umax = ceil(card(c)/m);\n",
 modelo=TSP_VARS + MTSP_BASE + CONT + """Equation fin(i) 'la ruta termina con al menos Lmin clientes';
fin(i)$c(i).. f(i) =g= Lmin*x(i,'d');
Model mtspb / all /;
""" + SOLVE + "solve mtspb using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, f.l, ruta, largo;')

OM_BASE = """Equations obj, saleDep 'salen m viajantes', entra(i), sale(i) 'a lo sumo un sucesor', arcos, mtz(i,j);
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
saleDep..       sum(c, x('d',c)) =e= m;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =l= 1;
arcos..         sum((i,j), x(i,j)) =e= card(c);
mtz(i,j)$(c(i) and c(j) and not sameas(i,j)).. u(i) - u(j) + card(c)*x(i,j) =l= card(c) - 1;
x.fx(i,'d') = 0;
u.lo(c) = 1; u.up(c) = card(c);
"""

modelo(id='omtsp', num='05', sigla='OmTSP', nombre='mTSP abierto', fam='Varios viajantes',
 desc='m viajantes salen del depósito y no regresan: cada ruta termina en su último cliente. Modela, por ejemplo, técnicos que al final del día se van a casa.',
 ej='Instancia CVRP-10, m = 3 viajantes, rutas abiertas.',
 datos=datos_base() + "Scalar m 'número de viajantes' / 3 /;\n",
 modelo=TSP_VARS + OM_BASE + "Model omtsp / all /;\n" + SOLVE + "solve omtsp using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, ruta, largo;')

modelo(id='omtspb', num='06', sigla='OBmTSP', nombre='mTSP abierto y balanceado', fam='Varios viajantes',
 desc='Rutas abiertas (sin regreso) y equilibradas: cada viajante atiende entre ⌊n/m⌋ y ⌈n/m⌉ clientes. El archivo resuelve primero la versión sin balance y luego la balanceada para medir el costo del equilibrio.',
 ej='Instancia CVRP-10 con m = 4 viajantes: rutas abiertas de 2 o 3 clientes cada una.',
 datos=datos_base() + "Scalar m 'número de viajantes' / 4 /;\nScalar Lmin 'mínimo de clientes por ruta', Umax 'máximo de clientes por ruta';\nLmin = floor(card(c)/m); Umax = ceil(card(c)/m);\n",
 modelo=TSP_VARS + OM_BASE + CONT + """Equation fin(i) 'el último cliente de cada ruta tiene f >= Lmin';
fin(i)$c(i).. f(i) =g= Lmin*(1 - sum(j$(not sameas(i,j)), x(i,j)));
Model omtsp  / obj, saleDep, entra, sale, arcos, mtz /;
Model omtspb / all /;
""" + SOLVE + """Scalar distSinBal 'distancia del mTSP abierto sin balance';
solve omtsp using mip minimizing z;
distSinBal = z.l;
solve omtspb using mip minimizing z;
""",
 rep=reporte2(), disp='display distSinBal, z.l, f.l, ruta, largo;')

modelo(id='mtspmm', num='07', sigla='MM-mTSP', nombre='mTSP min-max', fam='Varios viajantes',
 desc='Minimiza la ruta más larga (makespan) en lugar de la suma: reparte el tiempo de trabajo entre los viajantes. a(i) acumula la distancia recorrida hasta el cliente i; T acota todas las rutas. Un peso pequeño sobre la distancia total desempata. Se agregan dos cortes válidos que fortalecen la relajación: m·T >= distancia total y T >= ida y vuelta a cada cliente.',
 ej='Instancia CVRP-10, m = 3 viajantes; se minimiza la longitud de la ruta más larga.',
 datos=datos_base() + "Scalar m 'número de viajantes' / 3 /, Amax 'cota de la distancia acumulada' / 300 /, w 'peso de desempate' / 0.001 /;\n",
 modelo=TSP_VARS + """Positive Variable a(i) 'distancia acumulada al llegar a i', T 'longitud de la ruta más larga';
""" + MTSP_BASE.replace('obj..           z =e= sum((i,j), dist(i,j)*x(i,j));', 'obj..           z =e= T + w*sum((i,j), dist(i,j)*x(i,j));') + """Equations aIni(j) 'arco desde el depósito', aSig(i,j) 'acumula distancia', larga(i) 'T acota cada ruta',
          corteProm 'm·T >= distancia total', corteIda(i) 'T >= ida y vuelta al cliente';
aIni(j)$c(j)..  a(j) =g= dist('d',j)*x('d',j);
aSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. a(j) =g= a(i) + dist(i,j) - (Amax + dist(i,j))*(1 - x(i,j));
larga(i)$c(i).. T =g= a(i) + dist(i,'d') - (Amax + dist(i,'d'))*(1 - x(i,'d'));
corteProm..     m*T =g= sum((i,j), dist(i,j)*x(i,j));
corteIda(i)$c(i).. T =g= dist('d',i) + dist(i,'d');
a.up(c) = Amax;
Model mtspmm / all /;
""" + SOLVE + "solve mtspmm using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, T.l, ruta, largo;')

# =============================================================================================
# 8-13 CAPACIDAD
# =============================================================================================
CVRP_VARS = """
* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si un vehículo recorre el arco i -> j';
Positive Variable ql(i) 'carga acumulada al salir del cliente i';
Free Variable z 'función objetivo';
x.fx(i,i) = 0;
"""
CVRP_EQ = """Equations obj 'distancia total', sale(i) 'un sucesor por cliente', entra(i) 'un predecesor por cliente',
          flota 'a lo sumo K vehículos', balDep 'salen tantos como regresan', carga(i,j) 'carga acumulada (MTZ)';
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
flota..         sum(c, x('d',c)) =l= K;
balDep..        sum(c, x('d',c)) =e= sum(c, x(c,'d'));
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));
ql.lo(c) = dem(c); ql.up(c) = Q;
"""

modelo(id='cvrp', num='08', sigla='CVRP', nombre='VRP con capacidad', fam='Capacidad', clase=True,
 desc='Flota homogénea de vehículos de capacidad Q = 15 con base en el depósito. Cada cliente se atiende una vez y la carga de cada ruta no supera Q. Formulación de dos índices con carga acumulada (MTZ).',
 ej='Instancia CVRP-10: Q = 15, demanda total 38, a lo sumo K = 5 vehículos.',
 datos=datos_base() + "Scalar K 'vehículos disponibles' / 5 /;\n",
 modelo=CVRP_VARS + CVRP_EQ + "Model cvrp / all /;\n" + SOLVE + "solve cvrp using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, ql.l, ruta, largo, cargaR;')

modelo(id='ovrp', num='09', sigla='OVRP', nombre='VRP abierto', fam='Capacidad',
 desc='CVRP en el que los vehículos no regresan al depósito (flota tercerizada o entrega en la ruta de regreso a casa). Se eliminan los arcos hacia el depósito y la ruta termina en su último cliente.',
 ej='Instancia CVRP-10, Q = 15, K = 5; rutas abiertas.',
 datos=datos_base() + "Scalar K 'vehículos disponibles' / 5 /;\n",
 modelo=CVRP_VARS + """Equations obj, sale(i) 'a lo sumo un sucesor', entra(i), flota, carga(i,j);
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =l= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
flota..         sum(c, x('d',c)) =l= K;
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));
x.fx(i,'d') = 0;
ql.lo(c) = dem(c); ql.up(c) = Q;
Model ovrp / all /;
""" + SOLVE + "solve ovrp using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, ruta, largo, cargaR;')

modelo(id='dcvrp', num='10', sigla='DCVRP', nombre='VRP con capacidad y distancia máxima', fam='Capacidad',
 desc='CVRP en el que además ninguna ruta puede superar una distancia (o duración) máxima L, por jornada laboral o autonomía del vehículo. a(i) acumula la distancia de la ruta hasta i.',
 ej='Instancia CVRP-10, Q = 15, K = 5 y L = 150 (en el CVRP una ruta mide 151,1: deja de ser factible).',
 datos=datos_base() + "Scalar K 'vehículos disponibles' / 5 /, L 'distancia máxima por ruta' / 150 /, BigM / 1000 /;\n",
 modelo=CVRP_VARS + CVRP_EQ + """Positive Variable a(i) 'distancia acumulada al llegar a i';
Equations aIni(j), aSig(i,j), largoMax(i) 'la ruta (con el regreso) no supera L';
aIni(j)$c(j).. a(j) =g= dist('d',j)*x('d',j);
aSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. a(j) =g= a(i) + dist(i,j) - BigM*(1 - x(i,j));
largoMax(i)$c(i).. a(i) + dist(i,'d') =l= L + BigM*(1 - x(i,'d'));
Model dcvrp / all /;
""" + SOLVE + "solve dcvrp using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, a.l, ruta, largo, cargaR;')

modelo(id='vrpl', num='11', sigla='CVRP-L', nombre='CVRP con máximo de paradas', fam='Capacidad',
 desc='CVRP en el que cada ruta puede visitar como máximo P clientes (límite de paradas por turno o por reglas de servicio). f(i) cuenta las paradas hasta i.',
 ej='Instancia CVRP-10, Q = 15, K = 5 y P = 3 paradas por ruta (el CVRP tiene una ruta de 4).',
 datos=datos_base() + "Scalar K 'vehículos disponibles' / 5 /, P 'máximo de paradas por ruta' / 3 /;\n",
 modelo=CVRP_VARS + CVRP_EQ + """Positive Variable f(i) 'paradas hasta el cliente i';
Equation paradas(i,j) 'cuenta paradas (MTZ)';
paradas(i,j)$(c(i) and c(j) and not sameas(i,j)).. f(j) =g= f(i) + 1 - P*(1 - x(i,j));
f.lo(c) = 1; f.up(c) = P;
Model vrpl / all /;
""" + SOLVE + "solve vrpl using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, f.l, ruta, largo, cargaR;')

modelo(id='minveh', num='12', sigla='MinVeh', nombre='CVRP con mínima flota', fam='Capacidad',
 desc='Objetivo jerárquico (lexicográfico): primero el menor número de vehículos y, con esa flota fija, la menor distancia. Se resuelve en dos fases: (1) minimizar los vehículos que salen del depósito; (2) fijar ese número y minimizar la distancia. El archivo resuelve también el CVRP puro para comparar.',
 ej='Instancia CVRP-10 con Q = 13: el CVRP puro (mínima distancia) usa 4 vehículos; la mínima flota es ⌈38/13⌉ = 3.',
 datos=datos_base(Q=13) + "Scalar K 'vehículos disponibles' / 5 /;\n",
 modelo=CVRP_VARS + CVRP_EQ + """Free Variable nv 'vehículos usados';
Equations defNv 'cuenta los vehículos', fijaNv 'fase 2: flota fija';
Scalar vehMin 'mínimo de vehículos (fase 1)' / 5 /;
defNv..  nv =e= sum(c, x('d',c));
fijaNv.. sum(c, x('d',c)) =e= vehMin;
Model cvrpPuro / obj, sale, entra, flota, balDep, carga /;
Model fase1    / defNv, sale, entra, flota, balDep, carga /;
Model fase2    / obj, sale, entra, flota, balDep, carga, fijaNv /;
""" + SOLVE + """Scalar vehPuro 'vehículos del CVRP puro', distPuro 'distancia del CVRP puro', distMin 'distancia con mínima flota';
solve cvrpPuro using mip minimizing z;
vehPuro = sum(c, x.l('d',c)); distPuro = z.l;
solve fase1 using mip minimizing nv;
vehMin = round(nv.l);
solve fase2 using mip minimizing z;
distMin = z.l;
""",
 rep=reporte2(), disp='display vehPuro, distPuro, vehMin, distMin, ruta, largo, cargaR;')

modelo(id='cvrpb', num='13', sigla='BCVRP', nombre='CVRP balanceado', fam='Capacidad',
 desc='CVRP con rutas equilibradas: cada ruta atiende entre Lmin y Umax clientes, con el número de rutas fijado en m. Útil para repartir el trabajo entre conductores.',
 ej='Instancia CVRP-10, Q = 15, exactamente 4 rutas con 2 o 3 clientes cada una (el CVRP usa 3 rutas de 3, 3 y 4).',
 datos=datos_base() + "Scalar K 'número de rutas' / 4 /, Lmin 'mínimo de clientes por ruta' / 2 /, Umax 'máximo de clientes por ruta' / 3 /;\n",
 modelo=CVRP_VARS + CVRP_EQ.replace("flota..         sum(c, x('d',c)) =l= K;", "flota..         sum(c, x('d',c)) =e= K;") + CONT + """Equation fin(i) 'cada ruta termina con al menos Lmin clientes';
fin(i)$c(i).. f(i) =g= Lmin*x(i,'d');
Model cvrpb / all /;
""" + SOLVE + "solve cvrpb using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, f.l, ruta, largo, cargaR;')

# =============================================================================================
# 14-15 TIEMPO
# =============================================================================================
VT = {'c1': (60, 140), 'c2': (20, 90), 'c3': (150, 230), 'c4': (40, 110), 'c5': (170, 250), 'c6': (90, 160),
      'c7': (190, 270), 'c8': (30, 100), 'c9': (120, 200), 'c10': (80, 150)}
def vt_par():
    a = [('d', 0)] + [(k, VT[k][0]) for k in CLI]; b = [('d', 480)] + [(k, VT[k][1]) for k in CLI]; sv = [('d', 0)] + [(k, 10) for k in CLI]
    return ',\n' + fmt_par('ea', 'inicio de la ventana de tiempo', a) + ',\n' + fmt_par('la', 'fin de la ventana de tiempo', b) + ',\n' + fmt_par('sv', 'tiempo de servicio', sv)

VT_EQ = """Positive Variable tL(i) 'hora de llegada (inicio del servicio) al cliente i';
Equations tIni(j) 'primer cliente', tSig(i,j) 'secuencia de tiempos', tVen(i) 'ventana: no antes de ea';
tIni(j)$c(j).. tL(j) =g= dist('d',j) - BigM*(1 - x('d',j));
tSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. tL(j) =g= tL(i) + sv(i) + dist(i,j) - BigM*(1 - x(i,j));
tVen(i)$c(i).. tL(i) =g= ea(i);
tL.up(c) = la(c);
"""

modelo(id='vrptw', num='14', sigla='VRPTW', nombre='VRP con ventanas de tiempo', fam='Tiempo', clase=True,
 desc='Cada cliente debe empezar a atenderse dentro de su ventana [ea, la]; si el vehículo llega antes, espera. Tiempo de viaje = distancia (velocidad 1) y servicio de 10 minutos. El vehículo regresa antes del cierre del depósito.',
 ej='Instancia CVRP-10 con ventanas de 70-80 minutos por cliente, Q = 15, K = 5, depósito abierto de 0 a 480.',
 datos=datos_base(extra_par=vt_par()) + "Scalar K 'vehículos disponibles' / 5 /, BigM / 1000 /;\n",
 modelo=CVRP_VARS + CVRP_EQ + VT_EQ + """Equation tFin(i) 'regreso antes del cierre del depósito';
tFin(i)$c(i).. tL(i) + sv(i) + dist(i,'d') =l= la('d') + BigM*(1 - x(i,'d'));
Model vrptw / all /;
""" + SOLVE + "solve vrptw using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, tL.l, ruta, largo, cargaR;')

modelo(id='ovrptw', num='15', sigla='OVRPTW', nombre='VRP abierto con ventanas de tiempo', fam='Tiempo',
 desc='VRPTW con rutas abiertas: los vehículos terminan en su último cliente y no deben volver al depósito antes del cierre.',
 ej='Instancia CVRP-10 con las mismas ventanas del VRPTW, Q = 15, K = 5, rutas abiertas.',
 datos=datos_base(extra_par=vt_par()) + "Scalar K 'vehículos disponibles' / 5 /, BigM / 1000 /;\n",
 modelo=CVRP_VARS + """Equations obj, sale(i), entra(i), flota, carga(i,j);
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =l= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
flota..         sum(c, x('d',c)) =l= K;
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));
x.fx(i,'d') = 0;
ql.lo(c) = dem(c); ql.up(c) = Q;
""" + VT_EQ + "Model ovrptw / all /;\n" + SOLVE + "solve ovrptw using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, tL.l, ruta, largo, cargaR;')

# =============================================================================================
# 16-18 FLOTA (índice de tipo de vehículo t)
# =============================================================================================
def flota_datos(tipos, extra=''):
    t_l = ', '.join(t for t, *_ in tipos)
    return f"""Set t 'tipos de vehículo' / {t_l} /;
Parameter
   capT(t) 'capacidad del tipo' / {', '.join(f'{t} {q:g}' for t, q, *_ in tipos)} /
   cpk(t)  'costo por unidad de distancia' / {', '.join(f'{t} {v:g}' for t, q, v, *_ in tipos)} /
   fijo(t) 'costo fijo por vehículo usado' / {', '.join(f'{t} {f:g}' for t, q, v, f, *_ in tipos)} /
   nveh(t) 'vehículos disponibles del tipo' / {', '.join(f'{t} {n:g}' for t, q, v, f, n in tipos)} /;
""" + extra

FLOTA_MOD = """
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
"""

TIPOS_HF = [('grande', 20, 1.3, 0, 2), ('pequeno', 10, 0.8, 0, 2)]
modelo(id='hfvrp', num='16', sigla='HFVRP', nombre='VRP con flota heterogénea', fam='Flota',
 desc='La flota tiene tipos de vehículo con capacidad y costo por kilómetro distintos y una cantidad limitada de cada tipo. Se decide qué tipo cubre cada ruta. Índice t de tipo en lugar de índice de vehículo (menos simetría).',
 ej='Instancia CVRP-10; 2 camiones grandes (Q = 20, 1,3 $/km) y 2 pequeños (Q = 10, 0,8 $/km).',
 datos=datos_base() + flota_datos(TIPOS_HF) + "Scalar Qmax 'mayor capacidad'; Qmax = smax(t, capT(t));\n",
 modelo=FLOTA_MOD + "Model hfvrp / all /;\n" + SOLVE + "solve hfvrp using mip minimizing z;\n",
 rep=reporte2(idx='t') + """Parameter tipoR(r,t) 'tipo de vehículo de cada ruta';
nr = 0;
loop((h,t)$(c(h) and x.l('d',h,t) > 0.5), nr = nr + 1; tipoR(r,t)$(ord(r) = nr) = 1; );
""", disp='display z.l, ruta, largo, cargaR, tipoR;')

TIPOS_FS = [('grande', 20, 1.0, 80, 2), ('mediano', 15, 1.0, 60, 2), ('pequeno', 10, 1.0, 45, 2)]
modelo(id='fsmvrp', num='17', sigla='FSMVRP', nombre='VRP de tamaño y mezcla de flota', fam='Flota',
 desc='Decisión táctica: qué vehículos comprar o alquilar. Cada tipo tiene capacidad y costo fijo propios (el costo por km es igual). Se minimiza costo fijo + distancia. Formulación de 2 índices: w(j,t) elige el tipo de la ruta que empieza en j y kap(i) propaga esa capacidad a lo largo de la ruta.',
 ej='Instancia CVRP-10; tipos grande (Q 20, fijo 80), mediano (Q 15, fijo 60) y pequeño (Q 10, fijo 45); 1 $/km; hasta 2 de cada tipo.',
 datos=datos_base() + flota_datos(TIPOS_FS) + "Scalar Qmax 'mayor capacidad'; Qmax = smax(t, capT(t));\n",
 modelo="""
* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si un vehículo recorre el arco i -> j', w(i,t) 'la ruta que empieza en el cliente i usa el tipo t';
Positive Variable ql(i) 'carga acumulada al salir de i', kap(i) 'capacidad del vehículo que visita i';
Free Variable z 'costo total';
x.fx(i,i) = 0;
Equations obj 'costo fijo + distancia', sale(i), entra(i), balDep, tipoIni(i) 'cada ruta elige un tipo', disp(t) 'vehículos por tipo',
          kapIni(i) 'capacidad del primer cliente', kapIni2(i), kapSig1(i,j) 'la capacidad se propaga', kapSig2(i,j), carga(i,j), cap(i) 'carga <= capacidad del tipo';
obj..            z =e= sum((c,t), fijo(t)*w(c,t)) + sum((i,j), dist(i,j)*x(i,j));
sale(i)$c(i)..   sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j)..  sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
balDep..         sum(c, x('d',c)) =e= sum(c, x(c,'d'));
tipoIni(j)$c(j).. sum(t, w(j,t)) =e= x('d',j);
disp(t)..        sum(c, w(c,t)) =l= nveh(t);
kapIni(j)$c(j).. kap(j) =g= sum(t, capT(t)*w(j,t));
kapIni2(j)$c(j).. kap(j) =l= sum(t, capT(t)*w(j,t)) + Qmax*(1 - x('d',j));
kapSig1(i,j)$(c(i) and c(j) and not sameas(i,j)).. kap(j) =g= kap(i) - Qmax*(1 - x(i,j));
kapSig2(i,j)$(c(i) and c(j) and not sameas(i,j)).. kap(j) =l= kap(i) + Qmax*(1 - x(i,j));
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Qmax*(1 - x(i,j));
cap(i)$c(i)..    ql(i) =l= kap(i);
ql.lo(c) = dem(c); ql.up(c) = Qmax; kap.up(c) = Qmax;
w.fx(i,t)$(not c(i)) = 0;
Model fsmvrp / all /;
""" + SOLVE + "solve fsmvrp using mip minimizing z;\n" + """Parameter mezcla(t) 'vehículos usados de cada tipo', costoFijo, costoDist;
mezcla(t) = sum(c, w.l(c,t)); costoFijo = sum((c,t), fijo(t)*w.l(c,t)); costoDist = sum((i,j), dist(i,j)*x.l(i,j));
""",
 rep=reporte2(), disp='display z.l, mezcla, costoFijo, costoDist, ruta, largo, cargaR;')

modelo(id='hfvrptw', num='18', sigla='HFVRPTW', nombre='Flota heterogénea con ventanas de tiempo', fam='Flota',
 desc='Combina la flota heterogénea (capacidad y costo por tipo) con ventanas de tiempo en los clientes.',
 ej='Instancia CVRP-10 con las ventanas del VRPTW; 2 grandes (Q 20, 1,3 $/km) y 2 pequeños (Q 10, 0,8 $/km).',
 datos=datos_base(extra_par=vt_par()) + flota_datos(TIPOS_HF) + "Scalar Qmax 'mayor capacidad', BigM / 1000 /; Qmax = smax(t, capT(t));\n",
 modelo=FLOTA_MOD + """Positive Variable tL(i) 'hora de llegada al cliente i';
Equations tIni(j), tSig(i,j), tVen(i), tFin(i);
tIni(j)$c(j).. tL(j) =g= dist('d',j) - BigM*(1 - sum(t, x('d',j,t)));
tSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. tL(j) =g= tL(i) + sv(i) + dist(i,j) - BigM*(1 - sum(t, x(i,j,t)));
tVen(i)$c(i).. tL(i) =g= ea(i);
tFin(i)$c(i).. tL(i) + sv(i) + dist(i,'d') =l= la('d') + BigM*(1 - sum(t, x(i,'d',t)));
tL.up(c) = la(c);
Model hfvrptw / all /;
""" + SOLVE + "solve hfvrptw using mip minimizing z;\n",
 rep=reporte2(idx='t'), disp='display z.l, tL.l, ruta, largo, cargaR;')

# =============================================================================================
# 19-21 DEPÓSITOS (formulación de 2 índices con asignación cliente-depósito)
# =============================================================================================
DEP_COORD = {'d1': (30, 70), 'd2': (72, 30), 'd3': (50, 50)}
def datos_md(deps, extra_par='', extra=''):
    nodos = deps + CLI; coord = {n: COORD[k] for k, n in enumerate(NODOS)}; coord.update({d: DEP_COORD[d] for d in deps})
    s = datos_base(nodos=nodos, coord=coord, extra_par=extra_par)
    s += f"Set dp(i) 'depósitos' / {', '.join(deps)} /;\nAlias (dp,g2);\n" + extra
    return s

MD_MOD = """
* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j) 'vale 1 si un vehículo recorre el arco i -> j', y(i,i) 'y(c,g) = 1 si el cliente c se atiende desde el depósito g';
Positive Variable ql(i) 'carga acumulada al salir del cliente i';
Free Variable z 'función objetivo';
x.fx(i,i) = 0; x.fx(dp,g2) = 0;
Equations obj, sale(i), entra(i), asig(i) 'cada cliente a un depósito', balDep(dp) 'salen tantos como regresan a cada depósito',
          salDep(dp,j) 'del depósito solo a sus clientes', regDep(i,dp) 'al depósito solo desde sus clientes',
          mismo1(i,j,dp) 'clientes consecutivos -> mismo depósito', mismo2(i,j,dp), carga(i,j), flotaDep(dp) 'vehículos por depósito';
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= 1;
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;
asig(i)$c(i)..  sum(dp, y(i,dp)) =e= 1;
balDep(dp)..    sum(c, x(dp,c)) =e= sum(c, x(c,dp));
salDep(dp,j)$c(j).. x(dp,j) =l= y(j,dp);
regDep(i,dp)$c(i).. x(i,dp) =l= y(i,dp);
mismo1(i,j,dp)$(c(i) and c(j) and not sameas(i,j)).. y(j,dp) - y(i,dp) =l= 1 - x(i,j);
mismo2(i,j,dp)$(c(i) and c(j) and not sameas(i,j)).. y(i,dp) - y(j,dp) =l= 1 - x(i,j);
carga(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));
flotaDep(dp)..  sum(c, x(dp,c)) =l= Kd;
ql.lo(c) = dem(c); ql.up(c) = Q;
y.fx(i,j)$(not (c(i) and dp(j))) = 0;
"""
INI_MD = "dp(g)"

modelo(id='mdvrp', num='19', sigla='MDVRP', nombre='VRP con múltiples depósitos', fam='Depósitos',
 desc='Hay varios depósitos; cada cliente se asigna a uno (y(c,g)) y cada ruta sale y regresa al mismo depósito. Las restricciones «mismo» obligan a que dos clientes consecutivos pertenezcan al mismo depósito.',
 ej='Clientes de la instancia CVRP-10 con dos depósitos: d1 (30, 70) y d2 (72, 30); Q = 15; hasta 3 vehículos por depósito.',
 datos=datos_md(['d1', 'd2']) + "Scalar Kd 'vehículos por depósito' / 3 /;\n",
 modelo=MD_MOD + "obj.. z =e= sum((i,j), dist(i,j)*x(i,j));\nModel mdvrp / all /;\n" + SOLVE + "solve mdvrp using mip minimizing z;\n",
 rep=reporte2(inicio=INI_MD) + """Parameter depC(i,i) 'depósito asignado a cada cliente'; depC(c,dp) = y.l(c,dp);
""", disp='display z.l, depC, ruta, largo, cargaR;')

modelo(id='mdvrptw', num='20', sigla='MDVRPTW', nombre='Múltiples depósitos con ventanas de tiempo', fam='Depósitos',
 desc='MDVRP más ventanas de tiempo en los clientes; los tiempos parten del depósito asignado.',
 ej='Dos depósitos d1 (30, 70) y d2 (72, 30), ventanas del VRPTW, Q = 15, hasta 3 vehículos por depósito.',
 datos=datos_md(['d1', 'd2'], extra_par=vt_par().replace("d 0,", "d1 0, d2 0,").replace("d 480,", "d1 480, d2 480,")) + "Scalar Kd 'vehículos por depósito' / 3 /, BigM / 1000 /;\n",
 modelo=MD_MOD + """obj.. z =e= sum((i,j), dist(i,j)*x(i,j));
Positive Variable tL(i) 'hora de llegada al cliente i';
Equations tIni(dp,j), tSig(i,j), tVen(i), tFin(i,dp);
tIni(dp,j)$c(j).. tL(j) =g= dist(dp,j) - BigM*(1 - x(dp,j));
tSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. tL(j) =g= tL(i) + sv(i) + dist(i,j) - BigM*(1 - x(i,j));
tVen(i)$c(i).. tL(i) =g= ea(i);
tFin(i,dp)$c(i).. tL(i) + sv(i) + dist(i,dp) =l= la(dp) + BigM*(1 - x(i,dp));
tL.up(c) = la(c);
Model mdvrptw / all /;
""" + SOLVE + "solve mdvrptw using mip minimizing z;\n",
 rep=reporte2(inicio=INI_MD), disp='display z.l, tL.l, ruta, largo, cargaR;')

modelo(id='lrp', num='21', sigla='LRP', nombre='Localización y ruteo', fam='Depósitos',
 desc='Decide a la vez qué depósitos abrir (costo fijo y capacidad) y las rutas desde los depósitos abiertos. Es el MDVRP con variables de apertura w(g) y capacidad de depósito.',
 ej='Clientes CVRP-10; candidatos d1 (30, 70) y d2 (72, 30) con apertura 100 y capacidad 25, y d3 (50, 50) con apertura 160 y capacidad 40; Q = 15.',
 datos=datos_md(['d1', 'd2', 'd3']) + """Parameter fA(i) 'costo de abrir el depósito' / d1 100, d2 100, d3 160 /, capD(i) 'capacidad del depósito' / d1 25, d2 25, d3 40 /;
Scalar Kd 'vehículos por depósito' / 3 /;
""",
 modelo=MD_MOD + """Binary Variable w(i) 'vale 1 si se abre el depósito';
Equations abre(i,dp) 'solo depósitos abiertos atienden', capDep(dp) 'capacidad del depósito';
obj..            z =e= sum(dp, fA(dp)*w(dp)) + sum((i,j), dist(i,j)*x(i,j));
abre(i,dp)$c(i).. y(i,dp) =l= w(dp);
capDep(dp)..     sum(c, dem(c)*y(c,dp)) =l= capD(dp)*w(dp);
w.fx(i)$(not dp(i)) = 0;
Model lrp / all /;
""" + SOLVE + "solve lrp using mip minimizing z;\n" + """Parameter abierto(i) 'depósitos abiertos', costoApertura, costoRutas;
abierto(dp) = w.l(dp); costoApertura = sum(dp, fA(dp)*w.l(dp)); costoRutas = sum((i,j), dist(i,j)*x.l(i,j));
""",
 rep=reporte2(inicio=INI_MD), disp='display z.l, abierto, costoApertura, costoRutas, ruta, largo, cargaR;')

# =============================================================================================
# 22-25 CARGAS
# =============================================================================================
modelo(id='vrpb', num='22', sigla='VRPB', nombre='VRP con recogidas en el regreso (backhauls)', fam='Cargas',
 desc='Clientes de entrega (linehaul, L) y de recogida (backhaul, B). En cada ruta se atienden primero todas las entregas y después las recogidas; ninguna ruta empieza por una recogida. Cargas de entrega y de recogida no superan Q por separado.',
 ej='CVRP-10 con c1-c6 de entrega y c7-c10 de recogida (mismas cantidades), Q = 15, K = 5.',
 datos=datos_base() + """Set L(i) 'clientes de entrega (linehaul)' / c1*c6 /, B(i) 'clientes de recogida (backhaul)' / c7*c10 /;
Scalar K 'vehículos disponibles' / 5 /;
""",
 modelo="""
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
""" + SOLVE + "solve vrpb using mip minimizing z;\n",
 rep=reporte2(), disp='display z.l, ruta, largo;')

PK = {'c1': 5, 'c2': 6, 'c3': 6, 'c4': 7, 'c5': 6, 'c6': 4, 'c7': 5, 'c8': 7, 'c9': 4, 'c10': 6}
modelo(id='vrpspd', num='23', sigla='VRPSPD', nombre='VRP con entrega y recogida simultáneas', fam='Cargas',
 desc='Cada cliente recibe una entrega y devuelve una recogida en la misma visita (envases, devoluciones). La carga a bordo cambia a lo largo de la ruta: sale con todas las entregas y va acumulando recogidas. Formulación de flujo con dos mercancías: D (entregas aún a bordo) y P (recogidas a bordo).',
 ej='CVRP-10: entregas = demandas originales y recogidas de 4 a 7 unidades por cliente (total 56); Q = 15, K = 5.',
 datos=datos_base(extra_par=',\n' + fmt_par('pk', 'cantidad recogida', [('d', 0)] + [(k, PK[k]) for k in CLI])) + "Scalar K 'vehículos disponibles' / 5 /;\n",
 modelo="""
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
""" + SOLVE + "solve vrpspd using mip minimizing z;\n",
 rep=reporte2(extra="""
Parameter abordo(i,j) 'carga a bordo en cada arco usado'; abordo(i,j)$(x.l(i,j) > 0.5) = D.l(i,j) + P.l(i,j);"""), disp='display z.l, ruta, largo, abordo;')

PARES = [('c1', 'c4'), ('c2', 'c6'), ('c3', 'c8'), ('c9', 'c10'), ('c5', 'c7')]
modelo(id='vrppd', num='24', sigla='VRPPD', nombre='VRP con recogida y entrega por pares', fam='Cargas',
 desc='Cada solicitud tiene un punto de recogida y uno de entrega: ambos deben estar en la misma ruta y la recogida antes de la entrega (mensajería, transporte de pacientes). Índice k de vehículo para garantizar la misma ruta; u(i) da el orden de visita.',
 ej='5 solicitudes sobre la instancia CVRP-10: c1→c4, c2→c6, c3→c8, c9→c10, c5→c7, con la demanda del punto de recogida; Q = 15; 3 vehículos.',
 datos=datos_base() + f"""Set k 'vehículos' / k1*k3 /, pr(i,i) 'pares recogida -> entrega' / {', '.join(f'{a}.{b}' for a, b in PARES)} /;
Parameter w(i) 'cambio de carga: + en la recogida, - en la entrega';
w(c) = sum(j$pr(c,j), dem(c)) - sum(j$pr(j,c), dem(j));
Scalar BigM / 100 /;
""",
 modelo="""
* ------------------------------------- MODELO ------------------------------------------------
Binary Variable x(i,j,k) 'vale 1 si el vehículo k recorre el arco i -> j';
Positive Variable u(i) 'orden de visita', ql(i) 'carga a bordo al salir de i';
Free Variable z 'distancia total';
x.fx(i,i,k) = 0;
Equations obj, visita(j), flujo(i,k), salida(k) 'cada vehículo sale a lo sumo una vez', mismo(i,j,k) 'recogida y entrega en el mismo vehículo',
          orden(i,j) 'orden de visita (MTZ)', prec(i,j) 'recogida antes que entrega', cIni(j), cIni2(j), cSig(i,j), cSig2(i,j);
obj..            z =e= sum((i,j,k), dist(i,j)*x(i,j,k));
visita(j)$c(j).. sum((i,k)$(not sameas(i,j)), x(i,j,k)) =e= 1;
flujo(i,k)..     sum(j$(not sameas(i,j)), x(i,j,k)) =e= sum(j$(not sameas(i,j)), x(j,i,k));
salida(k)..      sum(c, x('d',c,k)) =l= 1;
mismo(i,j,k)$pr(i,j).. sum(h$(not sameas(h,i)), x(h,i,k)) =e= sum(h$(not sameas(h,j)), x(h,j,k));
orden(i,j)$(c(i) and c(j) and not sameas(i,j)).. u(j) =g= u(i) + 1 - card(c)*(1 - sum(k, x(i,j,k)));
prec(i,j)$pr(i,j).. u(j) =g= u(i) + 1;
cIni(j)$c(j)..   ql(j) =g= w(j) - BigM*(1 - sum(k, x('d',j,k)));
cIni2(j)$c(j)..  ql(j) =l= w(j) + BigM*(1 - sum(k, x('d',j,k)));
cSig(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =g= ql(i) + w(j) - BigM*(1 - sum(k, x(i,j,k)));
cSig2(i,j)$(c(i) and c(j) and not sameas(i,j)).. ql(j) =l= ql(i) + w(j) + BigM*(1 - sum(k, x(i,j,k)));
u.lo(c) = 1; u.up(c) = card(c); ql.up(c) = Q;
Model vrppd / all /;
""" + SOLVE + "solve vrppd using mip minimizing z;\n",
 rep=reporte2(idx='k'), disp='display z.l, u.l, ql.l, ruta, largo;')

SD_DEM = {'c1': 7, 'c2': 5, 'c3': 8, 'c4': 6, 'c5': 7, 'c6': 9, 'c7': 6, 'c8': 5}
modelo(id='sdvrp', num='25', sigla='SDVRP', nombre='VRP con entrega dividida', fam='Cargas',
 desc='La demanda de un cliente puede repartirse entre varios vehículos (split delivery). Ahorra distancia y vehículos cuando las demandas son grandes respecto a Q. Índice k de vehículo, cantidad entregada e(i,k) y MTZ por vehículo. El archivo resuelve también la versión sin división para comparar.',
 ej='8 clientes (c1-c8) con demandas grandes de 5 a 9 unidades (total 53) y Q = 15: 4 vehículos.',
 datos=datos_base(nodos=['d'] + CLI[:8], dem={**{'d': 0}, **SD_DEM}) + "Set k 'vehículos' / k1*k4 /;\n",
 modelo="""
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
""" + SOLVE + """Scalar distSinDiv 'distancia sin división';
solve sinDiv using mip minimizing z;
distSinDiv = z.l;
solve sdvrp using mip minimizing z;
Parameter entrega(i,k) 'cantidad entregada por vehículo'; entrega(c,k) = e.l(c,k);
""",
 rep="""
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
""", disp='display z.l, distSinDiv, entrega, rutaK, largoK, cargaK;')

# =============================================================================================
# 26-27 SELECTIVOS
# =============================================================================================
PREMIO = {'c1': 90, 'c2': 75, 'c3': 120, 'c4': 165, 'c5': 180, 'c6': 105, 'c7': 60, 'c8': 135, 'c9': 150, 'c10': 45}
def premio_par(): return ',\n' + fmt_par('pr', 'premio (beneficio) por visitar', [('d', 0)] + [(k, PREMIO[k]) for k in CLI])

modelo(id='pcvrp', num='26', sigla='PCVRP', nombre='VRP con beneficios (prize-collecting)', fam='Selectivos',
 desc='No es obligatorio visitar a todos: cada cliente aporta un beneficio y se visitan solo los rentables. Maximiza beneficio recogido − costo de distancia, con capacidad Q y flota limitada.',
 ej='CVRP-10 con beneficios de 45 a 180 por cliente, costo 1 $/km, Q = 15 y solo K = 2 vehículos (no caben los 38 de demanda).',
 datos=datos_base(extra_par=premio_par()) + "Scalar K 'vehículos disponibles' / 2 /, cpk 'costo por unidad de distancia' / 1 /;\n",
 modelo="""
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
""" + SOLVE + "solve pcvrp using mip maximizing z;\n" + """Scalar premio 'beneficio recogido', costo 'costo de distancia';
premio = sum(c, pr(c)*y.l(c)); costo = cpk*sum((i,j), dist(i,j)*x.l(i,j));
""",
 rep=reporte2(), disp='display z.l, premio, costo, y.l, ruta, largo, cargaR;')

modelo(id='top', num='27', sigla='TOP', nombre='Orienteering por equipos', fam='Selectivos',
 desc='m vehículos con una distancia máxima L por ruta maximizan el premio total recogido; no hay costo por distancia, el límite es el tiempo. Modela vendedores con jornada fija o visitas turísticas.',
 ej='CVRP-10 con los premios del PCVRP, m = 2 vehículos y L = 160 por ruta.',
 datos=datos_base(extra_par=premio_par()) + "Scalar m 'vehículos' / 2 /, L 'distancia máxima por ruta' / 160 /;\n",
 modelo="""
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
""" + SOLVE + "solve top using mip maximizing z;\n" + """Scalar distTot 'distancia recorrida'; distTot = sum((i,j), dist(i,j)*x.l(i,j));
""",
 rep=reporte2(), disp='display z.l, y.l, distTot, ruta, largo;')


def nombre_archivo(m): return f"{m['num']}_{m['sigla'].lower().replace('-', '_')}.gms"

def texto(m):
    rep = m.get('rep') or ''
    return cab(m['num'], m['sigla'], m['nombre'], m['desc'], m['ej']) + m['datos'] + m['modelo'] + rep + '\noption decimals = 2;\n' + m['disp'] + '\n'

def generar():
    os.makedirs(SAL, exist_ok=True)
    for m in M:
        open(os.path.join(SAL, nombre_archivo(m)), 'w', encoding='utf-8').write(texto(m))
    return [os.path.join(SAL, nombre_archivo(m)) for m in M]

if __name__ == '__main__':
    for f in generar(): print(f)
