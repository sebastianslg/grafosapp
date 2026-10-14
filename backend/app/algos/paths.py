"""Caminos mínimos y críticos: Dijkstra, Bellman-Ford, A*, Floyd-Warshall, k caminos, camino crítico."""
from __future__ import annotations
import heapq
import math
import networkx as nx
from .common import *
from ..model import haversine


def dijkstra_steps(g, s, ctx, res, t=None, max_steps=400):
    """Dijkstra propio con registro de pasos (etiquetado permanente)."""
    dist = {s: 0.0}
    prev = {}
    done = set()
    pq = [(0.0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u in done:
            continue
        done.add(u)
        if len(res["steps"]) < max_steps:
            step(res, f"Fijar {ctx.label(u)} con etiqueta permanente {fmt(d)}"
                 + (f" (vino de {ctx.label(prev[u])})" if u in prev else " (origen)"),
                 nodes=[u], edges=[(prev[u], u)] if u in prev else [], state="visit", data={"dist": d})
        if t is not None and u == t:
            break
        for v, a in g[u].items():
            nd = d + a["w"]
            if v in done:
                continue
            if nd < dist.get(v, math.inf) - 1e-12:
                old = dist.get(v)
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
                if len(res["steps"]) < max_steps:
                    step(res, f"Relajar {ctx.label(u)}→{ctx.label(v)}: {fmt(nd)}"
                         + (f" mejora {fmt(old)}" if old is not None else " (primera etiqueta)"),
                         nodes=[v], edges=[(u, v)], state="accepted")
            elif len(res["steps"]) < max_steps:
                step(res, f"Descartar {ctx.label(u)}→{ctx.label(v)}: {fmt(nd)} no mejora {fmt(dist[v])}",
                     nodes=[v], edges=[(u, v)], state="rejected")
    return dist, prev


def _recon(prev, s, t):
    out = [t]
    while out[-1] != s:
        out.append(prev[out[-1]])
    return out[::-1]


def dijkstra(ctx: Ctx):
    g = ctx.graph()
    if any(a["w"] < 0 for _, _, a in g.edges(data=True)):
        raise AlgoError("Hay pesos negativos: Dijkstra no es válido. Use Bellman-Ford.")
    s = ctx.node("source")
    t = ctx.node("target", required=False)
    res = new_result("dijkstra", "Camino mínimo – Dijkstra", "optimal", CRITERIA[ctx.criterion])
    ctx.progress(0.1)
    dist, prev = dijkstra_steps(g, s, ctx, res, t)
    if t is not None:
        if t not in dist:
            raise AlgoError(f"No existe camino de {ctx.label(s)} a {ctx.label(t)} (nodo inalcanzable).")
        path = _recon(prev, s, t)
        add_path(res, g, ctx, path, "camino mínimo")
        res["value"] = dist[t]
        res["message"] = f"De {ctx.label(s)} a {ctx.label(t)}: {fmt(dist[t])}, ruta " + " > ".join(path)
        ap = [{"label": "Segunda mejor ruta", "nodes": p2, "cost": c2}
              for c2, p2 in _k_paths(g, s, t, 2)[1:]]
        res["meta"]["alternatives"] = ap
    else:
        rows = []
        for v in ctx.ids:
            rows.append([ctx.label(v), fmt(dist.get(v)) if v in dist else "inalcanzable",
                         " > ".join(_recon(prev, s, v)) if v in dist else ""])
        res["tables"].append({"title": f"Costo a todos los nodos desde {ctx.label(s)}",
                              "columns": ["Nodo", "Costo", "Camino"], "rows": rows})
        res["value"] = sum(dist.values())
        res["meta"]["sum_label"] = "Suma de costos desde el origen"
        for v in dist:
            if v != s:
                res["highlight_edges"].append([prev[v], v, "árbol"])
        res["control"].append({"name": f"Costos desde {s}", "value": [dist.get(v) for v in ctx.ids]})
        res["message"] = f"Costos mínimos desde {ctx.label(s)} hacia {len(dist) - 1} nodos alcanzables."
    res["control"].append({"name": "Valor (escalado a entero)", "value": scaled(ctx, res["value"])})
    res["assumptions"] = ["Pesos no negativos", f"Criterio: {CRITERIA[ctx.criterion]}"]
    return res


def _k_paths(g, s, t, k):
    out = []
    gen = nx.shortest_simple_paths(g, s, t, weight="w")
    for pth in gen:
        out.append((path_cost(g, pth), pth))
        if len(out) >= k:
            break
    return out


def bellman_ford(ctx: Ctx):
    mode = ctx.params.get("mode", "min")
    g = ctx.graph()
    s = ctx.node("source")
    t = ctx.node("target", required=False)
    res = new_result("bellman_ford", "Camino %s – Bellman-Ford" % ("mínimo" if mode == "min" else "máximo"),
                     "optimal", CRITERIA[ctx.criterion])
    if mode == "max":
        h = g.copy()
        for u, v in h.edges:
            h[u][v]["w"] = -h[u][v]["w"]
        if not nx.is_directed_acyclic_graph(h):
            raise AlgoError("El camino máximo solo está definido en un grafo dirigido acíclico (DAG); este grafo tiene ciclos.")
        g = h
    try:
        dist, paths = nx.single_source_bellman_ford(g, s, weight="w")
    except nx.NetworkXUnbounded:
        cyc = nx.find_negative_cycle(g, s, weight="w")
        raise AlgoError("Ciclo de costo negativo alcanzable desde el origen: " + " > ".join(map(str, cyc)))
    sign = -1 if mode == "max" else 1
    step(res, f"Se relajan todos los arcos hasta |V|-1={len(g) - 1} veces; no se detectó ciclo negativo.")
    if t is not None:
        if t not in dist:
            raise AlgoError(f"No existe camino de {ctx.label(s)} a {ctx.label(t)}.")
        gg = ctx.graph()
        add_path(res, gg, ctx, paths[t], "camino " + ("mínimo" if mode == "min" else "máximo"), detail=mode == "min")
        res["value"] = sign * dist[t]
        res["message"] = f"De {ctx.label(s)} a {ctx.label(t)}: {fmt(res['value'])}, ruta " + " > ".join(paths[t])
    else:
        res["tables"].append({"title": "Costos desde el origen", "columns": ["Nodo", "Costo", "Camino"],
                              "rows": [[ctx.label(v), fmt(sign * d), " > ".join(paths[v])] for v, d in dist.items()]})
        res["value"] = sign * sum(dist.values())
        res["message"] = f"Costos {'mínimos' if mode == 'min' else 'máximos'} desde {ctx.label(s)}."
    res["assumptions"] = ["Admite pesos negativos (sin ciclos negativos)"] + (["Camino máximo: sólo en DAG"] if mode == "max" else [])
    return res


def critical_path(ctx: Ctx):
    """Camino crítico (más largo) en un DAG con tiempos en los arcos."""
    g = ctx.graph(ctx.params.get("criterion", "time"), force_directed=True)
    if not nx.is_directed_acyclic_graph(g):
        raise AlgoError("El camino crítico requiere un grafo dirigido acíclico (proyecto de actividades). Hay ciclos.")
    s = ctx.node("source", required=False) or [n for n in nx.topological_sort(g) if g.in_degree(n) == 0][0]
    t = ctx.node("target", required=False) or [n for n in nx.topological_sort(g) if g.out_degree(n) == 0][-1]
    res = new_result("critical_path", "Camino crítico", "optimal", CRITERIA[ctx.criterion])
    best = {s: (0.0, None)}
    for u in nx.topological_sort(g):
        if u not in best:
            continue
        for v, a in g[u].items():
            nv = best[u][0] + a["w"]
            if v not in best or nv > best[v][0]:
                best[v] = (nv, u)
        step(res, f"Procesar {ctx.label(u)} (más temprano {fmt(best[u][0])})", nodes=[u], state="visit")
    if t not in best:
        raise AlgoError("El destino no es alcanzable desde el origen.")
    pth = [t]
    while best[pth[-1]][1] is not None:
        pth.append(best[pth[-1]][1])
    pth.reverse()
    add_path(res, g, ctx, pth, "camino crítico", detail=False)
    res["value"] = best[t][0]
    res["message"] = f"Duración del proyecto {fmt(best[t][0])}; camino crítico " + " > ".join(pth)
    return res


def astar(ctx: Ctx):
    g = ctx.graph()
    s, t = ctx.node("source"), ctx.node("target")
    by = {n["id"]: n for n in ctx.p["nodes"]}
    rf = ctx.p["params"].get("road_factor", 1.0)
    crit = ctx.criterion
    if any(by[n].get("lat") is None for n in (s, t)) or crit not in ("distance", "time", "cost"):
        raise AlgoError("A* requiere coordenadas lat/lon y criterio distancia/tiempo/costo.")
    # heurística admisible: distancia geodésica × mínimo (w/distancia) de la red
    ratios = [a["w"] / a["distance"] for _, _, a in g.edges(data=True) if a.get("distance")]
    k = min(ratios) if ratios else 0.0
    # factor vial: la distancia de las aristas ya incluye rf; la geodésica pura es menor → admisible
    hfun = lambda u, v: k * haversine(by[u]["lat"], by[u]["lon"], by[v]["lat"], by[v]["lon"]) if by[u].get("lat") is not None and by[v].get("lat") is not None else 0.0
    res = new_result("astar", "Camino mínimo – A*", "optimal", CRITERIA[crit])
    try:
        pth = nx.astar_path(g, s, t, heuristic=hfun, weight="w")
    except nx.NetworkXNoPath:
        raise AlgoError("No existe camino.")
    c = path_cost(g, pth)
    add_path(res, g, ctx, pth, "camino A*")
    res["value"] = c
    step(res, "Heurística h(n)=k·Haversine(n,destino) con k=min(w/d); admisible porque w ≥ k·d ≥ k·geodésica.")
    res["message"] = f"De {ctx.label(s)} a {ctx.label(t)}: {fmt(c)}, ruta " + " > ".join(pth)
    res["assumptions"] = ["Heurística admisible/consistente → óptimo"]
    return res


def floyd_warshall(ctx: Ctx):
    g = ctx.graph()
    ids = list(g.nodes)
    n = len(ids)
    if n > 600:
        raise AlgoError(f"Floyd-Warshall con {n} nodos es muy costoso (O(n³)); limite a ≤600 o use Dijkstra por origen.")
    idx = {v: i for i, v in enumerate(ids)}
    import numpy as np
    D = np.full((n, n), np.inf)
    nxt = [[None] * n for _ in range(n)]
    for i in range(n):
        D[i, i] = 0
    for u, v, a in g.edges(data=True):
        D[idx[u], idx[v]] = a["w"]
        nxt[idx[u]][idx[v]] = idx[v]
    for k in range(n):
        ctx.progress(k / n, f"Pivote {k + 1}/{n}")
        for i in range(n):
            if D[i, k] == np.inf:
                continue
            cand = D[i, k] + D[k, :]
            better = cand < D[i, :] - 1e-12
            if better.any():
                for j in np.where(better)[0]:
                    nxt[i][j] = nxt[i][k]
                D[i, better] = cand[better]
        if D.diagonal().min() < 0:
            raise AlgoError("Ciclo negativo detectado.")
    res = _fw_res(ctx)
    res["steps"] = []
    for k in range(min(n, 12)):
        step(res, f"Pivote {ctx.label(ids[k])}: se actualizan los caminos que pasan por este nodo.", nodes=[ids[k]], state="visit")
    res["matrix"] = matrix_result(ctx, ids, D, "Matriz de costos mínimos")
    res["meta"]["next"] = nxt
    res["meta"]["ids"] = ids
    fin = D[np.isfinite(D)]
    res["value"] = float(fin.sum())
    res["meta"]["sum_label"] = "Suma de todos los pares ordenados"
    res["meta"]["unreachable_pairs"] = int(np.isinf(D).sum())
    res["control"] += [{"name": "Suma de todos los pares ordenados", "value": float(fin.sum())},
                       {"name": "Suma escalada (entero)", "value": scaled(ctx, float(fin.sum()))},
                       {"name": "Diámetro (máx. costo finito)", "value": float(fin.max())}]
    s, t = ctx.node("source", False), ctx.node("target", False)
    if s and t:
        path = _fw_path(ids, nxt, idx, s, t)
        if path:
            add_path(res, g, ctx, path, "camino mínimo")
            res["message"] = f"De {ctx.label(s)} a {ctx.label(t)}: {fmt(D[idx[s], idx[t]])}, ruta " + " > ".join(path)
        else:
            raise AlgoError("No existe camino entre el origen y el destino.")
    else:
        res["message"] = f"Matriz {n}×{n} de costos mínimos entre todos los pares."
    return res


def _fw_res(ctx):
    return new_result("floyd_warshall", "Todos los caminos mínimos – Floyd-Warshall", "optimal", CRITERIA[ctx.criterion])


def _fw_path(ids, nxt, idx, s, t):
    i, j = idx[s], idx[t]
    if i == j:
        return [s]
    if nxt[i][j] is None:
        return None
    out = [s]
    while i != j:
        i = nxt[i][j]
        out.append(ids[i])
        if len(out) > len(ids) + 1:
            return None
    return out


def k_shortest(ctx: Ctx):
    g = ctx.graph()
    s, t = ctx.node("source"), ctx.node("target")
    k = int(ctx.params.get("k", 3))
    res = new_result("k_shortest", f"{k} caminos más cortos (Yen)", "optimal", CRITERIA[ctx.criterion])
    try:
        paths = _k_paths(g, s, t, k)
    except nx.NetworkXNoPath:
        raise AlgoError("No existe camino.")
    for i, (c, p) in enumerate(paths, 1):
        add_path(res, g, ctx, p, f"camino {i}", detail=False)
    res["tables"].append({"title": "Caminos", "columns": ["#", "Costo", "Ruta"],
                          "rows": [[i, fmt(c), " > ".join(p)] for i, (c, p) in enumerate(paths, 1)]})
    res["value"] = paths[0][0]
    res["message"] = f"{len(paths)} caminos de {ctx.label(s)} a {ctx.label(t)}; el mejor cuesta {fmt(paths[0][0])}."
    return res
