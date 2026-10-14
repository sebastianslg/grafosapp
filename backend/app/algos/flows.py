"""Flujos: flujo máximo, corte mínimo, flujo de costo mínimo, transbordo, transporte y asignación."""
from __future__ import annotations
import math
import networkx as nx
import numpy as np
from collections import deque
from .common import *
from ..graphs import build_nx


def _cap_graph(ctx, default_cap=None):
    """DiGraph con 'capacity' (entero/float) desde capacidades de arista."""
    g = ctx.graph()
    h = nx.DiGraph()
    h.add_nodes_from(g.nodes(data=True))
    miss = 0
    for u, v, a in g.edges(data=True):
        c = a.get("capacity")
        if c is None:
            c = default_cap
            miss += 1
        if c is None:
            raise AlgoError(f"El arco {u}→{v} no tiene capacidad. Cargue una columna de capacidad/'Matriz máximo' o indique 'default_capacity'.")
        h.add_edge(u, v, capacity=c, w=a["w"], cost=a.get("cost"))
    return h, miss


def max_flow(ctx: Ctx):
    s, t = ctx.node("source"), ctx.node("target")
    if s == t:
        raise AlgoError("Origen y destino deben ser distintos.")
    h, miss = _cap_graph(ctx, ctx.params.get("default_capacity"))
    method = ctx.params.get("method", "edmonds_karp")
    res = new_result("max_flow", "Flujo máximo – Ford-Fulkerson (Edmonds-Karp)" if method != "dinic" else "Flujo máximo – Dinic", "optimal")
    # Edmonds-Karp con registro de caminos aumentantes
    R = {}
    for u, v, a in h.edges(data=True):
        R.setdefault(u, {})[v] = R.get(u, {}).get(v, 0) + a["capacity"]
        R.setdefault(v, {}).setdefault(u, 0)
    flow = 0
    while True:
        prev = {s: None}
        q = deque([s])
        while q and t not in prev:
            u = q.popleft()
            for v, c in R.get(u, {}).items():
                if c > 1e-12 and v not in prev:
                    prev[v] = u
                    q.append(v)
        if t not in prev:
            break
        pth = [t]
        while pth[-1] != s:
            pth.append(prev[pth[-1]])
        pth.reverse()
        b = min(R[u][v] for u, v in zip(pth[:-1], pth[1:]))
        for u, v in zip(pth[:-1], pth[1:]):
            R[u][v] -= b
            R[v][u] += b
        flow += b
        if len(res["steps"]) < 300:
            step(res, f"Camino aumentante {' > '.join(pth)} con cuello de botella {fmt(b)}; flujo acumulado {fmt(flow)}",
                 nodes=pth, edges=list(zip(pth[:-1], pth[1:])), state="accepted", data={"flow": flow})
    # corte mínimo = alcanzables en residual
    S = {s}
    q = deque([s])
    while q:
        u = q.popleft()
        for v, c in R.get(u, {}).items():
            if c > 1e-12 and v not in S:
                S.add(v)
                q.append(v)
    cut = [(u, v, a["capacity"]) for u, v, a in h.edges(data=True) if u in S and v not in S]
    cutv = sum(c for _, _, c in cut)
    ref = nx.maximum_flow_value(h, s, t)
    assert abs(ref - flow) < 1e-6, "inconsistencia flujo máximo"
    fl = {}
    for u, v, a in h.edges(data=True):
        used = max(0.0, a["capacity"] - R[u][v]) if (u, v) in [(x, y) for x, y in h.edges] else 0
        if used > 1e-9:
            fl[(u, v)] = used
    res["value"] = flow
    res["highlight_edges"] = [[u, v, "flujo"] for (u, v) in fl] + [[u, v, "corte"] for u, v, _ in cut]
    res["tables"] += [{"title": "Flujo por arco", "columns": ["Arco", "Flujo", "Capacidad"],
                       "rows": [[f"{ctx.label(u)}→{ctx.label(v)}", fmt(f), fmt(h[u][v]['capacity'])] for (u, v), f in fl.items()]},
                      {"title": "Corte mínimo", "columns": ["Arco", "Capacidad"],
                       "rows": [[f"{ctx.label(u)}→{ctx.label(v)}", fmt(c)] for u, v, c in cut]}]
    res["message"] = f"Flujo máximo de {ctx.label(s)} a {ctx.label(t)}: {fmt(flow)}. Corte mínimo de capacidad {fmt(cutv)} (teorema max-flow min-cut)."
    res["control"] += [{"name": "Flujo máximo", "value": flow}, {"name": "Capacidad del corte mínimo", "value": cutv}]
    res["meta"]["cut_nodes_S"] = sorted(S)
    res["meta"]["flow"] = {f"{u}->{v}": f for (u, v), f in fl.items()}
    if miss:
        res["assumptions"].append(f"{miss} arcos sin capacidad usaron default_capacity={ctx.params.get('default_capacity')}")
    return res


