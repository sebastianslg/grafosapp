"""Localización: p-mediana, p-centro, cobertura máxima, localización a costo fijo (MILP con HiGHS)."""
from __future__ import annotations
import numpy as np
import networkx as nx
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix
from .common import *

BIG = 1e9


def _setup(ctx):
    g = ctx.graph()
    ids = list(g.nodes)
    D = dict(nx.all_pairs_dijkstra_path_length(g, weight="w"))
    cand = ctx.selection("candidates") or ids
    dem_nodes = ctx.selection("customers") or ids
    w = {n["id"]: (n.get("demand") if (n.get("demand") or 0) > 0 else 1.0) for n in ctx.p["nodes"] if n["id"] in g}
    d = np.array([[D[i].get(j, BIG) for j in cand] for i in dem_nodes])
    if (d >= BIG).all(axis=1).any():
        raise AlgoError("Hay clientes inalcanzables desde todas las candidatas (grafo desconectado).")
    return g, ids, cand, dem_nodes, np.array([w[i] for i in dem_nodes]), d


def _solve(c, A, lb, ub, integrality, bounds, tl, seed):
    return milp(c, constraints=LinearConstraint(A.tocsr(), lb, ub), integrality=integrality, bounds=bounds,
                options={"time_limit": tl, "disp": False, "presolve": True})


def _status(r):
    if r.status == 0:
        return "optimal"
    if r.x is not None:
        return "heuristic"
    return None


def p_median(ctx: Ctx):
    g, ids, cand, cus, w, d = _setup(ctx)
    p = int(ctx.params.get("p", 2))
    n, m = d.shape
    if not 1 <= p <= m:
        raise AlgoError(f"p debe estar entre 1 y {m}.")
    # vars: y_j (m) , x_ij (n*m)
    nv = m + n * m
    c = np.concatenate([np.zeros(m), (w[:, None] * d).ravel()])
    A = lil_matrix((n + n * m + 1, nv))
    lb, ub = [], []
    r = 0
    for i in range(n):
        for j in range(m):
            A[r, m + i * m + j] = 1
        lb.append(1); ub.append(1); r += 1
    for i in range(n):
        for j in range(m):
            A[r, m + i * m + j] = 1
            A[r, j] = -1
            lb.append(-np.inf); ub.append(0); r += 1
    A[r, :m] = 1
    lb.append(p); ub.append(p)
    ctx.progress(0.2, "Resolviendo MILP")
    rs = _solve(c, A, lb, ub, np.concatenate([np.ones(m), np.zeros(n * m)]), Bounds(0, 1), ctx.time_limit, ctx.seed)
    st = _status(rs)
    if st is None:
        raise AlgoError("El MILP no encontró solución factible: " + str(rs.message))
    y = rs.x[:m] > 0.5
    chosen = [cand[j] for j in range(m) if y[j]]
    X = rs.x[m:].reshape(n, m)
    assign = {cus[i]: cand[int(np.argmax(X[i]))] for i in range(n)}
    res = new_result("p_median", f"p-mediana (p={p}) – MILP", st)
    res["value"] = float(rs.fun)
    res["highlight_nodes"] = chosen
    res["highlight_edges"] = [[a, b, "asignación"] for a, b in assign.items() if a != b]
    res["tables"].append({"title": "Asignación de clientes", "columns": ["Cliente", "Mediana asignada", "Distancia"],
                          "rows": [[ctx.label(a), ctx.label(b), fmt(float(d[cus.index(a)][cand.index(b)]))] for a, b in assign.items()]})
    res["message"] = f"Medianas: {', '.join(map(ctx.label, chosen))}; costo ponderado total {fmt(res['value'])}."
    res["meta"].update(chosen=chosen, assign=assign, gap=getattr(rs, "mip_gap", None))
    res["control"].append({"name": "Costo ponderado", "value": res["value"]})
    res["assumptions"] = ["Peso de cada cliente = demanda (1 si no hay)", "Distancias = camino mínimo del criterio elegido"]
    return res


def p_center(ctx: Ctx):
    g, ids, cand, cus, w, d = _setup(ctx)
    p = int(ctx.params.get("p", 2))
    n, m = d.shape
    nv = m + n * m + 1   # y, x, z
    c = np.zeros(nv)
    c[-1] = 1
    rows = 2 * n * 0 + n + n * m + n + 1
    A = lil_matrix((rows, nv))
    lb, ub = [], []
    r = 0
    for i in range(n):
        for j in range(m):
            A[r, m + i * m + j] = 1
        lb.append(1); ub.append(1); r += 1
    for i in range(n):
        for j in range(m):
            A[r, m + i * m + j] = 1; A[r, j] = -1
            lb.append(-np.inf); ub.append(0); r += 1
    for i in range(n):
        for j in range(m):
            A[r, m + i * m + j] = d[i, j]
        A[r, nv - 1] = -1
        lb.append(-np.inf); ub.append(0); r += 1
    A[r, :m] = 1
    lb.append(p); ub.append(p)
    integ = np.concatenate([np.ones(m), np.zeros(n * m + 1)])
    rs = _solve(c, A, lb, ub, integ, Bounds(np.zeros(nv), np.concatenate([np.ones(m + n * m), [np.inf]])), ctx.time_limit, ctx.seed)
    st = _status(rs)
    if st is None:
        raise AlgoError("Sin solución: " + str(rs.message))
    chosen = [cand[j] for j in range(m) if rs.x[j] > 0.5]
    X = rs.x[m:m + n * m].reshape(n, m)
    assign = {cus[i]: cand[int(np.argmax(X[i]))] for i in range(n)}
    res = new_result("p_center", f"p-centro (p={p}) – MILP minimax", st)
    res["value"] = float(rs.x[-1])
    res["highlight_nodes"] = chosen
    res["highlight_edges"] = [[a, b, "asignación"] for a, b in assign.items() if a != b]
    res["message"] = f"Centros: {', '.join(map(ctx.label, chosen))}; distancia máxima a un cliente {fmt(res['value'])}."
    res["meta"].update(chosen=chosen, assign=assign)
    return res


