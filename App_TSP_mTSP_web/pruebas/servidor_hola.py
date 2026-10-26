"""Servidor local de desarrollo: responde en el formato de highs-js usando HiGHS de Python (solo para probar la interfaz)."""
import json, tempfile, os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
import highspy
class H(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in (("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Headers", "*"), ("Access-Control-Allow-Methods", "POST")): self.send_header(k, v)
        self.end_headers()
    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        with tempfile.NamedTemporaryFile("w", suffix=".lp", delete=False) as f: f.write(d["lp"]); p = f.name
        h = highspy.Highs(); h.setOptionValue("output_flag", False); h.setOptionValue("time_limit", max(d["tl"], 1.0)); h.setOptionValue("mip_rel_gap", d["gap"])
        h.readModel(p); os.unlink(p); h.run()
        st = h.modelStatusToString(h.getModelStatus()); info = h.getInfo(); ok = info.primal_solution_status == 2
        names = [h.getColName(i)[1] for i in range(h.getNumCol())]; val = list(h.getSolution().col_value)
        out = {"Status": {"Optimal": "Optimal", "Infeasible": "Infeasible", "Time limit reached": "Time limit reached"}.get(st, st), "ObjectiveValue": info.objective_function_value,
               "Columns": {n: {"Primal": v} for n, v in zip(names, val)} if ok else {}, "Rows": []}
        b = json.dumps(out).encode()
        self.send_response(200); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 8765), H).serve_forever()
