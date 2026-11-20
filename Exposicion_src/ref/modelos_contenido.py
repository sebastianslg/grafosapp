"""Contenido didáctico de los 27 modelos: aplicaciones, supuestos, formulación (con la misma notación del código GAMS)
y lectura de resultados (calculada con ref/modelos.json). Genera ref/modelos_deck.json para el constructor de diapositivas."""
import json, os, re
import modelos_gams as MG

BASE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(BASE, 'modelos.json')))


def f(x, d=2):
    s = f'{x:,.{d}f}'; return s.replace(',', '_').replace('.', ',').replace('_', '.')


def rutas(k):
    out = []
    for r in D[k]['rutas']:
        s = r['ini'].upper().replace('D', 'D') + ' → ' + ' → '.join(c[1:] for c in r['cli']) + (' → ' + r['fin'].upper() if r['fin'] else ' (fin)')
        out.append(s)
    return out


def par(k, n): return D[k]['par'].get(n, {}).get('', None)


Z = {k: D[k]['z'] for k in D}
CV = Z['cvrp']

# --------------------------------------------------------------------------------------- notación común
N_BASE = [('i, j, h', 'nodos: depósito d y clientes c1…c10'), ('c(i)', 'subconjunto de clientes C')]
P_BASE = [('dist(i,j)', 'distancia euclidiana (también tiempo de viaje)'), ('dem(i)', 'demanda del cliente'), ('Q', 'capacidad del vehículo')]
X2 = ('x(i,j) ∈ {0,1}', '1 si se recorre el arco i → j')
GRADO = [('sale(i), i ∈ C', 'Σ j≠i x(i,j) = 1', 'cada cliente tiene un sucesor'),
         ('entra(j), j ∈ C', 'Σ i≠j x(i,j) = 1', 'cada cliente tiene un predecesor')]
MTZ = ('mtz(i,j), i ≠ j ∈ C', 'u(i) − u(j) + n·x(i,j) ≤ n − 1', 'elimina subtours: si se usa i → j, u(j) ≥ u(i) + 1')
CARGA = ('carga(i,j), i ≠ j ∈ C', 'ql(j) ≥ ql(i) + dem(j) − Q·(1 − x(i,j))', 'carga acumulada (MTZ): elimina subtours y limita a Q')
CARGA_B = ('cotas', 'dem(i) ≤ ql(i) ≤ Q', 'la carga al salir de i incluye su demanda y no supera Q')
FLOTA = ('flota', 'Σ c x(d,c) ≤ K', 'a lo sumo K vehículos salen del depósito')
BAL = ('balDep', 'Σ c x(d,c) = Σ c x(c,d)', 'salen tantos vehículos como regresan')
OBJ_D = 'min z = Σ(i,j) dist(i,j)·x(i,j)'

C = {}

def mod(id, **kw): C[id] = kw

# ======================================================================================= 1-7
mod('tsp', cambia='Es el caso base: un solo vehículo sin capacidad. Todos los demás modelos parten de él.',
    aplic=['Ruta de un repartidor, técnico o supervisor que visita todos los puntos en un turno.', 'Secuencia de perforación de placas o de recogida en un almacén (picking).', 'Recorrido de un vehículo de inspección o lectura de medidores.'],
    sup=['Un solo vehículo, sin límite de capacidad ni de tiempo.', 'Costos simétricos y conocidos (distancia euclidiana).', 'Se sale y se regresa al mismo depósito.'],
    conj=N_BASE, par=[P_BASE[0], ('n = card(c)', 'número de clientes (10)')], var=[X2, ('u(i) ≥ 0', 'posición del nodo en el recorrido (MTZ)')],
    fo=OBJ_D, res=[('sale(i), i ∈ N', 'Σ j≠i x(i,j) = 1', 'cada nodo (incluido d) tiene un sucesor'), ('entra(j), j ∈ N', 'Σ i≠j x(i,j) = 1', 'cada nodo tiene un predecesor'), MTZ, ('cotas', '1 ≤ u(i) ≤ n', 'posición entre 1 y n')],
    lect=lambda: [f'Un solo recorrido de {f(Z["tsp"])} que visita a los 10 clientes: {rutas("tsp")[0]}.', 'Sin restricciones de MTZ la solución se partiría en subtours (ciclos que no pasan por el depósito).', f'Es la cota inferior de cualquier ruteo con regreso: el mTSP y el CVRP cuestan más ({f(Z["mtsp"])} y {f(CV)}).'])

mod('otsp', cambia='Respecto al TSP se eliminan los arcos que vuelven al depósito y los clientes tienen a lo sumo un sucesor: el recorrido es un camino.',
    aplic=['Conductor que termina el turno en su casa o en otra base.', 'Vehículo contratado (tercero) que no debe regresar.', 'Trayecto de evacuación o de reparto con destino libre.'],
    sup=['Un vehículo; inicia en d y termina en cualquier cliente.', 'Sin capacidad.', 'Distancias euclidianas.'],
    conj=N_BASE, par=[P_BASE[0], ('n = card(c)', 'número de clientes')], var=[X2, ('u(i) ≥ 0', 'posición (MTZ)')], fo=OBJ_D,
    res=[('saleDep', 'Σ c x(d,c) = 1', 'sale una vez del depósito'), ('entra(j), j ∈ C', 'Σ i x(i,j) = 1', 'cada cliente recibe un arco'), ('sale(i), i ∈ C', 'Σ j x(i,j) ≤ 1', 'a lo sumo un sucesor (el último no tiene)'), ('arcos', 'Σ(i,j) x(i,j) = n', 'el camino tiene exactamente n arcos'), ('x(i,d) = 0', 'x.fx(i,\'d\') = 0', 'no se regresa al depósito'), MTZ],
    lect=lambda: [f'Camino de {f(Z["otsp"])}: {rutas("otsp")[0]}.', f'Ahorra {f(Z["tsp"] - Z["otsp"])} frente al TSP ({f(Z["tsp"])}): se evita el arco de regreso más largo.', 'El último cliente (c4) es el que deja más cerca el cierre del camino, no el más cercano al depósito.'])

