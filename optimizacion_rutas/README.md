# Optimización de redes y rutas (Jupyter)

Cuaderno `Optimizacion_Rutas.ipynb` + librería `optgrafos.py`: resuelve problemas de grafos y rutas
**solo con optimización matemática** (programación lineal y entera mixta, solver exacto HiGHS vía SciPy).
No usa algoritmos de grafos (Dijkstra, Prim, Kruskal, Floyd-Warshall…) ni heurísticas.

## Qué resuelve
| Familia | Problemas |
|---|---|
| Rutas | TSP (circuito, camino abierto, camino origen→destino, camino libre), m-TSP (balanceado, min-máx, rutas abiertas, multidepósito), CVRP |
| Caminos | origen→destino, origen→todos, todos los pares (LP de flujo) |
| Árboles | árbol de valor mínimo / arborescencia (MILP de flujo) |
| Flujos | flujo máximo, flujo de costo mínimo, transporte, asignación |
| Recorridos | cartero chino |
| Localización | p-mediana, p-centro, cobertura |
| Otros | cualquier modelo propio con `optgrafos.Modelo` |

## Uso
```bash
pip install -r requirements.txt
jupyter notebook Optimizacion_Rutas.ipynb
```
Ejecute las celdas en orden. La sección 2 es un **panel interactivo** (datos → problema → resolver → Excel).
Las secciones 3 y 4 reproducen los casos del parcial (China Top 25 y tiendas ARA de Cali).

## Datos de entrada
Se aceptan CSV, TSV, Excel o texto pegado en tres formatos (`#` o vacío = no hay arco):
* **Matriz** de costos con etiquetas en la primera fila y columna.
* **Aristas**: columnas `origen, destino, costo` (+ `capacidad`).
* **Coordenadas**: columnas `lat, lon` (+ `id, nombre, demanda`); distancia haversine × factor, o euclidiana.

También se puede crear una red a mano: `Red.desde_aristas([(1,2,7),(1,3,9),...], dirigido=False)`.

```python
import optgrafos as og
red = og.cargar("datos/distancias_cali_km.csv")
og.tsp(red, 0)                          # circuito desde el nodo 0
og.mtsp(red, 2, 0, lmin=12, lmax=13)    # 2 viajantes, 12–13 clientes cada uno
og.camino_minimo(red, 1, 25)            # camino mínimo (LP de flujo)
og.arbol_minimo(red, raiz=1)            # árbol de valor mínimo
```

## Archivos
* `Optimizacion_Rutas.ipynb`: cuaderno ejecutado con los resultados.
* `optgrafos.py`: modelos y cargadores. `panel.py`: panel interactivo.
* `pruebas_optgrafos.py`: 16 pruebas contra fuerza bruta, SciPy y NetworkX (`pytest -q`).
* `datos/`: matrices por carretera (Cali ARA, China Top 25), coordenadas y nombres.
* `resultados_optimizacion.xlsx`: resultados exportados por el cuaderno.

## Límites
* Los modelos son exactos: m-TSP, CVRP y p-centro con 25+ nodos pueden tardar; use `tiempo=` y revise la `brecha`.
* Con estado «límite de tiempo» la solución es factible pero no probada óptima.
* Las matrices se usan tal cual (por carretera puede violarse la desigualdad triangular).
* La detección de subtours en el TSP solo lee la solución del MILP para agregar cortes; no calcula rutas con algoritmos de grafos.
  `metodo="mtz"` evita incluso eso (un único MILP).
