"""Escenarios: cierres, fallas múltiples, resiliencia (enlaces a agregar), cambio de flota, sensibilidad."""
from __future__ import annotations
import copy
import itertools
import networkx as nx
from .common import *
from ..graphs import undirected_view, build_nx
from ..model import haversine


def resilience(ctx: Ctx):
    """Qué enlaces agregar para eliminar puntos de articulación y puentes (greedy sobre costo del enlace nuevo)."""
    p = ctx.p
    u = undirected_view(ctx.graph())
    by = {n["id"]: n for n in p["nodes"]}
    rf = p["params"].get("road_factor", 1.0)

    def dist(a, b):
        A, B = by[a], by[b]
        if A.get("lat") is not None and B.get("lat") is not None:
            return haversine(A["lat"], A["lon"], B["lat"], B["lon"]) * rf
        try:
            return nx.shortest_path_length(u, a, b, weight="w")
        except nx.NetworkXNoPath:
            return 1e9
    res = new_result("resilience", "Resiliencia: enlaces a agregar", "heuristic")
    added = []
    h = u.copy()
    limit = int(ctx.params.get("max_links", 10))
    nodes = list(h.nodes)
    for _ in range(limit):
        cut = set(nx.articulation_points(h)) | {x for e in nx.bridges(h) for x in e}
        if nx.is_connected(h) and not cut:
            break
        best = None
        base = (nx.number_connected_components(h), len(list(nx.articulation_points(h))), len(list(nx.bridges(h))))
        pool = sorted(((dist(a, b), a, b) for a, b in itertools.combinations(nodes, 2) if not h.has_edge(a, b)))[:3000]
        for d, a, b in pool:
            t = h.copy()
            t.add_edge(a, b, w=d)
            score = (nx.number_connected_components(t), len(list(nx.articulation_points(t))), len(list(nx.bridges(t))))
            if score < base and (best is None or (score, d) < (best[0], best[1])):
                best = (score, d, a, b)
        if not best:
            break
        _, d, a, b = best
        h.add_edge(a, b, w=d)
        added.append((a, b, d))
        step(res, f"Agregar {ctx.label(a)}–{ctx.label(b)} (≈{fmt(d)}): reduce componentes/articulaciones/puentes", nodes=[a, b], edges=[(a, b)], state="accepted")
    left = (len(list(nx.articulation_points(h))), len(list(nx.bridges(h))))
    res["tables"].append({"title": "Enlaces propuestos", "columns": ["Enlace", "Longitud estimada"],
                          "rows": [[f"{ctx.label(a)}–{ctx.label(b)}", fmt(d)] for a, b, d in added]})
    res["highlight_edges"] = [[a, b, "nuevo"] for a, b, _ in added]
    res["value"] = float(len(added))
    res["message"] = f"{len(added)} enlace(s) propuesto(s); quedan {left[0]} articulaciones y {left[1]} puentes." if added else \
        "No se requieren enlaces: no hay puntos críticos."
    res["meta"]["links"] = [[a, b, d] for a, b, d in added]
    res["assumptions"] = ["HEURÍSTICO voraz: minimiza (componentes, articulaciones, puentes) y luego longitud", "Longitud del enlace = Haversine × factor vial"]
    return res


def failure(ctx: Ctx):
    """Impacto de cerrar nodos/aristas (fallas múltiples): conectividad y variación de caminos mínimos."""
    from .paths import floyd_warshall
    closed_n = ctx.params.get("closed_nodes", [])
    closed_e = ctx.params.get("closed_edges", [])
    if not closed_n and not closed_e:
        raise AlgoError("Indique 'closed_nodes' y/o 'closed_edges' para simular la falla.")
    base = Ctx(ctx.p, {**ctx.params, "closed_nodes": [], "closed_edges": []})
    gb = base.graph()
    gf = ctx.graph()
    res = new_result("failure", "Escenario de falla: nodos/aristas cerrados", "optimal")
    ub, uf = undirected_view(gb), undirected_view(gf)
    comps = [sorted(c) for c in nx.connected_components(uf)]
    isolated = [c[0] for c in comps if len(c) == 1]
    db = dict(nx.all_pairs_dijkstra_path_length(gb, weight="w"))
    df_ = dict(nx.all_pairs_dijkstra_path_length(gf, weight="w"))
    rows, lost, worse = [], 0, 0
    tb = tf = 0.0
    for a in gf:
        for b in gf:
            if a == b:
                continue
            x, y = db[a].get(b), df_[a].get(b)
            if x is None:
                continue
            if y is None:
                lost += 1
            else:
                tb += x
                tf += y
                if y > x + 1e-9:
                    worse += 1
    res["value"] = tf - tb
    res["tables"].append({"title": "Impacto", "columns": ["Indicador", "Antes", "Después"],
                          "rows": [["Nodos activos", len(gb), len(gf)], ["Componentes conexas", nx.number_connected_components(ub), len(comps)],
                                   ["Pares ordenados sin camino", 0, lost], ["Suma de costos mínimos (pares conectados)", fmt(tb), fmt(tf)],
                                   ["Pares con camino más caro", "—", worse]]})
    res["message"] = (f"Tras cerrar {len(closed_n)} nodo(s) y {len(closed_e)} arista(s): {len(comps)} componente(s), "
                      f"{lost} pares ordenados pierden conexión y {worse} pares empeoran; suma de costos {fmt(tb)} → {fmt(tf)}.")
    res["highlight_nodes"] = isolated
    res["meta"].update(components=comps, isolated=isolated, lost_pairs=lost, worse_pairs=worse, before=tb, after=tf)
    res["control"] += [{"name": "Componentes tras la falla", "value": len(comps)}, {"name": "Aislados", "value": isolated}]
    return res


