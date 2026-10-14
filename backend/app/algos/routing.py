"""Rutas: TSP, m-TSP, CVRP, VRPSPD, VRPTW, flota heterogénea, multi-depósito, VRP periódico, FSTSP,
cartero chino y rural, con OR-Tools (guided local search, límite fijo de soluciones, determinista)."""
from __future__ import annotations
import itertools
import math
import networkx as nx
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from .common import *
from ..graphs import undirected_view

INF = 10 ** 12


# ---------- matrices sobre nodos seleccionados ----------

class Mats:
    """Costo/km/tiempo entre nodos seleccionados, medidos a lo largo del camino de costo mínimo."""

    def __init__(self, ctx: Ctx, nodes: list[str]):
        self.g = ctx.graph("cost")
        self.nodes = nodes
        self.idx = {n: i for i, n in enumerate(nodes)}
        n = len(nodes)
        self.cost = [[0.0] * n for _ in range(n)]
        self.km = [[0.0] * n for _ in range(n)]
        self.time = [[0.0] * n for _ in range(n)]
        self.em = [[0.0] * n for _ in range(n)]
        self.paths = {}
        miss = []
        for i, a in enumerate(nodes):
            if a not in self.g:
                raise AlgoError(f"El nodo {a} está cerrado o no existe en la red.")
            dist, pth = nx.single_source_dijkstra(self.g, a, weight="w")
            for j, b in enumerate(nodes):
                if i == j:
                    continue
                if b not in dist:
                    miss.append((a, b))
                    self.cost[i][j] = INF
                    self.km[i][j] = INF
                    self.time[i][j] = INF
                    continue
                path = pth[b]
                self.paths[(a, b)] = path
                t = path_totals(self.g, path)
                self.cost[i][j] = t["cost"] or dist[b]
                self.km[i][j] = t["distance"]
                self.time[i][j] = t["time"]
                self.em[i][j] = t["emissions"]
        if miss:
            raise AlgoError(f"Hay pares inalcanzables (p. ej. {miss[0][0]}→{miss[0][1]}): el grafo no permite conectar todos los nodos seleccionados.")

    def expand(self, seq: list[str]) -> list[str]:
        out = [seq[0]]
        for a, b in zip(seq[:-1], seq[1:]):
            if a == b:
                continue
            out += self.paths[(a, b)][1:]
        return out


def _depot(ctx: Ctx) -> str:
    d = ctx.node("depot", required=False) or ctx.node("source", required=False)
    if d:
        return d
    deps = [x for x in ctx.p["params"].get("depots", []) if x in ctx.idset]
    return deps[0] if deps else ctx.ids[0]


def _customers(ctx: Ctx, depots) -> list[str]:
    sel = ctx.selection("nodes")
    if sel:
        return [x for x in sel if x not in depots]
    with_dem = [n["id"] for n in ctx.p["nodes"] if n["id"] not in depots and
                ((n.get("demand") or 0) > 0 or (n.get("supply") or 0) > 0)]
    if with_dem and ctx.params.get("only_with_demand", True):
        return with_dem
    return [i for i in ctx.ids if i not in depots]


def _fleet(ctx: Ctx, ncust: int, default_cap=None):
    """Vehículos individuales. Un 'capacity' explícito en los parámetros reemplaza la flota del proyecto."""
    explicit = ctx.params.get("capacity") is not None and not ctx.params.get("vehicles")
    vs = ctx.params.get("vehicles") or ([] if explicit else ctx.p.get("vehicles") or [])
    out = []
    for v in vs:
        cnt = int(v.get("count") or 1)
        for k in range(cnt):
            out.append({**v, "label": f"{v.get('type', 'Vehículo')} #{k + 1}" if cnt > 1 else v.get("type", "Vehículo")})
    if not out:
        cap = ctx.params.get("capacity", default_cap)
        if ctx.params.get("n_vehicles"):
            nveh = int(ctx.params["n_vehicles"])
        else:
            tot = sum((n.get("demand") or n.get("supply") or 0) for n in ctx.p["nodes"])
            nveh = max(1, min(ncust, math.ceil(tot / cap) + 1)) if cap else min(max(ncust, 1), 10)
        out = [{"type": "Vehículo", "capacity": cap, "label": f"Vehículo {i + 1}"} for i in range(nveh)]
    return out


def _cap_scale(values):
    """Factor para volver enteras las cantidades (0.01 de resolución)."""
    vals = [v for v in values if v]
    if all(abs(v - round(v)) < 1e-9 for v in vals):
        return 1
    return 100


# ---------- TSP ----------

def _held_karp(C):
    n = len(C)
    full = (1 << (n - 1)) - 1
    dp = {}
    for j in range(1, n):
        dp[(1 << (j - 1), j)] = (C[0][j], 0)
    for mask in range(1, full + 1):
        for j in range(1, n):
            if not mask & (1 << (j - 1)):
                continue
            if (mask, j) not in dp:
                continue
            c0, _ = dp[(mask, j)]
            for k in range(1, n):
                if mask & (1 << (k - 1)):
                    continue
                nm = mask | (1 << (k - 1))
                nc = c0 + C[j][k]
                if (nm, k) not in dp or nc < dp[(nm, k)][0]:
                    dp[(nm, k)] = (nc, j)
    best, last = min((dp[(full, j)][0] + C[j][0], j) for j in range(1, n))
    seq, mask, j = [], full, last
    while j != 0:
        seq.append(j)
        c, pj = dp[(mask, j)]
        mask ^= 1 << (j - 1)
        j = pj
    seq.reverse()
    return best, [0] + seq + [0]


