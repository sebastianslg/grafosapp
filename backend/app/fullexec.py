"""Resumen ejecutivo completo, al estilo de los informes de clase (puntos numerados, tablas, comparaciones en %,
sensibilidad, ruido heurístico, supuestos y recomendación). TODA cifra sale de un cálculo hecho aquí o del resultado."""
from __future__ import annotations
import copy
import math
import networkx as nx
from .algos import registry
from .algos.common import AlgoError, Cancelled, fmt
from .graphs import build_nx, undirected_view
from .model import node_label

ROUTING = ("cvrp", "vrpspd", "vrptw", "hetero", "multidepot", "mtsp")
PATHS = ("dijkstra", "bellman_ford", "astar", "floyd_warshall", "k_shortest")
TREES = ("kruskal", "prim")
LOCATION = ("p_median", "p_center", "max_cover", "fixed_charge")


def pct(new, base):
    if new is None or base in (None, 0):
        return None
    return (new - base) / abs(base) * 100


def sg(x, nd=1):
    return "—" if x is None else f"{x:+.{nd}f} %"


def money(x, nd=2):
    return fmt(round(x, nd), nd) if x is not None else "—"


class Builder:
    def __init__(self, project, result, opts, progress=None):
        self.p, self.r, self.o = project, result, opts or {}
        self.key = result.get("key") or result.get("algorithm")
        self.params = dict(result.get("run_params") or {})
        self.tl = int(self.o.get("time", 4))
        self.light = bool(self.o.get("light"))
        self.progress = progress or (lambda f, m="": None)
        self.sections, self.figs, self.notes = [], [], []
        self.reruns = 0
        self.total_runs = 1

    # --- utilidades ---
    def lab(self, n):
        return node_label(self.p, n)

    def run(self, key, project=None, **over):
        """Re-ejecuta un algoritmo con cambios; devuelve (resultado|None, error|None)."""
        params = {k: v for k, v in self.params.items() if k not in ("seed",)}
        params.update(over)
        params["time_limit"] = over.get("time_limit", self.tl)
        self.reruns += 1
        self.progress(min(0.95, self.reruns / max(self.total_runs, 1)), f"Escenario {self.reruns}…")
        try:
            return registry.run(key, project or self.p, params), None
        except AlgoError as e:
            return None, str(e)

    def sec(self, heading, paragraphs=(), bullets=(), tables=()):
        self.sections.append({"heading": heading, "paragraphs": [x for x in paragraphs if x], "bullets": [x for x in bullets if x],
                              "tables": list(tables)})

    # --- secciones comunes ---
    def context_section(self):
        p = self.p
        pr = p["params"]
        dem = sum((n.get("demand") or 0) for n in p["nodes"])
        sup = sum((n.get("supply") or 0) for n in p["nodes"])
        rows = [["Nodos", len(p["nodes"])], ["Aristas", len(p["edges"])],
                ["Dirigidas", sum(1 for e in p["edges"] if e.get("directed"))],
                ["Tipos de vehículo", len(p["vehicles"])]]
        if dem:
            rows.append(["Demanda total", fmt(dem)])
        if sup:
            rows.append(["Oferta total", fmt(sup)])
        rows += [["Costo por km", pr.get("c_km")], ["Costo por hora", pr.get("c_hora")], ["Velocidad (km/h)", pr.get("speed")],
                 ["Factor vial", pr.get("road_factor")], ["Emisiones por km", pr.get("e_km")]]
        crit = self.params.get("criterion", "cost")
        tbl = [{"title": "Datos y parámetros del modelo", "columns": ["Concepto", "Valor"], "rows": rows}]
        if p["vehicles"]:
            tbl.append({"title": "Flota disponible", "columns": ["Tipo", "Capacidad", "Costo fijo", "Costo/km", "Velocidad", "Autonomía", "Cantidad"],
                        "rows": [[v.get("type"), fmt(v.get("capacity")), fmt(v.get("fixed_cost")), fmt(v.get("cost_per_km")), fmt(v.get("speed")),
                                  fmt(v.get("range")), fmt(v.get("count"))] for v in p["vehicles"]]})
        paras = [f"El modelo tiene {len(p['nodes'])} nodos y {len(p['edges'])} aristas; el criterio de peso usado es «{crit}». "
                 "El costo de cada arista se calcula como c = c_km·d + c_hora·t/60, con t = 60·d/v, y las distancias derivadas de coordenadas usan Haversine (R = 6371.0088 km) por el factor vial indicado."]
        src = p["meta"].get("source") or []
        if src:
            paras.append("Orígenes de los datos: " + "; ".join(f"{s.get('archivo')} ({s.get('formato')})" for s in src) + ".")
        w = p["meta"].get("warnings") or []
        if w:
            paras.append("Advertencias de calidad de datos: " + " ".join(x["mensaje"] for x in w[:4]))
        self.sec("1. Datos, supuestos y modelo", paras, tables=tbl)

    def quality_section(self, extra_paras=(), extra_tables=()):
        st = self.r.get("status")
        base = {"optimal": "El resultado es óptimo probado: el método es exacto sobre el modelo definido.",
                "heuristic": "El resultado es heurístico: es una buena solución reproducible, no un óptimo probado.",
                "info": "El análisis es descriptivo; no hay un problema de optimización que probar."}.get(st, "")
        paras = [base] + list(extra_paras)
        paras.append("Reproducibilidad: " + ", ".join(f"{k}={v}" for k, v in self.params.items() if k not in ("closed_nodes", "closed_edges", "vehicles", "fleets", "nodes")
                                                      and not isinstance(v, (dict, list))) + ".")
        self.sec("Calidad de la solución y reproducibilidad", paras, tables=list(extra_tables))

    def risks_section(self, risks):
        w = self.p["meta"].get("warnings") or []
        r = list(risks)
        if self.r.get("status") == "heuristic":
            r.append("La solución es heurística: puede existir una mejor; aumente el tiempo de cómputo o valide con un solver exacto.")
        if w:
            r += [f"Dato: {x['mensaje']}" for x in w[:3]]
        r.append("Los resultados dependen de los supuestos y parámetros del modelo; confirme costos, velocidades y capacidades con datos reales antes de decidir.")
        self.sec("Riesgos y limitaciones", bullets=r)

    def control_section(self):
        c = self.r.get("control") or []
        if c:
            self.sec("Valores de control para validar", ["Cifras para contrastar con otra herramienta (p. ej. Grafos v.1.3.5):"],
                     tables=[{"title": "Valores de control", "columns": ["Indicador", "Valor"],
                              "rows": [[x["name"], str(x["value"])[:160]] for x in c]}])

    def finish(self, title, headline, conclusion, reco_bullets, next_steps=None):
        """Orden final: resumen en una mirada primero, conclusión y recomendación al final."""
        head = {"heading": "Resumen en una mirada", "paragraphs": headline, "bullets": [], "tables": []}
        self.sections.insert(0, head)
        self.sec("Conclusión", conclusion)
        self.sec("Recomendación y siguientes pasos", bullets=reco_bullets + (next_steps or [
            "Validar los valores de control contra otra herramienta.", "Probar escenarios adicionales (cierres de nodos, cambios de flota, sensibilidad)."]))
        self.control_section()
        return {"title": title, "key_figures": self.figs, "sections": self.sections, "mode": "light" if self.light else "completo",
                "scenarios_run": self.reruns}


