# Optimización de rutas: TSP y m-TSP (Jupyter)

Cuaderno `Optimizacion_TSP_mTSP.ipynb`: resuelve TSP y m-TSP con programación entera mixta
(solver exacto HiGHS vía SciPy). No usa algoritmos de grafos ni heurísticas.

## Uso
```bash
pip install -r requirements.txt
jupyter notebook Optimizacion_TSP_mTSP.ipynb
```
Ejecute las celdas en orden. El panel de la sección 5 permite cambiar problema, número de
vehículos, límites por ruta, objetivo, tiempo máximo y origen.

## Datos incluidos (`datos/`)
- `distancias_cali_km.csv`: matriz por carretera (km) de 26 puntos (centro de distribución y 25 tiendas ARA).
- `tiendas_cali.csv`: id, nombre, latitud y longitud de los mismos puntos.
- `ciudades_china_km.csv`: matriz por carretera (km) de las 25 ciudades del Top 25 de China.

## Resultados verificados
| Caso | Resultado | Brecha |
|---|---|---|
| TSP, 26 puntos de Cali | 72.048 km | 0 (óptimo) |
| m-TSP, 2 vehículos, 12 y 13 clientes | 75.675 km | 0 (óptimo) |
| TSP, 8 puntos aleatorios | igual a fuerza bruta | — |

## Límites
- El modelo exacto crece rápido con el número de puntos. Con 26 puntos resuelve en segundos o minutos.
- Si el solver se detiene por tiempo, el estado lo indica y la brecha muestra la distancia al óptimo.
- Los resultados dependen de la matriz de distancias cargada.
