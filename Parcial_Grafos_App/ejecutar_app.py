"""Parcial de Teoría de Grafos: TSP, m-TSP, caminos y árboles por optimización.

Ejecutar:   python ejecutar_app.py        (abre http://127.0.0.1:8765 en el navegador)

Solo usa la biblioteca estándar de Python. El solver de optimización (HiGHS) corre dentro del navegador
(WebAssembly incluido en web/vendor). Si el navegador no pudiera usarlo, la interfaz ofrece instalar
`highspy` (pip) y resolver desde este servidor. Las calles se trazan con OSRM (OpenStreetMap) y se guardan
en datos/cache_rutas.json; sin internet se usa lo ya guardado y líneas rectas para lo demás.
"""
import base64
import io
import json
import math
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
import zipfile
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.sax.saxutils import escape

AQUI = Path(__file__).resolve().parent
WEB = AQUI / "web"
CACHE_ARCHIVO = AQUI / "datos" / "cache_rutas.json"
OSRM = os.environ.get("OSRM_URL", "https://router.project-osrm.org")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/javascript", ".js")

# ----------------------------------------------------------------------------------------------
# Caché de trazados por calles
# ----------------------------------------------------------------------------------------------
_cache, _cache_lock, _sucio = {}, threading.Lock(), [0]


def cargar_cache():
    global _cache
    try:
        _cache = json.loads(CACHE_ARCHIVO.read_text(encoding="utf-8"))
    except Exception:
        _cache = {}


def guardar_cache(forzar=False):
    with _cache_lock:
        if not forzar and _sucio[0] < 20:
            return
        try:
            CACHE_ARCHIVO.parent.mkdir(exist_ok=True)
            CACHE_ARCHIVO.write_text(json.dumps(_cache, separators=(",", ":")), encoding="utf-8")
            _sucio[0] = 0
        except OSError:
            pass


def clave(a, b, c, d):
    return f"{a:.5f},{b:.5f}>{c:.5f},{d:.5f}"