# ======================= RUTAS (VRP y variantes) =======================

def _fleet_ok_runs(b: Builder, project):
    """Una flota por tipo de vehículo (si hay ≥2 tipos), con cantidad suficiente."""
    out = []
    vs = project.get("vehicles") or []
    if len(vs) < 2 or b.light:
        return out
    tot = sum((n.get("demand") or n.get("supply") or 0) for n in project["nodes"])
    for v in vs:
        cap = v.get("capacity") or 0
        need = math.ceil(tot / cap) + 1 if cap else (v.get("count") or 1)
        vv = dict(v, count=max(int(v.get("count") or 1), need))
        out.append((v.get("type") or "Vehículo", vv))
    return out


def build_routing(b: Builder):
    r, p = b.r, b.p
    paths = r.get("paths", [])
    key = b.key
    if not paths:
        raise AlgoError("El resultado no tiene rutas.")
    tot_cost = r["value"]
    fixed = sum(x.get("fixed") or 0 for x in paths)
    cdist = sum(x.get("cost_dist") or 0 for x in paths)
    ctime = sum(x.get("cost_time") or 0 for x in paths)
    km = sum(x["totals"].get("distance") or 0 for x in paths)
    tmin = sum(x["totals"].get("time") or 0 for x in paths)
    em = sum(x["totals"].get("emissions") or 0 for x in paths)
    load = sum(x.get("load") or 0 for x in paths)
    nserv = sum(len(x["stops"]) - 2 for x in paths)
    unserved = r.get("meta", {}).get("unserved") or []
    b.total_runs = 1 + (0 if b.light else (len(_fleet_ok_runs(b, p)) + 1 + 2))

    b.figs = [{"label": "Costo total", "value": money(tot_cost)}, {"label": "Rutas", "value": len(paths)}, {"label": "Distancia", "value": f"{fmt(km)} km"},
              {"label": "Emisiones", "value": fmt(em)}, {"label": "Clientes servidos", "value": f"{nserv}" + (f" (+{len(unserved)} sin servir)" if unserved else "")}]
    if load:
        b.figs.append({"label": "Costo por unidad entregada", "value": money(tot_cost / load, 3)})

    # --- resultado principal
    rows = []
    for x in paths:
        cap = x.get("capacity")
        rows.append([x["label"], len(x["stops"]) - 2, fmt(x.get("load")), (f"{(x.get('load') or 0) / cap * 100:.0f} %" if cap else "—"),
                     fmt(x["totals"].get("distance")), fmt(x["totals"].get("time")), money(x["cost"])])
    b.sec("2. Resultado principal", [r.get("message", "")], tables=[
        {"title": "Rutas de la solución", "columns": ["Ruta", "Paradas", "Carga", "Uso de capacidad", "Km", "Tiempo (min)", "Costo"], "rows": rows}])
    byt = {}
    for x in paths:
        t = x.get("vtype") or "Vehículo"
        d = byt.setdefault(t, [0, 0.0, 0.0, 0.0])
        d[0] += 1
        d[1] += x["totals"].get("distance") or 0
        d[2] += x.get("load") or 0
        d[3] += x["cost"]
    if len(byt) > 1:
        b.sections[-1]["tables"].append({"title": "Resumen por tipo de vehículo", "columns": ["Tipo", "Rutas", "Km", "Carga", "Costo"],
                                         "rows": [[t, d[0], fmt(d[1]), fmt(d[2]), money(d[3])] for t, d in byt.items()]})

    # --- desglose del costo
    comp = [("Costo fijo de vehículos", fixed), ("Costo por distancia", cdist), ("Costo por tiempo", ctime)]
    rest = tot_cost - fixed - cdist - ctime
    if abs(rest) > 1e-6:
        comp.append(("Otros", rest))
    big = max(comp, key=lambda c: c[1])
    util = [(x.get("load") or 0) / x["capacity"] for x in paths if x.get("capacity")]
    paras = [f"El costo total de {money(tot_cost)} se descompone en " + ", ".join(f"{n.lower()} {money(v)} ({v / tot_cost * 100:.0f} %)" for n, v in comp if v) +
             f". El componente dominante es el {big[0].lower()} ({big[1] / tot_cost * 100:.0f} %)."]
    if util:
        paras.append(f"La utilización de la capacidad es {sum(util) / len(util) * 100:.0f} % en promedio (mínima {min(util) * 100:.0f} %, máxima {max(util) * 100:.0f} %).")
    b.sec("3. Desglose del costo e impulsores", paras, tables=[{"title": "Componentes del costo", "columns": ["Componente", "Valor", "% del total"],
                                                              "rows": [[n, money(v), f"{v / tot_cost * 100:.1f} %"] for n, v in comp if v]}])

    # --- cota inferior (calidad)
    lb = lower_bound(b, paths)
    extra = []
    gap = None
    if lb:
        gap = (tot_cost - lb) / lb * 100
        if gap <= 60:
            extra.append(f"Cota inferior de costo (árbol generador mínimo sobre los puntos servidos, por el costo mínimo por km): {money(lb)}. La solución está como máximo {gap:.1f} % por encima del óptimo, "
                         "sea cual sea el óptimo real (la brecha verdadera es menor o igual).")
            b.figs.append({"label": "Brecha máxima al óptimo", "value": f"≤ {gap:.1f} %"})
        else:
            extra.append(f"La cota inferior disponible ({money(lb)}) es demasiado débil para certificar la calidad de la solución (con varias rutas, costos fijos y capacidad el óptimo real queda muy por encima de ella); por eso se mide la calidad con las corridas alternativas de la sección 4.")
            gap = None

    # --- escenarios
    scen_tables, scen_paras = [], []
    spread = None
    growth = None
    # sensibilidad analítica con las mismas rutas
    sens_rows = []
    for name, f in (("Costo por distancia", "d"), ("Costo por tiempo", "t"), ("Costo fijo", "f")):
        base = {"d": cdist, "t": ctime, "f": fixed}[f]
        if not base:
            continue
        lo, hi = tot_cost - 0.2 * base, tot_cost + 0.2 * base
        sens_rows.append([name, money(lo), money(tot_cost), money(hi), f"±{0.2 * base / tot_cost * 100:.1f} %"])
    if sens_rows:
        scen_tables.append({"title": "Sensibilidad con las mismas rutas (cada componente ±20 %)", "columns": ["Componente", "-20 %", "Base", "+20 %", "Efecto sobre el total"], "rows": sens_rows})
        top = max(sens_rows, key=lambda x: float(x[4].replace("±", "").replace(" %", "")))
        scen_paras.append(f"Con las mismas rutas, el costo total es más sensible a «{top[0].lower()}»: una variación de 20 % en ese componente mueve el total {top[4].replace('±', '')}.")
    if not b.light:
        # +40 % demanda
        p2 = copy.deepcopy(p)
        for n in p2["nodes"]:
            for k in ("demand", "supply"):
                if n.get(k):
                    n[k] = n[k] * 1.4
        r2, err = b.run(key, p2)
        rows = []
        if r2:
            m2 = r2.get("meta", {})
            rows.append(["Demanda base", len(paths), money(tot_cost), fmt(km), "—"])
            rows.append(["Demanda +40 %", m2.get("routes"), money(r2["value"]), fmt(m2.get("km")), sg(pct(r2["value"], tot_cost))])
            scen_paras.append(f"Con la demanda un 40 % mayor ({fmt(load * 1.4)} unidades) la solución usa {m2.get('routes')} ruta(s) (antes {len(paths)}) y su costo pasa de {money(tot_cost)} a {money(r2['value'])} ({sg(pct(r2['value'], tot_cost))}).")
        else:
            rows.append(["Demanda +40 %", "—", "No factible con la flota actual", "—", "—"])
            scen_paras.append(f"Con la demanda un 40 % mayor el problema no es factible con la flota actual: {err}")
            # ¿cuántos vehículos adicionales harían falta? (tipo de mayor capacidad)
            vs = [v for v in (p.get("vehicles") or []) if v.get("capacity")]
            if vs:
                big_v = max(vs, key=lambda v: v["capacity"])
                need_tot = sum((n.get("demand") or n.get("supply") or 0) for n in p2["nodes"])
                have = sum((v.get("capacity") or 0) * int(v.get("count") or 1) for v in vs)
                add = max(1, math.ceil((need_tot - have) / big_v["capacity"]) + 1)
                fleet2 = [dict(v) for v in vs]
                for v in fleet2:
                    if v is not None and v.get("type") == big_v.get("type"):
                        v["count"] = int(v.get("count") or 1) + add
                r5, e5 = b.run(key, p2, vehicles=fleet2)
                if r5:
                    rows.append([f"Demanda +40 % con +{add} {big_v.get('type')}", r5["meta"].get("routes"), money(r5["value"]), fmt(r5["meta"].get("km")), sg(pct(r5["value"], tot_cost))])
                    growth = (add, big_v.get("type"), r5["value"])
                    scen_paras.append(f"Agregando {add} vehículo(s) de tipo «{big_v.get('type')}» el problema vuelve a ser factible y cuesta {money(r5['value'])} ({sg(pct(r5['value'], tot_cost))} frente a la base).")
        scen_tables.append({"title": "Efecto de un aumento de 40 % en la demanda", "columns": ["Escenario", "Rutas", "Costo", "Km", "Variación"], "rows": rows})
        # ruido heurístico: otras estrategias de construcción inicial
        vals = [("Estrategia base", tot_cost)]
        for st in ("savings", "parallel_cheapest_insertion"):
            r3, e3 = b.run(key, strategy=st)
            if r3:
                vals.append((st.replace("_", " "), r3["value"]))
        if len(vals) > 1:
            mn, mx = min(v for _, v in vals), max(v for _, v in vals)
            spread = (mx - mn) / mn * 100 if mn else 0
            scen_tables.append({"title": "Ruido de la búsqueda heurística (misma instancia, otra solución inicial)", "columns": ["Corrida", "Costo", "Diferencia vs. mejor"],
                                "rows": [[n, money(v), sg(pct(v, mn))] for n, v in vals]})
            scen_paras.append(f"Entre estrategias de construcción el costo varía {spread:.1f} % (de {money(mn)} a {money(mx)}): diferencias menores que ésa entre escenarios deben leerse como ruido de la búsqueda heurística y no como mejoras reales.")
            if mn < tot_cost - 1e-6:
                scen_paras.append(f"Una de las corridas encontró una solución {abs(pct(mn, tot_cost)):.1f} % más barata; se recomienda aumentar el límite de tiempo antes de implementar las rutas.")
                b.figs.append({"label": "Mejor corrida alternativa", "value": f"{money(mn)} ({sg(pct(mn, tot_cost))})"})
    b.sec("4. Escenarios y sensibilidad", scen_paras, tables=scen_tables)

    # --- comparación de flotas
    cmp_rows, cmp_paras = [], []
    best_alt = None
    fl = _fleet_ok_runs(b, p)
    if fl:
        cmp_rows.append(["Flota actual (mixta)", len(paths), money(tot_cost), fmt(km), fmt(em), "—", "Factible" if not unserved else "Deja clientes sin servir"])
        for name, v in fl:
            r4, e4 = b.run(key, vehicles=[v])
            if r4:
                m4 = r4["meta"]
                cmp_rows.append([f"Solo {name}", m4.get("routes"), money(r4["value"]), fmt(m4.get("km")), fmt(m4.get("emissions")), sg(pct(r4["value"], tot_cost)),
                                 "Factible" if not m4.get("unserved") else "Deja clientes sin servir"])
                if not m4.get("unserved") and (best_alt is None or r4["value"] < best_alt[1]):
                    best_alt = (name, r4["value"], m4.get("emissions"))
            else:
                cmp_rows.append([f"Solo {name}", "—", "No factible", "—", "—", "—", e4[:90]])
        if best_alt:
            if best_alt[1] < tot_cost - 1e-6:
                cmp_paras.append(f"Una flota compuesta solo por «{best_alt[0]}» sería {abs(pct(best_alt[1], tot_cost)):.1f} % más barata que la flota actual ({money(best_alt[1])} frente a {money(tot_cost)}); aun así, al ser heurística, parte de la diferencia puede ser ruido de búsqueda.")
            else:
                m_ = abs(pct(best_alt[1], tot_cost))
                cmp_paras.append(f"Ninguna flota de un solo tipo mejora a la flota actual ({money(tot_cost)}): la combinación de vehículos es la opción de menor costo entre las evaluadas"
                                 + (f", aunque la ventaja de {m_:.1f} % sobre «{best_alt[0]}» es menor que el ruido heurístico ({spread:.1f} %) y no debe considerarse concluyente." if (spread is not None and m_ <= spread) else "."))
        cmp_paras.append("La comparación vuelve a resolver el problema con cada tipo de vehículo por separado y con unidades suficientes para cubrir la demanda.")
    # línea base ingenua
    from .explain import baseline_comparison
    bl = baseline_comparison(p, r)
    if bl:
        cmp_paras.append(bl)
    b.sec("5. Comparación con alternativas", cmp_paras, tables=[{"title": "Comparación de flotas", "columns": ["Flota", "Rutas", "Costo", "Km", "Emisiones", "Δ costo", "Observación"], "rows": cmp_rows}] if cmp_rows else [])

    b.quality_section(extra)
    risks = []
    if util and max(util) > 0.9:
        risks.append(f"Alguna ruta usa más del 90 % de la capacidad ({max(util) * 100:.0f} %): hay poca holgura ante pedidos mayores a los previstos.")
    if unserved:
        risks.append(f"Clientes sin servir: {', '.join(map(str, unserved[:15]))}.")
    if key == "vrptw":
        risks.append("Las ventanas horarias son duras en el modelo: cualquier retraso real puede dejar un cliente fuera de ventana.")
    b.risks_section(risks)

    # --- conclusión (estilo del informe de clase)
    saving = ""
    if best_alt and best_alt[1] > tot_cost + 1e-6:
        saving = f" Frente a la mejor flota de un solo tipo ({best_alt[0]}, {money(best_alt[1])}) ahorra {abs(pct(tot_cost, best_alt[1])):.1f} % del costo"
        saving += (" (diferencia del orden del ruido heurístico, no concluyente)." if (spread is not None and abs(pct(tot_cost, best_alt[1])) <= spread * 1.5) else ".")
    concl = [f"Para los {nserv + len(unserved)} puntos de servicio y {fmt(load)} unidades de carga, la solución propuesta usa {len(paths)} ruta(s), recorre {fmt(km)} km, cuesta {money(tot_cost)}, emite {fmt(em)} y tarda {fmt(tmin)} min de conducción."
             + (" Atiende a todos los clientes." if not unserved else f" Deja {len(unserved)} cliente(s) sin servir.") + saving,
             "PLACEHOLDER2", "PLACEHOLDER3"]
    c2 = [f"El costo está dominado por el {big[0].lower()} ({big[1] / tot_cost * 100:.0f} %)."]
    if growth:
        c2.append(f"Con la demanda un 40 % mayor hacen falta {growth[0]} vehículo(s) adicional(es) de tipo «{growth[1]}» y el costo sube a {money(growth[2])}.")
    elif not b.light:
        c2.append("El efecto de un aumento de 40 % en la demanda se detalla en la sección 4.")
    if spread is not None:
        c2.append(f"Entre estrategias de búsqueda el costo varía {spread:.1f} %, por lo que diferencias menores entre escenarios son ruido de la heurística.")
    if gap is not None:
        c2.append(f"La solución está como máximo {gap:.1f} % por encima del óptimo.")
    c3 = ["Las rutas son heurísticas, no óptimos garantizados, y no son datos operativos oficiales; los resultados dependen de los supuestos de costo, velocidad, capacidad y demanda del modelo."]
    concl[1] = " ".join(c2)
    concl[2] = c3[0]
    reco = [f"Implementar las {len(paths)} rutas propuestas y medir el costo real frente al modelado ({money(tot_cost)}).",
            "Reoptimizar cuando cambie la demanda, las ventanas o la flota disponible."]
    if best_alt and best_alt[1] < tot_cost - 1e-6:
        reco.insert(0, f"Evaluar la flota de «{best_alt[0]}» como alternativa: el modelo la estima {abs(pct(best_alt[1], tot_cost)):.1f} % más barata.")
    headline = [f"{r['title']}: {len(paths)} ruta(s), {fmt(km)} km, costo {money(tot_cost)}" + (f", {len(unserved)} cliente(s) sin servir" if unserved else ", todos los clientes servidos") +
                (f". Mejor alternativa evaluada: {best_alt[0]} ({sg(pct(best_alt[1], tot_cost))})." if best_alt else ".")]
    return b.finish(r["title"], headline, concl, reco)


