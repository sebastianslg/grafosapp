# Guion de la exposición · 58 diapositivas · ~35 min (una sola persona)

Tiempo total de habla ≈ 30 min 0 s (con transiciones, ~35 min). **Estudio:** lee una vez en voz alta (15 min) y repasa solo las negritas (10 min); ensaya sin mirar las láminas del pseudocódigo (tabú, recocido) y de GAMS (CVRP, VRPTW).

Las láminas de pseudocódigo se explican **línea por línea**: cita el número de línea y di qué hace, con las frases en negrita.


## Introducción

**1 · Portada (10 s · acum. 0:10).** Buenos días. Soy Juan Sebastián Salas. Presento los modelos de las variantes del VRP, **cómo se resuelven con algoritmos y pseudocódigo**, y la herramienta que construí con sus pruebas.

**2 · Agenda (10 s · acum. 0:20).** A: lo visto en clase. B: otros modelos. C: algoritmos heurísticos y metaheurísticos con pseudocódigo. D: ejemplos, la herramienta con **27 variantes, 11 algoritmos, código GAMS y pruebas**.

**3 · Por qué importa (20 s · acum. 0:40).** El transporte pesa entre el **6 y el 7 % del precio** de los productos y el **40–60 % de los costos logísticos**; la logística es cerca del 8 % del PIB de EE. UU. Mejorar rutas es la palanca más grande de costos.


## A · Lo visto en clase

**4 · Repaso: de TSP a VRPTW (35 s · acum. 1:15).** **TSP**: un viajante entra y sale una vez de cada cliente; MTZ evita subtours. **mTSP**: m viajantes desde el depósito. **CVRP**: agrega capacidad. **VRPTW**: agrega ventanas de tiempo con una M grande. Las otras variantes son este núcleo más una restricción.

**5 · Notación común (20 s · acum. 1:35).** N clientes, K vehículos, costo c, tiempo t, demanda d, capacidad Q y **x(i,j,k) = 1 si el vehículo k va de i a j**.


## B · Modelos matemáticos, código GAMS y pruebas

**6 · OVRP · ruteo abierto (35 s · acum. 2:10).** El vehículo termina en su último cliente: **se eliminan los arcos de regreso**. Ej.: rutas escolares y transportistas externos.

**7 · DCVRP · distancia máxima (30 s · acum. 2:40).** Además de capacidad, **tope de distancia L por ruta**. Ej.: mensajería con 8 horas máximas.

**8 · HFVRP · flota heterogénea (35 s · acum. 3:15).** Cada tipo de vehículo con **capacidad, costo fijo y costo por km**; el modelo decide cuántos usar de cada uno.

**9 · MDVRP · varios depósitos (30 s · acum. 3:45).** **Varios depósitos**; cada ruta sale y vuelve al suyo. Ej.: supermercados con bodegas regionales.

**10 · LRP · localizar y rutear (40 s · acum. 4:25).** Se agrega una **variable binaria para abrir cada depósito**, con costo fijo. Ej.: dónde ubicar el CD de las tiendas ARA; lo resolvemos más adelante.

**11 · VRPPD y SDVRP (40 s · acum. 5:05).** Recoger y entregar: **misma ruta y la recogida primero**. Entrega dividida: un cliente con más demanda que un vehículo se atiende entre varios.

**12 · Otras variantes (30 s · acum. 5:35).** Con **tráfico**, **dos niveles**, flota propia y tercerizada, abiertas y cerradas, estocásticas y con drones: cada una cambia un elemento del modelo.

**13 · 27 variantes (1/2) (30 s · acum. 6:05).** La herramienta resuelve **27 variantes** con una misma formulación: del TSP y el mTSP a CVRP, distancia máxima, mínima flota y ventanas de tiempo.

**14 · 27 variantes (2/2) (30 s · acum. 6:35).** Las otras: flota heterogénea, **varios depósitos, LRP, backhauls, recoger-entregar, entrega dividida**, y los selectivos: con beneficios y orienteering.

