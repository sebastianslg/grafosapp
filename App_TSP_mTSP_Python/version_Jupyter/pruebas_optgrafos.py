"""Pruebas de optgrafos contra métodos independientes (fuerza bruta, SciPy, NetworkX).
Los oráculos solo se usan aquí para verificar; la librería no los usa.   Ejecutar: pytest -q
"""
import itertools
import os

import numpy as np
import pandas as pd
import pytest

import optgrafos as og

AQUI = os.path.dirname(os.path.abspath(__file__))


def red_aleatoria(n, semilla=1, dirigida=False):
    rng = np.random.default_rng(semilla)
    P = rng.random((n, 2))
    D = np.linalg.norm(P[:, None] - P[None], axis=2)
    if dirigida:
        D = D * (0.7 + 0.6 * rng.random((n, n)))
    return og.Red(D, list(range(1, n + 1)), dirigido=dirigida)


def costo_ruta(D, ruta):
    return sum(D[a, b] for a, b in zip(ruta[:-1], ruta[1:]))


@pytest.mark.parametrize("dirigida", [False, True])
def test_tsp_ciclo_vs_fuerza_bruta(dirigida):
    red = red_aleatoria(8, 3, dirigida)
    D = red.D.copy(); np.fill_diagonal(D, 0)
    mejor = min(costo_ruta(D, (0,) + p + (0,)) for p in itertools.permutations(range(1, 8)))
    for metodo in ("dfj", "mtz"):
        r = og.tsp(red, metodo=metodo)
        assert r.estado == "óptimo" and abs(r.objetivo - mejor) < 1e-6


def test_tsp_modos_abiertos():
    red = red_aleatoria(7, 5)
    D = red.D.copy(); np.fill_diagonal(D, 0)
    resto = range(1, 7)
    abierto = min(costo_ruta(D, (0,) + p) for p in itertools.permutations(resto))
    assert abs(og.tsp(red, 1, "abierto").objetivo - abierto) < 1e-6
    fijo = min(costo_ruta(D, (0,) + p + (6,)) for p in itertools.permutations(range(1, 6)))
    r = og.tsp(red, 1, "fijo", fin=7)
    assert abs(r.objetivo - fijo) < 1e-6 and r.rutas[0][0] == 1 and r.rutas[0][-1] == 7
    libre = min(costo_ruta(D, p) for p in itertools.permutations(range(7)))
    assert abs(og.tsp(red, modo="libre").objetivo - libre) < 1e-6


def test_tsp_con_arcos_prohibidos():
    red = red_aleatoria(6, 2)
    red.D[0, 3] = red.D[3, 0] = np.inf
    r = og.tsp(red)
    ruta = r.rutas[0]
    assert (1, 4) not in zip(ruta[:-1], ruta[1:]) and (4, 1) not in zip(ruta[:-1], ruta[1:])


def test_mtsp_vs_fuerza_bruta():
    red = red_aleatoria(7, 4)
    D = red.D.copy(); np.fill_diagonal(D, 0)
    cl = list(range(1, 7))
    mejor = 1e9
    for p in itertools.permutations(cl):
        for corte in range(1, 6):
            a, b = p[:corte], p[corte:]
            mejor = min(mejor, costo_ruta(D, (0,) + a + (0,)) + costo_ruta(D, (0,) + b + (0,)))
    r = og.mtsp(red, 2, lmin=1)
    assert r.estado == "óptimo" and abs(r.objetivo - mejor) < 1e-6
    visitados = sorted(u for ruta in r.rutas for u in ruta if u != 1)
    assert visitados == [2, 3, 4, 5, 6, 7]


def test_mtsp_balance_y_minmax():
    red = red_aleatoria(8, 6)
    D = red.D.copy(); np.fill_diagonal(D, 0)
    r = og.mtsp(red, 2, lmin=3, lmax=4)
    assert sorted(len(x) - 2 for x in r.rutas) == [3, 4]
    cl = list(range(1, 8))
    mejor = 1e9
    for p in itertools.permutations(cl):
        for corte in range(1, 7):
            a, b = p[:corte], p[corte:]
            mejor = min(mejor, max(costo_ruta(D, (0,) + a + (0,)), costo_ruta(D, (0,) + b + (0,))))
    r = og.mtsp(red, 2, objetivo="maximo")
    assert abs(r.objetivo - mejor) < 1e-6


