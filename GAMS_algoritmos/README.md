# Códigos GAMS de los algoritmos del ruteo de vehículos

Dieciocho programas GAMS autocontenidos (datos, algoritmo, evaluación y reporte en un solo archivo) sobre la misma instancia
**CVRP-10**: 1 depósito, 10 clientes, capacidad Q = 15, demanda total 38. El óptimo conocido es **425,05** (modelo exacto, archivo 12).

## Cómo ejecutarlos

1. Abrir el archivo `.gms` en **GAMS Studio** y pulsar **Run (F9)**, o por consola: `gams 07_recocido_simulado.gms`.
2. Abrir el archivo `.lst` y buscar las instrucciones `display`: `tr` (tour), `rr`/`RTc` (rutas), `costo_final`, `gap_pct` y `nev`.
3. Comparar con la tabla de abajo (y con la diapositiva «Resultados» de cada algoritmo en `Exposicion_Algoritmos_GAMS.pptx`).

El archivo 12 resuelve primero la relajación lineal (`rmip`) y luego el MIP completo (`mip`); es pequeño (131 columnas). El número de nodos explorados depende del solver (con HiGHS: 1.369).

## Resultados de referencia

| Archivo | Algoritmo | `costo_final` | `gap_pct` | `nev` |
|---|---|---|---|---|
| `01_vecino_mas_cercano.gms` | Vecino más cercano | 481,16 | 13,20 | 0 |
| `02_barrido.gms` | Barrido | 426,35 | 0,31 | 10 |
| `03_insercion_mas_barata.gms` | Inserción más barata | 481,16 | 13,20 | 0 |
| `04_dos_opt.gms` | 2-opt | 426,35 | 0,31 | 181 |
| `05_vnd_relocate_swap_2opt.gms` | VND | 425,05 | 0,00 | 451 |
| `06_busqueda_tabu.gms` | Búsqueda tabú | 425,05 | 0,00 | 2701 |
| `07_recocido_simulado.gms` | Recocido simulado | 425,05 | 0,00 | 4001 |
| `08_algoritmo_genetico.gms` | Algoritmo genético | 425,05 | 0,00 | 1830 |
| `09_colonia_de_hormigas.gms` | Colonia de hormigas | 429,43 | 1,03 | 300 |
| `10_grasp.gms` | GRASP | 425,05 | 0,00 | 8095 |
| `11_vns.gms` | VNS | 425,05 | 0,00 | 18308 |
| `12_branch_and_bound_exacto.gms` | Branch and bound (MIP) | 425,05 | 0,00 | — |
| `13_or_opt.gms` | Or-opt | 426,35 | 0,31 | 437 |
| `14_ils.gms` | Búsqueda local iterada (ILS) | 425,05 | 0,00 | 2716 |
| `15_lns.gms` | LNS (destruir y reparar) | 425,05 | 0,00 | 1081 |
| `16_split_ruta_primero.gms` | Ruta primero-agrupa después (Split) | 425,05 | 0,00 | 0 |
| `17_fisher_jaikumar.gms` | Fisher-Jaikumar (GAP + TSP) | 425,05 | 0,00 | 0 |
| `18_petalos.gms` | Pétalos (partición de conjuntos) | 425,05 | 0,00 | 0 |

Los algoritmos 01–06 y 12 son deterministas. Los algoritmos 07–11 usan un generador Park-Miller con **semilla fija**
(`seed = mod(16807*seed, 2147483647)`), por lo que la corrida es reproducible; cambiar la semilla (por ejemplo 2024 por 2025)
modifica la trayectoria. Las 20 semillas de robustez: recocido, GRASP y VNS llegan al óptimo en 20/20; el genético en 9/20; hormigas en 0/20 (siempre 429,43).

## Estado de la verificación (importante)

* Los archivos 01–11 se ejecutaron con un intérprete propio del subconjunto de GAMS que usan (`Exposicion_src/ref/gams_mini.py`)
  y coinciden **exactamente** con la implementación equivalente en Python (tour, costo y número de evaluaciones): `python3 Exposicion_src/ref/verificar_gams.py`.
* El modelo del archivo 12 se verificó con HiGHS (`scipy.optimize.milp`): óptimo 425,0513, relajación lineal 308,47, 1.369 nodos.
* Los 18 archivos se ejecutaron además completos con `Exposicion_src/ref/gamsx.py` (intérprete del subconjunto de GAMS + HiGHS),
  que reproduce los mismos costos y detecta los errores de compilación más comunes. Los archivos 16, 17 y 18 resuelven modelos
  MIP dentro del algoritmo (TSP, asignación generalizada, partición de conjuntos): usar un solver MIP (HiGHS: `option mip = highs;`).
* **No se pudo compilar con GAMS** en el entorno donde se generaron (no hay licencia ni motor instalado). La sintaxis pasa un análisis
  estático (`Exposicion_src/ref/lint_gams.py`), pero conviene abrir y ejecutar cada archivo una vez antes de la clase. Si GAMS marca un error
  de sintaxis, es local y se corrige en la línea indicada; la lógica ya está validada.
* Los costos de la tabla son, por tanto, **valores de referencia**; al ejecutar en GAMS deben coincidir.

## Regenerar los archivos

`python3 Exposicion_src/ref/generar_gams.py` regenera los `.gms`; `python3 Exposicion_src/ref/resultados.py` recalcula resultados y figuras.