mod('mtsp', cambia='Respecto al TSP, del depósito salen y regresan m viajantes; cada cliente sigue con un predecesor y un sucesor.',
    aplic=['Asignar visitas de m vendedores o técnicos desde una misma sede.', 'Recorridos de m buses escolares sin límite de capacidad relevante.', 'Planeación de rutas de patrullaje o vigilancia.'],
    sup=['m viajantes idénticos, sin capacidad.', 'Cada viajante visita al menos un cliente (salen exactamente m).', 'Se minimiza la distancia total, no la de cada viajante.'],
    conj=N_BASE, par=[P_BASE[0], ('m', 'número de viajantes (3)')], var=[X2, ('u(i) ≥ 0', 'posición (MTZ)')], fo=OBJ_D,
    res=[('saleDep', 'Σ c x(d,c) = m', 'salen m viajantes'), ('entraDep', 'Σ c x(c,d) = m', 'regresan m viajantes')] + GRADO + [MTZ],
    lect=lambda: [f'Distancia total {f(Z["mtsp"])} con 3 rutas:'] + rutas('mtsp') + ['Las rutas quedan muy desbalanceadas (una con 1 cliente y otra con 6): por eso existen las versiones balanceada y min-max.'])

CONT_R = [('cIni, cIni2', 'f(j) = 1 si x(d,j) = 1', 'el primer cliente de la ruta tiene contador 1 (dos desigualdades con big-M)'),
          ('cSig, cSig2', 'f(j) = f(i) + 1 si x(i,j) = 1', 'el contador aumenta exactamente en 1 por arco'),
          ('cotas', '1 ≤ f(i) ≤ Umax', 'ninguna ruta supera Umax clientes')]
mod('mtspb', cambia='Al mTSP se le agrega un contador exacto f(i) de clientes por ruta, con mínimo Lmin al cerrar la ruta y máximo Umax.',
    aplic=['Repartir de forma equitativa las visitas entre vendedores o técnicos.', 'Cargas de trabajo justas entre turnos o equipos.', 'Contratos que exigen un número similar de paradas por conductor.'],
    sup=['m = 3 viajantes; cada uno con 3 o 4 clientes (⌊10/3⌋ y ⌈10/3⌉).', 'Sin capacidad.', 'Equilibrio medido en número de clientes.'],
    conj=N_BASE, par=[P_BASE[0], ('m, Lmin, Umax', 'viajantes, mínimo y máximo de clientes por ruta')], var=[X2, ('u(i) ≥ 0', 'posición (MTZ)'), ('f(i) ≥ 0', 'contador exacto de clientes en la ruta hasta i')], fo=OBJ_D,
    res=[('saleDep / entraDep', 'Σ c x(d,c) = Σ c x(c,d) = m', 'm rutas cerradas')] + GRADO + [MTZ] + CONT_R + [('fin(i)', 'f(i) ≥ Lmin·x(i,d)', 'la ruta termina con al menos Lmin clientes')],
    lect=lambda: [f'Distancia {f(Z["mtspb"])} frente a {f(Z["mtsp"])} del mTSP: el equilibrio cuesta {f(Z["mtspb"] - Z["mtsp"])} ({f(100*(Z["mtspb"]/Z["mtsp"]-1),1)} %).'] + rutas('mtspb') + ['Cada ruta tiene 3 o 4 clientes, como exige el modelo.'])

OM_R = [('saleDep', 'Σ c x(d,c) = m', 'salen m viajantes'), ('entra(j), j ∈ C', 'Σ i x(i,j) = 1', 'cada cliente recibe un arco'), ('sale(i), i ∈ C', 'Σ j x(i,j) ≤ 1', 'el último cliente no tiene sucesor'), ('arcos', 'Σ x(i,j) = n', 'm arcos desde d + (n − m) entre clientes'), ('x(i,d) = 0', 'x.fx(i,\'d\') = 0', 'sin regreso'), MTZ]
mod('omtsp', cambia='Es el mTSP sin arcos de regreso: cada ruta termina en su último cliente.',
    aplic=['Técnicos que al final del día se van a su casa.', 'Distribución con vehículos de terceros pagados por trayecto.', 'Rutas de recogida que terminan en distintos puntos de transferencia.'],
    sup=['m = 3 viajantes, sin capacidad.', 'Rutas abiertas desde el depósito.', 'Distancia total mínima.'],
    conj=N_BASE, par=[P_BASE[0], ('m', 'número de viajantes (3)')], var=[X2, ('u(i) ≥ 0', 'posición (MTZ)')], fo=OBJ_D, res=OM_R,
    lect=lambda: [f'Distancia {f(Z["omtsp"])} (el mTSP cerrado cuesta {f(Z["mtsp"])}).'] + rutas('omtsp') + ['Sin el regreso, las rutas se alargan hacia la periferia y terminan en los clientes más lejanos.'])

mod('omtspb', cambia='mTSP abierto + contador exacto de clientes; el fin de ruta es el cliente sin sucesor.',
    aplic=['Rutas abiertas de mensajeros con igual número de entregas.', 'Turnos de técnicos que terminan en casa con carga pareja.', 'Asignación equitativa de visitas de campo.'],
    sup=['m = 4 viajantes con 2 o 3 clientes cada uno.', 'Rutas abiertas, sin capacidad.', 'Se compara con la versión sin balance en el mismo archivo.'],
    conj=N_BASE, par=[P_BASE[0], ('m, Lmin, Umax', 'viajantes y límites de clientes (4, 2, 3)')], var=[X2, ('u(i), f(i) ≥ 0', 'posición y contador de clientes')], fo=OBJ_D,
    res=OM_R[:5] + CONT_R + [('fin(i)', 'f(i) ≥ Lmin·(1 − Σ j x(i,j))', 'el cliente sin sucesor cierra la ruta con al menos Lmin')],
    lect=lambda: [f'Con balance: {f(Z["omtspb"])}; sin balance (mismo archivo): {f(par("omtspb", "distsinbal"))}.'] + rutas('omtspb') + [('El balance no cambia el costo.' if abs(Z['omtspb'] - par('omtspb', 'distsinbal')) < 1e-6 else f'El equilibrio cuesta {f(Z["omtspb"] - par("omtspb", "distsinbal"))}.')])