def test_formulaciones_coinciden():
    red = red_aleatoria(10, 12)
    a = og.vrp(red, 3, 1, lmin=2, lmax=4, formulacion="2indices")
    b = og.vrp(red, 3, 1, lmin=2, lmax=4, formulacion="vehiculos")
    assert a.estado == b.estado == "óptimo" and abs(a.objetivo - b.objetivo) < 1e-6
    assert sorted(a.tablas["rutas"].clientes) == sorted(b.tablas["rutas"].clientes)
    a = og.vrp(red, 2, 1, lmin=4, abierto=True, formulacion="2indices")
    b = og.vrp(red, 2, 1, lmin=4, abierto=True, formulacion="vehiculos")
    assert abs(a.objetivo - b.objetivo) < 1e-6


def test_cvrp_capacidad():
    red = red_aleatoria(8, 7)
    dem = [0, 4, 3, 5, 2, 4, 3, 2]
    r = og.cvrp(red, 3, 9, dem)
    assert r.estado == "óptimo"
    assert all(f <= 9 + 1e-9 for f in r.tablas["rutas"]["carga"])
    assert r.tablas["rutas"]["clientes"].sum() == 7


def test_camino_minimo_vs_scipy():
    from scipy.sparse.csgraph import dijkstra
    red = red_aleatoria(12, 8, True)
    # grafo ralo: quitar arcos
    rng = np.random.default_rng(0)
    red.D[rng.random(red.D.shape) < 0.55] = np.inf
    np.fill_diagonal(red.D, np.inf)
    W = np.where(np.isfinite(red.D), red.D, 0)
    ref = dijkstra(W, directed=True)
    todo = og.todos_los_caminos(red)
    d = todo.extra["dist"]
    ok = np.isfinite(ref)
    assert np.allclose(d[ok], ref[ok], atol=1e-6)
    assert np.all(np.isinf(d[~ok]))
    r = og.camino_minimo(red, 1, 12)
    if np.isfinite(ref[0, 11]):
        assert abs(r.objetivo - ref[0, 11]) < 1e-6
        assert abs(sum(a[2] for a in r.arcos) - r.objetivo) < 1e-9


def test_arbol_minimo_vs_scipy():
    from scipy.sparse.csgraph import minimum_spanning_tree
    for sem in (1, 2):
        red = red_aleatoria(14, sem)
        ref = minimum_spanning_tree(np.where(np.isfinite(red.D), red.D, 0)).sum()
        for raiz in (1, 9):
            r = og.arbol_minimo(red, raiz)
            assert r.estado == "óptimo" and abs(r.objetivo - ref) < 1e-6 and len(r.arcos) == 13


def test_flujo_maximo_vs_networkx():
    import networkx as nx
    aristas = [(1, 2, 10, 10), (1, 3, 8, 8), (2, 3, 5, 5), (2, 4, 5, 5), (3, 5, 10, 10), (4, 5, 7, 7), (4, 6, 8, 8), (5, 6, 10, 10)]
    red = og.Red.desde_aristas([(a, b, c, u) for a, b, c, u in aristas], dirigido=True)
    G = nx.DiGraph(); G.add_weighted_edges_from([(a, b, u) for a, b, _, u in aristas], weight="capacity")
    ref = nx.maximum_flow_value(G, 1, 6)
    assert abs(og.flujo_maximo(red, 1, 6).objetivo - ref) < 1e-9


def test_flujo_costo_minimo_vs_networkx():
    import networkx as nx
    G = nx.DiGraph()
    datos = [(1, 2, 4, 6), (1, 3, 2, 5), (2, 3, 1, 3), (2, 4, 5, 4), (3, 4, 3, 8), (3, 5, 6, 5), (4, 5, 1, 7)]
    for a, b, c, u in datos:
        G.add_edge(a, b, weight=c, capacity=u)
    G.nodes[1]["demand"] = -8; G.nodes[5]["demand"] = 8
    ref = nx.min_cost_flow_cost(G)
    red = og.Red.desde_aristas(datos, dirigido=True)
    assert abs(og.flujo_costo_minimo(red, {1: 8, 5: -8}).objetivo - ref) < 1e-6