def _routing_params(ctx):
    sp = pywrapcp.DefaultRoutingSearchParameters()
    sp.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    sp.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    sp.time_limit.FromSeconds(max(1, ctx.time_limit))
    sp.solution_limit = int(ctx.params.get("solution_limit", 2000))   # límite fijo → reproducible
    return sp


def tsp(ctx: Ctx):
    depot = _depot(ctx)
    sel = ctx.selection("nodes")
    nodes = [depot] + [x for x in (sel or ctx.ids) if x != depot]
    if len(nodes) < 3:
        raise AlgoError("TSP requiere al menos 3 nodos (el origen y 2 más).")
    M = Mats(ctx, nodes)
    n = len(nodes)
    exact_limit = int(ctx.params.get("exact_limit", 12))
    if n <= exact_limit:
        best, seq = _held_karp(M.cost)
        status, method = "optimal", f"programación dinámica Held-Karp (exacto, n={n})"
    else:
        S = 1000
        man = pywrapcp.RoutingIndexManager(n, 1, 0)
        rt = pywrapcp.RoutingModel(man)
        cb = rt.RegisterTransitCallback(lambda i, j: int(round(M.cost[man.IndexToNode(i)][man.IndexToNode(j)] * S)))
        rt.SetArcCostEvaluatorOfAllVehicles(cb)
        sol = rt.SolveWithParameters(_routing_params(ctx))
        if sol is None:
            raise AlgoError("OR-Tools no encontró un tour.")
        seq, i = [], rt.Start(0)
        while not rt.IsEnd(i):
            seq.append(man.IndexToNode(i))
            i = sol.Value(rt.NextVar(i))
        seq.append(0)
        best = sum(M.cost[a][b] for a, b in zip(seq[:-1], seq[1:]))
        status, method = "heuristic", "OR-Tools (PATH_CHEAPEST_ARC + guided local search)"
    tour = [nodes[i] for i in seq]
    full = M.expand(tour)
    res = new_result("tsp", "Viajante de comercio (TSP) a costo mínimo", status)
    res["value"] = best
    tot = {"distance": sum(M.km[a][b] for a, b in zip(seq[:-1], seq[1:])),
           "time": sum(M.time[a][b] for a, b in zip(seq[:-1], seq[1:]))}
    res["paths"].append({"label": "tour", "nodes": full, "stops": tour, "cost": best, "totals": {"w": best, **tot}})
    res["highlight_edges"] = [[a, b, "tour"] for a, b in zip(full[:-1], full[1:])]
    res["tables"].append({"title": "Orden de visita", "columns": ["Parada", "Nodo", "Tramo (costo)", "Acumulado"],
                          "rows": _tour_rows(ctx, M, seq, nodes)})
    res["message"] = f"Tour de costo {fmt(best)} ({fmt(tot['distance'])} km): " + " > ".join(tour)
    res["meta"].update(method=method, depot=depot)
    res["control"] += [{"name": "Costo del tour", "value": best}, {"name": "Costo escalado (entero)", "value": scaled(ctx, best)}]
    res["assumptions"] = [f"Método: {method}", "Costos entre nodos = camino mínimo de la red",
                          "Óptimo probado" if status == "optimal" else f"Heurístico: sin garantía de optimalidad (límite de {ctx.params.get('solution_limit', 2000)} soluciones, {ctx.time_limit}s)"]
    for k, (a, b) in enumerate(zip(tour[:-1], tour[1:])):
        step(res, f"Parada {k + 1}: {ctx.label(a)} → {ctx.label(b)} (costo {fmt(M.cost[seq[k]][seq[k + 1]])})", nodes=[b], edges=[(a, b)], state="accepted")
    return res


def _tour_rows(ctx, M, seq, nodes):
    acc, rows = 0.0, []
    for k, (a, b) in enumerate(zip(seq[:-1], seq[1:])):
        acc += M.cost[a][b]
        rows.append([k + 1, ctx.label(nodes[b]), fmt(M.cost[a][b]), fmt(acc)])
    return rows


# ---------- VRP general ----------

