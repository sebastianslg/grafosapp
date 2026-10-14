import itertools, math, random
import networkx as nx
import pytest
from app.algos import registry as R
from app.algos.common import AlgoError
from app.samples import sample_small, sample_fleet, sample_transshipment
from app.graphs import build_nx
from helpers import proj


def rnd_graph(n=12, seed=3, directed=False):
    r = random.Random(seed)
    edges = set()
    for i in range(1, n):
        edges.add((i, r.randrange(i)))
    for _ in range(n):
        a, b = r.sample(range(n), 2)
        edges.add((a, b))
    return proj(range(n), [(a, b, r.randint(1, 20)) for a, b in sorted(edges)], directed=directed)


def test_dijkstra_matches_networkx():
    p = rnd_graph(directed=True)
    g = build_nx(p, "cost")
    for t in range(1, 12):
        try:
            ref = nx.dijkstra_path_length(g, "0", str(t), weight="w")
        except nx.NetworkXNoPath:
            with pytest.raises(AlgoError):
                R.run("dijkstra", p, dict(source="0", target=str(t)))
            continue
        r = R.run("dijkstra", p, dict(source="0", target=str(t)))
        assert r["value"] == pytest.approx(ref)
        assert r["status"] == "optimal"


def test_floyd_equals_dijkstra_all_pairs():
    p = rnd_graph(seed=5)
    r = R.run("floyd_warshall", p, {})
    g = build_nx(p, "cost")
    D = dict(nx.all_pairs_dijkstra_path_length(g, weight="w"))
    ids = r["matrix"]["ids"]
    for i, a in enumerate(ids):
        for j, b in enumerate(ids):
            assert r["matrix"]["values"][i][j] == pytest.approx(D[a][b])
    assert r["value"] == pytest.approx(sum(D[a][b] for a in D for b in D[a] if a != b))


def test_bellman_ford_negative_and_cycle():
    p = proj(["a", "b", "c", "d"], [("a", "b", 4), ("a", "c", 5), ("b", "d", -3), ("c", "d", 2)], directed=True)
    assert R.run("bellman_ford", p, dict(source="a", target="d"))["value"] == 1
    p2 = proj(["a", "b", "c"], [("a", "b", 1), ("b", "c", -3), ("c", "b", 1)], directed=True)
    with pytest.raises(AlgoError, match="negativo"):
        R.run("bellman_ford", p2, dict(source="a"))
    with pytest.raises(AlgoError, match="negativos"):
        R.run("dijkstra", p, dict(source="a", target="d"))


def test_critical_path_and_longest():
    p = proj(["s", "a", "b", "t"], [("s", "a", 3), ("s", "b", 2), ("a", "t", 4), ("b", "t", 6)], directed=True)
    r = R.run("critical_path", p, dict(criterion="cost"))
    assert r["value"] == 8 and r["paths"][0]["nodes"] == ["s", "b", "t"]
    assert R.run("bellman_ford", p, dict(source="s", target="t", mode="max"))["value"] == 8


def test_trees_agree_with_networkx():
    p = rnd_graph(14, seed=9)
    g = nx.Graph()
    for e in p["edges"]:     # aristas antiparalelas: la vista no dirigida conserva el mínimo
        a, b = e["source"], e["target"]
        if not g.has_edge(a, b) or g[a][b]["w"] > e["cost"]:
            g.add_edge(a, b, w=e["cost"])
    mn = sum(d["w"] for *_, d in nx.minimum_spanning_edges(g, weight="w", data=True))
    mx = sum(d["w"] for *_, d in nx.maximum_spanning_edges(g, weight="w", data=True))
    assert R.run("kruskal", p, {})["value"] == pytest.approx(mn)
    assert R.run("prim", p, {})["value"] == pytest.approx(mn)
    assert R.run("kruskal", p, dict(mode="max"))["value"] == pytest.approx(mx)
    assert R.run("prim", p, dict(mode="max"))["value"] == pytest.approx(mx)


def test_kruskal_disconnected_gives_forest():
    p = proj(range(4), [(0, 1, 1), (2, 3, 2)])
    r = R.run("kruskal", p, {})
    assert r["value"] == 3 and r["meta"]["components"] == 2 and "bosque" in r["message"]


def test_max_flow_min_cut():
    p = proj(["s", "a", "b", "t"], [("s", "a", 1, 10), ("s", "b", 1, 5), ("a", "b", 1, 15), ("a", "t", 1, 5), ("b", "t", 1, 10)], directed=True)
    r = R.run("max_flow", p, dict(source="s", target="t"))
    assert r["value"] == 15
    cut = R.run("min_cut", p, dict(source="s", target="t"))
    assert sum(float(x[1]) for x in cut["tables"][1]["rows"]) == 15
    q = rnd_graph(10, 4, True)
    for e in q["edges"]:
        e["capacity"] = e["cost"]
    g = nx.DiGraph([(e["source"], e["target"], {"capacity": e["capacity"]}) for e in q["edges"]])
    if nx.has_path(g, "0", "9"):
        assert R.run("max_flow", q, dict(source="0", target="9"))["value"] == pytest.approx(nx.maximum_flow_value(g, "0", "9"))


