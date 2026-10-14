# Grafos Lab

App web para **analizar grafos y logística** a partir de datos o informes de formato desconocido: los convierte en un
modelo de grafo, ejecuta ~40 algoritmos (caminos, árboles, flujos, estructura, localización, rutas, escenarios), muestra
cada iteración, responde con el razonamiento paso a paso y exporta informes, Excel y paquetes de importación para
**Grafos v.1.3.5**.

- **Backend:** Python 3.12 · FastAPI · NetworkX · SciPy (HiGHS) · OR-Tools · pandas · python-docx · reportlab · SQLite
- **Frontend:** HTML/JS sin paso de build (Cytoscape.js para el grafo, Leaflet para el mapa, ambos incluidos en `frontend/static/vendor`)
- Una sola orden para levantar todo.

## Arranque

```bash
docker compose up --build        # → http://localhost:8000
# o, sin Docker:
./run.sh                         # crea .venv, instala dependencias y arranca en :8000
```

Variables opcionales: `GRAFOS_DB` (ruta SQLite), `GRAFOS_WORKERS`, `GRAFOS_MAX_TIME` (s por cálculo), `GRAFOS_MAX_NODES`,
`ANTHROPIC_API_KEY` (ayuda opcional de un LLM para extraer parámetros de informes; sin clave se usan reglas).

## Recorrido de uso (5 minutos)

1. **Ingesta** → «Ejemplo con flota (25 nodos)» (o arrastre sus archivos; puede subir varios a la vez).
2. **Análisis** → clic **izquierdo** en un nodo = origen (amarillo), clic **derecho** en otro = destino (rojo): se calcula Dijkstra al instante.
   En el panel derecho: *Respuesta*, *Paso a paso* (tramo por tramo con la alternativa descartada), *Razonamiento*, *Resumen* (corto y largo),
   *Informe* técnico, *Control* (valores para validar en otras herramientas) y *Tablas*/matriz como mapa de calor.
3. Elija **Kruskal** y pulse ▶ para **animar** el algoritmo (pausa, paso a paso, velocidad); o **VRPTW** para ver una ruta por vehículo con paradas numeradas.
4. **Escenarios**: cierre nodos, compare ejecuciones con Δ %, proponga enlaces de resiliencia, sensibilidad a costos.
5. **Preguntas**: «¿cuál es la ruta más barata entre Punto 00 y Punto 09 si cierro Punto 03?».
6. **Exportar**: Word/PDF/Excel/PNG/SVG/GraphML/GEXF/GeoJSON/SQLite/CSV, ZIP completo y el **paquete Grafos v.1.3.5**.

Datos de ejemplo en `data/ejemplos/` (CSV, Excel multi-hoja, JSON, informe Word y paquete Grafos). Se regeneran con `python scripts/make_examples.py`.

## Ingesta de formatos desconocidos

Acepta CSV/TSV/TXT (separador y codificación detectados, coma decimal), Excel (varias hojas), JSON, GeoJSON, SQLite, volcado SQL
(solo `CREATE TABLE/INSERT`; todo lo demás se omite y se avisa), GraphML, GEXF, listas de aristas (con o sin cabecera),
matrices de adyacencia/costo (con etiquetas o NxN), archivos de importación de Grafos v.1.3.5
(`#` = sin valor; 3 columnas = coordenadas; 2 columnas = valores) y **informes Word/PDF**.

Flujo: detectar → perfilar columnas → **proponer mapeo con confianza** → pantalla editable con vista previa → validaciones
(nodos duplicados, aristas huérfanas, coordenadas fuera de rango, unidades dudosas, grafo desconectado, valores negativos) → proyecto versionado.
De los informes se extraen tablas y parámetros con **cita de origen y confianza** para que usted los confirme; lo que no está
en el texto **no se inventa**. Si faltan aristas pero hay coordenadas, se generan por k-vecinos, umbral, Delaunay o grafo completo
(Haversine R = 6371.0088 km × factor vial). Sin coordenadas se calcula un layout (MDS/fuerza).

## Algoritmos