def min_cut(ctx: Ctx):
    r = max_flow(ctx)
    r["algorithm"] = "min_cut"
    r["title"] = "Corte mínimo s–t"
    r["highlight_edges"] = [e for e in r["highlight_edges"] if e[2] == "corte"]
    return r


def _int_scale(ctx):
    sc = ctx.scale
    return sc if sc and sc >= 1 else 1


def min_cost_flow(ctx: Ctx):
    """Transbordo equilibrado a costo mínimo: demand<0 oferta, demand>0 consumo (balance obligatorio)."""
    g = ctx.graph()
    sc = max(_int_scale(ctx), 1)
    sup = {}
    for n in ctx.p["nodes"]:
        if n["id"] not in g:
            continue
        d = (n.get("demand") or 0) - (n.get("supply") or 0)
        if d:
            sup[n["id"]] = d
    if not sup:
        raise AlgoError("No hay oferta/demanda en los nodos (columnas 'supply'/'demand').")
    tot = sum(sup.values())
    res = new_result("min_cost_flow", "Transbordo equilibrado a costo mínimo", "optimal")
    if abs(tot) > 1e-9:
        if ctx.params.get("auto_balance"):
            dummy = "__BALANCE__"
            g.add_node(dummy)
            for n in list(sup):
                g.add_edge(n, dummy, w=0, capacity=None) if tot < 0 else g.add_edge(dummy, n, w=0, capacity=None)
            sup[dummy] = -tot
            res["assumptions"].append(f"Se agregó nodo ficticio para equilibrar (desbalance {fmt(tot)}).")
        else:
            raise AlgoError(f"Oferta y demanda no están equilibradas (Σdemanda−Σoferta = {fmt(tot)}). "
                            "Equilibre los datos o active 'auto_balance'.")
    G = nx.DiGraph()
    for nid in g.nodes:
        G.add_node(nid, demand=int(round(sup.get(nid, 0))))
    for u, v, a in g.edges(data=True):
        kw = {"weight": int(round(a["w"] * sc))}
        if a.get("capacity") is not None:
            kw["capacity"] = int(round(a["capacity"]))
        G.add_edge(u, v, **kw)
    try:
        cost, flow = nx.network_simplex(G)
    except nx.NetworkXUnfeasible:
        raise AlgoError("Infactible: la red no permite enviar toda la oferta a la demanda (revise conexiones y capacidades).")
    except nx.NetworkXUnbounded:
        raise AlgoError("Problema no acotado: hay ciclo de costo negativo con capacidad infinita.")
    rows = [[f"{ctx.label(u)}→{ctx.label(v)}", f, fmt(g[u][v]['w']), fmt(f * g[u][v]['w'])]
            for u in flow for v, f in flow[u].items() if f > 0 and u in g and v in g[u]]
    res["tables"].append({"title": "Flujo por arco", "columns": ["Arco", "Flujo", "Costo unitario", "Costo"], "rows": rows})
    res["value"] = cost / sc
    res["highlight_edges"] = [[u, v, "flujo"] for u in flow for v, f in flow[u].items() if f > 0]
    res["message"] = f"Costo mínimo de transbordo: {fmt(cost / sc)} enviando {fmt(sum(v for v in sup.values() if v < 0) * -1)} unidades."
    res["control"] += [{"name": "Costo mínimo", "value": cost / sc}]
    step(res, "Se resolvió con símplex de redes (óptimo exacto, costos escalados a enteros).")
    return res