def lower_bound(b: Builder, paths):
    """Cota inferior: costo mínimo por km × árbol generador mínimo (km) de los puntos servidos. Válida si costo ≥ cpk_min·km."""
    try:
        pts = list(dict.fromkeys(x for pth in paths for x in pth["stops"]))
        g = build_nx(b.p, "distance", closed_nodes=b.params.get("closed_nodes", []), closed_edges=b.params.get("closed_edges", []))
        sp = dict(nx.all_pairs_dijkstra_path_length(g, weight="w"))
        K = nx.Graph()
        for i, a in enumerate(pts):
            for c in pts[i + 1:]:
                d = min(sp[a].get(c, math.inf), sp[c].get(a, math.inf))
                if d < math.inf:
                    K.add_edge(a, c, w=d)
        if not nx.is_connected(K):
            return None
        mst = sum(d["w"] for *_, d in nx.minimum_spanning_edges(K, weight="w", data=True))
        types = {x.get("vtype") for x in paths}
        cpks = []
        for v in (b.p.get("vehicles") or []):
            if v.get("type") in types or not types:
                cpks.append(v.get("cost_per_km") if v.get("cost_per_km") is not None else b.p["params"].get("c_km", 1.0))
        cpk = min(cpks) if cpks else b.p["params"].get("c_km", 1.0)
        lb = cpk * mst
        return lb if lb > 0 else None
    except Exception:
        return None


