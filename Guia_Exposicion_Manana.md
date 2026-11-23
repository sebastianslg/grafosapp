# Guía para la exposición de mañana

Juan Sebastián Salas Lugo y Alejandro Álvarez Torres · UTB · Distribución y Transporte

Lee esta guía completa una vez esta noche. Mañana, antes de entrar, repasa solo los recuadros **«Lo que digo»** y la sección 7 (preguntas).

---

## 0. Qué llevar y qué preparar esta noche (20 min)

| Qué | Archivo | Para qué |
|---|---|---|
| Diapositivas principales | `Exposicion_Ruteo_de_Vehiculos.pptx` (58 láminas) | La exposición |
| Diapositivas de apoyo | `Exposicion_Modelos_VRP_GAMS.pptx` y `Exposicion_Algoritmos_GAMS.pptx` | Si piden ver el código GAMS |
| Guion | `Guion_35min_58diapositivas.md` (o `Guion_15min.md` si te dan 15 min) | Qué decir en cada lámina |
| App | `App_Parcial_Grafos.zip` | Demostración en vivo |
| Código GAMS | `GAMS_modelos/` (34 modelos) y `GAMS_algoritmos/` (18 algoritmos) | Correr un modelo en vivo |
| **Respaldo** | Capturas de pantalla de la app (las tomas tú esta noche) | Si la app no abre en el PC de clase |

**Pasos esta noche, en el PC que vas a usar (o en uno con Windows):**

1. Descomprime `App_Parcial_Grafos.zip` en el Escritorio (clic derecho → *Extraer todo*). **No la abras desde dentro del zip.**
2. Entra a la carpeta `Parcial_Grafos_App` y haz doble clic en `Ejecutar_App.bat`. Se abre el navegador solo.
   - Si Windows muestra «Windows protegió su PC»: *Más información* → *Ejecutar de todas formas*.
   - Espera a que arriba a la derecha el indicador diga **HiGHS** en verde (unos segundos).
3. Haz la demostración de la sección 4 completa una vez. Si todo funciona, ya está.
4. **Toma capturas** de cada paso de la demostración (tecla `Windows + Shift + S`) y pégalas en 2–3 láminas al final de tu presentación. Si mañana la app falla, muestras las capturas y no pierdes nada.
5. Si tienes GAMS instalado: abre `GAMS_modelos/08_cvrp.gms`, pulsa **F9** y verifica que el objetivo sea **425,05**. Si sale error de licencia o de solver, quita el asterisco de la línea `* option mip = highs;` y vuelve a correr.

> **Importante:** algunas cifras de las diapositivas son de una versión anterior. Ver la sección 6 («Cifras que cambiaron»). Dilo así: «en la versión final de la herramienta…».

---

## 1. La idea central en un minuto

**Lo que digo:**
> «El VRP es decidir qué vehículo visita a qué clientes y en qué orden, al menor costo. Todas las variantes comparten un **núcleo**: cada cliente se visita una vez, cada vehículo sale y vuelve al depósito, y no hay subtours. Cada variante **agrega una restricción**: capacidad, ventanas de tiempo, varios depósitos, etc. Para resolverlo hay tres caminos: el **modelo matemático exacto** (da el óptimo probado pero escala poco), las **heurísticas** (rápidas, sin garantía) y las **metaheurísticas** (mejor calidad, salen de óptimos locales). En la práctica: **heurística para empezar, metaheurística para mejorar y exacto para validar.**»

Tres conceptos que debes dominar:

- **Óptimo probado:** el solver demostró que no existe una solución mejor (brecha 0 %).
- **Cota (inferior):** un valor que el solver garantiza que ninguna solución puede bajar. Sale de la relajación lineal (resolver el modelo permitiendo que las x valgan entre 0 y 1).
- **Brecha (gap)** = (mejor solución − cota) / mejor solución. Si la brecha es 3 %, la solución que tengo está como máximo a 3 % del óptimo.

---

## 2. Los modelos matemáticos (bloques A y B)

### 2.1 Notación (lámina 5)
- Nodos: depósito `d` (o 0) y clientes `c1…cn`.
- `dist(i,j)` costo o distancia del arco; `dem(i)` demanda; `Q` capacidad; `K` vehículos.
- **x(i,j) = 1 si un vehículo recorre el arco i → j** (0 si no). Es binaria.