mod('mtspmm', cambia='Cambia el objetivo: en lugar de la suma se minimiza la ruta más larga T; a(i) acumula la distancia de cada ruta.',
    aplic=['Minimizar la hora de regreso del último vehículo (makespan).', 'Atención de emergencias: que ningún equipo tarde demasiado.', 'Jornadas laborales parejas entre conductores.'],
    sup=['m = 3 viajantes, sin capacidad.', 'El peso w = 0,001 sobre la distancia total solo desempata.', 'Big-M ajustadas y dos cortes válidos fortalecen la relajación.'],
    conj=N_BASE, par=[P_BASE[0], ('m, Amax, w', 'viajantes, cota de distancia acumulada, peso de desempate')], var=[X2, ('a(i) ≥ 0', 'distancia acumulada al llegar a i'), ('T ≥ 0', 'longitud de la ruta más larga')],
    fo='min z = T + w·Σ dist(i,j)·x(i,j)',
    res=[('saleDep / entraDep', 'm salidas y m regresos', 'm rutas cerradas')] + GRADO + [MTZ, ('aIni(j)', 'a(j) ≥ dist(d,j)·x(d,j)', 'distancia al primer cliente'), ('aSig(i,j)', 'a(j) ≥ a(i) + dist(i,j) − M·(1 − x(i,j))', 'acumula la distancia de la ruta'), ('larga(i)', 'T ≥ a(i) + dist(i,d) − M·(1 − x(i,d))', 'T acota cada ruta completa'), ('corteProm', 'm·T ≥ Σ dist·x', 'la más larga es al menos el promedio'), ('corteIda(i)', 'T ≥ 2·dist(d,i)', 'ida y vuelta a cada cliente')],
    lect=lambda: [f'Ruta más larga T = {f(par("mtspmm", "t") or D["mtspmm"]["var"]["t"][""])}; distancia total {f(sum(r["dist"] for r in D["mtspmm"]["rutas"]))} (el mTSP suma {f(Z["mtsp"])}).'] + rutas('mtspmm') + ['Las tres rutas miden casi lo mismo (137 a 148): se sacrifica distancia total por equidad.'])

# ======================================================================================= 8-13
BASE_CV = GRADO + [FLOTA, BAL, CARGA, CARGA_B]
VAR_CV = [X2, ('ql(i) ≥ 0', 'carga acumulada al salir del cliente i')]
PAR_CV = P_BASE + [('K', 'vehículos disponibles')]
mod('cvrp', cambia='Respecto al mTSP se agrega la capacidad Q: la carga acumulada ql(i) reemplaza a la posición u(i) y elimina subtours.',
    aplic=['Distribución de mercancía desde un centro de distribución a tiendas.', 'Recolección de residuos o de leche con camiones de capacidad fija.', 'Reparto de pedidos de comercio electrónico.'],
    sup=['Flota homogénea de capacidad Q = 15 en un depósito.', 'Cada cliente se atiende una sola vez y completo.', 'A lo sumo K = 5 vehículos.'],
    conj=N_BASE, par=PAR_CV, var=VAR_CV, fo=OBJ_D, res=BASE_CV,
    lect=lambda: [f'Óptimo {f(CV)} con 3 rutas (cargas 12, 12 y 14 de 15):'] + rutas('cvrp') + ['Es el óptimo que usan como referencia las heurísticas y metaheurísticas (brecha = 0 %).'])

mod('ovrp', cambia='Es el CVRP sin arcos de regreso: los clientes tienen a lo sumo un sucesor y x(i,d) = 0.',
    aplic=['Flota tercerizada pagada solo hasta el último cliente.', 'Rutas de buses escolares de la mañana (terminan en el colegio).', 'Reparto en el que el conductor se queda con el vehículo.'],
    sup=['Q = 15, K = 5.', 'Rutas abiertas desde el depósito.', 'Cada cliente se atiende completo.'],
    conj=N_BASE, par=PAR_CV, var=VAR_CV, fo=OBJ_D,
    res=[('sale(i), i ∈ C', 'Σ j x(i,j) ≤ 1', 'el último cliente no tiene sucesor'), GRADO[1], FLOTA, ('x(i,d) = 0', 'x.fx(i,\'d\') = 0', 'no se regresa'), CARGA, CARGA_B],
    lect=lambda: [f'Distancia {f(Z["ovrp"])}, frente a {f(CV)} del CVRP ({f(100*(1-Z["ovrp"]/CV),1)} % menos).'] + rutas('ovrp') + ['Las rutas cambian: al no regresar conviene terminar en el cliente más lejano.'])

DIST_R = [('aIni(j)', 'a(j) ≥ dist(d,j)·x(d,j)', 'distancia hasta el primer cliente'), ('aSig(i,j)', 'a(j) ≥ a(i) + dist(i,j) − M·(1 − x(i,j))', 'acumula la distancia de la ruta'), ('largoMax(i)', 'a(i) + dist(i,d) ≤ L + M·(1 − x(i,d))', 'con el regreso, la ruta no supera L')]
mod('dcvrp', cambia='Al CVRP se agrega a(i), la distancia acumulada, y el límite L por ruta (jornada o autonomía).',
    aplic=['Jornada laboral máxima del conductor.', 'Autonomía de vehículos eléctricos o drones.', 'Productos perecederos con tiempo máximo en ruta.'],
    sup=['Q = 15, K = 5, L = 150.', 'Tiempo de viaje = distancia.', 'Sin tiempos de servicio.'],
    conj=N_BASE, par=PAR_CV + [('L, M', 'distancia máxima por ruta y constante grande')], var=VAR_CV + [('a(i) ≥ 0', 'distancia acumulada al llegar a i')], fo=OBJ_D, res=BASE_CV + DIST_R,
    lect=lambda: [f'Distancia {f(Z["dcvrp"])} (CVRP: {f(CV)}). La ruta de 151,1 del CVRP ya no es factible.'] + rutas('dcvrp') + [f'Todas las rutas miden ≤ 150; el costo sube solo {f(Z["dcvrp"] - CV)}.'])

