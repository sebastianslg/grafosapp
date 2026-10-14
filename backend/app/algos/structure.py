"""Estructura del grafo: conexidad, articulación, puentes, grados, centralidad, coloreo, diámetro, ciclos, Euler."""
from __future__ import annotations
import networkx as nx
from .common import *
from ..graphs import undirected_view


def _ug(ctx):
    return undirected_view(ctx.graph())


def components(ctx: Ctx):
    g = ctx.graph()
    res = new_result("components", "Componentes conexas y fuertemente conexas", "optimal")
    u = undirected_view(g)
    cc = [sorted(c) for c in nx.connected_components(u)]
    scc = [sorted(c) for c in nx.strongly_connected_components(g)]
    res["tables"] += [{"title": "Componentes conexas", "columns": ["#", "Tamaño", "Nodos"],
                       "rows": [[i + 1, len(c), ", ".join(c[:40])] for i, c in enumerate(cc)]},
                      {"title": "Componentes fuertemente conexas", "columns": ["#", "Tamaño", "Nodos"],
                       "rows": [[i + 1, len(c), ", ".join(c[:40])] for i, c in enumerate(scc)]}]
    res["value"] = len(cc)
    res["message"] = f"{len(cc)} componente(s) conexa(s) y {len(scc)} fuertemente conexa(s). " + \
        ("El grafo es fuertemente conexo." if len(scc) == 1 else "No es fuertemente conexo: hay pares sin camino dirigido.")
    res["meta"]["components"] = cc
    res["highlight_nodes"] = []
    return res


def articulation(ctx: Ctx):
    u = _ug(ctx)
    aps = sorted(nx.articulation_points(u))
    br = sorted(nx.bridges(u))
    res = new_result("articulation", "Puntos de articulación y puentes", "optimal")
    res["tables"] += [{"title": "Puntos de articulación", "columns": ["Nodo"], "rows": [[ctx.label(a)] for a in aps]},
                      {"title": "Puentes", "columns": ["Arista"], "rows": [[f"{ctx.label(a)}–{ctx.label(b)}"] for a, b in br]}]
    res["highlight_nodes"] = aps
    res["highlight_edges"] = [[a, b, "puente"] for a, b in br]
    res["value"] = len(aps)
    res["message"] = f"{len(aps)} punto(s) de articulación y {len(br)} puente(s)." + \
        ("" if nx.is_connected(u) else " Nota: el grafo no es conexo; se analiza cada componente.")
    res["meta"].update(aps=aps, bridges=br)
    return res


def degrees(ctx: Ctx):
    g = ctx.graph()
    res = new_result("degrees", "Grados y centralidad", "optimal")
    u = undirected_view(g)
    bc = nx.betweenness_centrality(g, weight="w")
    cc = nx.closeness_centrality(g, distance="w")
    pr = nx.pagerank(g, weight=None)
    rows = [[ctx.label(n), g.in_degree(n), g.out_degree(n), u.degree(n), round(bc[n], 4), round(cc[n], 4), round(pr[n], 4)]
            for n in g.nodes]
    rows.sort(key=lambda r: -r[4])
    res["tables"].append({"title": "Grados y centralidades", "columns": ["Nodo", "Grado entrada", "Grado salida", "Grado (no dir.)",
                                                                       "Intermediación", "Cercanía", "PageRank"], "rows": rows})
    res["value"] = max(r[3] for r in rows)
    res["message"] = f"Nodo más central por intermediación: {rows[0][0]} ({rows[0][4]}). Grado máximo {res['value']}."
    res["meta"]["betweenness"] = bc
    return res


def diameter(ctx: Ctx):
    g = ctx.graph()
    res = new_result("diameter", "Diámetro, radio y centro", "optimal", CRITERIA[ctx.criterion])
    if not nx.is_strongly_connected(g):
        raise AlgoError("El diámetro requiere un grafo fuertemente conexo (hay pares sin camino).")
    ecc = {}
    far = {}
    for s in g:
        d = nx.single_source_dijkstra_path_length(g, s, weight="w")
        t = max(d, key=d.get)
        ecc[s], far[s] = d[t], t
    dia = max(ecc.values())
    s = max(ecc, key=ecc.get)
    rad = min(ecc.values())
    center = [n for n, e in ecc.items() if abs(e - rad) < 1e-9]
    _, pth = nx.single_source_dijkstra(g, s, far[s], weight="w")
    add_path(res, g, ctx, pth, "diámetro", detail=False)
    res["value"] = dia
    res["message"] = f"Diámetro {fmt(dia)} (de {ctx.label(s)} a {ctx.label(far[s])}); radio {fmt(rad)}; centro: {', '.join(map(ctx.label, center))}."
    return res