### 2.2 El modelo CVRP explicado línea por línea (archivo `GAMS_modelos/08_cvrp.gms`)

Este es el que debes saber explicar; los demás son variaciones.

```gams
Binary Variable x(i,j)   'vale 1 si un vehículo recorre el arco i -> j';
Positive Variable ql(i)  'carga acumulada al salir del cliente i';
obj..           z =e= sum((i,j), dist(i,j)*x(i,j));                     (1)
sale(i)$c(i)..  sum(j$(not sameas(i,j)), x(i,j)) =e= 1;                  (2)
entra(j)$c(j).. sum(i$(not sameas(i,j)), x(i,j)) =e= 1;                  (3)
flota..         sum(c, x('d',c)) =l= K;                                  (4)
balDep..        sum(c, x('d',c)) =e= sum(c, x(c,'d'));                   (5)
carga(i,j)$(c(i) and c(j) and not sameas(i,j))..
                ql(j) =g= ql(i) + dem(j) - Q*(1 - x(i,j));               (6)
ql.lo(c) = dem(c); ql.up(c) = Q;                                         (7)
solve cvrp using mip minimizing z;
```

**Lo que digo, ecuación por ecuación:**
1. **Objetivo:** minimizar la distancia total de los arcos usados.
2. **Sale:** de cada cliente sale exactamente un arco.
3. **Entra:** a cada cliente entra exactamente un arco. Con (2) y (3) cada cliente se visita **una sola vez**.
4. **Flota:** del depósito salen como máximo K vehículos.
5. **Balance del depósito:** salen tantos vehículos como regresan.
6. **Carga acumulada (MTZ):** si voy de i a j (x = 1), la carga al salir de j es al menos la de i más la demanda de j. Si no voy (x = 0), el término `Q·(1−x)` la desactiva. **Esto hace dos cosas a la vez: controla la capacidad y elimina los subtours** (un ciclo que no pasa por el depósito haría crecer la carga sin fin).
7. **Límites:** la carga de cada cliente está entre su demanda y Q → **nunca se pasa de la capacidad**.

Los símbolos de GAMS que te pueden preguntar:
- `=e=` igual, `=l=` menor o igual, `=g=` mayor o igual.
- `$c(i)` es una **condición**: la ecuación solo se crea para los clientes.
- `sameas(i,j)` es «i y j son el mismo nodo» (para no crear el arco de un nodo a sí mismo).
- `x.l` es el **valor** de x en la solución (se usa en el reporte para reconstruir las rutas).
- `option optcr = 0` exige el óptimo exacto (brecha 0).

**Cómo correrlo en vivo:** abrir el archivo en GAMS Studio → **F9** → abrir el `.lst` → buscar `display`: verás `z` (objetivo), `ruta` (orden de clientes por ruta), `largo` y `cargaR`. Resultado esperado: **425,05 con 3 rutas**.

### 2.3 Qué cambia en cada variante (una frase cada una)

| Variante | Qué se agrega o cambia | Archivo |
|---|---|---|
| TSP | Un vehículo, sin capacidad; MTZ con contador de orden `u` | `01_tsp` |
| mTSP / balanceado | m vehículos; balanceado = piso y techo de clientes por ruta | `03`, `04` |
| Min-max | Minimiza la **ruta más larga** (variable auxiliar ≥ cada ruta) | `07`, `28` |
| OVRP (abierto) | El vehículo no vuelve: **costo cero en los arcos de regreso** | `09` |
| DCVRP | **Distancia máxima L por ruta** | `10` |
| MinVeh | Dos fases: primero **mínimo de vehículos**, luego mínima distancia con esa flota | `12` |
| VRPTW | **Hora de llegada t(i)**: `t(j) ≥ t(i) + servicio + viaje − M·(1−x)` y `a(i) ≤ t(i) ≤ b(i)` | `14` |
| Ventanas blandas | Se puede llegar tarde **pagando penalización** por hora | `29` |
| HFVRP / FSMVRP | **Flota mixta**: cada tipo con capacidad, costo por km y costo fijo | `16`, `17` |
| MDVRP | **Varios depósitos**; cada vehículo sale y vuelve al suyo | `19` |
| LRP | **Binaria de apertura** de cada depósito con costo fijo | `21` |
| VRPB (backhauls) | Primero entregas, luego recogidas | `22` |
| VRPSPD | Entrega y recoge en el mismo cliente; la **carga sube y baja** | `23` |
| VRPPD | Pares recoger → entregar: **mismo vehículo y recogida antes** | `24` |
| SDVRP | **Entrega dividida**: la demanda de un cliente se reparte entre vehículos | `25` |
| PCVRP, TOP, OP, PTP | **No es obligatorio visitar a todos**: se maximiza premio − costo | `26`, `27`, `33`, `34` |
| CCVRP | Minimiza la **suma de horas de llegada** (atención al cliente) | `31` |