def max_cover(ctx: Ctx):
    g, ids, cand, cus, w, d = _setup(ctx)
    p = int(ctx.params.get("p", 2))
    R = ctx.params.get("radius")
    if R is None:
        raise AlgoError("Cobertura máxima requiere 'radius' (radio de cobertura en las unidades del criterio).")
    R = float(R)
    n, m = d.shape
    cov = d <= R + 1e-9
    nv = m + n
    c = np.concatenate([np.zeros(m), -w])
    A = lil_matrix((n + 1, nv))
    lb, ub = [], []
    for i in range(n):
        A[i, m + i] = 1
        for j in range(m):
            if cov[i, j]:
                A[i, j] = -1
        lb.append(-np.inf); ub.append(0)
    A[n, :m] = 1
    lb.append(p); ub.append(p)
    rs = _solve(c, A, lb, ub, np.ones(nv), Bounds(0, 1), ctx.time_limit, ctx.seed)
    st = _status(rs)
    if st is None:
        raise AlgoError("Sin solución: " + str(rs.message))
    chosen = [cand[j] for j in range(m) if rs.x[j] > 0.5]
    covered = [cus[i] for i in range(n) if rs.x[m + i] > 0.5]
    res = new_result("max_cover", f"Cobertura máxima (p={p}, radio {fmt(R)})", st)
    res["value"] = float(-rs.fun)
    res["highlight_nodes"] = chosen
    res["message"] = f"Instalaciones {', '.join(map(ctx.label, chosen))} cubren {len(covered)}/{n} clientes (demanda cubierta {fmt(res['value'])} de {fmt(float(w.sum()))})."
    res["meta"].update(chosen=chosen, covered=covered)
    return res


def fixed_charge(ctx: Ctx):
    """Localización a costo mínimo (UFLP/CFLP): costo fijo por instalación (param fixed_cost o extra.fixed_cost) + asignación."""
    g, ids, cand, cus, w, d = _setup(ctx)
    n, m = d.shape
    fc_default = ctx.params.get("fixed_cost")
    fc = []
    for j in cand:
        node = next(x for x in ctx.p["nodes"] if x["id"] == j)
        v = (node.get("extra") or {}).get("fixed_cost", fc_default)
        if v is None:
            raise AlgoError(f"Falta costo fijo para la candidata {j}: use el parámetro 'fixed_cost' o una columna fixed_cost.")
        fc.append(float(v))
    cap = ctx.params.get("facility_capacity")
    nv = m + n * m
    c = np.concatenate([np.array(fc), (w[:, None] * d).ravel()])
    rows = n + n * m + (m if cap else 0)
    A = lil_matrix((rows, nv))
    lb, ub = [], []
    r = 0
    for i in range(n):
        for j in range(m):
            A[r, m + i * m + j] = 1
        lb.append(1); ub.append(1); r += 1
    for i in range(n):
        for j in range(m):
            A[r, m + i * m + j] = 1; A[r, j] = -1
            lb.append(-np.inf); ub.append(0); r += 1
    if cap:
        for j in range(m):
            for i in range(n):
                A[r, m + i * m + j] = w[i]
            A[r, j] = -float(cap)
            lb.append(-np.inf); ub.append(0); r += 1
    rs = _solve(c, A, lb, ub, np.concatenate([np.ones(m), np.zeros(n * m)]), Bounds(0, 1), ctx.time_limit, ctx.seed)
    st = _status(rs)
    if st is None:
        raise AlgoError("Infactible (¿capacidad total insuficiente?): " + str(rs.message))
    chosen = [cand[j] for j in range(m) if rs.x[j] > 0.5]
    X = rs.x[m:].reshape(n, m)
    assign = {cus[i]: cand[int(np.argmax(X[i]))] for i in range(n)}
    fixed_total = sum(fc[j] for j in range(m) if rs.x[j] > 0.5)
    res = new_result("fixed_charge", "Localización a costo mínimo – MILP", st)
    res["value"] = float(rs.fun)
    res["highlight_nodes"] = chosen
    res["highlight_edges"] = [[a, b, "asignación"] for a, b in assign.items() if a != b]
    res["tables"].append({"title": "Desglose", "columns": ["Concepto", "Valor"],
                          "rows": [["Costo fijo", fmt(fixed_total)], ["Costo de asignación", fmt(float(rs.fun) - fixed_total)], ["Total", fmt(float(rs.fun))]]})
    res["message"] = f"Abrir {', '.join(map(ctx.label, chosen))}: costo total {fmt(res['value'])} (fijo {fmt(fixed_total)} + asignación {fmt(res['value'] - fixed_total)})."
    res["meta"].update(chosen=chosen, assign=assign)
    return res
