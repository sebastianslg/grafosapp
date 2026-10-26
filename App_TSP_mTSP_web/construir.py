"""Genera TSP_mTSP_Optimizacion.html (un solo archivo, sin dependencias) a partir de fuente/.
   python construir.py            -> versión final con HiGHS (WebAssembly) incrustado
   python construir.py --prueba   -> versión de pruebas que consulta un servidor local (solo desarrollo)"""
import base64, sys, pathlib
aqui = pathlib.Path(__file__).parent
f = aqui / "fuente"
prueba = "--prueba" in sys.argv
python = "--python" in sys.argv
prueba = prueba or python
html = (f / "app.html").read_text(encoding="utf-8")
solver = (f / "solver.js").read_text(encoding="utf-8")
if prueba:
    url = "/solve" if python else "http://127.0.0.1:8765/"
    base = "(self.location.href.replace(/^blob:/, '').match(/^https?:\\/\\/[^\\/]+/) || [''])[0] + " if python else ""
    highs = ("""var Module = async () => ({ solve: (lp, o) => { const x = new XMLHttpRequest(); x.open('POST', """ + base + """'%s', false);
      x.send(JSON.stringify({ lp, tl: o.time_limit, gap: o.mip_rel_gap })); return JSON.parse(x.responseText); } });""" % url)
    wasm = "AA=="
else:
    highs = (f / "vendor" / "highs.js").read_text(encoding="utf-8")
    wasm = base64.b64encode((f / "vendor" / "highs.wasm").read_bytes()).decode()
ejemplo = (aqui.parent / "App_TSP_mTSP" / "datos" / "ejemplo_puntos.csv").read_text(encoding="utf-8").strip()
esc = lambda t: t.replace("</script", "<\\/script")
html = (html.replace("%%HIGHS_JS%%", esc(highs)).replace("%%SOLVER_JS%%", esc(solver))
            .replace("%%WASM_B64%%", wasm).replace("%%EJEMPLO%%", ejemplo))
if python:
    plantilla = (aqui / "fuente" / "plantilla_app.py").read_text(encoding="utf-8")
    salida = aqui / "ejecutar_app.py"
    salida.write_text(plantilla.replace("%%HTML_B64%%", base64.b64encode(html.encode("utf-8")).decode()), encoding="utf-8")
else:
    salida = aqui / ("prueba.html" if prueba else "TSP_mTSP_Optimizacion.html")
    salida.write_text(html, encoding="utf-8")
print(salida, round(salida.stat().st_size / 1e6, 2), "MB")