def solve_vrp(ctx: Ctx, mode: str = "cvrp") -> dict:
    """mode: cvrp | vrpspd | vrptw | mtsp | hetero | multidepot (las banderas se derivan de los datos)."""
    params = ctx.params
    depot_ids = [d for d in (params.get("depots") or ctx.p["params"].get("depots") or []) if d in ctx.idset]
    if mode == "multidepot" and len(depot_ids) < 2:
        raise AlgoError("Multi-depósito requiere ≥2 depósitos (parámetro 'depots' o nodos tipo depósito).")
    main = _depot(ctx)
    depots = depot_ids if mode == "multidepot" else [main]
    custs = _customers(ctx, depots)
    if not custs:
        raise AlgoError("No hay clientes: marque nodos con demanda o indique 'nodes'.")
    nodes = list(dict.fromkeys(depots + custs))
    M = Mats(ctx, nodes)
    by = {n["id"]: n for n in ctx.p["nodes"]}
    N = len(nodes)
    fleet = _fleet(ctx, len(custs), params.get("capacity"))
    use_tw = mode == "vrptw" or params.get("time_windows")
    spd = mode == "vrpspd"
    if mode == "mtsp":
        for v in fleet:
            v["capacity"] = None
        fleet = fleet[:int(params.get("m", params.get("n_vehicles", 2)))]
    dem = [0] * N
    pick = [0] * N
    unitsf = _cap_scale([by[x].get("demand") for x in nodes] + [by[x].get("supply") for x in nodes] + [v.get("capacity") for v in fleet])
    for i, x in enumerate(nodes):
        if x in depots:
            continue
        d, s = by[x].get("demand") or 0, by[x].get("supply") or 0
        if spd:
            dem[i], pick[i] = int(round(d * unitsf)), int(round(s * unitsf))
        else:
            dem[i] = int(round((d if d else s) * unitsf)) if mode != "mtsp" else 0
    capped = any(v.get("capacity") for v in fleet)
    # diagnóstico previo de factibilidad
    if capped and mode != "mtsp":
        maxcap = max((v.get("capacity") or 0) for v in fleet) * unitsf
        for i, x in enumerate(nodes):
            need = max(dem[i], pick[i])
            if need > maxcap + 1e-9:
                raise AlgoError(f"Infactible: la demanda de {ctx.label(x)} ({fmt(need / unitsf)}) excede la mayor capacidad de la flota ({fmt(maxcap / unitsf)}).")
        tot = sum(dem) if not spd else max(sum(dem), sum(pick))
        fcap = sum((v.get("capacity") or 0) for v in fleet) * unitsf
        if tot > fcap + 1e-9:
            raise AlgoError(f"Infactible: la demanda total ({fmt(tot / unitsf)}) excede la capacidad total de la flota ({fmt(fcap / unitsf)}). Agregue vehículos.")
    V = len(fleet)
    starts, ends = [], []
    for k, v in enumerate(fleet):
        dv = v.get("depot")
        d = dv if dv in nodes else depots[k % len(depots)]
        starts.append(nodes.index(d))
        ends.append(nodes.index(d))
    man = pywrapcp.RoutingIndexManager(N, V, starts, ends)
    rt = pywrapcp.RoutingModel(man)
    S = 1000 if ctx.scale < 100 else ctx.scale
    c_hora = ctx.p["params"].get("c_hora", 0.0)
    cbs = {}
    for k, v in enumerate(fleet):
        key = (v.get("cost_per_km"), v.get("speed"))
        if key not in cbs:
            cpk = v.get("cost_per_km")

            def mk(cpk=cpk, sp=v.get("speed")):
                def f(i, j):
                    a, b = man.IndexToNode(i), man.IndexToNode(j)
                    if cpk is None:
                        return int(round(M.cost[a][b] * S))
                    tm = M.km[a][b] * 60 / sp if sp else M.time[a][b]
                    return int(round((cpk * M.km[a][b] + c_hora * tm / 60) * S))
                return f
            cbs[key] = rt.RegisterTransitCallback(mk())
        rt.SetArcCostEvaluatorOfVehicle(cbs[key], k)
        fc = v.get("fixed_cost")
        if fc:
            rt.SetFixedCostOfVehicle(int(round(fc * S)), k)
    # capacidad
    if capped and mode != "mtsp" and not spd:
        dcb = rt.RegisterUnaryTransitCallback(lambda i: dem[man.IndexToNode(i)])
        rt.AddDimensionWithVehicleCapacity(dcb, 0, [int(round((v.get("capacity") or 10 ** 9) * unitsf)) for v in fleet], True, "Cap")
    if spd:
        capv = [int(round((v.get("capacity") or 10 ** 9) * unitsf)) for v in fleet]
        pcb = rt.RegisterUnaryTransitCallback(lambda i: pick[man.IndexToNode(i)])
        rt.AddDimensionWithVehicleCapacity(pcb, 0, capv, True, "Pick")
        dcb2 = rt.RegisterUnaryTransitCallback(lambda i: dem[man.IndexToNode(i)])
        rt.AddDimensionWithVehicleCapacity(dcb2, 0, capv, True, "Del")
        A, B, sol_ = rt.GetDimensionOrDie("Pick"), rt.GetDimensionOrDie("Del"), rt.solver()
        for k in range(V):
            sol_.Add(B.CumulVar(rt.End(k)) <= capv[k])          # carga al salir del depósito
            for i in range(N):
                if i in set(starts):
                    continue
                idx = man.NodeToIndex(i)
                # carga tras atender i: recogido hasta i (incl.) + entregas pendientes (excl. i)
                sol_.Add(sol_.ConditionalExpression(rt.VehicleVar(idx) == k,
                                                    A.CumulVar(idx) + pick[i] + B.CumulVar(rt.End(k)) - B.CumulVar(idx) - dem[i],
                                                    0) <= capv[k])
    # tiempo / ventanas
    if use_tw or any(v.get("range") for v in fleet) or params.get("max_route_time"):
        tcb = {}
        for k, v in enumerate(fleet):
            sp = v.get("speed")
            key = sp
            if key not in tcb:
                def mkt(sp=sp):
                    def f(i, j):
                        a, b = man.IndexToNode(i), man.IndexToNode(j)
                        t = M.km[a][b] * 60 / sp if sp else M.time[a][b]
                        return int(round(t + (by[nodes[a]].get("service") or 0)))
                    return f
                tcb[key] = rt.RegisterTransitCallback(mkt())
        horizon = int(params.get("horizon", 24 * 60))
        rt.AddDimensionWithVehicleTransitAndCapacity([tcb[v.get("speed")] for v in fleet], horizon, [horizon] * V, False, "Time")
        T = rt.GetDimensionOrDie("Time")
        if use_tw:
            for i, x in enumerate(nodes):
                a, b = by[x].get("tw_start"), by[x].get("tw_end")
                if (a is not None or b is not None) and x not in depots:
                    T.CumulVar(man.NodeToIndex(i)).SetRange(int(a or 0), int(b if b is not None else horizon))
        mrt = params.get("max_route_time")
        if mrt:
            for k in range(V):
                T.CumulVar(rt.End(k)).SetMax(int(mrt))
    if any(v.get("range") for v in fleet):
        dcb3 = {}
        for k, v in enumerate(fleet):
            dcb3[k] = rt.RegisterTransitCallback(lambda i, j: int(round(M.km[man.IndexToNode(i)][man.IndexToNode(j)] * 100)))
        rt.AddDimensionWithVehicleTransitAndCapacity([dcb3[k] for k in range(V)], 0,
                                                     [int(round((v.get("range") or 10 ** 6) * 100)) for v in fleet], True, "Range")
    if mode == "mtsp" and V <= len(custs):      # m-TSP: cada viajante debe usarse
        for k in range(V):
            rt.solver().Add(rt.NextVar(rt.Start(k)) != rt.End(k))
    pen = params.get("penalty")
    if pen is not None:
        for i, x in enumerate(nodes):
            if x not in depots:
                rt.AddDisjunction([man.NodeToIndex(i)], int(round(float(pen) * S)))
    time_dim = None
    if use_tw or any(v.get("range") for v in fleet) or params.get("max_route_time"):
        time_dim = rt.GetDimensionOrDie("Time")
    ctx.progress(0.3, "Optimizando rutas")
    sol = rt.SolveWithParameters(_routing_params(ctx))
    if sol is None:
        why = "Con ventanas horarias: revise que las ventanas y tiempos de servicio sean compatibles." if use_tw else \
            "Revise capacidades, autonomía y número de vehículos."
        raise AlgoError("OR-Tools no encontró solución factible. " + why)
    ctx.progress(0.9)
    routes, unserved = [], []
    served = set()
    total_cost = total_km = total_t = total_em = 0.0
    for k, v in enumerate(fleet):
        i, seq, arr = rt.Start(k), [], []
        Tdim = time_dim
        while not rt.IsEnd(i):
            seq.append(man.IndexToNode(i))
            arr.append(sol.Min(Tdim.CumulVar(i)) if Tdim else None)
            i = sol.Value(rt.NextVar(i))
        seq.append(man.IndexToNode(i))
        arr.append(sol.Min(Tdim.CumulVar(i)) if Tdim else None)
        if len(seq) <= 2:
            continue
        cost = km = tm = em = 0.0
        for a, b in zip(seq[:-1], seq[1:]):
            km += M.km[a][b]
            tm += M.time[a][b]
            em += M.em[a][b]
            cpk = v.get("cost_per_km")
            cost += M.cost[a][b] if cpk is None else cpk * M.km[a][b] + c_hora * (M.km[a][b] * 60 / v["speed"] if v.get("speed") else M.time[a][b]) / 60
        cost += v.get("fixed_cost") or 0
        if v.get("emissions_per_km"):
            em = v["emissions_per_km"] * km
        stops = [nodes[a] for a in seq]
        for a in seq:
            served.add(nodes[a])
        load = sum(dem[a] for a in seq) / unitsf
        routes.append({"vehicle": k + 1, "label": v["label"], "type": v.get("type"), "stops": stops,
                       "nodes": M.expand(stops), "cost": cost, "km": km, "time_min": tm, "emissions": em,
                       "load": load, "arrivals": arr, "pickup": sum(pick[a] for a in seq) / unitsf if spd else None,
                       "capacity": v.get("capacity")})
        total_cost += cost
        total_km += km
        total_t += tm
        total_em += em
    unserved = [x for x in custs if x not in served]
    return {"routes": routes, "unserved": unserved, "cost": total_cost, "km": total_km, "time": total_t,
            "emissions": total_em, "M": M, "nodes": nodes, "depots": depots, "fleet": fleet, "mode": mode}