def test_asignacion_y_transporte():
    from scipy.optimize import linear_sum_assignment
    C = np.random.default_rng(3).integers(1, 30, (6, 6)).astype(float)
    f, c = linear_sum_assignment(C)
    assert abs(og.asignacion(C).objetivo - C[f, c].sum()) < 1e-9
    f, c = linear_sum_assignment(C, maximize=True)
    assert abs(og.asignacion(C, maximizar=True).objetivo - C[f, c].sum()) < 1e-9
    import networkx as nx
    costo = np.array([[4, 6, 9], [5, 3, 7]], float)
    r = og.transporte(costo, [30, 40], [20, 25, 25])
    G = nx.DiGraph()
    G.add_node("s1", demand=-30); G.add_node("s2", demand=-40)
    for j, d in enumerate([20, 25, 25]):
        G.add_node(f"d{j}", demand=d)
    for i in range(2):
        for j in range(3):
            G.add_edge(f"s{i+1}", f"d{j}", weight=costo[i, j])
    G.add_node("ficticio", demand=70 - 70)
    # oferta (70) = demanda (70): balanceado
    assert abs(r.objetivo - nx.min_cost_flow_cost(G)) < 1e-6


def test_cartero_chino():
    # Triángulo con un pendiente: grados impares en 1 y 4 -> repetir el camino 1-4
    red = og.Red.desde_aristas([(1, 2, 3), (2, 3, 4), (3, 1, 5), (3, 4, 2)])
    r = og.cartero_chino(red)
    assert abs(r.objetivo - (3 + 4 + 5 + 2 + 2)) < 1e-9  # grados impares en 3 y 4: se repite la arista 3-4
    # Red euleriana: no repite nada
    red = og.Red.desde_aristas([(1, 2, 1), (2, 3, 1), (3, 1, 1)])
    assert abs(og.cartero_chino(red).objetivo - 3) < 1e-9


def test_localizacion_vs_fuerza_bruta():
    red = red_aleatoria(9, 11)
    D = red.D.copy(); np.fill_diagonal(D, 0)
    p = 3
    med = min(sum(D[i, list(S)].min() for i in range(9)) for S in itertools.combinations(range(9), p))
    cen = min(max(D[i, list(S)].min() for i in range(9)) for S in itertools.combinations(range(9), p))
    assert abs(og.p_mediana(red, p).objetivo - med) < 1e-6
    assert abs(og.p_centro(red, p).objetivo - cen) < 1e-6
    r = 0.35
    k = min(len(S) for k in range(1, 10) for S in itertools.combinations(range(9), k)
            if all(D[i, list(S)].min() <= r for i in range(9)))
    assert og.cobertura(red, r).objetivo == k


def test_cargadores():
    txt = "\t1\t2\t3\n1\t#\t5\t9\n2\t5\t#\t2\n3\t9\t2\t#"
    red = og.cargar(txt)
    assert red.n == 3 and red.D[0, 1] == 5 and np.isinf(red.D[0, 0])
    assert og.camino_minimo(red, 1, 3).objetivo == 7
    red = og.cargar("origen,destino,costo\n1,2,5\n2,3,2\n1,3,9")
    assert og.camino_minimo(red, 1, 3).objetivo == 7
    red = og.cargar("id,nombre,lat,lon\n1,A,3.4,-76.5\n2,B,3.5,-76.5\n3,C,3.4,-76.4")
    assert red.n == 3 and 10 < red.D[0, 1] < 12


def test_ejemplo_demo():
    red = og.ejemplo("demo")
    assert red.n == 15 and red.demanda is not None
    sub = red.subred(list(range(9)))
    D = sub.D.copy(); np.fill_diagonal(D, 0)
    mejor = min(costo_ruta(D, (0,) + p + (0,)) for p in itertools.permutations(range(1, 9)))
    assert abs(og.tsp(sub).objetivo - mejor) < 1e-6
    assert og.tsp(red).estado == "óptimo"
    r = og.mtsp(red, 3, 0, lmin=4, lmax=5)
    assert r.estado == "óptimo" and sorted(r.tablas["rutas"].clientes) == [4, 5, 5]
