"""Ingesta de formatos desconocidos: detección, perfilado, mapeo automático y construcción del proyecto.

Nunca se asumen columnas fijas: se proponen mapeos con confianza y el usuario los confirma.
"""
from __future__ import annotations
import csv
import io
import json
import re
import sqlite3
import zipfile
import unicodedata
from dataclasses import dataclass, field
import pandas as pd
from .model import num, truthy, new_project, validate, DEFAULT_PARAMS

MAX_BYTES = 50 * 1024 * 1024


class IngestError(ValueError):
    pass


@dataclass
class Table:
    name: str
    df: pd.DataFrame
    source: str = ""
    kind: str = "table"           # table | grafos_matrix | grafos_coords | grafos_values
    header: bool = True


@dataclass
class Parsed:
    filename: str
    fmt: str
    tables: list = field(default_factory=list)
    texts: list = field(default_factory=list)   # (cita, texto) de informes
    notes: list = field(default_factory=list)


def _norm(s) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def decode(raw: bytes) -> tuple[str, str]:
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8"), "utf-8-sig"
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16"), "utf-16"
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            continue
    raise IngestError("No se pudo decodificar el archivo (codificación desconocida).")


def detect_format(filename: str, raw: bytes) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    head = raw[:2048]
    if raw[:4] == b"PK\x03\x04":
        try:
            names = zipfile.ZipFile(io.BytesIO(raw)).namelist()
        except zipfile.BadZipFile:
            raise IngestError("Archivo ZIP/Office corrupto.")
        if any(n.startswith("word/") for n in names):
            return "docx"
        if any(n.startswith("xl/") for n in names):
            return "xlsx"
        raise IngestError("ZIP no reconocido (solo se aceptan Office Open XML).")
    if raw[:4] == b"%PDF":
        return "pdf"
    if raw[:16].startswith(b"SQLite format 3"):
        return "sqlite"
    if raw[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        raise IngestError("Formato Office antiguo (.xls/.doc) no soportado: guarde como .xlsx/.docx.")
    low = head.decode("utf-8", "ignore").lstrip().lower()
    if ext in ("graphml",) or "<graphml" in low:
        return "graphml"
    if ext == "gexf" or "<gexf" in low:
        return "gexf"
    if ext in ("geojson",) or '"featurecollection"' in low.replace(" ", ""):
        return "geojson"
    if ext == "json" or low.startswith("{") or low.startswith("["):
        return "json"
    if ext == "sql" or low.startswith(("--", "create table", "insert into", "pragma", "begin")):
        return "sqldump"
    if ext == "edgelist" or ext == "edges":
        return "edgelist"
    if ext in ("csv", "tsv", "txt", "dat", "mat", "xyz", "val", ""):
        return "text"
    return "text"


# ---------- lectura de texto delimitado y archivos Grafos ----------

def _sniff_delim(text: str) -> str:
    lines = [l for l in text.splitlines() if l.strip()][:20]
    if not lines:
        return ","
    best, score = ",", -1
    for d in ("\t", ";", ",", "|", " "):
        counts = [len(l.split(d)) for l in lines]
        if min(counts) > 1 and len(set(counts)) == 1 and counts[0] > score:
            best, score = d, counts[0]
    if score < 0:
        for d in ("\t", ";", ",", "|"):
            counts = [len(l.split(d)) for l in lines]
            if max(counts) > 1 and (sum(counts) / len(counts)) > score:
                best, score = d, sum(counts) / len(counts)
    return best


def _is_numlike(x: str) -> bool:
    return x.strip() == "#" or num(x) is not None


def _grafos_kind(rows: list[list[str]]):
    """Reconoce archivos de importación de Grafos v.1.3.5 (sin cabecera, valores numéricos o '#')."""
    if not rows:
        return None
    if not all(_is_numlike(c) for r in rows for c in r):
        return None
    w = len(rows[0])
    if any(len(r) != w for r in rows):
        return None
    n = len(rows)
    diag_ok = w == n and all(rows[i][i].strip() in ("#", "0", "0.0", "0.00") for i in range(n))
    first_seq = all(num(r[0]) is not None and float(num(r[0])).is_integer() for r in rows)
    if w == n and n >= 2 and diag_ok:
        return "grafos_matrix"
    if w == 3 and n >= 2 and first_seq:
        return "grafos_coords"
    if w == 2 and n >= 2 and first_seq:
        return "grafos_values"
    if w == n and n >= 2:
        return "grafos_matrix"
    return None


def parse_text(filename: str, text: str) -> Parsed:
    pr = Parsed(filename, "text")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    delim = _sniff_delim(text)
    rows = [next(csv.reader([l], delimiter=delim)) if delim != " " else l.split()
            for l in text.split("\n") if l.strip()]
    if not rows:
        raise IngestError("El archivo está vacío.")
    kind = _grafos_kind(rows)
    if kind:
        pr.fmt = "grafos"
        if kind == "grafos_matrix":
            df = pd.DataFrame(rows)
        elif kind == "grafos_coords":
            df = pd.DataFrame(rows, columns=["id", "x", "y"])
        else:
            df = pd.DataFrame(rows, columns=["id", "value"])
        pr.tables.append(Table(filename, df, filename, kind, header=False))
        pr.notes.append(f"Reconocido como archivo de importación de Grafos ({kind}).")
        return pr
    # edge list sin cabecera: 2-3 columnas con la primera fila no numérica en alguna columna de ids
    width = max(len(r) for r in rows)
    first = rows[0]
    all_syn = [x for role in SYN.values() for ss in role.values() for x in ss]
    first_text = all(num(c) is None and c.strip() != "#" for c in first) and any(re.search(r"[A-Za-z]", c) for c in first)
    syn_hit = any(_score(c, all_syn) >= 0.8 for c in first)
    second_numeric = len(rows) > 1 and any(num(c) is not None for c in rows[1])
    # cabecera: todo texto y (coincide con sinónimos conocidos o la fila siguiente trae números)
    has_header = first_text and (syn_hit or second_numeric)
    if has_header:
        hdr = [c.strip() or f"col{i}" for i, c in enumerate(first)]
        body = [r + [""] * (len(hdr) - len(r)) for r in rows[1:]]
        df = pd.DataFrame([r[:len(hdr)] for r in body], columns=_dedupe(hdr))
    else:
        df = pd.DataFrame([r + [""] * (width - len(r)) for r in rows],
                          columns=[f"col{i}" for i in range(width)])
        if width in (2, 3):
            df.columns = ["source", "target", "weight"][:width]
            pr.notes.append("Sin cabecera: interpretado como lista de aristas.")
    pr.tables.append(Table(filename, df, filename))
    return pr


def _dedupe(cols):
    seen, out = {}, []
    for c in cols:
        if c in seen:
            seen[c] += 1
            out.append(f"{c}_{seen[c]}")
        else:
            seen[c] = 0
            out.append(c)
    return out


# ---------- otros formatos ----------

def parse_excel(filename: str, raw: bytes) -> Parsed:
    pr = Parsed(filename, "xlsx")
    try:
        sheets = pd.read_excel(io.BytesIO(raw), sheet_name=None, header=None, dtype=object)
    except Exception as e:
        raise IngestError(f"No se pudo leer el Excel: {e}")
    for name, raw_df in sheets.items():
        raw_df = raw_df.dropna(how="all").dropna(axis=1, how="all")
        if raw_df.empty:
            continue
        hdr_idx = 0
        for i in range(min(10, len(raw_df))):   # primera fila con ≥2 celdas de texto = cabecera
            row = raw_df.iloc[i]
            if sum(isinstance(v, str) for v in row) >= max(2, len(row) // 2):
                hdr_idx = i
                break
        hdr = [str(v) if v is not None and str(v) != "nan" else f"col{j}"
               for j, v in enumerate(raw_df.iloc[hdr_idx])]
        df = raw_df.iloc[hdr_idx + 1:].copy()
        df.columns = _dedupe(hdr)
        df = df.reset_index(drop=True)
        pr.tables.append(Table(f"{filename}::{name}", df, f"hoja '{name}'"))
    if not pr.tables:
        raise IngestError("El Excel no contiene datos.")
    return pr


def parse_json(filename: str, text: str) -> Parsed:
    pr = Parsed(filename, "json")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise IngestError(f"JSON inválido: {e}")

    def to_df(rows):
        return pd.json_normalize(rows)
    if isinstance(data, list) and data and isinstance(data[0], dict):
        pr.tables.append(Table(filename, to_df(data), "raíz"))
    elif isinstance(data, dict):
        found = False
        for key in ("nodes", "nodos", "vertices", "edges", "aristas", "links", "arcos",
                    "vehicles", "vehiculos", "vehículos", "depots", "depositos"):
            if isinstance(data.get(key), list) and data[key] and isinstance(data[key][0], dict):
                pr.tables.append(Table(f"{filename}::{key}", to_df(data[key]), key))
                found = True
        if not found:
            for k, v in data.items():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    pr.tables.append(Table(f"{filename}::{k}", to_df(v), k))
                    found = True
        if isinstance(data.get("params"), dict) or isinstance(data.get("parametros"), dict):
            pr.notes.append("params:" + json.dumps(data.get("params") or data.get("parametros")))
        if not found:
            raise IngestError("JSON sin listas de registros reconocibles (nodes/edges/...).")
    else:
        raise IngestError("JSON no reconocido: se esperaba lista de objetos o {nodes, edges}.")
    return pr


def parse_geojson(filename: str, text: str) -> Parsed:
    pr = Parsed(filename, "geojson")
    data = json.loads(text)
    feats = data.get("features", [data] if data.get("type") == "Feature" else [])
    pts, lines = [], []
    for i, f in enumerate(feats):
        g, props = f.get("geometry") or {}, f.get("properties") or {}
        if g.get("type") == "Point":
            lon, lat = g["coordinates"][:2]
            pts.append({"id": props.get("id", props.get("name", f"N{i}")), "lat": lat, "lon": lon, **props})
        elif g.get("type") in ("LineString", "MultiLineString"):
            lines.append({"props": props, "coords": g["coordinates"] if g["type"] == "LineString"
                          else [c for seg in g["coordinates"] for c in seg]})
    if pts:
        df = pd.DataFrame(pts).loc[:, lambda d: ~d.columns.duplicated()]
        pr.tables.append(Table(filename + "::puntos", df, "puntos GeoJSON"))
    if lines and pts:
        from .model import haversine
        def near(lat, lon):
            return min(pts, key=lambda q: haversine(lat, lon, q["lat"], q["lon"]))["id"]
        rows = []
        for ln in lines:
            a, b = ln["coords"][0], ln["coords"][-1]
            rows.append({"source": near(a[1], a[0]), "target": near(b[1], b[0]), **ln["props"]})
        pr.tables.append(Table(filename + "::lineas", pd.DataFrame(rows), "líneas GeoJSON"))
        pr.notes.append("Líneas GeoJSON asociadas al nodo más cercano en cada extremo.")
    if not pts:
        raise IngestError("GeoJSON sin geometrías Point.")
    return pr


def parse_sqlite_file(filename: str, raw: bytes) -> Parsed:
    import tempfile, os
    pr = Parsed(filename, "sqlite")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as f:
        f.write(raw)
        path = f.name
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        return _read_sqlite(pr, con)
    except sqlite3.DatabaseError as e:
        raise IngestError(f"SQLite inválido: {e}")
    finally:
        os.unlink(path)


def _read_sqlite(pr: Parsed, con: sqlite3.Connection) -> Parsed:
    names = [r[0] for r in con.execute("select name from sqlite_master where type in ('table','view')")
             if not r[0].startswith("sqlite_")]
    for t in names:
        df = pd.read_sql_query(f'select * from "{t}" limit 200000', con)
        if len(df):
            pr.tables.append(Table(f"{pr.filename}::{t}", df, f"tabla '{t}'"))
    con.close()
    if not pr.tables:
        raise IngestError("La base de datos no contiene tablas con datos.")
    return pr


_SAFE_SQL = re.compile(r"^\s*(create\s+table|insert\s+into|create\s+index|begin|commit|pragma\s+\w+\s*=)", re.I)


def parse_sqldump(filename: str, text: str) -> Parsed:
    """Carga CREATE TABLE/INSERT en una base en memoria. Se rechaza cualquier otra sentencia."""
    pr = Parsed(filename, "sqldump")
    con = sqlite3.connect(":memory:")
    text = re.sub(r"--[^\n]*", "", text)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"`", '"', text)
    text = re.sub(r"\)\s*ENGINE=[^;]*;", ");", text, flags=re.I)
    stmts = [s.strip() for s in re.split(r";\s*\n", text) if s.strip()]
    skipped = 0
    for s in stmts:
        if not _SAFE_SQL.match(s):
            skipped += 1
            continue
        if re.match(r"^\s*pragma", s, re.I):
            continue
        try:
            con.execute(s)
        except sqlite3.Error:
            skipped += 1
    if skipped:
        pr.notes.append(f"{skipped} sentencias SQL no soportadas/omitidas (solo se ejecutan CREATE TABLE/INSERT).")
    return _read_sqlite(pr, con)


def parse_graphml_gexf(filename: str, raw: bytes, fmt: str) -> Parsed:
    import networkx as nx
    pr = Parsed(filename, fmt)
    try:
        g = nx.read_graphml(io.BytesIO(raw)) if fmt == "graphml" else nx.read_gexf(io.BytesIO(raw))
    except Exception as e:
        raise IngestError(f"{fmt.upper()} inválido: {e}")
    nodes = [{"id": n, **d} for n, d in g.nodes(data=True)]
    edges = [{"source": u, "target": v, **d} for u, v, d in g.edges(data=True)]
    pr.tables.append(Table(filename + "::nodos", pd.DataFrame(nodes), "nodos"))
    e = pd.DataFrame(edges)
    if len(e):
        e["directed"] = g.is_directed()
        pr.tables.append(Table(filename + "::aristas", e, "aristas"))
    return pr


def parse_docx(filename: str, raw: bytes) -> Parsed:
    import docx
    pr = Parsed(filename, "docx")
    try:
        d = docx.Document(io.BytesIO(raw))
    except Exception as e:
        raise IngestError(f"Word inválido: {e}")
    for i, para in enumerate(d.paragraphs):
        if para.text.strip():
            pr.texts.append((f"párrafo {i + 1}", para.text.strip()))
    for ti, t in enumerate(d.tables):
        rows = [[c.text.strip() for c in r.cells] for r in t.rows]
        if len(rows) >= 2:
            df = pd.DataFrame(rows[1:], columns=_dedupe([c or f"col{j}" for j, c in enumerate(rows[0])]))
            pr.tables.append(Table(f"{filename}::tabla{ti + 1}", df, f"tabla {ti + 1} del documento"))
    return pr


def parse_pdf(filename: str, raw: bytes) -> Parsed:
    import pdfplumber
    pr = Parsed(filename, "pdf")
    try:
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            for pi, page in enumerate(pdf.pages[:200]):
                txt = page.extract_text() or ""
                for li, line in enumerate(txt.splitlines()):
                    if line.strip():
                        pr.texts.append((f"pág. {pi + 1}, línea {li + 1}", line.strip()))
                for ti, tb in enumerate(page.extract_tables()):
                    rows = [[(c or "").strip() for c in r] for r in tb if r]
                    if len(rows) >= 2:
                        df = pd.DataFrame(rows[1:], columns=_dedupe([c or f"col{j}" for j, c in enumerate(rows[0])]))
                        pr.tables.append(Table(f"{filename}::p{pi + 1}t{ti + 1}", df,
                                               f"pág. {pi + 1}, tabla {ti + 1}"))
    except Exception as e:
        raise IngestError(f"PDF ilegible: {e}")
    if not pr.tables and not pr.texts:
        pr.notes.append("PDF sin texto extraíble (¿escaneado?). OCR no disponible; cargue los datos en CSV/Excel.")
    return pr


def parse_file(filename: str, raw: bytes) -> Parsed:
    if len(raw) > MAX_BYTES:
        raise IngestError(f"Archivo demasiado grande ({len(raw) / 1e6:.1f} MB; máximo {MAX_BYTES // 1_000_000} MB).")
    if not raw:
        raise IngestError("El archivo está vacío.")
    fmt = detect_format(filename, raw)
    if fmt == "xlsx":
        return parse_excel(filename, raw)
    if fmt == "docx":
        return parse_docx(filename, raw)
    if fmt == "pdf":
        return parse_pdf(filename, raw)
    if fmt == "sqlite":
        return parse_sqlite_file(filename, raw)
    if fmt in ("graphml", "gexf"):
        return parse_graphml_gexf(filename, raw, fmt)
    text, enc = decode(raw)
    if fmt == "json":
        return parse_json(filename, text)
    if fmt == "geojson":
        return parse_geojson(filename, text)
    if fmt == "sqldump":
        return parse_sqldump(filename, text)
    if fmt == "edgelist":
        p = parse_text(filename, text)
        return p
    pr = parse_text(filename, text)
    pr.notes.append(f"Codificación detectada: {enc}")
    return pr


# ---------- perfilado ----------

def profile(t: Table) -> list[dict]:
    out = []
    for c in t.df.columns:
        s = t.df[c]
        vals = [v for v in s.tolist() if v is not None and str(v).strip() not in ("", "nan", "None")]
        nums = [num(v) for v in vals]
        isnum = len(vals) > 0 and sum(x is not None for x in nums) / len(vals) > 0.9
        info = {"col": str(c), "nulos": int(len(s) - len(vals)), "unicos": len(set(map(str, vals))),
                "tipo": "numérico" if isnum else "texto"}
        if isnum:
            xs = [x for x in nums if x is not None]
            info.update(min=min(xs), max=max(xs), media=sum(xs) / len(xs))
        else:
            info["ejemplos"] = list(dict.fromkeys(map(str, vals)))[:4]
        out.append(info)
    return out


# ---------- mapeo automático ----------

SYN = {
    "node": {
        "id": ["id", "nodo", "node", "codigo", "code", "cod", "idnodo", "node id", "id nodo", "vertice", "n", "index", "i"],
        "name": ["nombre", "name", "label", "etiqueta", "ciudad", "city", "estacion", "descripcion", "sitio", "location"],
        "lat": ["lat", "latitude", "latitud", "y coord", "ycoord"],
        "lon": ["lon", "lng", "long", "longitude", "longitud", "x coord", "xcoord"],
        "x": ["x", "px", "pos x"],
        "y": ["y", "py", "pos y"],
        "demand": ["demanda", "demand", "carga", "kg", "peso", "pedido", "entrega", "delivery", "delivery demand", "q"],
        "supply": ["oferta", "supply", "produccion", "capacidad oferta", "recogida", "pickup", "pick up"],
        "type": ["tipo", "type", "categoria", "category", "rol", "role", "clase"],
        "tw_start": ["tw start", "ventana inicio", "inicio ventana", "ready time", "ready", "apertura", "open", "earliest", "tw inicio", "hora inicio", "tw a", "a"],
        "tw_end": ["tw end", "ventana fin", "fin ventana", "due date", "due", "cierre", "close", "latest", "tw fin", "hora fin", "tw b", "b"],
        "service": ["servicio", "service", "service time", "tiempo servicio", "tiempo de servicio", "dwell"],
        "capacity": ["capacidad", "capacity", "cap"],
        "frequency": ["frecuencia", "frequency", "visitas", "visits", "freq"],
    },
    "edge": {
        "source": ["source", "origen", "from", "desde", "src", "u", "inicio", "start", "nodo origen", "tail", "o", "i"],
        "target": ["target", "destino", "to", "hasta", "dst", "v", "fin", "end", "nodo destino", "head", "d", "j"],
        "distance": ["distancia", "distance", "dist", "km", "longitud", "length", "d km", "distancia km", "metros", "meters", "m"],
        "time": ["tiempo", "time", "duracion", "duration", "minutos", "min", "minutes", "t min", "travel time"],
        "cost": ["costo", "coste", "cost", "peso", "weight", "w", "valor", "tarifa", "precio", "price", "cost eur"],
        "capacity": ["capacidad", "capacity", "cap", "flujo max", "max flow", "maximo", "upper"],
        "directed": ["dirigido", "directed", "oneway", "one way", "sentido", "direccion"],
        "emissions": ["emisiones", "emissions", "co2", "co2e"],
    },
    "vehicle": {
        "type": ["tipo", "type", "vehiculo", "vehicle", "nombre", "name", "flota", "fleet"],
        "capacity": ["capacidad", "capacity", "cap", "carga"],
        "fixed_cost": ["costo fijo", "fixed cost", "fixed", "costo_fijo", "arranque"],
        "cost_per_km": ["costo km", "cost per km", "costo por km", "c km", "cost km", "tarifa km"],
        "speed": ["velocidad", "speed", "kmh", "km h"],
        "range": ["autonomia", "range", "alcance", "endurance"],
        "count": ["cantidad", "count", "numero", "n", "unidades", "flota size", "fleet size", "qty"],
        "emissions_per_km": ["emisiones km", "emissions per km", "co2 km", "e km"],
        "depot": ["deposito", "depot", "base", "origen"],
    },
}


def _score(col: str, syns: list[str]) -> float:
    c = _norm(col)
    best = 0.0
    for s in syns:
        s = _norm(s)
        if c == s:
            best = max(best, 1.0)
        elif len(s) >= 3 and (s in c.split() or c in s.split()):
            best = max(best, 0.8)
        elif len(s) >= 4 and s in c:
            best = max(best, 0.6)
    return best


def _best_map(df: pd.DataFrame, role: str, prof: list[dict]) -> tuple[dict, float]:
    syn = SYN[role]
    p = {x["col"]: x for x in prof}
    cand = []
    for field_, ss in syn.items():
        for c in df.columns:
            sc = _score(c, ss)
            if sc > 0:
                if field_ in ("lat", "lon", "x", "y", "distance", "time", "cost", "demand", "capacity",
                              "supply", "tw_start", "tw_end", "service", "fixed_cost", "cost_per_km",
                              "speed", "range", "count", "emissions", "emissions_per_km", "frequency"):
                    if p[str(c)]["tipo"] != "numérico":
                        continue
                cand.append((sc, field_, str(c)))
    cand.sort(reverse=True)
    mapping, used = {}, set()
    for sc, f, c in cand:
        if f in mapping or c in used:
            continue
        mapping[f] = c
        used.add(c)
    conf = sum(_score(c, syn[f]) for f, c in mapping.items()) / max(1, len(mapping))
    return mapping, conf


def classify_table(t: Table) -> dict:
    """Propone rol (nodes|edges|vehicles|matrix|coords|values|params|ignore) y mapeo de columnas."""
    prof = profile(t)
    if t.kind == "grafos_matrix":
        return {"role": "matrix", "mapping": {}, "confidence": 0.95, "profile": prof,
                "razon": "Matriz cuadrada NxN con '#' = sin valor (formato Grafos)."}
    if t.kind == "grafos_coords":
        return {"role": "coords", "mapping": {"id": "id", "x": "x", "y": "y"}, "confidence": 0.9,
                "profile": prof, "razon": "Tres columnas i, x, y (formato Grafos)."}
    if t.kind == "grafos_values":
        return {"role": "values", "mapping": {"id": "id", "value": "value"}, "confidence": 0.9,
                "profile": prof, "razon": "Dos columnas i, valor (formato Grafos)."}
    df = t.df
    # matriz con etiquetas (primera columna = etiquetas, encabezados = mismas etiquetas)
    if df.shape[1] >= 3 and df.shape[0] >= 2:
        cols = [str(c) for c in df.columns]
        firstcol = [str(v) for v in df.iloc[:, 0].tolist()]
        rest_num = all(num(v) is not None or str(v).strip() in ("", "#", "nan", "None", "-")
                       for v in df.iloc[:, 1:].to_numpy().ravel())
        labels_match = [_norm(x) for x in cols[1:]] == [_norm(x) for x in firstcol]
        hdr_syn = any(_score(c, [x for role in ("node", "edge") for ss in SYN[role].values() for x in ss]) >= 0.8 for c in cols)
        if rest_num and (labels_match or (df.shape[1] - 1 == df.shape[0] and df.shape[0] >= 3 and not hdr_syn)):
            return {"role": "matrix", "mapping": {"labels_in_first_column": True, "labels_match": labels_match},
                    "confidence": 0.9 if labels_match else 0.6, "profile": prof,
                    "razon": "Matriz de adyacencia/costo con etiquetas."}
    mn, cn = _best_map(df, "node", prof)
    me, ce = _best_map(df, "edge", prof)
    mv, cv = _best_map(df, "vehicle", prof)
    nodes_score = (("id" in mn) + (("lat" in mn and "lon" in mn) or ("x" in mn and "y" in mn)) +
                   len({"demand", "supply", "type", "tw_start", "tw_end", "service", "name"} & set(mn))) * cn
    edges_score = (("source" in me and "target" in me) * 3 + len({"distance", "time", "cost", "capacity"} & set(me))) * ce
    veh_score = (("capacity" in mv) + ("cost_per_km" in mv) + ("fixed_cost" in mv) + ("count" in mv) +
                 ("range" in mv)) * cv * (1 if "type" in mv else 0.4)
    # tablas de una columna "parámetro/valor"
    if df.shape[1] == 2 and _score(df.columns[0], ["parametro", "parameter", "param", "concepto", "variable", "clave", "key"]) > 0:
        return {"role": "params", "mapping": {"key": str(df.columns[0]), "value": str(df.columns[1])},
                "confidence": 0.8, "profile": prof, "razon": "Tabla parámetro/valor."}
    best = max((nodes_score, "nodes"), (edges_score, "edges"), (veh_score, "vehicles"))
    # tablas con lat/lon pero sin columna id → nodos igualmente
    if best[0] < 1.0 and ("lat" in mn and "lon" in mn):
        best = (1.0, "nodes")
    role = best[1] if best[0] >= 1.0 else "ignore"
    mapping = {"nodes": mn, "edges": me, "vehicles": mv}.get(role, {})
    conf = {"nodes": cn, "edges": ce, "vehicles": cv}.get(role, 0.0)
    if role == "nodes" and "id" not in mapping:
        mapping = dict(mapping)
        mapping["id"] = None   # se generará de forma secuencial
    razon = {"nodes": "Columnas de identificador/coordenadas/atributos de nodo.",
             "edges": "Columnas origen–destino y atributos de arista.",
             "vehicles": "Columnas de capacidad/costos de flota.",
             "ignore": "No se reconoció estructura de grafo; asigne el rol manualmente."}[role]
    return {"role": role, "mapping": mapping, "confidence": round(float(conf), 2), "profile": prof, "razon": razon}


# ---------- extracción de parámetros desde texto de informes ----------

PARAM_PATTERNS = [
    ("c_km", r"(?:costo|coste|cost)\s*(?:por|/|per)\s*(?:km|kil[oó]metro)", "costo por km"),
    ("c_hora", r"(?:costo|coste|cost)\s*(?:por|/|per)\s*(?:hora|hour|h)\b", "costo por hora"),
    ("speed", r"velocidad(?:\s+(?:media|promedio))?|speed", "velocidad (km/h)"),
    ("road_factor", r"factor\s+(?:vial|de\s+circuidad|de\s+rodeo|circuity)", "factor vial"),
    ("e_km", r"emisiones?\s*(?:por|/)\s*km|co2e?\s*(?:por|/)\s*km", "emisiones por km"),
    ("vehicle_capacity", r"capacidad(?:\s+del\s+veh[ií]culo|\s+de\s+carga)?|capacity", "capacidad del vehículo"),
    ("vehicle_count", r"(?:n[uú]mero|cantidad)\s+de\s+veh[ií]culos|flota\s+de|fleet\s+size", "tamaño de flota"),
    ("fixed_cost", r"costo\s+fijo|fixed\s+cost", "costo fijo por vehículo"),
    ("range", r"autonom[ií]a|alcance|range", "autonomía (km)"),
    ("depot", r"dep[oó]sito|base\s+central|depot", "depósito"),
]
_NUM = r"(-?\d[\d.,]*)"


def extract_params(texts: list[tuple[str, str]]) -> list[dict]:
    """Extrae parámetros con cita de origen y confianza. Lo no encontrado NO se inventa."""
    found = []
    for cita, line in texts:
        for key, pat, desc in PARAM_PATTERNS:
            m = re.search(rf"(?:{pat})[^0-9\-]{{0,40}}?[:=]?\s*{_NUM}", line, re.I)
            if m and key != "depot":
                v = num(m.group(m.lastindex))
                if v is not None:
                    exact = bool(re.search(rf"(?:{pat})\s*[:=]\s*{_NUM}", line, re.I))
                    found.append({"param": key, "descripcion": desc, "valor": v,
                                  "confianza": 0.85 if exact else 0.55, "cita": f"{cita}: «{line[:160]}»"})
            elif m is None and key == "depot":
                m2 = re.search(r"dep[oó]sito\s*[:=]?\s*([A-Za-z0-9_\-]+)", line, re.I)
                if m2 and m2.group(1).lower() not in ("es", "en", "de", "del", "central"):
                    found.append({"param": "depot", "descripcion": desc, "valor": m2.group(1),
                                  "confianza": 0.5, "cita": f"{cita}: «{line[:160]}»"})
    return found


def llm_extract(texts: list[tuple[str, str]]) -> list[dict]:
    """Ayuda opcional por LLM (ANTHROPIC_API_KEY). Sin clave devuelve [] y se usan reglas."""
    import os
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key or not texts:
        return []
    try:
        import httpx
        body = "\n".join(f"[{c}] {t}" for c, t in texts[:300])[:30000]
        prompt = ("Extrae del informe SOLO parámetros explícitos para un modelo de grafos/logística. "
                  "Devuelve JSON: lista de {param, valor, cita}. param ∈ c_km,c_hora,speed,road_factor,e_km,"
                  "vehicle_capacity,vehicle_count,fixed_cost,range,depot. Si no está explícito, no lo incluyas.\n\n" + body)
        r = httpx.post("https://api.anthropic.com/v1/messages", timeout=60,
                       headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                       json={"model": os.environ.get("LLM_MODEL", "claude-sonnet-5-5"), "max_tokens": 2000,
                             "messages": [{"role": "user", "content": prompt}]})
        txt = r.json()["content"][0]["text"]
        arr = json.loads(txt[txt.index("["): txt.rindex("]") + 1])
        return [{"param": a["param"], "descripcion": "extraído por LLM", "valor": a["valor"],
                 "confianza": 0.6, "cita": a.get("cita", "")} for a in arr if "param" in a and "valor" in a]
    except Exception:
        return []


# ---------- construcción del proyecto ----------

def _clean_id(v) -> str:
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def build_project(name: str, parsed_list: list[Parsed], decisions: dict | None = None,
                  extra_params: dict | None = None, units: dict | None = None) -> dict:
    """Construye el proyecto canónico. decisions: {nombre_tabla: {role, mapping}} (editable por el usuario)."""
    decisions = decisions or {}
    units = units or {}
    p = new_project(name)
    tables = [t for ps in parsed_list for t in ps.tables]
    for ps in parsed_list:
        p["meta"]["source"].append({"archivo": ps.filename, "formato": ps.fmt, "notas": ps.notes})
    plan = []
    for t in tables:
        d = decisions.get(t.name) or classify_table(t)
        plan.append((t, d))
    node_rows: dict[str, dict] = {}
    order: list[str] = []

    def upsert(nid, **kw):
        nid = _clean_id(nid)
        if nid not in node_rows:
            node_rows[nid] = {"id": nid}
            order.append(nid)
        for k, v in kw.items():
            if v is not None:
                node_rows[nid][k] = v
        return node_rows[nid]

    matrix_tables = []
    for t, d in plan:
        role, m = d["role"], d.get("mapping", {})
        df = t.df
        if role == "nodes":
            idcol = m.get("id")
            for ri, row in df.iterrows():
                nid = row[idcol] if idcol else ri
                if idcol and str(nid).strip() in ("", "nan", "None"):
                    continue
                if not idcol and "name" in m:
                    pass
                rec: dict = {}
                for f in ("name", "type"):
                    if m.get(f):
                        v = row[m[f]]
                        rec[f] = None if str(v) in ("nan", "None", "") else str(v)
                for f in ("lat", "lon", "x", "y", "demand", "supply", "tw_start", "tw_end", "service",
                          "capacity", "frequency"):
                    if m.get(f):
                        rec[f] = num(row[m[f]])
                known = set(m.values())
                for c in df.columns:
                    if c not in known and str(c) not in ("index",):
                        v = row[c]
                        if str(v) not in ("nan", "None", ""):
                            rec.setdefault("extra", {})[str(c)] = v if isinstance(v, (int, float, str)) else str(v)
                upsert(nid, **rec)
        elif role == "coords":
            for _, r in df.iterrows():
                upsert(r.iloc[0], x=num(r.iloc[1]), y=num(r.iloc[2]))
        elif role == "values":
            vcol = d.get("mapping", {}).get("value_field", "demand")
            for _, r in df.iterrows():
                upsert(r.iloc[0], **{vcol: num(r.iloc[1])})
        elif role in ("matrix", "edges", "vehicles", "params"):
            matrix_tables.append((t, d))
    # nodos implícitos desde matrices/aristas
    explicit = set(order)
    edges, vehicles = [], []
    scale_dist = units.get("distance_divisor", 1.0)

    for t, d in matrix_tables:
        role, m = d["role"], d.get("mapping", {})
        df = t.df
        if role == "matrix":
            if t.kind == "grafos_matrix":
                vals = [[num(v) for v in r] for r in df.to_numpy().tolist()]
                labels = [str(i) for i in range(len(vals))]
            else:
                labels = [_clean_id(v) for v in df.iloc[:, 0].tolist()]
                vals = [[num(v) for v in r] for r in df.iloc[:, 1:].to_numpy().tolist()]
            attr = d.get("matrix_attr", "cost" if t.kind == "grafos_matrix" else d.get("matrix_attr", "distance"))
            for l in labels:
                upsert(l)
            sym = all(vals[i][j] == vals[j][i] or (vals[i][j] is None and vals[j][i] is None)
                      for i in range(len(vals)) for j in range(len(vals)))
            for i, row in enumerate(vals):
                for j, v in enumerate(row):
                    if v is None or i == j:
                        continue
                    if sym and j < i:
                        continue
                    edges.append({"source": labels[i], "target": labels[j], attr: v / (scale_dist if attr == "distance" else 1),
                                  "directed": not sym})
        elif role == "edges":
            sc, tg = m.get("source"), m.get("target")
            if not sc or not tg:
                raise IngestError(f"Tabla '{t.name}': el rol 'aristas' requiere columnas origen y destino.")
            wcol = m.get("weight")
            for _, row in df.iterrows():
                a, b = row[sc], row[tg]
                if str(a) in ("", "nan", "None") or str(b) in ("", "nan", "None"):
                    continue
                e = {"source": _clean_id(a), "target": _clean_id(b)}
                for f in ("distance", "time", "cost", "capacity", "emissions"):
                    if m.get(f):
                        e[f] = num(row[m[f]])
                if wcol and e.get("cost") is None:
                    e[d.get("weight_attr", "cost")] = num(row[wcol])
                if "weight" in df.columns and not m.get("cost") and not m.get("distance") and e.get("cost") is None:
                    e["cost"] = num(row["weight"])
                if m.get("directed"):
                    e["directed"] = truthy(row[m["directed"]], None)
                if e.get("distance") is not None and units.get("distance_divisor"):
                    e["distance"] = e["distance"] / units["distance_divisor"]
                edges.append(e)
                upsert(e["source"])
                upsert(e["target"])
        elif role == "vehicles":
            for _, row in df.iterrows():
                v = {}
                for f in ("type", "depot"):
                    if m.get(f):
                        v[f] = str(row[m[f]])
                for f in ("capacity", "fixed_cost", "cost_per_km", "speed", "range", "count", "emissions_per_km"):
                    if m.get(f):
                        v[f] = num(row[m[f]])
                if v:
                    v.setdefault("type", f"Vehículo {len(vehicles) + 1}")
                    vehicles.append(v)
        elif role == "params":
            for _, row in df.iterrows():
                k, v = _norm(row[m["key"]]), num(row[m["value"]])
                for key, pat, _ in PARAM_PATTERNS:
                    if v is not None and re.search(pat, k, re.I):
                        extra_params = dict(extra_params or {})
                        extra_params.setdefault(key, v)
    ids_in_edges = {e["source"] for e in edges} | {e["target"] for e in edges}
    # si las matrices Grafos usan índices 0..N-1 y los nodos explícitos son 0..N-1 también: coinciden
    p["nodes"] = [{"id": k, "name": node_rows[k].get("name", k), **{kk: vv for kk, vv in node_rows[k].items()
                                                                      if kk not in ("id", "name")}} for k in order]
    for n in p["nodes"]:
        for f in ("lat", "lon", "x", "y", "demand", "supply", "type", "tw_start", "tw_end", "service",
                  "capacity", "frequency"):
            n.setdefault(f, None)
    p["edges"] = [{"source": e["source"], "target": e["target"], "distance": e.get("distance"),
                   "time": e.get("time"), "cost": e.get("cost"), "capacity": e.get("capacity"),
                   "directed": e.get("directed"), "emissions": e.get("emissions")} for e in edges]
    p["vehicles"] = vehicles
    for k, v in (extra_params or {}).items():
        if k in DEFAULT_PARAMS:
            p["params"][k] = v
        elif k == "vehicle_capacity" and not vehicles:
            p["vehicles"].append({"type": "Vehículo", "capacity": v, "count": 1})
    if extra_params and "vehicle_count" in extra_params and p["vehicles"]:
        p["vehicles"][0]["count"] = extra_params["vehicle_count"]
    dep = [n["id"] for n in p["nodes"] if n.get("type") and re.search(r"dep[oó]sito|depot|base|warehouse|almac",
                                                                   str(n["type"]), re.I)]
    if dep:
        p["params"]["depots"] = dep
    for ps in parsed_list:
        for note in ps.notes:
            if note.startswith("params:"):
                try:
                    for k, v in json.loads(note[7:]).items():
                        if k in DEFAULT_PARAMS:
                            p["params"][k] = v
                except Exception:
                    pass
    p["meta"]["warnings"] = validate(p)
    return p


def preview(parsed_list: list[Parsed]) -> dict:
    """Respuesta para la pantalla de mapeo: tablas, perfiles, propuestas, parámetros extraídos de texto."""
    out_tables = []
    for ps in parsed_list:
        for t in ps.tables:
            c = classify_table(t)
            out_tables.append({"name": t.name, "source": t.source, "kind": t.kind,
                               "rows": int(len(t.df)), "columns": [str(x) for x in t.df.columns],
                               "sample": t.df.head(8).astype(object).where(t.df.head(8).notna(), None).values.tolist(),
                               **c})
    texts = [x for ps in parsed_list for x in ps.texts]
    params = extract_params(texts) + llm_extract(texts)
    return {"files": [{"name": ps.filename, "format": ps.fmt, "notes": ps.notes} for ps in parsed_list],
            "tables": out_tables, "extracted_params": params, "text_lines": len(texts)}