def test_max_flow_requires_capacity():
    p = proj(range(3), [(0, 1, 1), (1, 2, 1)], directed=True)
    with pytest.raises(AlgoError, match="capacidad"):
        R.run("max_flow", p, dict(source="0", target="2"))


def test_min_cost_flow_known_and_unbalanced():
    p = sample_transshipment()
    r = R.run("min_cost_flow", p, {})
    # óptimo verificado con networkx.network_simplex independiente
    G = nx.DiGraph()
    for n in p["nodes"]:
        G.add_node(n["id"], demand=int((n.get("demand") or 0) - (n.get("supply") or 0)))
    for e in p["edges"]:
        G.add_edge(e["source"], e["target"], weight=int(e["cost"]), capacity=int(e["capacity"]))
    assert r["value"] == pytest.approx(nx.network_simplex(G)[0])
    p["nodes"][0]["supply"] = 999
    with pytest.raises(AlgoError, match="equilibradas"):
        R.run("min_cost_flow", p, {})


def test_articulation_and_components():
    p = proj(range(6), [(0, 1, 1), (1, 2, 1), (2, 0, 1), (2, 3, 1), (3, 4, 1), (4, 5, 1)])
    r = R.run("articulation", p, {})
    assert set(r["meta"]["aps"]) == {"2", "3", "4"}
    assert len(r["meta"]["bridges"]) == 3
    assert R.run("components", p, {})["value"] == 1


def test_coloring_valid_and_optimal():
    p = proj(range(5), [(i, (i + 1) % 5, 1) for i in range(5)])   # C5 → 3 colores
    r = R.run("coloring", p, {})
    assert r["value"] == 3 and r["status"] == "optimal"
    col = r["meta"]["colors"]
    assert all(col[e["source"]] != col[e["target"]] for e in p["edges"])


def test_p_median_matches_bruteforce():
    p = sample_small()
    g = build_nx(p, "cost")
    D = dict(nx.all_pairs_dijkstra_path_length(g, weight="w"))
    w = {n["id"]: (n["demand"] if (n["demand"] or 0) > 0 else 1) for n in p["nodes"]}
    ids = list(g)
    best = min(sum(w[i] * min(D[i][j] for j in S) for i in ids) for S in itertools.combinations(ids, 2))
    r = R.run("p_median", p, dict(p=2))
    assert r["value"] == pytest.approx(best, rel=1e-6)


def test_euler_and_chinese_postman():
    sq = proj(range(4), [(0, 1, 1), (1, 2, 1), (2, 3, 1), (3, 0, 1)])
    assert R.run("euler", sq, {})["value"] == 4
    k = proj(range(4), [(0, 1, 1), (1, 2, 1), (2, 3, 1), (3, 0, 1), (0, 2, 5)])
    with pytest.raises(AlgoError, match="impar"):
        R.run("euler", k, {})
    r = R.run("chinese_postman", k, {})
    assert r["value"] == pytest.approx(9 + 2)       # 9 + camino mínimo 1→3 (=2)
    nodes = r["paths"][0]["nodes"]
    assert nodes[0] == nodes[-1]
    covered = {frozenset(x) for x in zip(nodes[:-1], nodes[1:])}
    assert covered >= {frozenset((e["source"], e["target"])) for e in k["edges"]}


def test_tsp_exact_vs_bruteforce():
    p = rnd_graph(8, seed=2)
    g = build_nx(p, "cost")
    D = dict(nx.all_pairs_dijkstra_path_length(g, weight="w"))
    ids = [str(i) for i in range(1, 8)]
    best = min(D["0"][a[0]] + sum(D[a[i]][a[i + 1]] for i in range(6)) + D[a[-1]]["0"] for a in itertools.permutations(ids))
    r = R.run("tsp", p, dict(depot="0"))
    assert r["status"] == "optimal" and r["value"] == pytest.approx(best)
    assert r["paths"][0]["nodes"][0] == r["paths"][0]["nodes"][-1] == "0"


def test_tsp_heuristic_flagged_and_reproducible():
    p = sample_small()
    a = R.run("tsp", p, dict(depot="0", time_limit=2))
    b = R.run("tsp", p, dict(depot="0", time_limit=2))
    assert a["status"] == "heuristic"
    assert a["value"] == pytest.approx(b["value"]) and a["paths"][0]["stops"] == b["paths"][0]["stops"]
    assert any("HEUR" in x.upper() for x in a["assumptions"])