**15 · GAMS · modelo base CVRP (70 s · acum. 7:45).** El modelo en GAMS: **x de arco por vehículo, y de visita, v de uso**. Cobertura, conservación de flujo, capacidad y **MTZ**. Las demás variantes cambian pocas líneas. *GAMS no se ejecutó aquí: se verificó el modelo equivalente en HiGHS.*

**16 · GAMS · abierto, distancia, balanceo (55 s · acum. 8:40).** OVRP: **costo cero del arco de regreso**. DCVRP: **distancia máxima por vehículo**. Balanceado: **piso y techo de clientes** por ruta.

**17 · GAMS · ventanas y costo fijo (55 s · acum. 9:35).** VRPTW: variable de **hora de llegada t** con M grande. FSMVRP: **costo fijo** por vehículo usado en el objetivo.

**18 · GAMS · depósitos y LRP (55 s · acum. 10:30).** Varios depósitos: el conjunto **kd** liga vehículo y depósito. LRP: **variable de apertura op** y solo salen vehículos de depósitos abiertos.

**19 · GAMS · backhauls y simultáneo (55 s · acum. 11:25).** Backhauls: **sin arcos de recogida a entrega** y dos capacidades. Simultáneo: **carga l** que baja al entregar y sube al recoger.

**20 · GAMS · pares y entrega dividida (55 s · acum. 12:20).** Pares: **mismo vehículo y la recogida primero**. Entrega dividida: **q reparte la demanda** entre vehículos y el MTZ es por vehículo.

**21 · GAMS · beneficios y orienteering (45 s · acum. 13:05).** No es obligatorio visitar a todos: se maximiza **premio − costo**; en orienteering, el premio con **distancia máxima por ruta**.

**22 · Prueba de los modelos (1/2) (40 s · acum. 13:45).** Cada modelo se probó en una instancia de **7 nodos contra fuerza bruta** (todas las asignaciones y rutas): **coinciden las 14 primeras**.

**23 · Prueba de los modelos (2/2) (30 s · acum. 14:15).** Las 13 restantes también coinciden. La **entrega dividida** se verificó: su costo es **menor o igual al del CVRP** y se reparte toda la demanda.


## C · Algoritmos: heurísticas, metaheurísticas y exactos

**24 · Divisor C (5 s · acum. 14:20).** ¿Cómo se resuelven cuando son muy grandes?

**25 · ¿Por qué no basta lo exacto? (30 s · acum. 14:50).** El VRP es **NP-difícil**: las rutas crecen factorialmente. En la práctica hay miles de clientes y poco tiempo: una buena solución rápida vale más que el óptimo tarde. Heurísticas simples (60–70), programación matemática (70–80), metaheurísticas (desde 1980).

**26 · Mapa de métodos (20 s · acum. 15:10).** Exactos (branch and bound), heurísticas (constructivas y mejora local), metaheurísticas (trayectoria y poblacionales) e híbridos.

**27 · Cómo leer el pseudocódigo (25 s · acum. 15:35).** La **flecha es asignación**, *mientras* y *para cada* son ciclos, *argmin* es el elemento de menor valor. Todos usan depósito 0, clientes, costos c, demandas d y capacidad Q.

**28 · Vecino más cercano (35 s · acum. 16:10).** Línea 1: ruta con el depósito y carga cero. Línea 3: **candidatos = clientes sin visitar a los que aún les cabe la carga**. Líneas 4–6: si no hay, vuelvo al depósito y abro ruta nueva. Líneas 7–10: voy al **más cercano (argmin)**, sumo su demanda y lo marco. Rápido, pero el final queda largo.

**29 · Barrido (30 s · acum. 16:40).** Línea 1: **ángulo de cada cliente**. Línea 2: ordeno. Líneas 4–7: agrego en orden y **cuando se llena el vehículo cierro la ruta**. Líneas 8–9: cada grupo con un TSP pequeño.

**30 · Inserción más barata (35 s · acum. 17:15).** Semilla: el cliente más lejano. Para cada cliente k y cada par (i,j) consecutivo: **costo de insertar = c(i,k) + c(k,j) − c(i,j)**. Escojo el de menor aumento que respete capacidad y ventanas; si no cabe, abro ruta nueva.