mod('vrpl', cambia='Al CVRP se agrega un contador de paradas f(i) con máximo P por ruta.',
    aplic=['Límite de entregas por turno o por conductor.', 'Normas de servicio (máximo de pacientes por ruta de ambulancia).', 'Rutas de cobranza o de mantenimiento con cupo de visitas.'],
    sup=['Q = 15, K = 5, P = 3 paradas.', 'Flota homogénea.', 'Cada cliente se atiende completo.'],
    conj=N_BASE, par=PAR_CV + [('P', 'máximo de paradas por ruta (3)')], var=VAR_CV + [('f(i) ≥ 0', 'paradas hasta el cliente i')], fo=OBJ_D,
    res=BASE_CV + [('paradas(i,j)', 'f(j) ≥ f(i) + 1 − P·(1 − x(i,j))', 'cuenta paradas (MTZ)'), ('cotas', '1 ≤ f(i) ≤ P', 'a lo sumo P paradas')],
    lect=lambda: [f'Distancia {f(Z["vrpl"])} con 4 rutas (CVRP: {f(CV)} con 3).'] + rutas('vrpl') + ['La ruta de 4 clientes del CVRP debe partirse: aparece una ruta extra y el costo sube.'])

mod('minveh', cambia='Mismas restricciones del CVRP; cambia el objetivo: primero mínima flota y luego mínima distancia (dos fases).',
    aplic=['Cuando el costo fijo del vehículo y el conductor domina al de combustible.', 'Dimensionar la flota mínima para un día de operación.', 'Comparar escenarios de flota propia vs. alquilada.'],
    sup=['Q = 13, K = 5.', 'Fase 1: minimizar vehículos; fase 2: fijar ese número y minimizar distancia.', 'Se compara con el CVRP puro en el mismo archivo.'],
    conj=N_BASE, par=PAR_CV, var=VAR_CV + [('nv', 'vehículos usados (fase 1)')], fo='fase 1: min nv = Σ c x(d,c);  fase 2: min Σ dist·x',
    res=BASE_CV + [('fijaNv (fase 2)', 'Σ c x(d,c) = vehMin', 'la flota queda fija en el mínimo')],
    lect=lambda: [f'CVRP puro: {int(par("minveh", "vehpuro"))} vehículos y {f(par("minveh", "distpuro"))} de distancia.', f'Mínima flota: {int(par("minveh", "vehmin"))} vehículos y {f(par("minveh", "distmin"))} de distancia.'] + rutas('minveh') + [f'Se ahorra un vehículo a cambio de solo {f(par("minveh", "distmin") - par("minveh", "distpuro"))} de distancia.'])

mod('cvrpb', cambia='CVRP con número de rutas fijo y contador exacto de clientes entre Lmin y Umax.',
    aplic=['Repartir el trabajo de forma pareja entre conductores.', 'Equidad en rutas de recolección municipal.', 'Planeación de turnos con igual número de visitas.'],
    sup=['Q = 15, exactamente 4 rutas.', 'Cada ruta con 2 o 3 clientes.', 'Equilibrio medido en número de clientes.'],
    conj=N_BASE, par=PAR_CV + [('Lmin, Umax', 'mínimo y máximo de clientes por ruta (2, 3)')], var=VAR_CV + [('f(i) ≥ 0', 'contador de clientes')], fo=OBJ_D,
    res=GRADO + [('flota', 'Σ c x(d,c) = K', 'exactamente K = 4 rutas'), BAL, CARGA] + CONT_R + [('fin(i)', 'f(i) ≥ Lmin·x(i,d)', 'cada ruta cierra con al menos Lmin clientes')],
    lect=lambda: [f'Distancia {f(Z["cvrpb"])} con 4 rutas de 2 o 3 clientes (CVRP: {f(CV)}).'] + rutas('cvrpb') + [f'El equilibrio cuesta {f(Z["cvrpb"] - CV)} ({f(100*(Z["cvrpb"]/CV-1),1)} %).'])

# ======================================================================================= 14-15
VT_R = [('tIni(j)', 'tL(j) ≥ dist(d,j) − M·(1 − x(d,j))', 'llegada al primer cliente'), ('tSig(i,j)', 'tL(j) ≥ tL(i) + sv(i) + dist(i,j) − M·(1 − x(i,j))', 'secuencia de tiempos (también elimina subtours)'), ('ventana(i)', 'ea(i) ≤ tL(i) ≤ la(i)', 'servicio dentro de la ventana; si llega antes, espera')]
mod('vrptw', cambia='Al CVRP se agrega la hora de llegada tL(i) con ventanas [ea, la], tiempo de servicio y cierre del depósito.',
    aplic=['Entregas con citas o franjas horarias acordadas con el cliente.', 'Recogida de pacientes, mantenimiento programado.', 'Restricciones de cargue y descargue en centros urbanos.'],
    sup=['Tiempo de viaje = distancia (velocidad 1); servicio de 10 min.', 'Ventanas de 70-80 min; depósito abierto de 0 a 480.', 'Q = 15, K = 5.'],
    conj=N_BASE, par=PAR_CV + [('ea(i), la(i)', 'inicio y fin de la ventana'), ('sv(i)', 'tiempo de servicio'), ('M', 'constante grande (1000)')], var=VAR_CV + [('tL(i) ≥ 0', 'hora de llegada al cliente i')], fo=OBJ_D,
    res=BASE_CV + VT_R + [('tFin(i)', 'tL(i) + sv(i) + dist(i,d) ≤ la(d) + M·(1 − x(i,d))', 'regreso antes del cierre')],
    lect=lambda: [f'Distancia {f(Z["vrptw"])} (CVRP sin ventanas: {f(CV)}).'] + rutas('vrptw') + ['Las rutas se reorganizan por hora, no solo por cercanía: c5 se atiende a las 170 y c7 justo a las 270 (fin de su ventana).'])