def rdp(pts, tol):
    """Simplificación Ramer-Douglas-Peucker (solo para reducir el tamaño del trazado dibujado)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    pila = [(0, len(pts) - 1)]
    while pila:
        i, j = pila.pop()
        ax, ay = pts[i]; bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        mejor, idx = 0.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            if L == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > mejor:
                mejor, idx = d, k
        if mejor > tol and idx > 0:
            keep[idx] = True
            pila += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def osrm_tramo(la1, lo1, la2, lo2):
    """Trazado por calles entre dos puntos: [[lat, lon], ...] o None si no hay conexión."""
    k = clave(la1, lo1, la2, lo2)
    with _cache_lock:
        if k in _cache:
            return _cache[k]
    largo = math.hypot((lo2 - lo1) * 111.32 * math.cos(math.radians((la1 + la2) / 2)), (la2 - la1) * 110.574) > 80   # distancia euclidiana en km
    url = (f"{OSRM}/route/v1/driving/{lo1:.6f},{la1:.6f};{lo2:.6f},{la2:.6f}"
           "?overview=full&geometries=geojson&steps=false")
    for intento in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "parcial-grafos/1.0"}), timeout=40) as r:
                d = json.loads(r.read())
            if d.get("code") != "Ok":
                return None
            pts = [(p[1], p[0]) for p in d["routes"][0]["geometry"]["coordinates"]]
            pts = rdp(pts, 6e-4 if largo else 2e-5)
            res = [[round(a, 5), round(b, 5)] for a, b in pts]
            with _cache_lock:
                _cache[k] = res
                _sucio[0] += 1
            guardar_cache()
            return res
        except Exception:
            time.sleep(1.5 * (intento + 1))
    return None


def osrm_tabla(fuentes, destinos):
    """Distancias por carretera (km) de cada fuente a cada destino (por lotes para respetar el límite del servicio)."""
    if len(destinos) > 90:
        raise RuntimeError("Demasiados destinos para una consulta (máx. 90).")
    paso = max(1, 95 - len(destinos))
    salida = []
    for i in range(0, len(fuentes), paso):
        lote = fuentes[i:i + paso]
        coords = ";".join(f"{p[1]:.6f},{p[0]:.6f}" for p in lote + destinos)
        src = ";".join(str(k) for k in range(len(lote)))
        dst = ";".join(str(len(lote) + k) for k in range(len(destinos)))
        url = f"{OSRM}/table/v1/driving/{coords}?annotations=distance&sources={src}&destinations={dst}"
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "parcial-grafos/1.0"}), timeout=90) as r:
            d = json.loads(r.read())
        if d.get("code") != "Ok":
            raise RuntimeError(d.get("message", "OSRM no respondió"))
        salida += [[None if v is None else round(v / 1000.0, 3) for v in fila] for fila in d["distances"]]
    return salida


_busq_cache, _busq_lock, _busq_ultimo = {}, threading.Lock(), [0.0]


def buscar_lugar(q, viewbox=None, acotar=False, limite=6):
    """Búsqueda de lugares y direcciones con Nominatim (OpenStreetMap). Máx. 1 consulta por segundo."""
    clave_b = json.dumps([q, viewbox, acotar, limite])
    if clave_b in _busq_cache:
        return _busq_cache[clave_b]
    url = f"https://nominatim.openstreetmap.org/search?format=jsonv2&limit={int(limite)}&q={urllib.parse.quote(q)}"
    if viewbox:
        w, s_, e, n = viewbox
        url += f"&viewbox={w},{n},{e},{s_}" + ("&bounded=1" if acotar else "")
    with _busq_lock:
        espera = 1.1 - (time.time() - _busq_ultimo[0])
        if espera > 0:
            time.sleep(espera)
        _busq_ultimo[0] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": "parcial-grafos/1.0 (uso academico)", "Accept-Language": "es"})
        with urllib.request.urlopen(req, timeout=30) as r:
            datos = json.loads(r.read())
    res = [{"nombre": d.get("display_name", ""), "lat": float(d["lat"]), "lon": float(d["lon"]), "tipo": d.get("type", ""),
            "bbox": [float(x) for x in d.get("boundingbox", [d["lat"], d["lat"], d["lon"], d["lon"]])]} for d in datos]
    _busq_cache[clave_b] = res
    return res


def osrm_matriz(puntos):
    """Matriz de distancias por carretera (km) con el servicio de tabla de OSRM."""
    coords = ";".join(f"{p[1]:.6f},{p[0]:.6f}" for p in puntos)
    url = f"{OSRM}/table/v1/driving/{coords}?annotations=distance"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "parcial-grafos/1.0"}), timeout=90) as r:
        d = json.loads(r.read())
    if d.get("code") != "Ok":
        raise RuntimeError(d.get("message", "OSRM no respondió"))
    return [[None if v is None else round(v / 1000.0, 3) for v in fila] for fila in d["distances"]]


# ----------------------------------------------------------------------------------------------
# Solver de respaldo (HiGHS de Python) y lectura/escritura de Excel (.xlsx) sin dependencias
# ----------------------------------------------------------------------------------------------
def resolver_highspy(lp, tiempo, brecha):
    import highspy  # noqa: PLC0415
    with tempfile.NamedTemporaryFile("w", suffix=".lp", delete=False) as f:
        f.write(lp); ruta = f.name
    try:
        h = highspy.Highs(); h.setOptionValue("output_flag", False)
        h.setOptionValue("time_limit", max(float(tiempo), 1.0)); h.setOptionValue("mip_rel_gap", float(brecha))
        h.readModel(ruta); h.run()
    finally:
        os.unlink(ruta)
    st = h.modelStatusToString(h.getModelStatus()); info = h.getInfo()
    ok = info.primal_solution_status == 2
    nombres = [h.getColName(i)[1] for i in range(h.getNumCol())]; val = list(h.getSolution().col_value)
    return {"Status": st, "ObjectiveValue": info.objective_function_value,
            "Columns": {n: {"Primal": v} for n, v in zip(nombres, val)} if ok else {}, "Rows": []}


def leer_xlsx(datos):
    z = zipfile.ZipFile(io.BytesIO(datos))
    ns = {}
    compartidas = []
    if "xl/sharedStrings.xml" in z.namelist():
        xml = z.read("xl/sharedStrings.xml").decode("utf-8")
        for si in re.findall(r"<si>(.*?)</si>", xml, re.S):
            compartidas.append("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S)))
    nombres_hojas = re.findall(r'<sheet [^>]*name="([^"]*)"', z.read("xl/workbook.xml").decode("utf-8"))
    hojas = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    hojas.sort(key=lambda n: int(re.search(r"(\d+)", n.split("/")[-1]).group(1)))
    unesc = lambda s: s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")
    salida = []
    for i, nom in enumerate(hojas):
        xml = z.read(nom).decode("utf-8")
        filas = []
        for fila in re.findall(r"<row[^>]*>(.*?)</row>", xml, re.S):
            celdas = {}
            for m in re.finditer(r'<c ([^>]*?)(?:/>|>(.*?)</c>)', fila, re.S):
                attrs, cuerpo = m.group(1), m.group(2) or ""
                ref = re.search(r'r="([A-Z]+)\d+"', attrs).group(1)
                col = 0
                for ch in ref:
                    col = col * 26 + ord(ch) - 64
                tipo = re.search(r't="(\w+)"', attrs)
                v = re.search(r"<v>(.*?)</v>", cuerpo, re.S)
                if tipo and tipo.group(1) == "s" and v:
                    val = compartidas[int(v.group(1))]
                elif tipo and tipo.group(1) == "inlineStr":
                    val = "".join(re.findall(r"<t[^>]*>(.*?)</t>", cuerpo, re.S))
                else:
                    val = v.group(1) if v else ""
                celdas[col - 1] = unesc(val)
            if celdas:
                filas.append([celdas.get(c, "") for c in range(max(celdas) + 1)])
        ancho = max((len(f) for f in filas), default=0)
        filas = [f + [""] * (ancho - len(f)) for f in filas]   # las celdas vacías al final de la fila no vienen en el XML
        salida.append({"nombre": nombres_hojas[i] if i < len(nombres_hojas) else f"Hoja{i+1}", "filas": filas})
    return salida


def _col(n):
    s = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def escribir_xlsx(hojas):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + "".join(f'<Override PartName="/xl/worksheets/sheet{i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(len(hojas))) + "</Types>")
        z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + "".join(f'<sheet name="{escape(h["nombre"][:31])}" sheetId="{i+1}" r:id="rId{i+1}"/>' for i, h in enumerate(hojas)) + "</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(f'<Relationship Id="rId{i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i+1}.xml"/>' for i in range(len(hojas))) + f'<Relationship Id="rId{len(hojas)+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        z.writestr("xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>')
        for i, h in enumerate(hojas):
            filas = []
            for r, fila in enumerate(h["filas"]):
                celdas = []
                for c, v in enumerate(fila):
                    ref = f"{_col(c)}{r+1}"
                    if v is None or v == "":
                        continue
                    if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v):
                        celdas.append(f'<c r="{ref}"><v>{v}</v></c>')
                    else:
                        celdas.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>')
                filas.append(f'<row r="{r+1}">{"".join(celdas)}</row>')
            z.writestr(f"xl/worksheets/sheet{i+1}.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(filas) + "</sheetData></worksheet>")
    return buf.getvalue()


# ----------------------------------------------------------------------------------------------
# Servidor HTTP
# ----------------------------------------------------------------------------------------------
class Manejador(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    pool = ThreadPoolExecutor(max_workers=4)

    def _enviar(self, codigo, cuerpo, tipo="application/json", extra=None):
        if isinstance(cuerpo, (dict, list)):
            cuerpo = json.dumps(cuerpo).encode("utf-8")
        elif isinstance(cuerpo, str):
            cuerpo = cuerpo.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-cache")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        ruta = self.path.split("?")[0]
        if ruta == "/":
            ruta = "/index.html"
        if ruta == "/datos/cache_rutas.json":
            return self._enviar(200, json.dumps(_cache, separators=(",", ":")))
        archivo = (WEB / ruta.lstrip("/")).resolve()
        if WEB.resolve() not in archivo.parents and archivo != WEB.resolve():
            return self._enviar(403, {"error": "prohibido"})
        if not archivo.is_file():
            return self._enviar(404, {"error": "no encontrado"})
        tipo = mimetypes.guess_type(str(archivo))[0] or "application/octet-stream"
        self._enviar(200, archivo.read_bytes(), tipo + ("; charset=utf-8" if tipo.startswith("text/") or tipo.endswith("javascript") or tipo.endswith("json") else ""))

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            d = json.loads(self.rfile.read(n) or b"{}")
            ruta = self.path.split("?")[0]
            if ruta == "/api/estado":
                try:
                    import highspy  # noqa: F401, PLC0415
                    hp = True
                except ImportError:
                    hp = False
                return self._enviar(200, {"highspy": hp, "python": sys.version.split()[0], "cache": len(_cache)})
            if ruta == "/api/solve":
                try:
                    return self._enviar(200, resolver_highspy(d["lp"], d["tl"], d["gap"]))
                except ImportError:
                    return self._enviar(503, {"error": "highspy no está instalado"})
            if ruta == "/api/instalar_solver":
                r = subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "highspy"], capture_output=True, text=True)
                return self._enviar(200, {"ok": r.returncode == 0, "salida": (r.stdout + r.stderr)[-600:]})
            if ruta == "/api/rutas":
                tramos = d["tramos"]
                res = list(self.pool.map(lambda t: osrm_tramo(*t), tramos))
                return self._enviar(200, {"geometrias": res})
            if ruta == "/api/matriz":
                if "fuentes" in d:
                    return self._enviar(200, {"D": osrm_tabla(d["fuentes"], d["destinos"])})
                return self._enviar(200, {"D": osrm_matriz(d["puntos"])})
            if ruta == "/api/buscar":
                return self._enviar(200, {"resultados": buscar_lugar(d["q"], d.get("viewbox"), d.get("acotar", False), d.get("limite", 6))})
            if ruta == "/api/leer":
                return self._enviar(200, {"hojas": leer_xlsx(base64.b64decode(d["contenido"]))})
            if ruta == "/api/xlsx":
                datos = escribir_xlsx(d["hojas"])
                return self._enviar(200, datos, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            return self._enviar(404, {"error": "ruta desconocida"})
        except Exception as e:  # noqa: BLE001
            return self._enviar(500, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, *a):
        pass


def main():
    cargar_cache()
    puerto = int(os.environ.get("PUERTO", "8765"))
    srv = None
    for p in range(puerto, puerto + 20):
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", p), Manejador)
            puerto = p
            break
        except OSError:
            continue
    if srv is None:
        sys.exit("No hay un puerto libre entre %d y %d." % (puerto, puerto + 19))
    url = f"http://127.0.0.1:{puerto}/"
    print("=" * 62)
    print(" Parcial de Teoría de Grafos · TSP, m-TSP, caminos y árboles")
    print(" Aplicación en:", url)
    print(" Deje esta ventana abierta mientras la usa. Ctrl+C para terminar.")
    print("=" * 62)
    if not os.environ.get("SIN_NAVEGADOR"):
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        guardar_cache(True)


if __name__ == "__main__":
    main()