**Lo que digo:** «Son 34 variantes y todas son el núcleo más una restricción. Cada archivo GAMS es autocontenido: datos, modelo, solve y reporte de rutas.»

### 2.4 Cómo se comprobó que los modelos están bien (láminas 22–23)
- Los 34 modelos se resolvieron con HiGHS sobre la instancia CVRP-10 y la app da **exactamente el mismo óptimo** que el GAMS escrito a mano.
- El código GAMS que exporta la app también se ejecutó y da el mismo óptimo.
- **Honestidad:** los `.gms` se verificaron con un intérprete propio del subconjunto de GAMS más HiGHS, **no con GAMS Studio** (no había licencia). Si alguno marca un error de sintaxis, es local y la lógica ya está validada.

---

## 3. Los algoritmos (bloque C) — explicación simple de los 18

**Idea general:** las heurísticas construyen o mejoran rutas con reglas sencillas; se quedan en un **óptimo local** (una solución que ningún cambio pequeño mejora). Las metaheurísticas tienen un mecanismo para **salir** de ese óptimo local.

Todos se probaron en la instancia CVRP-10 (óptimo 425,05). Tabla en `GAMS_algoritmos/README.md`.

### 3.1 Constructivas (arman una solución desde cero)

| # | Algoritmo | Cómo funciona (lo que digo) | CVRP-10 |
|---|---|---|---|
| 01 | **Vecino más cercano** | Desde el depósito voy siempre al cliente **más cercano que todavía cabe**; si nadie cabe, vuelvo y abro otra ruta. Rápido, pero las últimas rutas quedan largas. | 481,16 |
| 02 | **Barrido (sweep)** | Ordeno los clientes por **ángulo** alrededor del depósito y lleno vehículos en ese orden, como una manecilla del reloj. | 426,35 |
| 03 | **Inserción más barata** | Inserto cada cliente donde **menos aumenta el costo**: c(i,k) + c(k,j) − c(i,j). | 481,16 |
| — | **Ahorros (Clarke-Wright)** | Empiezo con una ruta por cliente y **uno rutas** por mayor ahorro s(i,j) = c(0,i) + c(0,j) − c(i,j). | (en la app) |

### 3.2 Mejora local (mejoran una solución existente)

| # | Algoritmo | Cómo funciona | CVRP-10 |
|---|---|---|---|
| 04 | **2-opt** | Tomo dos arcos de una ruta e **invierto el tramo del medio**; si baja la distancia (Δ < 0), me quedo. Quita los cruces. | 426,35 |
| 13 | **Or-opt** | Muevo un **tramo de 1, 2 o 3 clientes seguidos** a otra posición (en la misma ruta o en otra). | 426,35 |
| 05 | **VND** | Combina vecindarios: **relocate** (mover un cliente), **swap** (intercambiar dos), 2-opt; cuando uno no mejora paso al siguiente. | **425,05** |

### 3.3 Dos fases (agrupar y ordenar)