def transport(ctx: Ctx):
    """Problema de transporte: orígenes (supply>0) → destinos (demand>0) con costo = camino mínimo."""
    g = ctx.graph()
    src = {n["id"]: n.get("supply") for n in ctx.p["nodes"] if (n.get("supply") or 0) > 0 and n["id"] in g}
    dst = {n["id"]: n.get("demand") for n in ctx.p["nodes"] if (n.get("demand") or 0) > 0 and n["id"] in g}
    if not src or not dst:
        raise AlgoError("Transporte requiere nodos con oferta (supply>0) y nodos con demanda (demand>0).")
    ts, td = sum(src.values()), sum(dst.values())
    res = new_result("transport", "Problema de transporte a costo mínimo", "optimal")
    D = {s: nx.single_source_dijkstra_path_length(g, s, weight="w") for s in src}
    sc = max(_int_scale(ctx), 1000)
    G = nx.DiGraph()
    for s, a in src.items():
        G.add_node(("s", s), demand=-int(round(a)))
    for d, b in dst.items():
        G.add_node(("d", d), demand=int(round(b)))
    dummy_needed = abs(ts - td) > 1e-9
    if dummy_needed:
        if ts > td:
            G.add_node("DUMMY_D", demand=int(round(ts - td)))
            for s in src:
                G.add_edge(("s", s), "DUMMY_D", weight=0)
        else:
            G.add_node("DUMMY_S", demand=-int(round(td - ts)))
            for d in dst:
                G.add_edge("DUMMY_S", ("d", d), weight=int(round(ctx.params.get("shortage_penalty", 1e6) )) )
        res["assumptions"].append(f"Oferta ({fmt(ts)}) ≠ demanda ({fmt(td)}): se agregó un nodo ficticio.")
    for s in src:
        for d in dst:
            if d in D[s]:
                G.add_edge(("s", s), ("d", d), weight=int(round(D[s][d] * sc)))
    try:
        cost, flow = nx.network_simplex(G)
    except nx.NetworkXUnfeasible:
        raise AlgoError("Infactible: hay destinos inalcanzables desde los orígenes.")
    rows, hl = [], []
    for (a, f) in flow.items():
        for b, q in f.items():
            if q > 0 and isinstance(a, tuple) and isinstance(b, tuple):
                rows.append([ctx.label(a[1]), ctx.label(b[1]), q, fmt(D[a[1]][b[1]]), fmt(q * D[a[1]][b[1]])])
                hl.append([a[1], b[1], "flujo"])
    res["tables"].append({"title": "Plan de transporte (costo = camino mínimo)", "columns": ["Origen", "Destino", "Unidades", "Costo unit.", "Costo"], "rows": rows})
    res["value"] = sum(float(r[4]) for r in rows)
    res["highlight_edges"] = hl
    res["message"] = f"Costo mínimo de transporte: {fmt(res['value'])}."
    res["control"].append({"name": "Costo mínimo", "value": res["value"]})
    return res


def assignment(ctx: Ctx):
    from scipy.optimize import linear_sum_assignment
    g = ctx.graph()
    A = ctx.selection("sources") or [n["id"] for n in ctx.p["nodes"] if (n.get("supply") or 0) > 0 and n["id"] in g]
    B = ctx.selection("targets") or [n["id"] for n in ctx.p["nodes"] if (n.get("demand") or 0) > 0 and n["id"] in g]
    if not A or not B:
        raise AlgoError("Asignación: indique 'sources' y 'targets' o cargue oferta/demanda.")
    D = {a: nx.single_source_dijkstra_path_length(g, a, weight="w") for a in A}
    C = np.array([[D[a].get(b, 1e12) for b in B] for a in A])
    r, c = linear_sum_assignment(C)
    res = new_result("assignment", "Asignación a costo mínimo (Húngaro)", "optimal")
    rows = [[ctx.label(A[i]), ctx.label(B[j]), fmt(C[i, j])] for i, j in zip(r, c)]
    if any(C[i, j] >= 1e12 for i, j in zip(r, c)):
        raise AlgoError("No hay asignación completa factible (pares inalcanzables).")
    res["tables"].append({"title": "Asignación", "columns": ["Agente", "Tarea", "Costo"], "rows": rows})
    res["value"] = float(C[r, c].sum())
    res["highlight_edges"] = [[A[i], B[j], "flujo"] for i, j in zip(r, c)]
    res["message"] = f"Asignación óptima de costo total {fmt(res['value'])}."
    return res