**31 · 2-opt (35 s · acum. 17:50).** Mejora local: para cada par de arcos calculo **Δ = arcos nuevos − arcos viejos**. Si Δ < 0, **invierto el tramo del medio**, que quita el cruce. Repito hasta que nada mejore: **óptimo local**.

**32 · Relocate y swap (30 s · acum. 18:20).** Entre rutas: **relocate** pasa un cliente a otra ruta; **swap** intercambia dos. Acepto solo si **Δ < 0 y se respeta la capacidad**.

**33 · Cuatro metaheurísticas (25 s · acum. 18:45).** Las heurísticas se quedan en óptimos locales; las **metaheurísticas** saben salir: tabú (memoria), recocido (acepta peores), genético (población), hormigas (feromona).

**34 · Búsqueda tabú · pseudocódigo (45 s · acum. 19:30).** Línea 3: **vecinos** con 2-opt, relocate y swap. Líneas 4–6: el **mejor vecino no prohibido**, o que mejore al mejor global (**aspiración**). Líneas 7–9: me muevo **aunque empeore** y anoto el movimiento en la lista tabú.

**35 · Tabú · ejemplo (25 s · acum. 19:55).** En la iteración 3 el mejor vecino **empeora** (44,1 → 45,3) pero se acepta porque lo anterior está prohibido; en la 4 llega a 43,0. Así sale del óptimo local. Valores ilustrativos.

**36 · Recocido simulado · pseudocódigo (40 s · acum. 20:35).** Solución inicial y **temperatura alta T₀**. Vecino al azar y Δ. **Si Δ ≤ 0 lo acepto; si empeora, con probabilidad e^(−Δ/T)**. Enfrío: **T = α·T, con α ≈ 0,95**.

**37 · Recocido · gráfico (20 s · acum. 20:55).** A **mayor T, mayor probabilidad** de aceptar un empeoramiento; y un Δ grande (20 km) es mucho menos probable que uno pequeño (5 km).

**38 · Algoritmo genético · pseudocódigo (40 s · acum. 21:35).** Población de **permutaciones de clientes**; cada una se corta por capacidad. Padres por **torneo**, **cruce OX**, **mutación** por intercambio y **elitismo**: me quedo con los N mejores entre padres e hijos.

**39 · Colonia de hormigas · pseudocódigo (40 s · acum. 22:15).** Feromona τ y **visibilidad η = 1/costo**. Cada hormiga elige j con **probabilidad ∝ τ^α · η^β**. **Evaporo** con ρ y cada ruta **deposita Q/costo**: las cortas dejan más feromona.

**40 · Genético y hormigas · visual (20 s · acum. 22:35).** Cruce OX: copio un tramo del padre A (3,4,5) y completo con el orden del padre B; hijo = 6,1,3,4,5,2.

**41 · GRASP y VNS (30 s · acum. 23:05).** **GRASP**: construcción voraz con azar (lista RCL) + búsqueda local, repetida. **VNS**: al estancarse **cambia de vecindario**. **ALNS** (destruir y reparar) es el estado del arte.

**42 · Branch and bound (35 s · acum. 23:40).** Método **exacto** del solver: resuelvo la **relajación lineal**; si es infactible o no mejora la cota, **poda**; si es entera, actualizo; si no, **ramifico x=0 / x=1**. De ahí sale el **gap**.

**43 · Exactos y matheurísticas (25 s · acum. 24:05).** Los exactos **garantizan el óptimo pero escalan poco**. Las matheurísticas usan el solver dentro de una búsqueda.

**44 · Parámetros por método (15 s · acum. 24:20).** Cada método tiene sus perillas; se ajustan **probando con casos parecidos a los reales**.

**45 · ¿Cuándo usar cada enfoque? (20 s · acum. 24:40).** **Exacto**: pocos clientes y óptimo probado. **Heurística**: rápida. **Metaheurística**: mejor calidad. **Heurística para empezar, metaheurística para mejorar, exacto para validar.**

