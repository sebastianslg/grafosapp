# Solucionador de TSP y m-TSP por optimización (Jupyter)

Aplicación en Python/Jupyter que resuelve el **problema del viajante (TSP)** y el **de varios viajantes (m-TSP)**
con **métodos de optimización exactos** (programación lineal entera mixta, solver HiGHS vía SciPy).
**No usa algoritmos de grafos ni heurísticas.** Si el estado es «óptimo», la solución es el óptimo global probado.

## Instalación y uso
```bash
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
jupyter notebook TSP_mTSP_Optimizacion.ipynb
```
Ejecute las celdas en orden (Kernel → Restart & Run All). La sección 2 es un **panel interactivo**:
cargar datos → elegir TSP o m-TSP → parámetros → **Resolver**.

## Qué resuelve
* **TSP:** circuito, camino abierto desde un origen, camino de origen a destino, camino libre. Dos métodos: DFJ (cortes iterativos) y MTZ (un solo MILP).
* **m-TSP:** m viajantes desde un depósito; mínima distancia total; balance de clientes por ruta (mínimo y máximo); minimizar la ruta más larga; rutas abiertas; varios depósitos.
* **Extensión:** VRP con capacidad (CVRP).
* Complementos incluidos en `optgrafos.py` (no necesarios para TSP/m-TSP): camino mínimo, árbol de valor mínimo, flujo máximo, flujo de costo mínimo, asignación, transporte, cartero chino, p-mediana, p-centro, cobertura y la clase `Modelo` para modelos propios.

## Datos de entrada (CSV, TSV, Excel o texto pegado; `#` o vacío = no hay arco)
| Formato | Contenido |
|---|---|
| Matriz | primera fila y columna con etiquetas; valores = distancia/costo (asimétrica permitida) |
| Aristas | columnas `origen, destino, costo` |
| Coordenadas | columnas `lat, lon` (+ `id, nombre, demanda`); distancia haversine en km × factor |

Uso por código:
```python
import optgrafos as og
red = og.cargar("datos/ejemplo_puntos.csv", factor=1.3)   # o og.ejemplo()
og.tsp(red, origen=0)                                     # circuito
og.tsp(red, 0, "abierto")                                 # camino abierto
og.mtsp(red, 3, deposito=0)                               # 3 viajantes
og.mtsp(red, 3, 0, lmin=4, lmax=5)                        # balanceado
og.mtsp(red, 3, 0, objetivo="maximo")                     # minimiza la ruta más larga
```
El resultado trae `.objetivo`, `.estado`, `.brecha`, `.segundos`, `.rutas` y tablas (`.tablas["ruta"]`, `.tablas["rutas"]`), y se exporta con `.a_excel("archivo.xlsx")`.

## Archivos
* `TSP_mTSP_Optimizacion.ipynb`: cuaderno con ejemplos ejecutados, panel y formulaciones matemáticas.
* `optgrafos.py`: modelos y cargadores. `panel.py`: panel interactivo.
* `pruebas_optgrafos.py`: 17 pruebas contra fuerza bruta, SciPy y NetworkX (`pip install pytest networkx` y `pytest -q`).
* `datos/`: datos de ejemplo.

## Límites
Los modelos son exactos: el tiempo crece con el número de puntos (TSP de 25–50 puntos, segundos; m-TSP balanceado, ruta más larga y CVRP, más lentos).
Use el parámetro `tiempo=` y revise la `brecha`; con «límite de tiempo» la solución es factible pero no probada óptima.
