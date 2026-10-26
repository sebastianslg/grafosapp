"""Panel interactivo (ipywidgets) para optgrafos: cargar datos, elegir problema, resolver y ver resultados."""
import io
import os

import ipywidgets as w
import matplotlib.pyplot as plt
import pandas as pd
from IPython.display import display

import optgrafos as og

FUENTES = ["Ejemplo: Cali (CD + 25 tiendas ARA)", "Ejemplo: China Top 25", "Archivo (ruta o subir)", "Pegar datos"]


def _texto(v):
    v = str(v).strip()
    if v == "":
        return None
    try:
        f = float(v)
        return int(f) if f == int(f) else f
    except ValueError:
        return v


class Panel:
    def __init__(self, red=None):
        self.red = red
        self.res = None
        self.fuente = w.Dropdown(options=FUENTES, description="Datos", layout=w.Layout(width="420px"))
        self.ruta = w.Text(description="Archivo", placeholder="datos/mi_matriz.csv / .xlsx", layout=w.Layout(width="420px"))
        self.subir = w.FileUpload(accept=".csv,.tsv,.txt,.xlsx", multiple=False, description="Subir")
        self.pegar = w.Textarea(description="Pegar", placeholder="Matriz con tabulaciones, aristas (origen,destino,costo) o lat,lon",
                                layout=w.Layout(width="620px", height="90px"))
        self.tipo = w.Dropdown(options=["auto", "matriz", "aristas", "coordenadas"], value="auto", description="Formato")
        self.dirigida = w.Checkbox(value=False, description="Aristas dirigidas", indent=False)
        self.metrica = w.Dropdown(options=["haversine", "euclidiana"], description="Distancia")
        self.factor = w.FloatText(value=1.0, description="Factor", layout=w.Layout(width="160px"))
        self.btn_cargar = w.Button(description="Cargar datos", button_style="info")
        self.estado = w.HTML()
        self.problema = w.Dropdown(options=list(og.PROBLEMAS), description="Problema", layout=w.Layout(width="520px"))
        self.origen = w.Text(description="Origen", layout=w.Layout(width="200px"))
        self.destino = w.Text(description="Destino", layout=w.Layout(width="200px"))
        self.raiz = w.Text(description="Raíz", layout=w.Layout(width="200px"))
        self.m = w.IntText(value=2, description="Vehíc. m", layout=w.Layout(width="200px"))
        self.lmin = w.IntText(value=1, description="Mín/ruta", layout=w.Layout(width="200px"))
        self.lmax = w.IntText(value=0, description="Máx/ruta (0=sin)", style={"description_width": "110px"},
                              layout=w.Layout(width="230px"))
        self.objetivo = w.Dropdown(options=[("Minimizar distancia total", "suma"), ("Minimizar la ruta más larga", "maximo")],
                                   description="Objetivo", layout=w.Layout(width="360px"))
        self.abierto = w.Checkbox(value=False, description="Rutas abiertas (sin regresar)", indent=False)
        self.capacidad = w.FloatText(value=0, description="Capacidad Q", layout=w.Layout(width="200px"))
        self.p = w.IntText(value=2, description="p", layout=w.Layout(width="160px"))
        self.metodo = w.Dropdown(options=["dfj", "mtz"], description="TSP", layout=w.Layout(width="160px"))
        self.tiempo = w.IntText(value=300, description="Tiempo (s)", layout=w.Layout(width="200px"))
        self.btn_resolver = w.Button(description="Resolver", button_style="success", icon="play")
        self.btn_excel = w.Button(description="Guardar Excel", icon="save")
        self.salida = w.Output()
        self.btn_cargar.on_click(lambda _: self.cargar())
        self.btn_resolver.on_click(lambda _: self.resolver())
        self.btn_excel.on_click(lambda _: self.guardar())

    # ------------------------------------------------------------------------------
    def cargar(self):
        try:
            f = self.fuente.value
            if f == FUENTES[0]:
                self.red = og.ejemplo("cali")
            elif f == FUENTES[1]:
                self.red = og.ejemplo("china")
            elif f == FUENTES[2]:
                if self.subir.value:
                    item = self.subir.value[0] if isinstance(self.subir.value, (list, tuple)) else list(self.subir.value.values())[0]
                    nombre = item["name"]; contenido = bytes(item["content"])
                    if nombre.lower().endswith((".xlsx", ".xls")):
                        origen = pd.read_excel(io.BytesIO(contenido), dtype=str)
                    else:
                        origen = contenido.decode("utf-8-sig", errors="replace")
                else:
                    origen = self.ruta.value.strip()
                self.red = og.cargar(origen, tipo=self.tipo.value, dirigido=self.dirigida.value,
                                     metrica=self.metrica.value, factor=self.factor.value)
            else:
                self.red = og.cargar(self.pegar.value, tipo=self.tipo.value, dirigido=self.dirigida.value,
                                     metrica=self.metrica.value, factor=self.factor.value)
            r = self.red
            self.estado.value = (f"<b>{r}</b> &nbsp; etiquetas: {r.ids[:6]}{'…' if r.n > 6 else ''}")
            if not self.origen.value and r.n:
                self.origen.value = str(r.ids[0])
        except Exception as e:  # noqa: BLE001
            self.estado.value = f"<span style='color:#b00'>No se pudo cargar: {e}</span>"

    def parametros(self):
        return dict(origen=_texto(self.origen.value), destino=_texto(self.destino.value),
                    raiz=_texto(self.raiz.value), m=self.m.value, lmin=self.lmin.value,
                    lmax=self.lmax.value or None, objetivo=self.objetivo.value, abierto=self.abierto.value,
                    capacidad=self.capacidad.value or None, p=self.p.value, metodo=self.metodo.value,
                    tiempo=self.tiempo.value)

    def resolver(self):
        with self.salida:
            self.salida.clear_output()
            if self.red is None:
                print("Primero cargue los datos."); return
            par = self.parametros()
            try:
                if self.problema.value.startswith("CVRP") and not par["capacidad"]:
                    print("Indique la capacidad Q del vehículo (y una columna 'demanda' en los datos)."); return
                if self.problema.value.startswith("CVRP"):
                    if self.red.demanda is None:
                        print("La red no tiene demanda: cargue coordenadas con columna 'demanda'."); return
                self.res = og.resolver(self.problema.value, self.red, **par)
            except Exception as e:  # noqa: BLE001
                print(f"Error: {e}"); return
            print(self.res.resumen())
            for nombre, t in self.res.tablas.items():
                print(f"\n[{nombre}]")
                display(t if len(t) <= 60 else t.head(60))
            if self.res.ok and (self.res.rutas or self.res.arcos):
                og.dibujar(self.red, self.res)
                plt.show()

    def guardar(self):
        with self.salida:
            if self.res is None:
                print("Aún no hay resultados."); return
            ruta = "resultado_panel.xlsx"
            self.res.a_excel(ruta)
            print("Guardado:", os.path.abspath(ruta))

    def mostrar(self):
        datos = w.VBox([self.fuente,
                        w.HBox([self.ruta, self.subir]),
                        self.pegar,
                        w.HBox([self.tipo, self.metrica, self.factor, self.dirigida]),
                        w.HBox([self.btn_cargar]), self.estado])
        params = w.VBox([self.problema,
                         w.HBox([self.origen, self.destino, self.raiz]),
                         w.HBox([self.m, self.lmin, self.lmax]),
                         w.HBox([self.objetivo, self.abierto]),
                         w.HBox([self.capacidad, self.p, self.metodo, self.tiempo]),
                         w.HBox([self.btn_resolver, self.btn_excel])])
        tab = w.Tab(children=[datos, params])
        tab.set_title(0, "1. Datos"); tab.set_title(1, "2. Problema")
        display(w.VBox([tab, self.salida]))
        return self