| # | Algoritmo | Cómo funciona | CVRP-10 |
|---|---|---|---|
| 16 | **Split (ruta primero, agrupa después)** | Hago **una sola ruta gigante** con todos (como un TSP) y luego la **corto en rutas** que respeten capacidad, eligiendo los cortes de menor costo con **programación dinámica**. | **425,05** |
| 17 | **Fisher-Jaikumar** | Elijo un **cliente semilla** por vehículo, **asigno** cada cliente a una semilla respetando capacidad (problema de asignación generalizada) y luego **ordeno cada grupo** como un TSP. | **425,05** |
| 18 | **Pétalos** | Genero muchas rutas candidatas («pétalos»: grupos de clientes **consecutivos por ángulo**) y escojo la combinación que **cubre a todos una vez** al menor costo (partición de conjuntos). | **425,05** |

### 3.4 Metaheurísticas (salen de óptimos locales)

| # | Algoritmo | Mecanismo para salir del óptimo local (lo que digo) | CVRP-10 |
|---|---|---|---|
| 06 | **Búsqueda tabú** | Siempre me muevo al **mejor vecino aunque empeore**, pero **prohíbo** volver a lo reciente (lista tabú). Excepción: si un movimiento prohibido da la mejor solución global, se acepta (**aspiración**). | 425,05 |
| 07 | **Recocido simulado** | Acepto un vecino peor con probabilidad **e^(−Δ/T)**. Al principio T es alta (acepto mucho); la **enfrío** (T = α·T) y al final solo acepto mejoras. | 425,05 |
| 08 | **Algoritmo genético** | Población de soluciones; escojo padres por **torneo**, los **cruzo** (cruce OX), **muto** y me quedo con las mejores (**elitismo**). | 425,05 |
| 09 | **Colonia de hormigas** | Cada hormiga arma rutas eligiendo el siguiente cliente con probabilidad ∝ **feromona^α · (1/distancia)^β**; las rutas cortas **depositan más feromona**, que se **evapora** con el tiempo. | 429,43 |
| 10 | **GRASP** | Repito: construcción voraz **con algo de azar** (escojo entre los mejores candidatos, no siempre el mejor) + búsqueda local. Me quedo con la mejor. | 425,05 |
| 11 | **VNS** | Cuando me estanco, **sacudo** la solución con un vecindario más grande y vuelvo a mejorar. | 425,05 |
| 14 | **ILS** | Perturbo la mejor solución (unos movimientos al azar) y le aplico búsqueda local; acepto si mejora. | 425,05 |
| 15 | **LNS** | **Destruyo** una parte (quito 10–30 % de los clientes) y **reparo** reinsertándolos donde menos cuesten. | 425,05 |

### 3.5 Exacto

| # | Algoritmo | Cómo funciona |
|---|---|---|
| 12 | **Branch and bound** | Es lo que hace el solver con el modelo: resuelve la **relajación lineal** (da la cota); si una x sale fraccionaria, **ramifica** en x = 0 y x = 1; **poda** las ramas cuya cota ya es peor que la mejor solución encontrada. Cuando no quedan ramas, el óptimo está probado. En CVRP-10: relajación 308,47, óptimo 425,05, 1 369 nodos. |

### 3.6 Cómo leer un código de algoritmo en GAMS (`GAMS_algoritmos/07_recocido_simulado.gms`)
Los algoritmos en GAMS no usan `solve` (salvo 12, 16, 17 y 18): son **programas con ciclos**.
- Secciones del archivo: **DATOS** → **representación** (un tour gigante que se divide por capacidad) → **solución inicial** (vecino más cercano) → **generador aleatorio Park-Miller** (semilla fija: la corrida se repite igual) → **ciclo principal** `loop(itr, ...)` con vecino aleatorio, **criterio de Metropolis** y enfriamiento → **reporte**.
- En el `.lst` mira: `tr` (tour), `RTc` (rutas), `costo_final`, `gap_pct` y `nev` (número de evaluaciones).

---

## 4. Demostración de la app (bloque D) — guion paso a paso (5–7 min)

**Antes de empezar:** la app abierta, proyecto **ARA Cali** seleccionado arriba, indicador **HiGHS** en verde.

**Lo que digo al abrirla:**
> «Construimos una herramienta que resuelve las 34 variantes con el modelo matemático exacto, usando el solver HiGHS dentro del navegador. Funciona sin internet y se abre con un doble clic.»