def _check_vrp(res, project, cap_key="capacity"):
    served = []
    for pth in res["paths"]:
        assert pth["stops"][0] == pth["stops"][-1]
        served += pth["stops"][1:-1]
    return served


def test_cvrp_feasibility():
    p = sample_small()
    r = R.run("cvrp", p, dict(capacity=200, time_limit=2))
    by = {n["id"]: n for n in p["nodes"]}
    served = _check_vrp(r, p)
    assert sorted(served) == sorted(n["id"] for n in p["nodes"] if n["id"] != "0" and (n["demand"] or 0) > 0)
    for pth in r["paths"]:
        assert sum(by[s]["demand"] for s in pth["stops"][1:-1]) <= 200 + 1e-9
    assert r["status"] == "heuristic"


def test_cvrp_infeasible_messages():
    p = sample_small()
    with pytest.raises(AlgoError, match="excede la mayor capacidad"):
        R.run("cvrp", p, dict(capacity=10))
    with pytest.raises(AlgoError, match="capacidad total"):
        R.run("cvrp", p, dict(capacity=200, n_vehicles=2))


def test_vrpspd_load_never_exceeds_capacity():
    p = sample_fleet()
    r = R.run("vrpspd", p, dict(capacity=400, time_limit=3))
    by = {n["id"]: n for n in p["nodes"]}
    for pth in r["paths"]:
        stops = pth["stops"][1:-1]
        load = sum(by[s]["demand"] or 0 for s in stops)
        assert load <= 400 + 1e-9
        for s in stops:
            load += (by[s]["supply"] or 0) - (by[s]["demand"] or 0)
            assert load <= 400 + 1e-9


def test_vrptw_arrivals_within_windows():
    p = sample_fleet()
    r = R.run("vrptw", p, dict(time_limit=3))
    by = {n["id"]: n for n in p["nodes"]}
    for t in r["tables"][1:]:
        for row in t["rows"][1:-1]:
            nid = row[1].split(" ")[0]
            arr = float(row[-1])
            assert by[nid]["tw_start"] <= arr <= by[nid]["tw_end"], (nid, arr)


def test_multidepot_and_mtsp_and_hetero():
    p = sample_fleet()
    r = R.run("multidepot", p, dict(depots=["N00", "N10"], time_limit=2))
    assert {x["nodes"][0] for x in r["paths"]} <= {"N00", "N10"}
    r2 = R.run("mtsp", sample_small(), dict(m=3, time_limit=2))
    assert len(r2["paths"]) == 3
    r3 = R.run("hetero", p, dict(time_limit=2))
    assert len({x["label"].rsplit(" #", 1)[0] for x in r3["paths"]}) >= 1


def test_periodic_and_fstsp_run():
    p = sample_fleet()
    assert R.run("periodic", p, dict(days=3, capacity=600, time_limit=3))["status"] == "heuristic"
    r = R.run("fstsp", p, dict(time_limit=2))
    assert r["value"] <= r["meta"]["base_time"] + 1e-6 and r["status"] == "heuristic"


def test_failure_and_resilience():
    p = proj(range(5), [(0, 1, 1), (1, 2, 1), (2, 3, 1), (3, 4, 1)])
    r = R.run("failure", p, dict(closed_nodes=["2"]))
    assert r["meta"]["lost_pairs"] > 0 and len(r["meta"]["components"]) == 2
    res = R.run("resilience", p, {})
    assert len(res["meta"]["links"]) >= 1


def test_sensitivity_and_fleet_change():
    p = sample_small()
    r = R.run("sensitivity", p, dict(algorithm="dijkstra", param="c_km", source="0", target="9"))
    vals = [s[1] for s in r["meta"]["series"]]
    assert vals == sorted(vals) and vals[0] < vals[-1]
    q = sample_fleet()
    fc = R.run("fleet_change", q, dict(fleets={"A": [dict(q["vehicles"][0], count=4)], "B": [dict(q["vehicles"][1], count=6)]}, time_limit=2))
    assert len(fc["tables"][0]["rows"]) == 2


def test_closed_nodes_change_result():
    p = proj(range(4), [(0, 1, 1), (1, 3, 1), (0, 2, 5), (2, 3, 5)])
    assert R.run("dijkstra", p, dict(source="0", target="3"))["value"] == 2
    assert R.run("dijkstra", p, dict(source="0", target="3", closed_nodes=["1"]))["value"] == 10
    with pytest.raises(AlgoError, match="inalcanzable"):
        R.run("dijkstra", p, dict(source="0", target="3", closed_nodes=["1", "2"]))


def test_unknown_node_and_no_edges_errors():
    p = proj(range(3), [(0, 1, 1)])
    with pytest.raises(AlgoError, match="no existe"):
        R.run("dijkstra", p, dict(source="zz", target="1"))
    with pytest.raises(AlgoError, match="aristas"):
        R.run("kruskal", proj(range(3), []), {})
