"""Genera los archivos de ejemplo de data/ejemplos (CSV, Excel, Word, JSON, paquete Grafos)."""
import io, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import pandas as pd, docx
from app.samples import sample_small, sample_fleet
from app import export

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "ejemplos")
os.makedirs(OUT, exist_ok=True)
p = sample_small()
pd.DataFrame([{k: v for k, v in n.items() if k != "extra"} for n in p["nodes"]]).to_csv(f"{OUT}/pequeno_nodos.csv", index=False)
pd.DataFrame(p["edges"]).to_csv(f"{OUT}/pequeno_aristas.csv", index=False)
q = sample_fleet()
with pd.ExcelWriter(f"{OUT}/flota_datos.xlsx") as w:
    pd.DataFrame([{k: v for k, v in n.items() if k != "extra"} for n in q["nodes"]]).to_excel(w, sheet_name="Sitios", index=False)
    pd.DataFrame(q["vehicles"]).to_excel(w, sheet_name="Flota", index=False)
    pd.DataFrame(q["edges"]).to_excel(w, sheet_name="Aristas", index=False)
json.dump(p, open(f"{OUT}/pequeno.json", "w"), ensure_ascii=False, indent=1)
# paquete Grafos v.1.3.5
g = os.path.join(OUT, "grafos_v1.3.5")
os.makedirs(g, exist_ok=True)
for name, data in export.grafos_package(p, scale=100, source="0", target="9").items():
    open(os.path.join(g, name), "wb").write(data)
# informe Word con parámetros en texto y una tabla de sitios (sin aristas: se generan por k-vecinos)
d = docx.Document()
d.add_heading("Informe de distribución – ejemplo", 1)
d.add_paragraph("Parámetros del estudio:")
d.add_paragraph("Costo por km: 1.2")
d.add_paragraph("Costo por hora: 6")
d.add_paragraph("Velocidad media: 40")
d.add_paragraph("Factor vial: 1.25")
d.add_paragraph("Capacidad del vehículo: 250")
d.add_paragraph("Sitios atendidos:")
t = d.add_table(rows=1, cols=5)
for i, h in enumerate(["id", "nombre", "lat", "lon", "demanda"]):
    t.rows[0].cells[i].text = h
for n in p["nodes"][:10]:
    r = t.add_row().cells
    for i, v in enumerate([n["id"], n["name"], n["lat"], n["lon"], n["demand"]]):
        r[i].text = str(v)
d.save(f"{OUT}/informe_ejemplo.docx")
print("ejemplos generados en", os.path.abspath(OUT))