# ======================= TSP =======================

def build_tsp(b: Builder):
    r, p = b.r, b.p
    pth = r["paths"][0]
    km = pth["totals"].get("distance") or 0
    tm = pth["totals"].get("time") or 0
    cost = r["value"]
    stops = pth["stops"]
    b.total_runs = 1 if b.light else 3
    b.figs = [{"label": "Costo del tour", "value": money(cost)}, {"label": "Paradas", "value": len(stops) - 2}, {"label": "Distancia", "value": f"{fmt(km)} km"},
              {"label": "Tiempo", "value": f"{fmt(tm)} min"}]
    rows = []
    acc = 0.0
    g = build_nx(p, "cost")
    for a, c_ in zip(stops[:-1], stops[1:]):
        w = nx.shortest_path_length(g, a, c_, weight="w")
        acc += w
        rows.append([b.lab(a), b.lab(c_), money(w), money(acc)])
    b.sec("2. Resultado principal", [r["message"]], tables=[{"title": "Orden de visita", "columns": ["Desde", "Hacia", "Tramo", "Acumulado"], "rows": rows}])
    # comparación: vecino más cercano y cota
    cur, rest, nn = stops[0], set(stops[1:-1]), 0.0
    while rest:
        dd = nx.single_source_dijkstra_path_length(g, cur, weight="w")
        nx_ = min(rest, key=lambda x: dd.get(x, math.inf))
        nn += dd[nx_]
        cur = nx_
        rest.discard(nx_)
    nn += nx.shortest_path_length(g, cur, stops[0], weight="w")
    lb = None
    try:
        gu = undirected_view(g)
        pts = list(dict.fromkeys(stops))
        K = nx.Graph()
        for i, a in enumerate(pts):
            for c_ in pts[i + 1:]:
                K.add_edge(a, c_, w=nx.shortest_path_length(gu, a, c_, weight="w"))
        lb = sum(d["w"] for *_, d in nx.minimum_spanning_edges(K, weight="w", data=True))
    except Exception:
        pass
    paras = [f"El heurístico del vecino más cercano da {money(nn)}; el tour entregado cuesta {money(cost)} ({sg(pct(cost, nn))})."]
    extra = []
    if lb and (cost - lb) / lb * 100 <= 60:
        gap = (cost - lb) / lb * 100
        paras.append(f"Cota inferior (árbol generador mínimo de los puntos): {money(lb)}; el tour está como máximo {gap:.1f} % por encima del óptimo.")
        extra.append(f"Brecha máxima al óptimo: {gap:.1f} %.")
        b.figs.append({"label": "Brecha máxima al óptimo", "value": f"≤ {gap:.1f} %"})
    else:
        lb = None
    tabs = [{"title": "Comparación", "columns": ["Método", "Costo", "Δ vs. tour"], "rows": [["Tour entregado", money(cost), "—"], ["Vecino más cercano", money(nn), sg(pct(nn, cost))]] + ([["Cota inferior (MST)", money(lb), sg(pct(lb, cost))]] if lb else [])}]
    scen_paras, scen_tabs = [], []
    if not b.light and r["status"] == "heuristic":
        vals = [("Base", cost)]
        for st in ("savings", "parallel_cheapest_insertion"):
            r3, _ = b.run("tsp", strategy=st)
            if r3:
                vals.append((st.replace("_", " "), r3["value"]))
        mn, mx = min(v for _, v in vals), max(v for _, v in vals)
        scen_tabs.append({"title": "Ruido de la búsqueda heurística", "columns": ["Corrida", "Costo", "Diferencia vs. mejor"], "rows": [[n, money(v), sg(pct(v, mn))] for n, v in vals]})
        scen_paras.append(f"Entre estrategias el costo varía {(mx - mn) / mn * 100:.1f} %: diferencias menores son ruido de la búsqueda.")
    pr = p["params"]
    dpart, tpart = (pr.get("c_km") or 0) * km, (pr.get("c_hora") or 0) * tm / 60
    if dpart + tpart:
        scen_tabs.append({"title": "Sensibilidad con el mismo orden (±20 %)", "columns": ["Componente", "-20 %", "Base", "+20 %"],
                          "rows": [[n, money(cost - 0.2 * v), money(cost), money(cost + 0.2 * v)] for n, v in (("Costo por distancia", dpart), ("Costo por tiempo", tpart)) if v]})
    b.sec("3. Comparación con alternativas", paras, tables=tabs)
    b.sec("4. Escenarios y sensibilidad", scen_paras, tables=scen_tabs)
    b.quality_section(extra)
    b.risks_section(["El tour es cerrado y visita cada punto una sola vez; no considera ventanas horarias ni capacidad."])
    concl = [f"El tour recorre {len(stops) - 2} paradas en {fmt(km)} km con un costo de {money(cost)} y {fmt(tm)} min." + (f" Mejora al vecino más cercano en {abs(pct(cost, nn)):.1f} %." if nn > cost else "") +
             ("" if not lb else f" Está como máximo {(cost - lb) / lb * 100:.1f} % por encima del óptimo.")]
    return b.finish(r["title"], concl, concl, ["Seguir el orden propuesto y medir el costo real.", "Si cambia el conjunto de paradas, recalcular."])


