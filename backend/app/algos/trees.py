"""Árboles: Kruskal, Prim (mínimo y máximo), árbol de caminos mínimos/máximos (Dijkstra)."""
from __future__ import annotations
import heapq
import math
import networkx as nx
from .common import *
from ..graphs import undirected_view
from .paths import dijkstra_steps


class DSU:
    def __init__(self, xs):
        self.p = {x: x for x in xs}

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a == b:
            return False
        self.p[a] = b
        return True


def _ug(ctx):
    return undirected_view(ctx.graph())


def kruskal(ctx: Ctx):
    mx = ctx.params.get("mode", "min") == "max"
    h = _ug(ctx)
    res = new_result("kruskal", f"Árbol de valor total {'máximo' if mx else 'mínimo'} – Kruskal", "optimal",
                     CRITERIA[ctx.criterion])
    edges = sorted(h.edges(data=True), key=lambda e: (-e[2]["w"] if mx else e[2]["w"], str(e[0]), str(e[1])))
    d = DSU(h.nodes)
    total, acc = 0.0, []
    for u, v, a in edges:
        if d.union(u, v):
            total += a["w"]
            acc.append((u, v, a["w"]))
            step(res, f"Aceptar {ctx.label(u)}–{ctx.label(v)} ({fmt(a['w'])}): une dos componentes distintas; total {fmt(total)}",
                 nodes=[u, v], edges=[(u, v)], state="accepted", data={"w": a["w"], "total": total})
        else:
            step(res, f"Rechazar {ctx.label(u)}–{ctx.label(v)} ({fmt(a['w'])}): ya están conectados (cerraría un ciclo)",
                 nodes=[u, v], edges=[(u, v)], state="rejected", data={"w": a["w"]})
    ncomp = nx.number_connected_components(h)
    res["value"] = total
    res["highlight_edges"] = [[u, v, "árbol"] for u, v, _ in acc]
    res["tables"].append({"title": "Aristas del árbol", "columns": ["Origen", "Destino", "Peso"],
                          "rows": [[ctx.label(u), ctx.label(v), fmt(w)] for u, v, w in acc]})
    kind = "árbol" if ncomp == 1 else f"bosque de {ncomp} árboles (grafo no conexo)"
    res["message"] = f"{kind} {'máximo' if mx else 'mínimo'}: {len(acc)} aristas, valor total {fmt(total)}."
    res["control"] += [{"name": "Valor total", "value": total}, {"name": "Valor escalado (entero)", "value": scaled(ctx, total)},
                       {"name": "Aristas", "value": len(acc)}]
    res["meta"]["components"] = ncomp
    res["assumptions"] = ["Grafo tratado como no dirigido (mínimo de ambos sentidos)"]
    return res


def prim(ctx: Ctx):
    mx = ctx.params.get("mode", "min") == "max"
    h = _ug(ctx)
    res = new_result("prim", f"Árbol de valor total {'máximo' if mx else 'mínimo'} – Prim", "optimal", CRITERIA[ctx.criterion])
    root = ctx.node("source", required=False) or next(iter(h.nodes))
    seen, total, acc = set(), 0.0, []
    sign = -1 if mx else 1
    comps = 0
    for start in [root] + [n for n in h.nodes if n != root]:
        if start in seen:
            continue
        comps += 1
        seen.add(start)
        pq = [(sign * a["w"], start, v) for v, a in h[start].items()]
        heapq.heapify(pq)
        step(res, f"Iniciar en {ctx.label(start)}", nodes=[start], state="visit")
        while pq:
            w, u, v = heapq.heappop(pq)
            if v in seen:
                continue
            seen.add(v)
            total += sign * w
            acc.append((u, v, sign * w))
            step(res, f"Agregar {ctx.label(u)}–{ctx.label(v)} ({fmt(sign * w)}): arista de {'mayor' if mx else 'menor'} peso que sale del árbol; total {fmt(total)}",
                 nodes=[v], edges=[(u, v)], state="accepted", data={"total": total})
            for x, a in h[v].items():
                if x not in seen:
                    heapq.heappush(pq, (sign * a["w"], v, x))
    res["value"] = total
    res["highlight_edges"] = [[u, v, "árbol"] for u, v, _ in acc]
    res["tables"].append({"title": "Aristas del árbol", "columns": ["Origen", "Destino", "Peso"],
                          "rows": [[ctx.label(u), ctx.label(v), fmt(w)] for u, v, w in acc]})
    res["message"] = f"Árbol {'máximo' if mx else 'mínimo'} (Prim) desde {ctx.label(root)}: {len(acc)} aristas, valor {fmt(total)}" + \
        ("" if comps == 1 else f" ({comps} componentes: bosque)") + "."
    res["control"] += [{"name": "Valor total", "value": total}, {"name": "Valor escalado (entero)", "value": scaled(ctx, total)}]
    res["assumptions"] = ["Grafo tratado como no dirigido"]
    return res


def sp_tree(ctx: Ctx):
    """Árbol de caminos mínimos (o de máxima capacidad de cuello de botella) desde un origen."""
    mode = ctx.params.get("mode", "min")
    g = ctx.graph()
    s = ctx.node("source")
    if mode == "min":
        res = new_result("sp_tree", "Árbol de caminos mínimos – Dijkstra (origen)", "optimal", CRITERIA[ctx.criterion])
        dist, prev = dijkstra_steps(g, s, ctx, res)
        res["value"] = sum(g[prev[v]][v]["w"] for v in prev)
        res["meta"]["path_total"] = sum(dist.values())
        res["highlight_edges"] = [[prev[v], v, "árbol"] for v in prev]
        res["tables"].append({"title": "Árbol de caminos mínimos", "columns": ["Nodo", "Padre", "Costo desde origen"],
                              "rows": [[ctx.label(v), ctx.label(prev[v]) if v in prev else "—", fmt(dist[v])] for v in dist]})
        res["message"] = f"Árbol de caminos mínimos desde {ctx.label(s)}: {len(prev)} arcos, valor total de arcos {fmt(res['value'])}."
        return res
    # Árbol "máximo": camino de máxima capacidad (cuello de botella) — Dijkstra modificado
    res = new_result("sp_tree", "Árbol de caminos de máxima capacidad – Dijkstra modificado (origen)", "optimal", CRITERIA[ctx.criterion])
    best = {s: math.inf}
    prev = {}
    pq = [(-math.inf, s)]
    done = set()
    while pq:
        b, u = heapq.heappop(pq)
        b = -b
        if u in done:
            continue
        done.add(u)
        for v, a in g[u].items():
            nb = min(b, a["w"])
            if nb > best.get(v, -math.inf):
                best[v] = nb
                prev[v] = u
                heapq.heappush(pq, (-nb, v))
                step(res, f"Actualizar {ctx.label(v)}: cuello de botella {fmt(nb)} vía {ctx.label(u)}", nodes=[v], edges=[(u, v)], state="accepted")
    res["highlight_edges"] = [[prev[v], v, "árbol"] for v in prev]
    res["value"] = sum(g[prev[v]][v]["w"] for v in prev)
    res["tables"].append({"title": "Cuello de botella desde el origen", "columns": ["Nodo", "Padre", "Capacidad mínima del camino"],
                          "rows": [[ctx.label(v), ctx.label(prev[v]) if v in prev else "—", fmt(best[v]) if v != s else "∞"] for v in best]})
    res["message"] = f"Árbol de caminos de máxima capacidad desde {ctx.label(s)}."
    res["assumptions"] = ["Interpretación de 'árbol máximo – Dijkstra': maximiza el valor mínimo de arista (cuello de botella) en cada camino"]
    return res