def vrp(ctx: Ctx, mode: str = "cvrp"):
    names = {"cvrp": "VRP con capacidad (CVRP)", "vrpspd": "VRP con recogida y entrega (VRPSPD)",
             "vrptw": "VRP con ventanas horarias (VRPTW)", "mtsp": "m viajantes de comercio (m-TSP)",
             "hetero": "VRP con flota heterogénea", "multidepot": "VRP multi-depósito"}
    sv = solve_vrp(ctx, mode)
    res = new_result(mode, names[mode] + " – OR-Tools", "heuristic", ctx.p["params"].get("currency", ""))
    colors = {}
    for r in sv["routes"]:
        lab = f"{r['label']}"
        res["paths"].append({"label": lab, "nodes": r["nodes"], "stops": r["stops"], "cost": r["cost"],
                             "vehicle": r["vehicle"], "totals": {"w": r["cost"], "distance": r["km"], "time": r["time_min"],
                                                                "emissions": r["emissions"]},
                             "load": r["load"], "capacity": r["capacity"], "arrivals": r["arrivals"]})
        res["highlight_edges"] += [[a, b, f"veh{r['vehicle']}"] for a, b in zip(r["nodes"][:-1], r["nodes"][1:])]
        res["tables"].append({"title": f"Ruta {r['vehicle']} – {lab}",
                              "columns": ["Parada", "Nodo", "Tramo costo", "Tramo km", "Acumulado km"] + (["Llegada (min)"] if r["arrivals"][0] is not None else []),
                              "rows": [row + ([fmt(a)] if r["arrivals"][0] is not None else []) for row, a in zip(_route_rows(ctx, sv["M"], r["stops"]), r["arrivals"])]})
        step(res, f"{lab}: " + " > ".join(r["stops"]) + f" | {fmt(r['km'])} km, costo {fmt(r['cost'])}, carga {fmt(r['load'])}",
             nodes=r["stops"], edges=list(zip(r["nodes"][:-1], r["nodes"][1:])), state="accepted")
    if sv["unserved"]:
        res["message"] = f"ATENCIÓN: {len(sv['unserved'])} clientes sin servir: {sv['unserved']}. "
    res["value"] = sv["cost"]
    res["message"] += (f"{len(sv['routes'])} ruta(s), {fmt(sv['km'])} km, costo total {fmt(sv['cost'])}, "
                       f"{fmt(sv['time'])} min de conducción, {fmt(sv['emissions'])} de emisiones.")
    res["tables"].insert(0, {"title": "Resumen de rutas", "columns": ["Ruta", "Vehículo", "Paradas", "Carga", "Km", "Tiempo (min)", "Costo"],
                             "rows": [[r["vehicle"], r["label"], len(r["stops"]) - 2, fmt(r["load"]), fmt(r["km"]), fmt(r["time_min"]), fmt(r["cost"])]
                                      for r in sv["routes"]]})
    res["meta"].update(routes=len(sv["routes"]), km=sv["km"], time_min=sv["time"], emissions=sv["emissions"],
                       unserved=sv["unserved"], depots=sv["depots"])
    res["control"] += [{"name": "Rutas", "value": len(sv["routes"])}, {"name": "Distancia total (km)", "value": round(sv["km"], 2)},
                       {"name": "Costo total", "value": round(sv["cost"], 2)}]
    res["assumptions"] = ["HEURÍSTICO: guided local search de OR-Tools; no es óptimo probado",
                          f"Límite fijo de {ctx.params.get('solution_limit', 2000)} soluciones y {ctx.time_limit}s para reproducibilidad",
                          "Costos entre clientes = camino mínimo de la red"]
    return res