### Paso 1 — TSP (1 min)
1. Izquierda, tarjeta **Problema**: *Tipo de problema* = **TSP**; *Tiempo máximo* = **120**.
2. Muestra el recuadro ⏱ sobre el botón: **«Óptimo probado: entre 10 s y 2 min · 26 nodos»**. Di: «antes de resolver, la app estima cuánto va a tardar, con base en mediciones».
3. **Resolver.** Mientras corre, señala el panel en vivo: **mejor solución, cota, brecha y tiempo restante**.
4. Resultado esperado: **72,05 km, óptimo probado** (unos 25 s). La ruta se dibuja **sobre las calles reales** y un vehículo la recorre.

### Paso 2 — CVRP con capacidad (1 min)
1. *Tipo de problema* = **VRP**; *Variante* = **CVRP**.
2. **Resolver** → **74,87 km, óptimo probado en menos de 1 s**.
3. Di: «usamos la formulación de dos índices con cortes de capacidad, que es mucho más ajustada que la de vehículo-arco: con la formulación MTZ este mismo caso no se probaba ni en 10 minutos».

### Paso 3 — Comparar con los algoritmos (1,5 min)
1. *Método de solución* = **Comparar con heurísticas (referencia)**. Pon **Tiempo máximo = 24** (con el valor por defecto, 120, tarda ~1,5 min). El recuadro ⏱ dirá **«Duración ≈ 27 s»**.
2. **Resolver.** Aparece la tabla: cada algoritmo con su **objetivo, brecha y tiempo**. Pestaña **Gráficas** → calidad frente a tiempo.
3. Di: «el modelo da el óptimo y la cota; cada heurística muestra **qué tan lejos queda del óptimo**. Las metaheurísticas llegan al óptimo o muy cerca en segundos.»

   Lo que vas a ver (medido hoy con los datos de Cali; tarda ~17 s):

   | Grupo | Resultado |
   |---|---|
   | Modelo matemático | **74,87 km, brecha 0 %** (óptimo probado en 0,3 s) |
   | Constructivas simples | Vecino 101,93 (26,6 %) · Barrido 97,58 (23,3 %) · Inserción 90,33 (17,1 %) · **Ahorros 76,56 (2,2 %)** |
   | Mejora local y dos fases | 2-opt 79,57 · Split 79,11 · Pétalos 78,84 (~5 %) · **Or-opt, VND, Fisher-Jaikumar 75,02 (0,2 %)** |
   | Metaheurísticas (2 s c/u) | **Recocido, genético, hormigas, GRASP, VNS, ILS: 74,87 (óptimo)** · Tabú y LNS 75,02 (0,2 %) |

   Frase para cerrar: «las constructivas simples quedan entre 17 y 27 % por encima; la mejora local las acerca; **las metaheurísticas llegan al óptimo en 2 segundos**, pero solo el modelo **prueba** que es el óptimo.»

### Paso 4 — Ventanas de tiempo y parar (1,5 min)
1. Vuelve *Método de solución* a **Modelo matemático (exacto)** y *Tiempo máximo* a **120**. *Variante* = **VRPTW**. El ⏱ dice **«entre 1 y 15 min (puede no probarse)»**.
2. **Resolver**; a los ~20 s muestra la brecha bajando y pulsa **«Parar y ver lo mejor»**.
3. Di: «si la solución ya me sirve, paro y me quedo con la mejor encontrada **y su brecha garantizada**. Nunca se entrega una solución sin verificar: cada cliente una vez, capacidad y costo recalculado.»
4. Pestaña **Gantt**: muestra viaje, espera y servicio por vehículo, en horas del día.

### Paso 5 (opcional) — Exportar a GAMS (30 s)
Con un resultado del modelo en pantalla, baja en el panel derecho y pulsa el botón **«Código GAMS (.gms)»**: la app descarga el `.gms` de la variante con los datos de Cali. Di: «el modelo que resuelve la app es el mismo que se puede correr en GAMS».

