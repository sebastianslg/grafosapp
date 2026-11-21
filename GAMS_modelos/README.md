# Modelos del VRP en GAMS (34 variantes)

Cada archivo es autocontenido: datos del ejemplo, modelo MILP, `solve` y reporte de rutas (`ruta`, `largo`, `cargaR`).
Todos usan la instancia común CVRP-10 (depósito d en (48, 52) y clientes c1…c10) o una variante de sus datos (ventanas,
depósitos, tipos de vehículo, recogidas, pares, premios).

## Cómo ejecutarlos

1. Abrir el `.gms` en **GAMS Studio** y pulsar **Run (F9)** (o `gams 08_cvrp.gms` en consola).
2. Solver: cualquier solver MIP. **HiGHS es gratuito** y viene con GAMS: descomentar `option mip = highs;` en el archivo.
3. En el `.lst`, revisar `z.l`, `modelStat` (1 = óptimo) y las tablas de rutas.

## Resultados de referencia

| Archivo | Sigla | Modelo | Objetivo | Rutas | Variables / binarias | Tiempo HiGHS |
|---|---|---|---|---|---|---|
| `01_tsp.gms` | TSP | Problema del agente viajero | 312,78 | 1 | 121 / 110 | 0,07 s |
| `02_otsp.gms` | OTSP | TSP abierto (camino hamiltoniano) | 268,21 | 1 | 132 / 121 | 0,02 s |
| `03_mtsp.gms` | mTSP | Problema de múltiples viajantes | 415,54 | 3 | 121 / 110 | 0,05 s |
| `04_bmtsp.gms` | BmTSP | mTSP balanceado | 422,97 | 3 | 131 / 110 | 0,05 s |
| `05_omtsp.gms` | OmTSP | mTSP abierto | 291,99 | 3 | 132 / 121 | 0,05 s |
| `06_obmtsp.gms` | OBmTSP | mTSP abierto y balanceado | 309,68 | 4 | 142 / 121 | 0,03 s |
| `07_mm_mtsp.gms` | MM-mTSP | mTSP min-max | 148,10 | 3 | 132 / 110 | 1,04 s |
| `08_cvrp.gms` | CVRP | VRP con capacidad | 425,05 | 3 | 121 / 110 | 1,75 s |
| `09_ovrp.gms` | OVRP | VRP abierto | 292,92 | 3 | 121 / 110 | 0,27 s |
| `10_dcvrp.gms` | DCVRP | VRP con capacidad y distancia máxima | 426,35 | 3 | 131 / 110 | 3,41 s |
| `11_cvrp_l.gms` | CVRP-L | CVRP con máximo de paradas | 476,80 | 4 | 131 / 110 | 5,03 s |
| `12_minveh.gms` | MinVeh | CVRP con mínima flota | 477,01 | 3 | 121 / 110 | 9,47 s |
| `13_bcvrp.gms` | BCVRP | CVRP balanceado | 483,04 | 4 | 131 / 110 | 0,05 s |
| `14_vrptw.gms` | VRPTW | VRP con ventanas de tiempo | 468,72 | 3 | 131 / 110 | 0,01 s |
| `15_ovrptw.gms` | OVRPTW | VRP abierto con ventanas de tiempo | 325,20 | 4 | 131 / 110 | 0,02 s |
| `16_hfvrp.gms` | HFVRP | VRP con flota heterogénea | 442,37 | 3 | 231 / 220 | 6,02 s |
| `17_fsmvrp.gms` | FSMVRP | VRP de tamaño y mezcla de flota | 526,76 | 2 | 161 / 140 | 78,92 s |
| `18_hfvrptw.gms` | HFVRPTW | Flota heterogénea con ventanas de tiempo | 522,57 | 4 | 241 / 220 | 0,16 s |
| `19_mdvrp.gms` | MDVRP | VRP con múltiples depósitos | 377,94 | 3 | 163 / 152 | 2,82 s |
| `20_mdvrptw.gms` | MDVRPTW | Múltiples depósitos con ventanas de tiempo | 405,37 | 4 | 173 / 152 | 0,06 s |
| `21_lrp.gms` | LRP | Localización y ruteo | 577,94 | 3 | 200 / 189 | 11,40 s |
| `22_vrpb.gms` | VRPB | VRP con recogidas en el regreso (backhauls) | 364,68 | 2 | 121 / 110 | 0,18 s |
| `23_vrpspd.gms` | VRPSPD | VRP con entrega y recogida simultáneas | 534,37 | 4 | 331 / 110 | 6,22 s |
| `24_vrppd.gms` | VRPPD | VRP con recogida y entrega por pares | 315,74 | 1 | 351 / 330 | 1,87 s |
| `25_sdvrp.gms` | SDVRP | VRP con entrega dividida | 472,01 | 4 | 353 / 288 | 51,61 s |
| `26_pcvrp.gms` | PCVRP | VRP con beneficios (prize-collecting) | 635,66 | 2 | 131 / 120 | 1,73 s |
| `27_top.gms` | TOP | Orienteering por equipos | 885,00 | 2 | 131 / 120 | 18,18 s |
| `28_cvrp_mm.gms` | CVRP-MM | CVRP min-max (ruta más larga mínima) | 117,93 | 5 | 617 / 605 | 1,73 s |
| `29_vrpstw.gms` | VRPSTW | VRP con ventanas de tiempo suaves | 468,72 | 3 | 636 / 605 | 3,89 s |
| `30_dvrpt.gms` | DVRP-T | VRP con jornada máxima (duración) | 534,05 | 5 | 616 / 605 | 0,06 s |
| `31_ccvrp.gms` | CCVRP | VRP acumulativo (latencia mínima), 8 clientes | 565,24 | 3 | 260 / 243 | 27,62 s |
| `32_omdvrp.gms` | OMDVRP | Múltiples depósitos con rutas abiertas | 226,89 | 4 | 737 / 726 | 0,11 s |
| `33_op.gms` | OP | Orienteering de un vehículo | 464,99 | 1 | 132 / 121 | 0,11 s |
| `34_ptp.gms` | PTP | Tour rentable (TSP con beneficios) | 812,22 | 1 | 132 / 121 | 0,01 s |