mod('ovrptw', cambia='VRPTW con rutas abiertas: no hay regreso ni restricción de cierre del depósito.',
    aplic=['Técnicos con citas que terminan en casa.', 'Transporte de personal con horarios de recogida.', 'Mensajería tercerizada con franjas horarias.'],
    sup=['Mismas ventanas del VRPTW, Q = 15, K = 5.', 'Rutas abiertas.', 'Tiempo de viaje = distancia.'],
    conj=N_BASE, par=PAR_CV + [('ea, la, sv, M', 'ventanas, servicio y constante grande')], var=VAR_CV + [('tL(i) ≥ 0', 'hora de llegada')], fo=OBJ_D,
    res=[('sale(i), i ∈ C', 'Σ j x(i,j) ≤ 1', 'rutas abiertas'), GRADO[1], FLOTA, ('x(i,d) = 0', 'sin regreso', 'la ruta termina en un cliente'), CARGA, CARGA_B] + VT_R,
    lect=lambda: [f'Distancia {f(Z["ovrptw"])} con {len(D["ovrptw"]["rutas"])} rutas (VRPTW cerrado: {f(Z["vrptw"])}).'] + rutas('ovrptw') + ['Sin regreso conviene usar más rutas cortas que respeten las ventanas.'])

# ======================================================================================= 16-18
TIPO_R = [('visita(j)', 'Σ(i,t) x(i,j,t) = 1', 'cada cliente lo visita un vehículo de un tipo'), ('flujo(i,t)', 'Σ j x(i,j,t) = Σ j x(j,i,t)', 'la ruta conserva su tipo de vehículo'), ('disp(t)', 'Σ c x(d,c,t) ≤ nveh(t)', 'vehículos disponibles por tipo'), ('carga(i,j)', 'ql(j) ≥ ql(i) + dem(j) − Qmax·(1 − Σ t x(i,j,t))', 'carga acumulada (MTZ)'), ('capac(j)', 'ql(j) ≤ Σ(i,t) capT(t)·x(i,j,t)', 'carga ≤ capacidad del tipo que llega a j')]
P_T = [('t', 'tipos de vehículo'), ('capT(t), cpk(t)', 'capacidad y costo por km del tipo'), ('nveh(t)', 'vehículos disponibles del tipo')]
mod('hfvrp', cambia='Se agrega el índice t de tipo de vehículo: x(i,j,t). Capacidad y costo por km dependen del tipo.',
    aplic=['Flotas con camiones grandes y furgonetas.', 'Elegir qué vehículo asignar a cada ruta según volumen.', 'Distribución urbana con vehículos pequeños para el centro.'],
    sup=['2 grandes (Q 20, 1,3 $/km) y 2 pequeños (Q 10, 0,8 $/km).', 'Sin costo fijo.', 'Un depósito.'],
    conj=N_BASE + [('t', 'tipos: grande, pequeño')], par=P_BASE[:2] + P_T[1:], var=[('x(i,j,t) ∈ {0,1}', '1 si un vehículo del tipo t recorre i → j'), ('ql(i) ≥ 0', 'carga acumulada')],
    fo='min z = Σ(i,j,t) cpk(t)·dist(i,j)·x(i,j,t)', res=TIPO_R,
    lect=lambda: [f'Costo {f(Z["hfvrp"])}. Rutas:'] + rutas('hfvrp') + ['La ruta de 20 unidades usa un camión grande; las de 9 usan los pequeños, más baratos por km.'])

mod('fsmvrp', cambia='Decisión de flota: cada ruta elige su tipo w(j,t) (con costo fijo) y la capacidad kap(i) se propaga por la ruta.',
    aplic=['Decidir qué vehículos comprar o alquilar.', 'Renovación de flota y análisis de costo fijo vs. variable.', 'Contratos de transporte con tarifas por tipo de camión.'],
    sup=['Tipos grande (20, fijo 80), mediano (15, 60) y pequeño (10, 45); 1 $/km.', 'Hasta 2 de cada tipo.', 'Un depósito.'],
    conj=N_BASE + [('t', 'tipos: grande, mediano, pequeño')], par=P_BASE[:2] + [('capT(t), fijo(t)', 'capacidad y costo fijo del tipo'), ('nveh(t)', 'disponibles del tipo')],
    var=[X2, ('w(j,t) ∈ {0,1}', '1 si la ruta que empieza en j usa el tipo t'), ('ql(i), kap(i) ≥ 0', 'carga acumulada y capacidad del vehículo que visita i')],
    fo='min z = Σ(c,t) fijo(t)·w(c,t) + Σ dist(i,j)·x(i,j)',
    res=GRADO + [BAL, ('tipoIni(j)', 'Σ t w(j,t) = x(d,j)', 'cada ruta elige un tipo'), ('disp(t)', 'Σ c w(c,t) ≤ nveh(t)', 'vehículos por tipo'), ('kapIni(j)', 'kap(j) = Σ t capT(t)·w(j,t) si x(d,j) = 1', 'capacidad del primer cliente'), ('kapSig(i,j)', 'kap(j) = kap(i) si x(i,j) = 1', 'se propaga por la ruta'), ('carga, cap(i)', 'ql(i) ≤ kap(i)', 'la carga no supera la capacidad del tipo')],
    lect=lambda: [f'Costo {f(Z["fsmvrp"])} = fijo {f(par("fsmvrp", "costofijo"))} + distancia {f(par("fsmvrp", "costodist"))}.', 'Mezcla óptima: ' + ', '.join(f'{int(v)} ' + {'grande': 'grande', 'mediano': 'mediano', 'pequeno': 'pequeño'}[k] + ('s' if int(v) > 1 else '') for k, v in D['fsmvrp']['par']['mezcla'].items()) + '.'] + rutas('fsmvrp') + ['Dos camiones grandes con 19 unidades cada uno salen más baratos que tres medianos.'])

mod('hfvrptw', cambia='HFVRP + ventanas de tiempo; la secuencia de tiempos usa Σ t x(i,j,t).',
    aplic=['Flota mixta con citas de entrega.', 'Distribución urbana con franjas de cargue y vehículos de distinto tamaño.', 'Servicio técnico con camionetas y motos.'],
    sup=['Tipos del HFVRP; ventanas del VRPTW.', 'Servicio 10 min; tiempo = distancia.', 'Regreso antes de 480.'],
    conj=N_BASE + [('t', 'tipos')], par=P_BASE[:2] + P_T[1:] + [('ea, la, sv', 'ventanas y servicio')], var=[('x(i,j,t) ∈ {0,1}', 'arco por tipo'), ('ql(i), tL(i) ≥ 0', 'carga y hora de llegada')],
    fo='min z = Σ cpk(t)·dist(i,j)·x(i,j,t)', res=TIPO_R + [('tSig(i,j)', 'tL(j) ≥ tL(i) + sv(i) + dist(i,j) − M·(1 − Σ t x(i,j,t))', 'secuencia de tiempos'), ('ventanas', 'ea(i) ≤ tL(i) ≤ la(i)', 'servicio en la ventana'), ('tFin(i)', 'regreso ≤ la(d)', 'cierre del depósito')],
    lect=lambda: [f'Costo {f(Z["hfvrptw"])} (HFVRP sin ventanas: {f(Z["hfvrp"])}).'] + rutas('hfvrptw') + ['Las ventanas obligan a 4 rutas; las cortas usan los vehículos pequeños.'])