### Paso 6 — Los ejemplos de GAMS en la app (el mejor puente entre diapositivas y app)
En la tarjeta **«Ejemplos de la exposición»** (izquierda, bajo Problema) hay un ejemplo por cada archivo `.gms`: 34 modelos y 18 algoritmos, con **los mismos datos de GAMS**, cada uno en un mapa de una ciudad distinta.
1. Elige **«08 · CVRP — Santa Marta»** → **Cargar y resolver**. Sale **425,05 con óptimo probado** y la nota **«GAMS reporta 425,05; la app obtuvo 425,05 → coinciden»**.
2. Muestra uno más visual: **«19 · MDVRP — Valledupar»** (dos depósitos, ~30 s) o **«21 · LRP — Lima»** (abre depósitos, ~30 s).
3. Para un algoritmo: **«07 · Recocido simulado — …»** → corre «Comparar», resalta su fila y dice su brecha frente al óptimo 425,05.

**Lo que digo:** «cada modelo de las diapositivas tiene su ejemplo en la app con los mismos datos del archivo GAMS; aquí se ve que dan **el mismo valor**.»

Tiempos medidos en el navegador (10 clientes): casi todos **menos de 4 s**; MDVRP y LRP **~30 s**. **Evita VRPSPD (23) y CCVRP (31) en vivo**: hallan el mismo valor de GAMS, pero tardan más de 2 min en *probar* el óptimo. Si te preguntan, la nota lo explica.

Ojo: en los ejemplos de algoritmos, el valor de la app puede diferir del de GAMS (cada implementación y semilla es distinta, por ejemplo barrido). Lo que se compara es contra el **óptimo 425,05**.

### Si algo falla durante la demo
- **No abre / pantalla en blanco:** cierra y vuelve a abrir `Ejecutar_App.bat`. Si sigue, pasa a tus **capturas**.
- **El indicador no dice HiGHS:** espera 10 s; si dice «servidor», igual funciona.
- **Tarda más de lo esperado:** pulsa **Parar y ver lo mejor**. Eso también es parte de la demo.
- **Las calles no se dibujan (sin internet):** las rutas salen en línea recta; los resultados no cambian. Dilo así.

---

## 5. El código de la app (si preguntan cómo está hecha)

**Lo que digo:**
> «Es una aplicación web: la interfaz es HTML y JavaScript, y el solver es **HiGHS compilado a WebAssembly**, que corre en un hilo aparte del navegador. Un servidor mínimo en Python (sin librerías externas) la sirve en el propio computador y consulta las distancias por calle. Para Windows va con Python incluido, por eso abre con doble clic.»

| Archivo | Qué hace |
|---|---|
| `ejecutar_app.py` | Servidor local en Python: sirve la app, calcula distancias por calle (OSRM) y se cierra solo al cerrar la ventana |
| `web/js/variantes.js` | Las **34 variantes**: qué restricciones activa cada una |
| `web/js/vrp.js` | **Construye el modelo MILP** (variables x, y, restricciones, MTZ o dos índices con cortes) y verifica la solución |
| `web/js/solver.js` | Escribe el modelo en formato LP y lo pasa a HiGHS |
| `web/js/worker.js` | Corre el solver en segundo plano: progreso en vivo, parar, comparación |
| `web/js/heur.js` | Los **18 algoritmos** (constructivas, mejora local, dos fases y metaheurísticas) |
| `web/js/gams.js` | Genera el **código GAMS** de la variante elegida |
| `web/js/estimacion.js` | Estima el tiempo antes de resolver |
| `web/js/simulacion.js`, `graficas.js` | Simulación de vehículos, Gantt y gráficas |
| `pruebas/` | 17 pruebas automáticas (modelos contra GAMS, heurísticas contra el óptimo, interfaz) |

Dos ideas técnicas que suman puntos:
1. **Solución inicial heurística:** con muchos clientes, primero se calcula una solución por ahorros + VND (en 1 s) y el modelo arranca desde ahí; nunca se entrega algo peor que esa heurística.
2. **Dos índices con cortes:** en vez de x(k,i,j) por vehículo, se usa x(i,j) y se agregan **cortes de capacidad** solo cuando hacen falta (se resuelve, se buscan grupos de clientes que violan la capacidad, se agrega el corte y se repite). Es lo que permite 100 clientes con brecha ~3 % en 80 s.

---

## 6. Cifras que cambiaron respecto a las diapositivas