def cycles(ctx: Ctx):
    g = ctx.graph()
    res = new_result("cycles", "Ciclos", "optimal")
    if g.number_of_nodes() > 200:
        raise AlgoError("Enumerar ciclos con más de 200 nodos es inviable; use componentes/articulación.")
    lim = int(ctx.params.get("limit", 200))
    u = undirected_view(g)
    basis = nx.cycle_basis(u)
    res["tables"].append({"title": "Base de ciclos (no dirigido)", "columns": ["#", "Largo", "Ciclo"],
                          "rows": [[i + 1, len(c), " > ".join(c + [c[0]])] for i, c in enumerate(basis[:lim])]})
    dag = nx.is_directed_acyclic_graph(g)
    res["value"] = len(basis)
    res["message"] = f"Base de ciclos de dimensión {len(basis)} (número ciclomático = |E|−|V|+c). " + \
        ("El grafo dirigido es acíclico (DAG)." if dag else "El grafo dirigido contiene ciclos dirigidos.")
    if basis:
        c = basis[0]
        res["highlight_edges"] = [[a, b, "ciclo"] for a, b in zip(c, c[1:] + [c[0]])]
    return res


def euler(ctx: Ctx):
    """Circuito euleriano – Hierholzer (con diagnóstico si no existe)."""
    g = ctx.graph()
    undirected = not any(a.get("directed") for _, _, a in g.edges(data=True))
    res = new_result("euler", "Circuito euleriano – Hierholzer", "optimal")
    if undirected:
        u = undirected_view(g)
        odd = [n for n in u if u.degree(n) % 2]
        if odd or not nx.is_connected(u.subgraph([n for n in u if u.degree(n) > 0])):
            raise AlgoError("No existe circuito euleriano: " + (f"nodos de grado impar {odd[:20]}. " if odd else "") +
                            "Use el cartero chino para duplicar aristas mínimas.")
        adj = {n: [(v, i) for i, v in enumerate(u[n])] for n in u}
        used = set()
        stack, circ = [ctx.node("source", required=False) or next(n for n in u if u.degree(n) > 0)], []
        ptr = {n: 0 for n in u}
        while stack:
            v = stack[-1]
            while ptr[v] < len(adj[v]) and frozenset((v, adj[v][ptr[v]][0])) in used:
                ptr[v] += 1
            if ptr[v] == len(adj[v]):
                circ.append(stack.pop())
            else:
                w = adj[v][ptr[v]][0]
                used.add(frozenset((v, w)))
                stack.append(w)
        circ.reverse()
        tot = sum(u[a][b]["w"] for a, b in zip(circ, circ[1:]))
    else:
        if not nx.is_eulerian(g):
            raise AlgoError("No existe circuito euleriano dirigido (grados de entrada ≠ salida o no conexo).")
        circ = [e[0] for e in nx.eulerian_circuit(g)] + [next(iter(g))]
        tot = sum(g[a][b]["w"] for a, b in zip(circ, circ[1:]))
    res["paths"].append({"label": "circuito", "nodes": circ, "cost": tot, "totals": {"w": tot}})
    res["highlight_edges"] = [[a, b, "circuito"] for a, b in zip(circ, circ[1:])]
    res["value"] = tot
    step(res, "Hierholzer: recorrer aristas sin repetir hasta cerrar; empalmar subcircuitos.")
    res["message"] = f"Circuito euleriano de longitud {fmt(tot)} con {len(circ) - 1} aristas: " + " > ".join(circ[:60])
    return res


def coloring(ctx: Ctx):
    """Coloreo exacto con CP-SAT (número cromático) vs heurística DSATUR."""
    from ortools.sat.python import cp_model
    u = _ug(ctx)
    ids = list(u.nodes)
    n = len(ids)
    if n > 120:
        raise AlgoError("Coloreo exacto limitado a ≤120 nodos; se recomienda heurística para redes mayores.")
    greedy = nx.coloring.greedy_color(u, strategy="DSATUR")
    ub = max(greedy.values()) + 1 if greedy else 0
    res = new_result("coloring", "Coloreo de grafos – exacto (CP-SAT) vs DSATUR", "optimal")
    lb = max((len(c) for c in nx.find_cliques(u)), default=1)
    m = cp_model.CpModel()
    col = {v: m.NewIntVar(0, ub - 1, f"c{v}") for v in ids}
    k = m.NewIntVar(1, ub, "k")
    for a, b in u.edges:
        m.Add(col[a] != col[b])
    for v in ids:
        m.Add(col[v] < k)
    m.Minimize(k)
    sv = cp_model.CpSolver()
    sv.parameters.max_time_in_seconds = ctx.time_limit
    sv.parameters.random_seed = ctx.seed
    sv.parameters.num_workers = 1
    st = sv.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise AlgoError("No se obtuvo coloreo.")
    exact = {v: sv.Value(col[v]) for v in ids}
    res["status"] = "optimal" if st == cp_model.OPTIMAL else "heuristic"
    res["value"] = sv.Value(k)
    res["tables"].append({"title": "Colores", "columns": ["Nodo", "Color exacto", "Color DSATUR"],
                          "rows": [[ctx.label(v), exact[v] + 1, greedy[v] + 1] for v in ids]})
    res["meta"]["colors"] = {v: exact[v] for v in ids}
    res["message"] = (f"Número cromático {res['value']}" if st == cp_model.OPTIMAL else f"Mejor coloreo hallado con {res['value']} colores (no probado óptimo)") + \
        f"; DSATUR usó {ub}; cota inferior por clique máxima {lb}."
    res["control"] += [{"name": "Colores (exacto)", "value": res["value"]}, {"name": "Colores (DSATUR)", "value": ub}]
    return res