def _route_rows(ctx, M, stops):
    acc, rows = 0.0, []
    for k in range(len(stops)):
        if k == 0:
            rows.append([k, ctx.label(stops[0]), "—", "—", 0])
            continue
        a, b = M.idx[stops[k - 1]], M.idx[stops[k]]
        acc += M.km[a][b]
        rows.append([k, ctx.label(stops[k]), fmt(M.cost[a][b]), fmt(M.km[a][b]), fmt(acc)])
    return rows


def cvrp(ctx): return vrp(ctx, "cvrp")
def vrpspd(ctx): return vrp(ctx, "vrpspd")
def vrptw(ctx): return vrp(ctx, "vrptw")
def mtsp(ctx): return vrp(ctx, "mtsp")
def hetero(ctx): return vrp(ctx, "hetero")
def multidepot(ctx): return vrp(ctx, "multidepot")


def periodic(ctx: Ctx):
    """VRP periódico: cada cliente con frecuencia f se visita en f días espaciados; se resuelve un CVRP por día."""
    D = int(ctx.params.get("days", 5))
    depot = _depot(ctx)
    custs = _customers(ctx, [depot])
    by = {n["id"]: n for n in ctx.p["nodes"]}
    plan = {d: [] for d in range(D)}
    load = [0.0] * D
    for c in sorted(custs, key=lambda x: -(by[x].get("frequency") or 1)):
        f = int(min(max(by[c].get("frequency") or ctx.params.get("default_frequency", 1), 1), D))
        best = None
        for off in range(D):   # patrón: días espaciados desde un desfase; se elige el desfase de menor carga
            days = sorted({(off + round(k * D / f)) % D for k in range(f)})
            if len(days) != f:
                continue
            cost = sum(load[d] for d in days)
            if best is None or cost < best[0]:
                best = (cost, days)
        for d in best[1]:
            plan[d].append(c)
            load[d] += by[c].get("demand") or 1
    res = new_result("periodic", f"VRP periódico ({D} días)", "heuristic")
    tot_cost = tot_km = 0.0
    rows = []
    for d in range(D):
        if not plan[d]:
            rows.append([d + 1, 0, 0, 0, 0])
            continue
        sub = Ctx(ctx.p, {**ctx.params, "nodes": plan[d], "depot": depot, "time_limit": max(1, ctx.time_limit // D)})
        sv = solve_vrp(sub, "cvrp")
        tot_cost += sv["cost"]
        tot_km += sv["km"]
        rows.append([d + 1, len(plan[d]), len(sv["routes"]), fmt(sv["km"]), fmt(sv["cost"])])
        for r in sv["routes"]:
            res["paths"].append({"label": f"Día {d + 1} – {r['label']}", "nodes": r["nodes"], "stops": r["stops"], "cost": r["cost"],
                                 "vehicle": r["vehicle"], "totals": {"w": r["cost"], "distance": r["km"], "time": r["time_min"]}, "day": d + 1})
            res["highlight_edges"] += [[a, b, f"dia{d + 1}"] for a, b in zip(r["nodes"][:-1], r["nodes"][1:])]
        step(res, f"Día {d + 1}: {len(plan[d])} clientes, {len(sv['routes'])} ruta(s), {fmt(sv['km'])} km", nodes=plan[d], state="accepted")
    res["tables"].append({"title": "Plan semanal", "columns": ["Día", "Clientes", "Rutas", "Km", "Costo"], "rows": rows})
    res["value"] = tot_cost
    res["message"] = f"Plan de {D} días: {fmt(tot_km)} km y costo {fmt(tot_cost)} en total."
    res["assumptions"] = ["HEURÍSTICO: asignación de patrones de visita por balance de carga + CVRP diario con OR-Tools",
                          "Frecuencia f = columna 'frequency' (visitas por semana)"]
    return res


# ---------- FSTSP (camión + dron) ----------

def fstsp(ctx: Ctx):
    """Camión + drones (Flying Sidekick TSP). Heurístico: TSP del camión y salidas de dron voraces,
    evaluadas con una simulación temporal (el camión espera al dron en el punto de recuperación)."""
    p = ctx.params
    depot = _depot(ctx)
    custs = _customers(ctx, [depot])
    by = {n["id"]: n for n in ctx.p["nodes"]}
    nodes = [depot] + custs
    M = Mats(ctx, nodes)
    ndr = int(p.get("n_drones", 2))
    v_dr = float(p.get("drone_speed", 60.0))        # km/h
    endur = float(p.get("drone_endurance", 30.0))   # min
    cap = p.get("drone_capacity")
    t_l, t_r = float(p.get("launch_time", 1.0)), float(p.get("recovery_time", 1.0))
    window = int(p.get("max_span", 8))
    from ..model import haversine

    def flight_km(a, b):
        A, B = by[a], by[b]
        if A.get("lat") is not None and B.get("lat") is not None:
            return haversine(A["lat"], A["lon"], B["lat"], B["lon"])
        return M.km[M.idx[a]][M.idx[b]] / max(ctx.p["params"].get("road_factor", 1.0), 1.0)

    sub = Ctx(ctx.p, {**p, "nodes": custs, "depot": depot})
    base = tsp(sub)
    base_seq = base["paths"][0]["stops"][:-1]
    tt = lambda a, b: M.time[M.idx[a]][M.idx[b]]
    svc = lambda x: by[x].get("service") or 0

    def simulate(sorties):
        """Tiempo total. sorties: lista de (launch, cust, recover) sobre base_seq (cust sale del camión)."""
        removed = {s[1] for s in sorties}
        seq = [x for x in base_seq if x not in removed] + [depot]
        launches, recov = {}, {}
        for (i, j, k) in sorties:
            launches.setdefault(i, []).append((j, k))
            recov.setdefault(k, []).append((i, j))
        t, depart, arrive_drone = 0.0, {}, {}
        for idx, node in enumerate(seq):
            if idx > 0:
                t += tt(seq[idx - 1], node)
            # llegada de drones a este nodo
            wait_until = max([arrive_drone.get((i, j), 0.0) for (i, j) in recov.get(node, [])], default=0.0)
            t = max(t, wait_until) + (t_r * len(recov.get(node, [])) if idx > 0 else 0.0)
            if idx < len(seq) - 1 or node != depot:
                t += svc(node) if node != depot else 0.0
            for (j, k) in launches.get(node, []):
                t += t_l
                fl = (flight_km(node, j) + flight_km(j, k)) / v_dr * 60 + svc(j)
                arrive_drone[(node, j)] = t + fl
                if fl + t_r > endur:
                    return math.inf
            depart[node] = t
        return t

    def valid(sorties):
        spans = []
        for (i, j, k) in sorties:
            spans.append((base_seq.index(i), base_seq.index(k) if k != depot or k in base_seq[1:] else len(base_seq)))
        for a, (s0, e0) in enumerate(spans):   # a lo sumo ndr drones simultáneos
            sim = sum(1 for (s1, e1) in spans if s1 < e0 and s0 < e1)
            if sim > ndr:
                return False
        return True

    best_t = simulate([])
    base_t = best_t
    sorties = []
    while True:
        cand = None
        used = {s[1] for s in sorties}
        launch_k = {s[0] for s in sorties} | {s[2] for s in sorties}
        for jpos, j in enumerate(base_seq[1:], 1):
            if j in used or j in launch_k or (cap is not None and (by[j].get("demand") or 0) > float(cap)):
                continue
            for ia in range(max(0, jpos - window), jpos):
                for kb in range(jpos + 1, min(len(base_seq), jpos + window) + 1):
                    i = base_seq[ia]
                    k = base_seq[kb] if kb < len(base_seq) else depot
                    if i in used or k in used or j in (i, k):
                        continue
                    trial = sorties + [(i, j, k)]
                    if not valid(trial):
                        continue
                    tval = simulate(trial)
                    if tval < best_t - 1e-6 and (cand is None or tval < cand[0]):
                        cand = (tval, (i, j, k))
        if not cand:
            break
        best_t, s_new = cand
        sorties.append(s_new)
        ctx.progress(min(0.9, 0.2 + 0.1 * len(sorties)))
    removed = {s[1] for s in sorties}
    final = [x for x in base_seq if x not in removed] + [depot]
    res = new_result("fstsp", "Camión + drones (FSTSP) – heurístico", "heuristic")
    full = M.expand(final)
    res["paths"].append({"label": "camión", "nodes": full, "stops": final, "cost": best_t, "totals": {"w": best_t, "time": best_t}})
    res["highlight_edges"] = [[a, b, "camión"] for a, b in zip(full[:-1], full[1:])]
    rows = []
    for (i, j, k) in sorties:
        fl = (flight_km(i, j) + flight_km(j, k)) / v_dr * 60 + svc(j)
        res["highlight_edges"] += [[i, j, "dron"], [j, k, "dron"]]
        rows.append([ctx.label(i), ctx.label(j), ctx.label(k), fmt(fl + t_l + t_r)])
        step(res, f"Dron: lanzar en {ctx.label(i)}, entregar a {ctx.label(j)}, recuperar en {ctx.label(k)} ({fmt(fl)} min de vuelo)",
             nodes=[i, j, k], edges=[(i, j), (j, k)], state="accepted")
    res["tables"].append({"title": "Salidas de dron", "columns": ["Lanzamiento", "Cliente", "Recuperación", "Duración (min)"], "rows": rows})
    imp = (1 - best_t / base_t) * 100 if base_t else 0.0
    res["value"] = best_t
    res["unit"] = "min"
    res["message"] = (f"Tiempo total {fmt(best_t)} min con {len(sorties)} entrega(s) por dron frente a {fmt(base_t)} min solo camión "
                      f"({fmt(imp, 1)} % de mejora).")
    res["meta"].update(base_time=base_t, improvement_pct=imp, drones=ndr, sorties=[list(s) for s in sorties])
    res["control"] += [{"name": "Tiempo solo camión (min)", "value": round(base_t, 2)},
                       {"name": "Tiempo camión+dron (min)", "value": round(best_t, 2)}]
    res["assumptions"] = ["HEURÍSTICO voraz tipo Agatz et al. (FSTSP); no es óptimo probado",
                          f"Dron: {v_dr} km/h, autonomía {endur} min, {ndr} dron(es), lanzamiento {t_l} min y recuperación {t_r} min",
                          "Vuelo en línea recta (Haversine) y el camión espera en el punto de recuperación"]
    return res


# ---------- cartero chino / rural ----------

def _postman_graph(ctx):
    g = ctx.graph()
    directed = all(a.get("directed") for _, _, a in g.edges(data=True)) and g.number_of_edges() > 0
    mixed = (not directed) and any(a.get("directed") for _, _, a in g.edges(data=True))
    return g, directed, mixed


def chinese_postman(ctx: Ctx):
    g, directed, mixed = _postman_graph(ctx)
    res = new_result("chinese_postman", "Cartero chino (Euler con duplicación mínima)", "optimal")
    if mixed:
        raise AlgoError("Grafo mixto (arcos dirigidos y aristas): el cartero chino mixto es NP-difícil y no está soportado. Convierta a todo dirigido o todo no dirigido.")
    if directed:
        if not nx.is_strongly_connected(g):
            raise AlgoError("El grafo dirigido no es fuertemente conexo: no hay recorrido cerrado que cubra todos los arcos.")
        imb = {n: g.out_degree(n) - g.in_degree(n) for n in g}
        H = nx.DiGraph()
        for n, d in imb.items():
            H.add_node(n, demand=-d)    # nodos con exceso de salida son sumideros de caminos duplicados (demand>0)
        sp = dict(nx.all_pairs_dijkstra(g, weight="w"))
        sc = 1000
        for a in g:
            for b in g:
                if a != b and imb[a] < 0 < imb[b] or False:
                    pass
        # flujo de costo mínimo entre nodos con in>out (fuentes) y out>in (sumideros)
        G = nx.DiGraph()
        for n, d in imb.items():
            G.add_node(n, demand=d)  # d>0 (out>in) debe recibir d duplicaciones; d<0 las emite
        pos = [n for n, d in imb.items() if d < 0]
        neg = [n for n, d in imb.items() if d > 0]
        for a in pos:
            for b in neg:
                if b in sp[a][0]:
                    G.add_edge(a, b, weight=int(round(sp[a][0][b] * sc)))
        cost, flow = nx.network_simplex(G)
        extra = []
        for a in flow:
            for b, f in flow[a].items():
                for _ in range(f):
                    extra.append(sp[a][1][b])
        eu = nx.MultiDiGraph()
        for u, v, a in g.edges(data=True):
            eu.add_edge(u, v, w=a["w"])
        dup = 0.0
        for path in extra:
            for a, b in zip(path[:-1], path[1:]):
                eu.add_edge(a, b, w=g[a][b]["w"])
                dup += g[a][b]["w"]
        circ = [e[0] for e in nx.eulerian_circuit(eu)]
        circ.append(circ[0])
        base = sum(a["w"] for _, _, a in g.edges(data=True))
    else:
        u = undirected_view(g)
        if not nx.is_connected(u):
            raise AlgoError("El grafo no es conexo: no hay recorrido que cubra todas las aristas.")
        odd = [n for n in u if u.degree(n) % 2]
        base = sum(a["w"] for _, _, a in u.edges(data=True))
        dup = 0.0
        eu = nx.MultiGraph()
        for a, b, d in u.edges(data=True):
            eu.add_edge(a, b, w=d["w"])
        extra = []
        if odd:
            sp = {a: nx.single_source_dijkstra(u, a, weight="w") for a in odd}
            K = nx.Graph()
            for a, b in itertools.combinations(odd, 2):
                K.add_edge(a, b, weight=-sp[a][0][b])
            match = nx.max_weight_matching(K, maxcardinality=True)
            for a, b in match:
                extra.append(sp[a][1][b])
            for path in extra:
                for a, b in zip(path[:-1], path[1:]):
                    eu.add_edge(a, b, w=u[a][b]["w"])
                    dup += u[a][b]["w"]
        circ = [e[0] for e in nx.eulerian_circuit(eu)]
        circ.append(circ[0])
    total = base + dup
    res["paths"].append({"label": "recorrido", "nodes": circ, "cost": total, "totals": {"w": total}})
    res["highlight_edges"] = [[a, b, "recorrido"] for a, b in zip(circ[:-1], circ[1:])]
    res["value"] = total
    res["tables"].append({"title": "Desglose", "columns": ["Concepto", "Valor"],
                          "rows": [["Suma de aristas", fmt(base)], ["Repetición mínima", fmt(dup)], ["Recorrido total", fmt(total)]]})
    res["message"] = f"Recorrido de {fmt(total)} = {fmt(base)} (cubrir todo) + {fmt(dup)} (repetición mínima)."
    res["control"] += [{"name": "Recorrido total", "value": total}, {"name": "Recorrido escalado", "value": scaled(ctx, total)}]
    step(res, f"{'Dirigido: balanceo por flujo de costo mínimo' if directed else f'No dirigido: {len(odd)} nodos de grado impar emparejados por matching de peso mínimo'}")
    res["assumptions"] = ["Exacto en grafos no dirigidos o dirigidos puros (Edmonds-Johnson)"]
    return res


def rural_postman(ctx: Ctx):
    """Cartero rural: aristas obligatorias R ('required_edges'); heurística: conectar componentes + emparejar impares."""
    g, directed, mixed = _postman_graph(ctx)
    if directed or mixed:
        raise AlgoError("El cartero rural está implementado para grafos no dirigidos.")
    u = undirected_view(g)
    req = [tuple(map(str, e)) for e in (ctx.params.get("required_edges") or [])]
    if not req:
        raise AlgoError("Indique 'required_edges' (lista de pares [u,v]) o seleccione aristas obligatorias.")
    for a, b in req:
        if not u.has_edge(a, b):
            raise AlgoError(f"La arista obligatoria {a}–{b} no existe en la red.")
    R = nx.Graph()
    for a, b in req:
        R.add_edge(a, b, w=u[a][b]["w"])
    comps = [list(c) for c in nx.connected_components(R)]
    sp = dict(nx.all_pairs_dijkstra(u, weight="w"))
    E = nx.MultiGraph()
    for a, b, d in R.edges(data=True):
        E.add_edge(a, b, w=d["w"])
    extra_paths = []
    if len(comps) > 1:     # MST sobre componentes con distancias de camino mínimo
        K = nx.Graph()
        for i, j in itertools.combinations(range(len(comps)), 2):
            best = min(((sp[a][0][b], a, b) for a in comps[i] for b in comps[j] if b in sp[a][0]), default=None)
            if best:
                K.add_edge(i, j, weight=best[0], pair=(best[1], best[2]))
        for i, j in nx.minimum_spanning_edges(K, data=False):
            a, b = K[i][j]["pair"]
            extra_paths.append(sp[a][1][b])
    for path in extra_paths:
        for a, b in zip(path[:-1], path[1:]):
            E.add_edge(a, b, w=u[a][b]["w"])
    odd = [n for n in E if E.degree(n) % 2]
    if odd:
        K = nx.Graph()
        for a, b in itertools.combinations(odd, 2):
            K.add_edge(a, b, weight=-sp[a][0][b])
        for a, b in nx.max_weight_matching(K, maxcardinality=True):
            for x, y in zip(sp[a][1][b][:-1], sp[a][1][b][1:]):
                E.add_edge(x, y, w=u[x][y]["w"])
    circ = [e[0] for e in nx.eulerian_circuit(E)]
    circ.append(circ[0])
    total = sum(d["w"] for _, _, d in E.edges(data=True))
    base = sum(d["w"] for _, _, d in R.edges(data=True))
    res = new_result("rural_postman", "Cartero rural (aristas obligatorias) – heurístico", "heuristic")
    res["paths"].append({"label": "recorrido", "nodes": circ, "cost": total, "totals": {"w": total}})
    res["highlight_edges"] = [[a, b, "recorrido"] for a, b in zip(circ[:-1], circ[1:])]
    res["value"] = total
    res["message"] = f"Recorrido rural de {fmt(total)} (aristas obligatorias {fmt(base)}, enlaces/repeticiones {fmt(total - base)}), {len(comps)} componente(s) obligatoria(s)."
    res["assumptions"] = ["HEURÍSTICO: unión de componentes por árbol de costo mínimo + emparejamiento de impares; el cartero rural es NP-difícil"]
    res["control"].append({"name": "Recorrido total", "value": total})
    return res
