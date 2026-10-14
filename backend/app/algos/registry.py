"""Registro de algoritmos: clave → función, categoría, descripción y parámetros editables."""
from __future__ import annotations
import time
from . import paths, trees, flows, structure, location, routing, scenarios
from .common import Ctx, AlgoError, Cancelled

P_SRC = {"name": "source", "label": "Origen (clic izq.)", "type": "node"}
P_TGT = {"name": "target", "label": "Destino (clic der.)", "type": "node"}
P_CRIT = {"name": "criterion", "label": "Criterio", "type": "select", "options": ["cost", "distance", "time", "emissions", "hops"], "default": "cost"}
P_P = {"name": "p", "label": "p (n.º de instalaciones)", "type": "int", "default": 2}
P_MODE = {"name": "mode", "label": "Modo", "type": "select", "options": ["min", "max"], "default": "min"}
P_TL = {"name": "time_limit", "label": "Límite de tiempo (s)", "type": "int", "default": 10}
P_DEPOT = {"name": "depot", "label": "Depósito", "type": "node"}
P_NODES = {"name": "nodes", "label": "Nodos seleccionados", "type": "nodes"}
P_CLOSED = [{"name": "closed_nodes", "label": "Nodos cerrados", "type": "nodes"},
            {"name": "closed_edges", "label": "Aristas cerradas [[u,v],...]", "type": "json"}]