| Familia | Algoritmos |
|---|---|
| Caminos | Dijkstra (O–D y a todos), Bellman-Ford (mín. y máx. en DAG), A*, Floyd-Warshall, k caminos (Yen), camino crítico |
| Árboles | Kruskal y Prim (mín/máx, aceptadas/rechazadas con razón), árbol de caminos mínimos / de máxima capacidad |
| Flujos | Flujo máximo (Edmonds-Karp), corte mínimo, transbordo equilibrado a costo mínimo, transporte, asignación (húngaro) |
| Estructura | Componentes (conexas y fuertes), articulación y puentes, grados y centralidad, diámetro/radio/centro, ciclos, circuito de Euler (Hierholzer), coloreo exacto (CP-SAT) vs DSATUR |
| Localización | p-mediana, p-centro, cobertura máxima, localización a costo fijo (MILP con HiGHS) |
| Rutas | TSP, m-TSP, CVRP, VRPSPD, VRPTW, flota heterogénea, multi-depósito, VRP periódico, FSTSP (camión + drones), cartero chino, cartero rural |
| Escenarios | Cierre de nodos/aristas, fallas múltiples, resiliencia, cambio de flota, sensibilidad, comparación lado a lado |

Costo de arista: `c = c_km·d + c_hora·t/60`, `t = 60·d/v`, emisiones `e·d`; factor de escala (×100, ×1000…) para exportar enteros.

### Óptimo vs. heurístico (siempre indicado en cada resultado)

- **Óptimo probado:** Dijkstra, Bellman-Ford, A*, Floyd-Warshall, Kruskal/Prim, flujos, coloreo/MILPs (si HiGHS/CP-SAT cierran el *gap* en el tiempo dado; si no, se marca heurístico), cartero chino, Euler, TSP con ≤12 nodos (Held-Karp).
- **Heurístico:** TSP grande, m-TSP, CVRP, VRPSPD, VRPTW, flota heterogénea, multi-depósito, periódico, **FSTSP** (voraz con simulación temporal), cartero rural, resiliencia.
  Usan *guided local search* de OR-Tools con **límite fijo de soluciones** y tiempo para que sea reproducible; los parámetros y la semilla se guardan en cada ejecución.

## Paquete Grafos v.1.3.5

`Exportar → Paquete Grafos` genera, con TAB, CRLF y `#`:
`1_matriz_coste_arcos.txt`, `2_matriz_maximo_arcos.txt`, `3_coordenadas_XY_nodos.txt` (separación mínima de 10 px opcional),
`4_valores_nodo_2col.txt` y `0_INSTRUCCIONES_Grafos.txt` con el orden de carga, los modos (**Sustituir** para matrices, **Actualizar** para
coordenadas y valores), clic izquierdo = origen / derecho = destino y **los valores esperados**, recalculados sobre los mismos enteros exportados.

> **No verificado contra la interfaz de Grafos** (no hay acceso a ella desde esta app): cómo muestra el valor de un árbol (una vez por arista o por arco),
> y el esquema XML de VRP-XML (el CVRP de Grafos exige crear esa estructura en «Gestión de datos VRP-XML»). El archivo de instrucciones lo advierte.

## API (resumen)

`POST /api/ingest/preview` → `POST /api/ingest/commit` · `GET/PUT/DELETE /api/projects/{id}` · `POST /api/projects/{id}/run[?wait=true]`
(tarea en segundo plano con `GET /api/jobs/{id}` y `POST /api/jobs/{id}/cancel`) · `POST /api/projects/{id}/ask` ·
`POST /api/projects/{id}/compare` · `GET /api/projects/{id}/export/{kind}` · `GET /api/catalog`. Documentación interactiva en `/docs`.

## Pruebas

```bash
pip install -r backend/requirements-dev.txt
cd backend && python -m pytest tests -q
```

57 pruebas: cada algoritmo contra NetworkX/fuerza bruta/casos conocidos, factibilidad de CVRP/VRPSPD/VRPTW (capacidad y ventanas verificadas de forma
independiente), reproducibilidad, ingesta (Grafos, CSV con acentos/coma decimal, Excel, JSON, GeoJSON, SQL, Word y PDF) y archivos mal formados, y
todas las exportaciones (el Word y el Excel se reabren, el paquete Grafos se re-importa).

## Límites conocidos

- Rendimiento verificado con 500 nodos (Dijkstra, árboles, Floyd en ~2 s; 200 clientes en CVRP en ~15 s). Más allá se avisa.
- El mapa Leaflet usa teselas de OpenStreetMap (requiere internet); sin ellas se dibujan nodos y rutas sobre fondo vacío.
- Los PDF escaneados no tienen OCR (se avisa); cargue los datos en CSV/Excel.
- Cartero chino con grafos mixtos (arcos y aristas a la vez) no está soportado y se informa. El cartero rural solo en no dirigidos.
- Los exportes Word/PDF son un informe por ejecución; las ecuaciones se escriben como OMML (editables en Word).
- Cancelar un cálculo descarta su resultado; OR-Tools termina por su límite de tiempo.