# ======================= CAMINOS =======================

def build_paths(b: Builder):
    r, p = b.r, b.p
    pth = (r.get("paths") or [None])[0]
    if not pth:   # todos los destinos desde un origen
        return build_generic(b)
    src, dst = pth["nodes"][0], pth["nodes"][-1]
    cost = r["value"]
    tot = pth.get("totals", {})
    b.total_runs = 1
    b.figs = [{"label": "Costo mínimo", "value": fmt(cost)}, {"label": "Arcos", "value": len(pth["nodes"]) - 1},
              {"label": "Distancia", "value": f"{fmt(tot.get('distance'))} km"}, {"label": "Tiempo", "value": f"{fmt(tot.get('time'))} min"}]
    g = build_nx(p, b.params.get("criterion", "cost"), closed_nodes=b.params.get("closed_nodes", []), closed_edges=b.params.get("closed_edges", []))
    hops = []
    acc = 0.0
    for u, v in zip(pth["nodes"][:-1], pth["nodes"][1:]):
        a = g[u][v]
        acc += a["w"]
        hops.append([b.lab(u), b.lab(v), fmt(a.get("distance")), fmt(a.get("time")), fmt(a.get("cost")), fmt(acc)])
    b.sec("2. Resultado principal", [r["message"]], tables=[{"title": "Tramos de la ruta óptima", "columns": ["Desde", "Hacia", "Km", "Min", "Costo", "Acumulado"], "rows": hops}])
    # alternativas
    alts = []
    try:
        for k, pp in enumerate(nx.shortest_simple_paths(g, src, dst, weight="w")):
            alts.append((sum(g[a][c]["w"] for a, c in zip(pp[:-1], pp[1:])), pp))
            if k >= 3:
                break
    except nx.NetworkXNoPath:
        pass
    rows = [[("Óptima" if i == 0 else f"Alternativa {i}"), fmt(c), sg(pct(c, cost)) if i else "—", " > ".join(pp)] for i, (c, pp) in enumerate(alts)]
    paras = []
    if len(alts) > 1:
        paras.append(f"La mejor alternativa distinta cuesta {fmt(alts[1][0])}, es decir {sg(pct(alts[1][0], cost))} sobre la ruta óptima.")
    # criticidad de nodos intermedios
    crit = []
    for n in pth["nodes"][1:-1]:
        h = g.copy()
        h.remove_node(n)
        try:
            c2 = nx.shortest_path_length(h, src, dst, weight="w")
            crit.append([b.lab(n), fmt(c2), sg(pct(c2, cost))])
        except nx.NetworkXNoPath:
            crit.append([b.lab(n), "sin camino", "—"])
    # otros criterios
    other = []
    for c_ in ("cost", "distance", "time"):
        if c_ == b.params.get("criterion", "cost"):
            continue
        try:
            g2 = build_nx(p, c_, closed_nodes=b.params.get("closed_nodes", []), closed_edges=b.params.get("closed_edges", []))
            c2, p2 = nx.single_source_dijkstra(g2, src, dst, weight="w")
            other.append([c_, fmt(c2), " > ".join(p2), "igual" if p2 == pth["nodes"] else "distinta"])
        except Exception:
            pass
    tabs = [{"title": "Ruta óptima y alternativas", "columns": ["Ruta", "Costo", "Δ", "Secuencia"], "rows": rows}]
    b.sec("3. Comparación con alternativas", paras, tables=tabs)
    sparas, stabs = [], []
    if crit:
        stabs.append({"title": "Qué pasa si se cierra un nodo de la ruta", "columns": ["Nodo cerrado", "Nuevo costo", "Variación"], "rows": crit})
        worst = max((c for c in crit if c[2] != "—"), key=lambda c: float(c[2].replace(" %", "").replace("+", "")), default=None)
        if worst:
            sparas.append(f"El nodo más crítico de la ruta es {worst[0]}: si se cierra, el costo pasa a {worst[1]} ({worst[2]}).")
        if any(c[1] == "sin camino" for c in crit):
            sparas.append("Hay nodos cuyo cierre deja el destino inalcanzable: la ruta no tiene respaldo.")
    if other:
        stabs.append({"title": "Misma consulta con otros criterios", "columns": ["Criterio", "Valor", "Ruta", "¿Misma ruta?"], "rows": other})
        if all(o[3] == "igual" for o in other):
            sparas.append("La ruta óptima es la misma bajo los criterios de costo, distancia y tiempo: la decisión es robusta al criterio.")
        else:
            sparas.append("La ruta óptima cambia según el criterio: conviene definir cuál prima antes de decidir.")
    b.sec("4. Robustez y escenarios", sparas, tables=stabs)
    b.quality_section()
    b.risks_section(["La ruta supone que todos los arcos están disponibles con los costos del modelo; no considera congestión ni cierres no modelados."])
    concl = [f"El camino más barato de {b.lab(src)} a {b.lab(dst)} cuesta {fmt(cost)} y pasa por " + " > ".join(pth["nodes"]) + "."
             + (f" La mejor alternativa cuesta {sg(pct(alts[1][0], cost))} más." if len(alts) > 1 else "")]
    return b.finish(r["title"], concl, concl, [f"Usar la ruta {' > '.join(pth['nodes'])}.", "Mantener la alternativa registrada como plan de contingencia."])