| Lámina | Dice la diapositiva | Versión final de la app | Qué decir |
|---|---|---|---|
| 2, 13–14, 48 | 27 variantes, 11 algoritmos | **34 variantes, 18 algoritmos** | «En la versión final ampliamos a 34 y 18.» |
| 47–48 | Heurística como método de solución | La app entrega **solo el modelo exacto**; las heurísticas están en «Comparar» como **referencia** | «La solución oficial es el modelo; las heurísticas se comparan contra él.» |
| 56 | Modelo con 8 s: 87,83, cota 69,07, brecha 7,8 % | Modelo de dos índices: **74,87 km, óptimo probado en < 1 s** | «Con la formulación de dos índices, ahora el modelo prueba el óptimo: las heurísticas que daban 74,87 eran óptimas.» |
| 51 | TSP 72,048 km óptimo | Igual (≈ 25 s) | — |

---

## 7. Preguntas probables y respuestas cortas

- **¿Qué es el gap?** (mejor solución − mejor cota) / mejor solución. Con 0 % el óptimo está probado.
- **¿De dónde sale la cota?** De la **relajación lineal** y del branch and bound: el solver garantiza que ninguna solución baja de ese valor.
- **¿Qué es un subtour y cómo se elimina?** Un ciclo que no pasa por el depósito. Con **MTZ** (carga o contador acumulado que debe crecer) o con **DFJ** (cortes: en todo grupo S de clientes, los arcos internos ≤ |S| − 1).
- **¿MTZ o DFJ?** MTZ es un solo modelo, polinomial y es el del curso; su relajación es débil. DFJ es más ajustado pero tiene exponencialmente muchas restricciones, por eso se agregan como **cortes** solo cuando se violan.
- **¿Por qué no siempre el exacto?** El VRP es **NP-difícil**: el número de rutas crece factorialmente. Con 25 clientes se prueba en segundos; con 100, se llega a ~3 % de brecha en un minuto, pero probar el óptimo puede tardar horas.
- **¿Una heurística garantiza el óptimo?** No. Puede acertar (Split, Fisher-Jaikumar y Pétalos llegaron a 425,05), pero no lo **prueba**: solo el modelo con brecha 0 lo prueba.
- **¿Qué es un óptimo local?** Una solución que ningún cambio pequeño (2-opt, relocate) mejora, aunque exista una mejor.
- **¿Por qué aceptar soluciones peores?** Para salir de óptimos locales (tabú, recocido).
- **¿Por qué hormigas quedó en 429,43?** Con la semilla fija converge temprano a una ruta y la feromona la refuerza; necesitaría más evaporación o más iteraciones.
- **¿Qué solver usan?** **HiGHS**, gratuito y de código abierto, de los mejores para MILP; el mismo que trae GAMS como opción.
- **¿Las distancias son reales?** Sí: por carretera con OSRM (OpenStreetMap). Sin internet se usa línea recta por un factor.
- **¿Cómo saben que los resultados son correctos?** Los 34 modelos dan el mismo óptimo que el GAMS escrito a mano; las heurísticas nunca superan el óptimo y sus rutas cumplen todas las restricciones; toda solución mostrada se verifica (cada cliente una vez, capacidad, costo recalculado). Son 17 pruebas automáticas.
- **¿Corrieron los .gms en GAMS?** Se verificaron con un intérprete propio del subconjunto de GAMS más HiGHS. (Si los corriste esta noche en GAMS Studio, dilo: «y los corrimos en GAMS Studio».)

---

## 8. Plan de tiempo (si te dan 35 min)

| Bloque | Láminas | Tiempo |
|---|---|---|
| Introducción y lo visto en clase | 1–5 | 2 min |
| Modelos y GAMS | 6–23 | 12 min (explica bien la 15: CVRP en GAMS) |
| Algoritmos | 24–49 | 11 min (detente en 2-opt, tabú, recocido y branch and bound) |
| Demo de la app | — | 6–8 min (pasos 1–4 y 6) |
| Ejemplos, conclusiones | 51–58 | 3 min |
| Preguntas | — | el resto |

Con 15 min: usa `Guion_15min.md` y en la demo haz solo los pasos 2 y 3 (CVRP y Comparar).