**46 · Guía de decisión (20 s · acum. 25:00).** ¿Pocos clientes y necesito el óptimo? **Exacto**. Si no: heurística, metaheurística o matheurística. 25 puntos: exacto; 2 000 pedidos: combinar.

**47 · Tres formas de resolver (25 s · acum. 25:25).** Para cada variante se elige: **modelo matemático**, **heurística** o **metaheurística**, o comparar todos. **Gap = (costo − mejor cota) / costo**; la cota la da el modelo matemático.

**48 · 11 algoritmos (20 s · acum. 25:45).** **Cinco heurísticas y seis metaheurísticas**: vecino, ahorros, barrido, inserción, VND; recocido, tabú, genético, hormigas, GRASP y VNS.

**49 · Prueba de heurísticas (25 s · acum. 26:10).** Las 11 se compararon con el óptimo sobre las mismas instancias. Las **metaheurísticas alcanzan el óptimo en la mayoría** de las variantes.


## D · Ejemplos y la herramienta

**50 · Divisor D (5 s · acum. 26:15).** Ahora, la herramienta y los resultados con 25 tiendas ARA de Cali.

**51 · Ejemplo 1 · TSP (30 s · acum. 26:45).** 26 nodos, modelo MTZ del curso: **72,048 km, óptimo probado**, ruta sobre calles reales.

**52 · Ejemplo 2 · mTSP (35 s · acum. 27:20).** Dos supervisores. Sin límites: 72,4 km pero 24 y 1 tiendas, injusto. Balanceado 12–13: **+3,2 km**. Minimizar la ruta más larga: la peor jornada baja de 71 a 40 km.

**53 · Ejemplo 3 · flota y ventanas (30 s · acum. 27:50).** Camión (cap. 5) y tractocamión (34): **dos camiones llenos y el tractocamión con 4**. Con ventanas, **todas las llegadas caen en su franja**.

**54 · Ejemplo 4 · LRP (30 s · acum. 28:20).** El CD es una decisión: mal ubicado **93,6 km**; óptimo **72,4 km (−22,7 %)**; para cada candidato se resolvió el TSP exacto.

**55 · La herramienta (30 s · acum. 28:50).** Mientras resuelve muestra **mejor solución, cota y gap**; se puede **parar cuando uno quiera**; simula los vehículos con Gantt.

**56 · Comparación en Cali (35 s · acum. 29:25).** CVRP con 25 tiendas y 2 vehículos de capacidad 15. El modelo con 8 s da 87,83 pero **cota 69,07**. Seis métodos llegan a **74,87–75,02 km en menos de 2 s**: brecha 7,8 %, que es lo que se puede **garantizar** con esa cota.


## Cierre

**57 · Conclusiones (30 s · acum. 29:55).** Un mismo núcleo; modelos pequeños, aplicaciones grandes; el exacto da el óptimo pero escala poco, las metaheurísticas escalan; en la práctica se combinan: **heurística para empezar, metaheurística para mejorar y exacto para validar**.

**58 · Referencias (5 s · acum. 30:00).** Referencias en APA. Gracias; quedo atento a preguntas.


## Si te preguntan

- **¿Qué es el gap?** (mejor solución − mejor cota) / mejor solución. Con 0 % el óptimo está probado.
- **¿MTZ o DFJ?** MTZ es un solo modelo y es el del curso; DFJ agrega cortes por iteraciones y suele ser más rápido.
- **¿Una heurística garantiza el óptimo?** No. Clarke-Wright acertó en el ejemplo, pero no siempre.
- **¿Qué es un óptimo local?** Una solución que ningún cambio pequeño (2-opt, relocate) mejora, pero que puede no ser la mejor global.
- **¿Qué es NP-difícil?** Que no se conoce un algoritmo que resuelva todos los casos en tiempo polinomial.
- **¿Por qué aceptar soluciones peores?** Para salir de óptimos locales: en tabú y recocido se permite empeorar a propósito.