# ======================= ÁRBOLES =======================

def build_tree(b: Builder):
    r, p = b.r, b.p
    mx = b.params.get("mode") == "max"
    g = build_nx(p, b.params.get("criterion", "cost"), closed_nodes=b.params.get("closed_nodes", []), closed_edges=b.params.get("closed_edges", []))
    u = undirected_view(g)
    edges = [(a, c) for a, c, grp in r["highlight_edges"]]
    T = nx.Graph()
    T.add_edges_from((a, c, {"w": u[a][c]["w"]}) for a, c in edges)
    total = r["value"]
    net = sum(d["w"] for *_, d in u.edges(data=True))
    b.total_runs = 1
    b.figs = [{"label": "Valor total del árbol", "value": fmt(total)}, {"label": "Aristas", "value": len(edges)},
              {"label": "% de la red", "value": f"{total / net * 100:.1f} %" if net else "—"}, {"label": "Componentes", "value": r["meta"].get("components", 1)}]
    top = sorted(T.edges(data=True), key=lambda e: -e[2]["w"])[:8]
    b.sec("2. Resultado principal", [r["message"]], tables=[{"title": "Aristas más pesadas del árbol", "columns": ["Arista", "Peso", "% del árbol"],
                                                         "rows": [[f"{b.lab(a)}–{b.lab(c)}", fmt(d["w"]), f"{d['w'] / total * 100:.1f} %"] for a, c, d in top]}])
    paras = [f"El árbol usa {len(edges)} de las {u.number_of_edges()} aristas de la red y su valor ({fmt(total)}) es el {total / net * 100:.1f} % del valor de toda la red ({fmt(net)})."] if net else []
    # comparación con árbol de caminos mínimos desde un nodo central
    tabs = []
    try:
        root = max(nx.betweenness_centrality(u, weight="w").items(), key=lambda x: x[1])[0] if len(u) <= 300 else next(iter(u))
        sp = nx.single_source_dijkstra_path(u, root, weight="w")
        S = nx.Graph()
        for path in sp.values():
            for a, c in zip(path[:-1], path[1:]):
                S.add_edge(a, c, w=u[a][c]["w"])
        spt = sum(d["w"] for *_, d in S.edges(data=True))
        tabs.append({"title": "Árbol de expansión vs. árbol de caminos desde el nodo más central", "columns": ["Estructura", "Valor total", "Δ"],
                     "rows": [["Árbol de valor total " + ("máximo" if mx else "mínimo"), fmt(total), "—"], [f"Árbol de caminos mínimos desde {b.lab(root)}", fmt(spt), sg(pct(spt, total))]]})
        paras.append(f"Conectar todo mediante caminos mínimos desde {b.lab(root)} costaría {fmt(spt)} ({sg(pct(spt, total))} frente al árbol): el árbol de expansión minimiza el costo de construir la red, no el de ir de un punto a otro.")
    except Exception:
        pass
    b.sec("3. Comparación con alternativas", paras, tables=tabs)
    # robustez: costo de reemplazo de cada arista del árbol
    rep = []
    if len(T) <= 400 and not mx:
        for a, c, d in T.edges(data=True):
            h = u.copy()
            h.remove_edge(a, c)
            comps = list(nx.connected_components(T.copy().edge_subgraph([(x, y) for x, y in T.edges if (x, y) != (a, c) and (y, x) != (a, c)])))
            cand = [(dd["w"], x, y) for x, y, dd in h.edges(data=True) if any(x in cc for cc in comps) and any(y in cc for cc in comps)
                    and next(i for i, cc in enumerate(comps) if x in cc) != next(i for i, cc in enumerate(comps) if y in cc)]
            if cand:
                w, x, y = min(cand)
                rep.append((w - d["w"], a, c, d["w"], x, y, w))
            else:
                rep.append((math.inf, a, c, d["w"], None, None, None))
        rep.sort(key=lambda t: -t[0] if t[0] != math.inf else -1e18)
    sp_, st_ = [], []
    bridges = list(nx.bridges(u))
    sp_.append(f"La red completa tiene {len(bridges)} puente(s) (aristas cuya falla desconecta el grafo)." + (" Ningún enlace tiene respaldo en esos puntos." if bridges else " Toda arista del árbol tiene al menos un enlace de reemplazo."))
    if rep:
        st_.append({"title": "Costo de reemplazar cada arista del árbol si falla (las 6 más críticas)", "columns": ["Arista que falla", "Peso", "Reemplazo", "Peso", "Sobrecosto"],
                    "rows": [[f"{b.lab(a)}–{b.lab(c)}", fmt(w0), "sin reemplazo" if x is None else f"{b.lab(x)}–{b.lab(y)}", fmt(w) if w is not None else "—", "∞" if inc == math.inf else fmt(inc)] for inc, a, c, w0, x, y, w in rep[:6]]})
    b.sec("4. Robustez del árbol", sp_, tables=st_)
    b.quality_section(["Kruskal y Prim garantizan el mismo valor total (la selección de aristas solo cambia con empates)."])
    b.risks_section(["Un árbol no tiene redundancia: la falla de cualquiera de sus aristas desconecta la red, por eso se calcula el costo de reemplazo."])
    concl = [f"El árbol de valor total {'máximo' if mx else 'mínimo'} tiene {len(edges)} aristas y un valor de {fmt(total)}, equivalente a {total / net * 100:.1f} % de la red completa." if net else r["message"]]
    return b.finish(r["title"], concl, concl, ["Usar el árbol como esqueleto de menor costo y agregar los enlaces de reemplazo de mayor prioridad si se requiere resiliencia."])


# ======================= FLUJOS =======================