def compare_runs(runs: list[dict]) -> dict:
    """Comparación lado a lado con deltas porcentuales. runs: [{name, result}]"""
    if len(runs) < 2:
        raise AlgoError("Se requieren al menos 2 escenarios para comparar.")
    base = runs[0]["result"]
    rows = []
    for r in runs:
        res = r["result"]
        v = res.get("value")
        d = None if (v is None or base.get("value") in (None, 0)) else (v - base["value"]) / abs(base["value"]) * 100
        m = res.get("meta", {})
        rows.append({"escenario": r["name"], "valor": v, "delta_pct": d, "algoritmo": res["title"], "estado": res["status"],
                     "km": m.get("km"), "rutas": m.get("routes"), "emisiones": m.get("emissions"), "mensaje": res.get("message")})
    return {"base": runs[0]["name"], "rows": rows}


def sensitivity(ctx: Ctx):
    """Sensibilidad: repite un algoritmo variando un parámetro de costo (c_km, c_hora, speed, road_factor...)."""
    from . import registry
    algo = ctx.params.get("algorithm")
    param = ctx.params.get("param", "c_km")
    vals = ctx.params.get("values") or [0.8, 0.9, 1.0, 1.1, 1.2]
    factors = ctx.params.get("as_factors", True)
    if not algo or algo == "sensitivity":
        raise AlgoError("Indique 'algorithm' (algoritmo a repetir).")
    base_val = ctx.p["params"].get(param)
    if base_val is None:
        raise AlgoError(f"Parámetro de proyecto desconocido: {param}")
    res = new_result("sensitivity", f"Sensibilidad de {algo} a {param}", "info")
    rows, series = [], []
    for k, f in enumerate(vals):
        ctx.progress(k / len(vals))
        p2 = copy.deepcopy(ctx.p)
        p2["params"][param] = base_val * f if factors else f
        sub = {kk: vv for kk, vv in ctx.params.items() if kk not in ("algorithm", "param", "values", "as_factors")}
        r = registry.run(algo, p2, sub)
        rows.append([fmt(p2["params"][param], 4), fmt(r.get("value")), r.get("message", "")[:120]])
        series.append((p2["params"][param], r.get("value")))
    res["tables"].append({"title": "Resultados", "columns": [param, "Valor", "Resumen"], "rows": rows})
    res["meta"]["series"] = series
    ok = [s for s in series if s[1] is not None]
    res["value"] = (max(v for _, v in ok) - min(v for _, v in ok)) if ok else None
    res["message"] = f"Rango del valor al variar {param}: {fmt(res['value'])}."
    return res


def fleet_change(ctx: Ctx):
    """Cambio de flota: ejecuta el mismo VRP con varias flotas (params.fleets = {nombre: [vehículos]}) y compara."""
    from . import routing
    fleets = ctx.params.get("fleets")
    if not fleets or len(fleets) < 2:
        raise AlgoError("Indique 'fleets': {nombre: [vehículos]} con ≥2 flotas (p. ej. diésel, eléctrico, dron).")
    mode = ctx.params.get("mode", "cvrp")
    res = new_result("fleet_change", "Comparación de flotas", "heuristic")
    runs = []
    for k, (name, vs) in enumerate(fleets.items()):
        ctx.progress(k / len(fleets))
        sub = Ctx(ctx.p, {**ctx.params, "vehicles": vs})
        try:
            r = routing.vrp(sub, mode)
            runs.append({"name": name, "result": r})
        except AlgoError as e:
            runs.append({"name": name, "result": {"title": name, "status": "infeasible", "value": None, "message": str(e), "meta": {}}})
            res["steps"].append({"i": len(res["steps"]) + 1, "text": f"{name}: {e}", "nodes": [], "edges": [], "state": "rejected", "data": {}})
    cmp_ = compare_runs(runs)
    res["tables"].append({"title": "Comparación", "columns": ["Flota", "Costo", "Δ %", "Km", "Rutas", "Emisiones", "Estado"],
                          "rows": [[r["escenario"], fmt(r["valor"]), "—" if r["delta_pct"] is None else f"{r['delta_pct']:+.1f} %",
                                    fmt(r["km"]), fmt(r["rutas"]), fmt(r["emisiones"]), r["estado"]] for r in cmp_["rows"]]})
    res["meta"]["comparison"] = cmp_
    feas = [r for r in cmp_["rows"] if r["valor"] is not None]
    if feas:
        b = min(feas, key=lambda r: r["valor"])
        res["value"] = b["valor"]
        res["message"] = f"Flota de menor costo: {b['escenario']} ({fmt(b['valor'])})."
    else:
        res["message"] = "Ninguna flota fue factible."
    res["assumptions"] = ["Cada flota se resuelve con OR-Tools (heurístico)", "Base de comparación: la primera flota"]
    return res