ALGOS = {
    # caminos
    "dijkstra": dict(fn=paths.dijkstra, cat="Caminos", name="Camino mínimo – Dijkstra", params=[P_CRIT, P_SRC, dict(P_TGT, label="Destino (opcional)")]),
    "bellman_ford": dict(fn=paths.bellman_ford, cat="Caminos", name="Camino mínimo/máximo – Bellman-Ford", params=[P_CRIT, P_SRC, dict(P_TGT, label="Destino (opcional)"), P_MODE]),
    "astar": dict(fn=paths.astar, cat="Caminos", name="Camino mínimo – A*", params=[P_CRIT, P_SRC, P_TGT]),
    "floyd_warshall": dict(fn=paths.floyd_warshall, cat="Caminos", name="Todos los caminos mínimos – Floyd-Warshall", params=[P_CRIT, dict(P_SRC, label="Origen (opcional)"), dict(P_TGT, label="Destino (opcional)")]),
    "k_shortest": dict(fn=paths.k_shortest, cat="Caminos", name="k caminos más cortos", params=[P_CRIT, P_SRC, P_TGT, {"name": "k", "label": "k", "type": "int", "default": 3}]),
    "critical_path": dict(fn=paths.critical_path, cat="Caminos", name="Camino crítico (DAG)", params=[dict(P_CRIT, default="time"), dict(P_SRC, label="Inicio (opcional)"), dict(P_TGT, label="Fin (opcional)")]),
    # árboles
    "kruskal": dict(fn=trees.kruskal, cat="Árboles", name="Árbol de valor total mín/máx – Kruskal", params=[P_CRIT, P_MODE]),
    "prim": dict(fn=trees.prim, cat="Árboles", name="Árbol de valor total mín/máx – Prim", params=[P_CRIT, P_MODE, dict(P_SRC, label="Raíz (opcional)")]),
    "sp_tree": dict(fn=trees.sp_tree, cat="Árboles", name="Árbol de caminos mínimos/máx. capacidad – Dijkstra", params=[P_CRIT, P_SRC, P_MODE]),
    # flujos
    "max_flow": dict(fn=flows.max_flow, cat="Flujos", name="Flujo máximo – Ford-Fulkerson/Edmonds-Karp", params=[P_SRC, P_TGT, {"name": "default_capacity", "label": "Capacidad por defecto", "type": "float"}]),
    "min_cut": dict(fn=flows.min_cut, cat="Flujos", name="Corte mínimo s–t", params=[P_SRC, P_TGT, {"name": "default_capacity", "label": "Capacidad por defecto", "type": "float"}]),
    "min_cost_flow": dict(fn=flows.min_cost_flow, cat="Flujos", name="Transbordo equilibrado a costo mínimo", params=[P_CRIT, {"name": "auto_balance", "label": "Equilibrar con nodo ficticio", "type": "bool"}]),
    "transport": dict(fn=flows.transport, cat="Flujos", name="Transporte", params=[P_CRIT]),
    "assignment": dict(fn=flows.assignment, cat="Flujos", name="Asignación (Húngaro)", params=[P_CRIT, {"name": "sources", "label": "Agentes", "type": "nodes"}, {"name": "targets", "label": "Tareas", "type": "nodes"}]),
    # estructura
    "components": dict(fn=structure.components, cat="Estructura", name="Componentes conexas / fuertemente conexas", params=[]),
    "articulation": dict(fn=structure.articulation, cat="Estructura", name="Puntos de articulación y puentes", params=[]),
    "degrees": dict(fn=structure.degrees, cat="Estructura", name="Grados y centralidad", params=[P_CRIT]),
    "diameter": dict(fn=structure.diameter, cat="Estructura", name="Diámetro, radio y centro", params=[P_CRIT]),
    "cycles": dict(fn=structure.cycles, cat="Estructura", name="Ciclos", params=[]),
    "euler": dict(fn=structure.euler, cat="Estructura", name="Circuito euleriano – Hierholzer", params=[dict(P_SRC, label="Inicio (opcional)")]),
    "coloring": dict(fn=structure.coloring, cat="Estructura", name="Coloreo exacto (modelo entero) vs DSATUR", params=[P_TL]),
    # localización
    "p_median": dict(fn=location.p_median, cat="Localización", name="p-mediana – MILP", params=[P_CRIT, P_P, {"name": "candidates", "label": "Candidatas", "type": "nodes"}, {"name": "customers", "label": "Clientes", "type": "nodes"}, P_TL]),
    "p_center": dict(fn=location.p_center, cat="Localización", name="p-centro – MILP", params=[P_CRIT, P_P, {"name": "candidates", "label": "Candidatas", "type": "nodes"}, P_TL]),
    "max_cover": dict(fn=location.max_cover, cat="Localización", name="Cobertura máxima – MILP", params=[P_CRIT, P_P, {"name": "radius", "label": "Radio de cobertura", "type": "float"}, P_TL]),
    "fixed_charge": dict(fn=location.fixed_charge, cat="Localización", name="Localización a costo mínimo – MILP", params=[P_CRIT, {"name": "fixed_cost", "label": "Costo fijo por instalación", "type": "float"}, {"name": "facility_capacity", "label": "Capacidad de instalación (opcional)", "type": "float"}, {"name": "candidates", "label": "Candidatas", "type": "nodes"}, P_TL]),
    # rutas
    "tsp": dict(fn=routing.tsp, cat="Rutas", name="Viajante de comercio (TSP)", params=[P_DEPOT, P_NODES, P_TL]),
    "mtsp": dict(fn=routing.mtsp, cat="Rutas", name="m viajantes (m-TSP)", params=[P_DEPOT, P_NODES, {"name": "m", "label": "m (n.º de rutas)", "type": "int", "default": 2}, P_TL]),
    "cvrp": dict(fn=routing.cvrp, cat="Rutas", name="VRP con capacidad (CVRP)", params=[P_DEPOT, P_NODES, {"name": "capacity", "label": "Capacidad", "type": "float"}, {"name": "n_vehicles", "label": "N.º de vehículos", "type": "int"}, P_TL]),
    "vrpspd": dict(fn=routing.vrpspd, cat="Rutas", name="VRP recogida y entrega (VRPSPD)", params=[P_DEPOT, P_NODES, {"name": "capacity", "label": "Capacidad", "type": "float"}, {"name": "n_vehicles", "label": "N.º de vehículos", "type": "int"}, P_TL]),
    "vrptw": dict(fn=routing.vrptw, cat="Rutas", name="VRP con ventanas horarias (VRPTW)", params=[P_DEPOT, P_NODES, {"name": "capacity", "label": "Capacidad", "type": "float"}, {"name": "n_vehicles", "label": "N.º de vehículos", "type": "int"}, P_TL]),
    "hetero": dict(fn=routing.hetero, cat="Rutas", name="VRP flota heterogénea", params=[P_DEPOT, P_NODES, P_TL]),
    "multidepot": dict(fn=routing.multidepot, cat="Rutas", name="VRP multi-depósito", params=[{"name": "depots", "label": "Depósitos", "type": "nodes"}, P_NODES, P_TL]),
    "periodic": dict(fn=routing.periodic, cat="Rutas", name="VRP periódico", params=[P_DEPOT, {"name": "days", "label": "Días", "type": "int", "default": 5}, {"name": "capacity", "label": "Capacidad", "type": "float"}, P_TL]),
    "fstsp": dict(fn=routing.fstsp, cat="Rutas", name="Camión + drones (FSTSP)", params=[P_DEPOT, {"name": "n_drones", "label": "Drones", "type": "int", "default": 2}, {"name": "drone_speed", "label": "Vel. dron (km/h)", "type": "float", "default": 60}, {"name": "drone_endurance", "label": "Autonomía dron (min)", "type": "float", "default": 30}, P_TL]),
    "chinese_postman": dict(fn=routing.chinese_postman, cat="Rutas", name="Cartero chino", params=[P_CRIT]),
    "rural_postman": dict(fn=routing.rural_postman, cat="Rutas", name="Cartero rural", params=[P_CRIT, {"name": "required_edges", "label": "Aristas obligatorias [[u,v],...]", "type": "json"}]),
    # escenarios
    "failure": dict(fn=scenarios.failure, cat="Escenarios", name="Falla de nodos/aristas", params=[P_CRIT] + P_CLOSED),
    "resilience": dict(fn=scenarios.resilience, cat="Escenarios", name="Resiliencia: enlaces a agregar", params=[{"name": "max_links", "label": "Máx. enlaces", "type": "int", "default": 10}]),
    "fleet_change": dict(fn=scenarios.fleet_change, cat="Escenarios", name="Cambio de flota", params=[P_DEPOT, {"name": "fleets", "label": "Flotas {nombre:[vehículos]}", "type": "json"}, P_TL]),
    "sensitivity": dict(fn=scenarios.sensitivity, cat="Escenarios", name="Sensibilidad a costos", params=[{"name": "algorithm", "label": "Algoritmo", "type": "text"}, {"name": "param", "label": "Parámetro", "type": "text", "default": "c_km"}, {"name": "values", "label": "Factores", "type": "json"}]),
}