# ======================================================================================= 19-21
MD_R = GRADO + [('asig(i)', 'Σ g y(i,g) = 1', 'cada cliente se asigna a un depósito'), ('balDep(g)', 'Σ c x(g,c) = Σ c x(c,g)', 'salen y regresan los mismos al depósito g'), ('salDep, regDep', 'x(g,j) ≤ y(j,g);  x(i,g) ≤ y(i,g)', 'el depósito solo conecta con sus clientes'), ('mismo1, mismo2', '|y(j,g) − y(i,g)| ≤ 1 − x(i,j)', 'clientes consecutivos → mismo depósito'), CARGA, ('flotaDep(g)', 'Σ c x(g,c) ≤ Kd', 'vehículos por depósito')]
mod('mdvrp', cambia='Varios depósitos: y(c,g) asigna cada cliente a un depósito y la ruta vuelve al depósito de donde salió.',
    aplic=['Empresas con varios centros de distribución.', 'Hospitales o bodegas regionales que atienden su zona.', 'Planeación de recolección desde varias bases.'],
    sup=['Depósitos d1 (30, 70) y d2 (72, 30).', 'Q = 15; hasta 3 vehículos por depósito.', 'Cada ruta regresa a su propio depósito.'],
    conj=[('i, j, h', 'nodos: depósitos d1, d2 y clientes'), ('c(i), dp(i)', 'clientes y depósitos (g ∈ dp)')], par=P_BASE + [('Kd', 'vehículos por depósito')], var=[X2, ('y(c,g) ∈ {0,1}', 'el cliente c se atiende desde g'), ('ql(i) ≥ 0', 'carga acumulada')], fo=OBJ_D, res=MD_R,
    lect=lambda: [f'Distancia {f(Z["mdvrp"])} (un solo depósito central: {f(CV)}).'] + rutas('mdvrp') + ['Cada depósito atiende su zona: d1 el noroeste (c9, c10, c1, c2) y d2 el resto.'])

mod('mdvrptw', cambia='MDVRP + ventanas de tiempo; la llegada al primer cliente se mide desde su depósito.',
    aplic=['Redes de distribución con varias bodegas y citas de entrega.', 'Servicios de salud a domicilio desde varias sedes.', 'Logística urbana con microcentros y franjas horarias.'],
    sup=['Depósitos d1 y d2, ventanas del VRPTW.', 'Q = 15; 3 vehículos por depósito.', 'Servicio 10 min; tiempo = distancia.'],
    conj=[('i, j, h', 'nodos'), ('c(i), dp(i)', 'clientes y depósitos')], par=P_BASE + [('ea, la, sv', 'ventanas y servicio'), ('Kd', 'vehículos por depósito')], var=[X2, ('y(c,g)', 'asignación'), ('ql(i), tL(i)', 'carga y hora de llegada')], fo=OBJ_D,
    res=MD_R + [('tIni(g,j)', 'tL(j) ≥ dist(g,j) − M·(1 − x(g,j))', 'llegada desde el depósito'), ('tSig, ventanas', 'como en el VRPTW', 'secuencia y ventanas'), ('tFin(i,g)', 'regreso ≤ la(g)', 'cierre de cada depósito')],
    lect=lambda: [f'Distancia {f(Z["mdvrptw"])} (MDVRP sin ventanas: {f(Z["mdvrp"])}).'] + rutas('mdvrptw') + ['Las ventanas separan c6 en una ruta propia muy corta desde d2.'])

mod('lrp', cambia='MDVRP + decisión de apertura w(g) con costo fijo y capacidad de cada depósito candidato.',
    aplic=['Dónde ubicar centros de distribución considerando las rutas.', 'Diseño de redes de recolección de residuos o reciclaje.', 'Ubicación de bases de emergencia o de mantenimiento.'],
    sup=['Candidatos d1, d2 (apertura 100, capacidad 25) y d3 (160, 40).', 'Q = 15; 3 vehículos por depósito.', 'Costo = apertura + distancia.'],
    conj=[('i, j, h', 'nodos: 3 depósitos candidatos y clientes'), ('c(i), dp(i)', 'clientes y candidatos')], par=P_BASE + [('fA(g), capD(g)', 'costo de apertura y capacidad del depósito')],
    var=[X2, ('y(c,g)', 'asignación'), ('w(g) ∈ {0,1}', '1 si se abre el depósito'), ('ql(i)', 'carga acumulada')], fo='min z = Σ g fA(g)·w(g) + Σ dist(i,j)·x(i,j)',
    res=MD_R + [('abre(c,g)', 'y(c,g) ≤ w(g)', 'solo los depósitos abiertos atienden'), ('capDep(g)', 'Σ c dem(c)·y(c,g) ≤ capD(g)·w(g)', 'capacidad del depósito')],
    lect=lambda: ['Depósitos abiertos: ' + ', '.join(k.upper() for k, v in D['lrp']['par']['abierto'].items() if v > 0.5) + f'. Costo {f(Z["lrp"])} = apertura {f(par("lrp", "costoapertura"))} + rutas {f(par("lrp", "costorutas"))}.'] + rutas('lrp') + ['El depósito central d3 (160) no compensa: dos depósitos periféricos acortan más las rutas.'])