def build_flow(b: Builder):
    r, p = b.r, b.p
    src, tgt = b.params.get("source"), b.params.get("target")
    flow = r["meta"].get("flow", {})
    cutrows = r["tables"][1]["rows"] if len(r["tables"]) > 1 else []
    val = r["value"]
    b.total_runs = 1 + (0 if b.light else min(len(cutrows), 6))
    b.figs = [{"label": "Flujo máximo", "value": fmt(val)}, {"label": "Arcos en el corte mínimo", "value": len(cutrows)}, {"label": "Arcos con flujo", "value": len(flow)}]
    b.sec("2. Resultado principal", [r["message"]], tables=r["tables"][:2])
    sens, paras = [], []
    if not b.light:
        for row in cutrows[:6]:
            arc = row[0]
            a, c = [x.strip().split(" ")[0] for x in arc.split("→")]
            p2 = copy.deepcopy(p)
            for e in p2["edges"]:
                if (e["source"], e["target"]) == (a, c) or (not e.get("directed") and (e["source"], e["target"]) == (c, a)):
                    e["capacity"] = (e.get("capacity") or 0) * 1.2
            r2, _ = b.run("max_flow", p2)
            if r2:
                sens.append([arc, fmt(float(row[1])), fmt(float(row[1]) * 1.2), fmt(r2["value"]), sg(pct(r2["value"], val))])
        if sens:
            best = max(sens, key=lambda s: float(s[4].replace(" %", "").replace("+", "")))
            paras.append(f"Ampliar 20 % la capacidad de un arco del corte mínimo aumenta el flujo máximo; la mayor mejora ({best[4]}) se logra ampliando {best[0]}.")
            paras.append("Ampliar arcos que no están en el corte mínimo no aumenta el flujo máximo: el corte es el cuello de botella de toda la red.")
    b.sec("3. Cuellos de botella y mejoras", paras, tables=[{"title": "Efecto de ampliar +20 % cada arco del corte", "columns": ["Arco del corte", "Capacidad", "Nueva capacidad", "Nuevo flujo máximo", "Mejora"], "rows": sens}] if sens else [])
    b.quality_section(["El flujo máximo es igual a la capacidad del corte mínimo (teorema max-flow min-cut), lo que certifica la optimalidad."])
    b.risks_section(["El flujo máximo supone capacidades constantes y conservación de flujo en los nodos intermedios."])
    concl = [f"El flujo máximo de {b.lab(src) if src else 'origen'} a {b.lab(tgt) if tgt else 'destino'} es {fmt(val)} y coincide con la capacidad del corte mínimo, formado por {len(cutrows)} arco(s)."]
    return b.finish(r["title"], concl, concl, ["Priorizar la ampliación de los arcos del corte mínimo para aumentar el flujo."])


def build_mcf(b: Builder):
    r, p = b.r, b.p
    cost = r["value"]
    rows = r["tables"][0]["rows"]
    b.total_runs = 1 + (0 if b.light else 1)
    b.figs = [{"label": "Costo mínimo", "value": money(cost)}, {"label": "Arcos usados", "value": len(rows)}]
    b.sec("2. Resultado principal", [r["message"]], tables=r["tables"][:1])
    try:
        shares = sorted(((float(x[-1]), x[0]) for x in rows), reverse=True)[:5]
        paras = ["Los arcos de mayor aporte al costo son " + ", ".join(f"{n} ({v / cost * 100:.0f} %)" for v, n in shares) + "."] if cost else []
    except Exception:
        paras = []
    scen = []
    if not b.light:
        p2 = copy.deepcopy(p)
        for n in p2["nodes"]:
            for k in ("demand", "supply"):
                if n.get(k):
                    n[k] = n[k] * 1.4
        r2, err = b.run(b.key, p2)
        if r2:
            scen.append(["Demanda y oferta +40 %", money(r2["value"]), sg(pct(r2["value"], cost))])
            paras.append(f"Con oferta y demanda un 40 % mayores el costo pasa de {money(cost)} a {money(r2['value'])} ({sg(pct(r2['value'], cost))}).")
        else:
            scen.append(["Demanda y oferta +40 %", "No factible", err[:100]])
            paras.append(f"Con oferta y demanda un 40 % mayores la red no es factible: {err}")
    b.sec("3. Impulsores y escenarios", paras, tables=[{"title": "Escenario de demanda", "columns": ["Escenario", "Costo", "Variación"], "rows": [["Base", money(cost), "—"]] + scen}])
    b.quality_section(["El símplex de redes entrega el óptimo exacto del modelo."])
    b.risks_section(["El modelo supone costos unitarios constantes y capacidades fijas en los arcos."])
    concl = [r["message"]]
    return b.finish(r["title"], concl, concl, ["Implementar el plan de flujo y vigilar los arcos con mayor aporte al costo."])


# ======================= LOCALIZACIÓN =======================

def build_location(b: Builder):
    r, p = b.r, b.p
    key = b.key
    pp = int(b.params.get("p", 2))
    chosen = r["meta"].get("chosen", [])
    val = r["value"]
    b.total_runs = 1 + (0 if b.light else 3)
    b.figs = [{"label": "Instalaciones", "value": len(chosen)}, {"label": "Valor del objetivo", "value": fmt(val)}]
    b.sec("2. Resultado principal", [r["message"]], tables=r["tables"][:1])
    # carga por instalación
    assign = r["meta"].get("assign", {})
    by = {n["id"]: n for n in p["nodes"]}
    load = {}
    for c_, f in assign.items():
        d = load.setdefault(f, [0, 0.0])
        d[0] += 1
        d[1] += by[c_].get("demand") or 1
    if load:
        tot = sum(v[1] for v in load.values())
        b.sections[-1]["tables"].append({"title": "Clientes y demanda por instalación", "columns": ["Instalación", "Clientes", "Demanda", "% de la demanda"],
                                         "rows": [[b.lab(f), v[0], fmt(v[1]), f"{v[1] / tot * 100:.0f} %"] for f, v in load.items()]})
        top = max(load.items(), key=lambda kv: kv[1][1])
        b.figs.append({"label": "Mayor carga", "value": f"{b.lab(top[0])} ({top[1][1] / tot * 100:.0f} %)"})
    rows, paras = [], []
    if not b.light and key in ("p_median", "p_center", "max_cover") and pp >= 1:
        for q in (pp - 1, pp + 1):
            if q < 1:
                continue
            r2, e2 = b.run(key, p_=None) if False else b.run(key, **{"p": q})
            if r2:
                rows.append([q, fmt(r2["value"]), sg(pct(r2["value"], val)), ", ".join(map(b.lab, r2["meta"].get("chosen", [])))])
        rows.append([pp, fmt(val), "—", ", ".join(map(b.lab, chosen))])
        rows.sort(key=lambda x: int(x[0]))
        if len(rows) >= 2:
            lo = next((x for x in rows if int(x[0]) == pp - 1), None)
            hi = next((x for x in rows if int(x[0]) == pp + 1), None)
            if hi:
                paras.append(f"Con una instalación más (p={pp + 1}) el objetivo pasa de {fmt(val)} a {hi[1]} ({hi[2]}).")
            if lo:
                paras.append(f"Con una instalación menos (p={pp - 1}) el objetivo pasa a {lo[1]} ({lo[2]}).")
        p3 = copy.deepcopy(p)
        for n in p3["nodes"]:
            if n.get("demand"):
                n["demand"] *= 1.4
        r3, _ = b.run(key, p3)
        if r3:
            same = sorted(r3["meta"].get("chosen", [])) == sorted(chosen)
            paras.append("Con la demanda un 40 % mayor " + ("se mantienen las mismas instalaciones." if same else f"las instalaciones cambian a {', '.join(map(b.lab, r3['meta']['chosen']))}.") + f" El objetivo pasa a {fmt(r3['value'])} ({sg(pct(r3['value'], val))}).")
    b.sec("3. Comparación con alternativas y sensibilidad", paras, tables=[{"title": "Efecto del número de instalaciones p", "columns": ["p", "Objetivo", "Δ", "Instalaciones"], "rows": rows}] if rows else [])
    b.quality_section([f"Brecha del MILP: {r['meta']['gap']}" if r["meta"].get("gap") is not None else ""])
    b.risks_section(["Se usan distancias de camino mínimo de la red y la demanda como peso; no se modelan capacidades de instalación salvo que se indiquen."])
    concl = [r["message"]]
    return b.finish(r["title"], concl, concl, [f"Ubicar las instalaciones {', '.join(map(b.lab, chosen))} y confirmar capacidades antes de decidir."])