PCVRP, TOP, OP y PTP maximizan (en 33 y 34 se informa el premio o beneficio; el archivo minimiza su negativo); MinVeh, OBmTSP y SDVRP resuelven además una versión de comparación en el mismo archivo.

## Cómo se probaron

* Los modelos **28 a 34** los genera el exportador de la app (botón «Código GAMS (.gms)»), con la misma instancia; son el mismo
  modelo que la app resuelve con HiGHS. `node Parcial_Grafos_App/pruebas/validar_export_gams.js` ejecuta el `.gms` de las 34
  variantes y comprueba que dan el mismo óptimo que la app.

* **Corrección:** `26_pcvrp.gms` tenía una restricción de carga que se aplicaba también a clientes no visitados y hacía infactible
  el óptimo; el valor correcto es 635,66 (antes 450,55). Lo detectó la validación contra la app.
* Cada archivo se ejecutó de principio a fin con `Exposicion_src/ref/gamsx.py`, un intérprete del subconjunto de GAMS que usan
  estos archivos (declaraciones, asignaciones con `$`, loops, ecuaciones, `solve`) que construye el modelo y lo resuelve con
  **HiGHS**. El intérprete también rechaza los errores de compilación más comunes de GAMS (símbolos duplicados — GAMS no
  distingue mayúsculas —, índices no controlados, violaciones de dominio, ecuaciones sin definir, comentarios fuera de la columna 1).
  Con él se detectaron y corrigieron, por ejemplo, choques de nombres como `q`/`Q`.
* **No se ejecutaron con el programa GAMS** (no estaba disponible en el entorno de trabajo). Los objetivos son óptimos y deben
  coincidir; el número de nodos depende del solver. Conviene correr cada archivo una vez antes de la clase.
* Regenerar: `python3 Exposicion_src/ref/modelos_gams.py`; resolver y graficar: `python3 Exposicion_src/ref/resultados_modelos.py`.