# ======================================================================================= 22-25
mod('vrpb', cambia='Clientes de entrega L y de recogida B; se prohíben los arcos B → L y d → B, y cada carga se controla por separado.',
    aplic=['Distribuidor que reparte y luego recoge envases o devoluciones.', 'Retorno de vehículos con carga de proveedores (backhauling).', 'Logística inversa de reciclaje en la ruta de regreso.'],
    sup=['c1-c6 de entrega y c7-c10 de recogida.', 'Primero todas las entregas, después las recogidas.', 'Q = 15 para cada tipo de carga; K = 5.'],
    conj=N_BASE + [('L(i), B(i)', 'clientes de entrega y de recogida')], par=PAR_CV, var=[X2, ('qL(i), qB(i) ≥ 0', 'carga acumulada de entregas y de recogidas')], fo=OBJ_D,
    res=GRADO + [FLOTA, BAL, ('x(i,j) = 0', 'i ∈ B, j ∈ L  y  i = d, j ∈ B', 'recogidas solo después de las entregas'), ('cargaL(i,j)', 'qL(j) ≥ qL(i) + dem(j) − Q·(1 − x(i,j))', 'entregas ≤ Q'), ('cargaB(i,j)', 'qB(j) ≥ qB(i) + dem(j) − Q·(1 − x(i,j))', 'recogidas ≤ Q')],
    lect=lambda: [f'Distancia {f(Z["vrpb"])} con {len(D["vrpb"]["rutas"])} rutas.'] + [r + f'  (entrega {int(x["entrega"])}, recoge {int(x["recoge"])})' for r, x in zip(rutas('vrpb'), D['vrpb']['rutas'])] + ['Como entregas y recogidas no comparten el espacio a la vez, una ruta lleva 12 + 12 unidades.'])

mod('vrpspd', cambia='Cada cliente entrega y recoge en la misma visita. Dos flujos por arco: D (entregas aún a bordo) y P (recogidas a bordo).',
    aplic=['Reparto de bebidas con devolución de envases.', 'Entrega de equipos nuevos y retiro de los usados.', 'Logística inversa de pallets o canastas.'],
    sup=['Entregas = demandas; recogidas de 4 a 7 (total 56).', 'La carga a bordo cambia a lo largo de la ruta.', 'Q = 15, K = 5.'],
    conj=N_BASE, par=PAR_CV + [('pk(i)', 'cantidad recogida en el cliente')], var=[X2, ('D(i,j), P(i,j) ≥ 0', 'entregas y recogidas a bordo en el arco')], fo=OBJ_D,
    res=GRADO + [FLOTA, BAL, ('flujoD(j)', 'Σ i D(i,j) − Σ h D(j,h) = dem(j)', 'el cliente recibe su entrega'), ('flujoP(j)', 'Σ h P(j,h) − Σ i P(i,j) = pk(j)', 'el cliente entrega su recogida'), ('capArco(i,j)', 'D(i,j) + P(i,j) ≤ Q·x(i,j)', 'carga a bordo ≤ Q y solo en arcos usados'), ('salDepP, llegaDepD', 'Σ P(d,c) = 0;  Σ D(c,d) = 0', 'sale sin recogidas y vuelve sin entregas')],
    lect=lambda: [f'Distancia {f(Z["vrpspd"])} con {len(D["vrpspd"]["rutas"])} rutas (CVRP solo entregas: {f(CV)}).'] + rutas('vrpspd') + ['Las recogidas (56) superan a las entregas (38): la carga máxima a bordo, no la entrega, define las rutas.'])

mod('vrppd', cambia='Pares recogida → entrega en la misma ruta y en ese orden. Índice k de vehículo, orden u(i) y carga a bordo con signo.',
    aplic=['Mensajería puerta a puerta y domicilios.', 'Transporte de pacientes (dial-a-ride).', 'Carga compartida entre proveedores y clientes.'],
    sup=['5 solicitudes: c1→c4, c2→c6, c3→c8, c9→c10, c5→c7.', 'La carga sube en la recogida y baja en la entrega.', 'Q = 15; 3 vehículos.'],
    conj=N_BASE + [('k', 'vehículos'), ('pr(i,j)', 'pares recogida → entrega')], par=P_BASE + [('w(i)', '+dem en la recogida, −dem en la entrega')],
    var=[('x(i,j,k) ∈ {0,1}', 'el vehículo k recorre i → j'), ('u(i) ≥ 0', 'orden de visita'), ('ql(i) ≥ 0', 'carga a bordo al salir de i')], fo='min z = Σ(i,j,k) dist(i,j)·x(i,j,k)',
    res=[('visita(j)', 'Σ(i,k) x(i,j,k) = 1', 'cada punto se visita una vez'), ('flujo(i,k)', 'entra = sale para cada vehículo', 'rutas continuas'), ('salida(k)', 'Σ c x(d,c,k) ≤ 1', 'cada vehículo sale a lo sumo una vez'), ('mismo(i,j,k), (i,j) ∈ pr', 'visita de i por k = visita de j por k', 'recogida y entrega en el mismo vehículo'), ('orden(i,j)', 'u(j) ≥ u(i) + 1 − n·(1 − Σ k x(i,j,k))', 'orden de visita (MTZ)'), ('prec(i,j), (i,j) ∈ pr', 'u(j) ≥ u(i) + 1', 'recoger antes de entregar'), ('cIni, cSig', 'ql(j) = ql(i) + w(j) si se usa i → j', 'carga a bordo exacta'), ('cotas', '0 ≤ ql(i) ≤ Q', 'capacidad')],
    lect=lambda: [f'Distancia {f(Z["vrppd"])}: un solo vehículo atiende las 5 solicitudes.'] + rutas('vrppd') + ['Cada recogida va antes de su entrega (orden u) y la carga a bordo nunca pasa de 12 de 15.'])

