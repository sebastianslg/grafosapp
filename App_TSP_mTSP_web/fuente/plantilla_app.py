"""Solucionador de TSP y m-TSP por optimización (MILP exacto, HiGHS). Ejecutar:  python ejecutar_app.py
Abre la aplicación en el navegador (servidor local en 127.0.0.1). Si falta, instala 'highspy' automáticamente."""
import base64, json, os, subprocess, sys, tempfile, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import highspy
except ImportError:
    print("Instalando el solver HiGHS (highspy), solo la primera vez…")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "highspy"])
    import highspy

HTML = base64.b64decode("%%HTML_B64%%").decode("utf-8")
PUERTO = int(os.environ.get("PUERTO", "8765"))


def resolver(lp, tiempo, brecha):
    with tempfile.NamedTemporaryFile("w", suffix=".lp", delete=False) as f:
        f.write(lp); ruta = f.name
    h = highspy.Highs(); h.setOptionValue("output_flag", False)
    h.setOptionValue("time_limit", max(float(tiempo), 1.0)); h.setOptionValue("mip_rel_gap", float(brecha))
    h.readModel(ruta); os.unlink(ruta); h.run()
    st = h.modelStatusToString(h.getModelStatus()); info = h.getInfo()
    ok = info.primal_solution_status == 2
    nombres = [h.getColName(i)[1] for i in range(h.getNumCol())]; val = list(h.getSolution().col_value)
    return {"Status": st, "ObjectiveValue": info.objective_function_value,
            "Columns": {n: {"Primal": v} for n, v in zip(nombres, val)} if ok else {}, "Rows": []}


class Manejador(BaseHTTPRequestHandler):
    def do_GET(self):
        cuerpo = HTML.encode("utf-8")
        self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo))); self.end_headers(); self.wfile.write(cuerpo)

    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        cuerpo = json.dumps(resolver(d["lp"], d["tl"], d["gap"])).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo))); self.end_headers(); self.wfile.write(cuerpo)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador)
    url = f"http://127.0.0.1:{PUERTO}/"
    print("Aplicación en", url, "(cierre esta ventana o presione Ctrl+C para terminar)")
    if not os.environ.get("SIN_NAVEGADOR"):
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