_CLOSED_ALL = [P_CLOSED[0], P_CLOSED[1]]
for k, a in ALGOS.items():
    if a["cat"] != "Escenarios":
        a["params"] = a["params"] + _CLOSED_ALL


def catalog():
    return [{"key": k, "name": a["name"], "category": a["cat"], "params": a["params"]} for k, a in ALGOS.items()]


def run(key: str, project: dict, params: dict | None = None, progress=None, cancel=None) -> dict:
    if key not in ALGOS:
        raise AlgoError(f"Algoritmo desconocido: {key}")
    params = dict(params or {})
    ctx = Ctx(project, params, progress, cancel)
    if not project["nodes"]:
        raise AlgoError("El proyecto no tiene nodos.")
    if not project["edges"]:
        raise AlgoError("El proyecto no tiene aristas. Genere el grafo (k-vecinos, umbral, Delaunay o completo) o cargue aristas/matriz.")
    warn = []
    ncl = len(params.get("nodes") or project["nodes"])
    if ALGOS[key]["cat"] == "Rutas" and ncl > 200:
        warn.append(f"Aviso: {ncl} nodos en un problema de rutas (recomendado ≤200 clientes); el tiempo de cómputo puede ser alto y la calidad depende del límite de tiempo.")
    if len(project["nodes"]) > 500:
        warn.append(f"Aviso: {len(project['nodes'])} nodos; las vistas gráficas se recomiendan hasta ~500.")
    t0 = time.time()
    res = ALGOS[key]["fn"](ctx)
    res["warnings"] = warn
    res["algorithm"] = res.get("algorithm") or key
    res["key"] = key
    res["elapsed_s"] = round(time.time() - t0, 3)
    res["run_params"] = {k: v for k, v in params.items()}
    res["run_params"].setdefault("seed", ctx.seed)
    res["run_params"].setdefault("criterion", ctx.criterion)
    return res