mod('sdvrp', cambia='La demanda puede dividirse: e(i,k) es lo que el vehículo k entrega a i. Se necesita índice de vehículo y MTZ por vehículo.',
    aplic=['Clientes con demandas cercanas o mayores a la capacidad del vehículo.', 'Distribución de combustible, cemento o alimentos a granel.', 'Ahorro de vehículos cuando las cargas no encajan bien.'],
    sup=['8 clientes con demandas de 5 a 9 (total 53), Q = 15, 4 vehículos.', 'Un cliente puede recibir de varios vehículos.', 'Se compara con la versión sin división (misma flota).'],
    conj=[('i, j', 'nodos: depósito y c1…c8'), ('k', 'vehículos k1…k4')], par=P_BASE, var=[('x(i,j,k) ∈ {0,1}', 'el vehículo k recorre i → j'), ('e(i,k) ≥ 0', 'cantidad que k entrega a i'), ('u(i,k) ≥ 0', 'orden en la ruta de k')], fo='min z = Σ(i,j,k) dist(i,j)·x(i,j,k)',
    res=[('flujo(i,k), salida(k)', 'entra = sale; a lo sumo una salida', 'rutas continuas por vehículo'), ('demanda(i)', 'Σ k e(i,k) = dem(i)', 'se entrega toda la demanda'), ('soloSiVisita(i,k)', 'e(i,k) ≤ dem(i)·Σ j x(j,i,k)', 'entrega solo si k visita a i'), ('capV(k)', 'Σ c e(c,k) ≤ Q', 'capacidad de cada vehículo'), ('mtzK(i,j,k)', 'u(j,k) ≥ u(i,k) + 1 − n·(1 − x(i,j,k))', 'subtours por vehículo'), ('sin división', 'e(i,k) = dem(i)·v(i,k)', 'versión comparada: todo o nada')],
    lect=lambda: [f'Con división: {f(Z["sdvrp"])}; sin división: {f(par("sdvrp", "distsindiv"))} (ahorro {f(par("sdvrp", "distsindiv") - Z["sdvrp"])}).'] + rutas('sdvrp') + ['c5 (demanda 7) se reparte entre dos vehículos: 6 y 1 unidades, lo que permite llenar ambos.'])

# ======================================================================================= 26-27
mod('pcvrp', cambia='Visitar es opcional: y(i) decide si se atiende al cliente y el objetivo es beneficio − costo.',
    aplic=['Selección de pedidos rentables cuando la flota no alcanza.', 'Visitas comerciales con ingreso esperado por cliente.', 'Recolección selectiva (residuos aprovechables, donaciones).'],
    sup=['Beneficios de 45 a 180; costo 1 $/km.', 'Solo K = 2 vehículos con Q = 15 (no caben los 38).', 'Se maximiza beneficio neto.'],
    conj=N_BASE, par=PAR_CV + [('pr(i)', 'beneficio por visitar'), ('cpk', 'costo por unidad de distancia')], var=[X2, ('y(i) ∈ {0,1}', '1 si se visita el cliente'), ('ql(i) ≥ 0', 'carga acumulada')], fo='max z = Σ c pr(c)·y(c) − cpk·Σ dist(i,j)·x(i,j)',
    res=[('sale(i), entra(i)', 'Σ j x(i,j) = Σ j x(j,i) = y(i)', 'grado 1 solo si se visita'), FLOTA, BAL, CARGA, ('cargaMin/Max(i)', 'dem(i)·y(i) ≤ ql(i) ≤ Q·y(i)', 'carga solo en visitados'), ('arcoY1, arcoY2', 'x(i,j) ≤ y(i);  x(i,j) ≤ y(j)', 'cortes válidos'), ('capTot', 'Σ dem(c)·y(c) ≤ K·Q', 'lo atendido cabe en la flota')],
    lect=lambda: [f'Beneficio neto {f(Z["pcvrp"])} = premios {f(par("pcvrp", "premio"))} − costo {f(par("pcvrp", "costo"))}.', 'Se visitan ' + str(sum(1 for v in D['pcvrp']['var']['y'].values() if v > 0.5 and True) - (1 if D['pcvrp']['var']['y'].get('d') else 0)) + ' de 10 clientes:'] + rutas('pcvrp') + ['Quedan fuera los de menor beneficio relativo a su desvío.'])

mod('top', cambia='Sin costo por distancia: se maximiza el premio y el límite es la distancia L por ruta.',
    aplic=['Vendedores con jornada fija que eligen a qué clientes visitar.', 'Rutas turísticas con tiempo limitado.', 'Inspecciones prioritarias con tiempo de equipo limitado.'],
    sup=['m = 2 vehículos, L = 160 por ruta.', 'Premios del PCVRP; sin capacidad.', 'Visitar es opcional.'],
    conj=N_BASE, par=[P_BASE[0], ('pr(i)', 'premio'), ('m, L', 'vehículos y distancia máxima por ruta')], var=[X2, ('y(i) ∈ {0,1}', 'visita'), ('a(i) ≥ 0', 'distancia acumulada')], fo='max z = Σ c pr(c)·y(c)',
    res=[('sale(i), entra(i)', 'grado = y(i)', 'solo los visitados'), ('flota', 'Σ c x(d,c) ≤ m', 'm vehículos'), BAL] + DIST_R + [('arcoY, cota de a', 'x ≤ y;  a(c) ≤ L − dist(c,d)', 'cortes válidos')],
    lect=lambda: [f'Premio {f(Z["top"],0)} recorriendo {f(par("top", "disttot"))} en total.'] + rutas('top') + ['Ambas rutas quedan cerca del límite de 160; c2, c6 y c7 no caben.'])


def main():
    out = []
    for m in MG.M:
        c = C[m['id']]; d = D[m['id']]
        res = d['res']; prin = res[-1]
        out.append({'id': m['id'], 'num': m['num'], 'sigla': m['sigla'], 'nombre': m['nombre'], 'fam': m['fam'], 'clase': bool(m.get('clase')),
                    'desc': m['desc'], 'ej': m['ej'], 'arch': MG.nombre_archivo(m), 'cambia': c['cambia'], 'aplic': c['aplic'], 'sup': c['sup'],
                    'conj': c['conj'], 'par': c['par'], 'var': c['var'], 'fo': c['fo'], 'res': c['res'], 'lect': c['lect'](),
                    'z': d['z'], 'rutas': [{'ini': r['ini'], 'cli': r['cli'], 'fin': r['fin'], 'dist': r['dist'], 'carga': r['carga']} for r in d['rutas']],
                    'stats': {'vars': prin['n'], 'ecs': prin['m'], 'bin': prin.get('binarias'), 'nodos': prin.get('nodos'), 'tiempo': sum(r['tiempo'] for r in res), 'solves': len(res)}})
    json.dump(out, open(os.path.join(BASE, 'modelos_deck.json'), 'w'), ensure_ascii=False, indent=1)
    for o in out: print(o['num'], o['sigla'], o['lect'][0][:110])


if __name__ == '__main__':
    main()