# ======================= ESTRUCTURA =======================

def build_structure(b: Builder):
    r, p = b.r, b.p
    b.total_runs = 1 + (0 if b.light else 1)
    b.figs = [{"label": "Valor", "value": fmt(r.get("value"))}]
    b.sec("2. Resultado principal", [r["message"]], tables=r["tables"][:3])
    paras, tabs = [], []
    key = b.key
    if key in ("articulation", "components", "degrees"):
        g = build_nx(p, "cost")
        u = undirected_view(g)
        rows = []
        for n in list(nx.articulation_points(u))[:12]:
            h = u.copy()
            h.remove_node(n)
            comps = sorted((len(c) for c in nx.connected_components(h)), reverse=True)
            rows.append([b.lab(n), len(comps), comps[0], sum(comps[1:])])
        if rows:
            tabs.append({"title": "Qué se desconecta al fallar cada punto de articulación", "columns": ["Nodo", "Componentes resultantes", "Mayor componente", "Nodos aislados del resto"], "rows": rows})
            worst = max(rows, key=lambda x: x[3])
            paras.append(f"El punto más crítico es {worst[0]}: si falla, {worst[3]} nodo(s) quedan separados de la mayor parte de la red.")
        else:
            paras.append("No hay puntos de articulación: ningún nodo, al fallar, desconecta el grafo.")
        if key == "degrees":
            bc = r["meta"].get("betweenness", {})
            tot = sum(bc.values()) or 1
            top3 = sorted(bc.values(), reverse=True)[:3]
            paras.append(f"Los 3 nodos de mayor intermediación concentran {sum(top3) / tot * 100:.0f} % de la intermediación total: la red depende de pocos nodos para conectar el resto.")
        if not b.light and key == "articulation":
            r2, _ = b.run("resilience")
            if r2:
                tabs.append({"title": "Enlaces propuestos para eliminar los puntos críticos", "columns": ["Enlace", "Longitud estimada"], "rows": r2["tables"][0]["rows"]})
                paras.append(r2["message"])
    b.sec("3. Criticidad y mejoras", paras, tables=tabs)
    b.quality_section()
    b.risks_section(["El análisis es topológico: no pondera la demanda ni la capacidad de los enlaces."])
    concl = [r["message"]] + paras[:1]
    return b.finish(r["title"], concl, concl, ["Proteger o duplicar los elementos críticos identificados."])


# ======================= FSTSP / otros =======================

def build_fstsp(b: Builder):
    r, p = b.r, b.p
    m = r["meta"]
    b.total_runs = 1 + (0 if b.light else 4)
    b.figs = [{"label": "Tiempo camión+dron", "value": f"{fmt(r['value'])} min"}, {"label": "Solo camión", "value": f"{fmt(m['base_time'])} min"},
              {"label": "Mejora", "value": f"{fmt(m['improvement_pct'], 1)} %"}, {"label": "Entregas por dron", "value": len(m["sorties"])}]
    b.sec("2. Resultado principal", [r["message"]], tables=r["tables"][:1])
    rows = [[m["drones"], fmt(r["value"]), f"{fmt(m['improvement_pct'], 1)} %"]]
    paras = []
    if not b.light:
        for nd in (1, 3):
            if nd == m["drones"]:
                continue
            r2, _ = b.run("fstsp", n_drones=nd)
            if r2:
                rows.append([nd, fmt(r2["value"]), f"{fmt(r2['meta']['improvement_pct'], 1)} %"])
        rows.sort(key=lambda x: int(x[0]))
        paras.append("La tabla muestra el efecto del número de drones sobre el tiempo total; mejoras pequeñas entre filas pueden ser ruido heurístico.")
    b.sec("3. Sensibilidad al número de drones", paras, tables=[{"title": "Número de drones", "columns": ["Drones", "Tiempo total (min)", "Mejora vs. solo camión"], "rows": rows}])
    b.quality_section()
    b.risks_section(["El vuelo se modela en línea recta (Haversine) con velocidad y autonomía constantes; no hay viento, carga útil variable ni restricciones aéreas."])
    concl = [r["message"]]
    return b.finish(r["title"], concl, concl, ["Validar autonomía y puntos de lanzamiento/recuperación en campo antes de operar."])


def build_generic(b: Builder):
    r = b.r
    b.total_runs = 1
    b.figs = [{"label": "Valor", "value": fmt(r.get("value"))}] if r.get("value") is not None else []
    b.sec("2. Resultado principal", [r.get("message", "")], tables=r.get("tables", [])[:3])
    b.quality_section()
    b.risks_section([])
    concl = [r.get("message", "")]
    return b.finish(r["title"], concl, concl, ["Adoptar el resultado documentando sus supuestos."])


def build_summary(project: dict, result: dict, options: dict | None = None, progress=None) -> dict:
    """Devuelve el resumen ejecutivo completo. options: {time: s por escenario, light: bool}."""
    b = Builder(project, result, options, progress)
    k = b.key
    b.context_section()
    if k in ROUTING:
        out = build_routing(b)
    elif k == "tsp":
        out = build_tsp(b)
    elif k in PATHS:
        out = build_paths(b)
    elif k in TREES:
        out = build_tree(b)
    elif k in ("max_flow", "min_cut"):
        out = build_flow(b)
    elif k in ("min_cost_flow", "transport"):
        out = build_mcf(b)
    elif k in LOCATION:
        out = build_location(b)
    elif k in ("articulation", "components", "degrees"):
        out = build_structure(b)
    elif k == "fstsp":
        out = build_fstsp(b)
    else:
        out = build_generic(b)
    # el contexto (sección 1) va después del resumen en una mirada
    secs = out["sections"]
    out["sections"] = [secs[-0]] if False else secs
    out["algorithm"] = k
    out["status"] = result.get("status")
    return out
