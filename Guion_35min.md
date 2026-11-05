# Guion de la exposición · 46 diapositivas · ~35 min (una sola persona)

Tiempo total de habla ≈ 31 min 20 s (con transiciones, ~35 min). **Estudio:** lee una vez en voz alta (15 min) y repasa solo las negritas (10 min); ensaya sin mirar las láminas de pseudocódigo 18, 19, 20, 26, 28 y 34.

Las láminas de pseudocódigo se explican **línea por línea**: cita el número de línea y di qué hace, con las frases en negrita.


## Introducción

**1 · Portada (15 s · acum. 0:15).** Buenos días. Soy Juan Sebastián Salas. Hoy presento los modelos matemáticos de las variantes del problema de ruteo de vehículos y, sobre todo, **cómo se resuelven: los algoritmos con su pseudocódigo**.

**2 · Agenda (15 s · acum. 0:30).** Cuatro bloques: **A**, lo visto en clase; **B**, otros modelos matemáticos; **C**, algoritmos heurísticos y metaheurísticos con su pseudocódigo; y **D**, ejemplos resueltos con optimización exacta.

**3 · Por qué importa (30 s · acum. 1:00).** El transporte pesa entre el **6 y el 7 % del precio** final de los productos y genera entre el **40 y el 60 % de los costos logísticos**. La logística es cerca del 8 % del PIB de Estados Unidos. Mejorar rutas es la palanca de costos más grande de la cadena.


## A · Lo visto en clase

**4 · Repaso: de TSP a VRPTW (50 s · acum. 1:50).** Cuatro modelos de clase. **TSP**: un viajante entra y sale una vez de cada cliente; MTZ evita subtours. **mTSP**: m viajantes salen del depósito, m salen y m regresan. **CVRP**: agrega la capacidad del vehículo. **VRPTW**: agrega ventanas de tiempo, con una restricción de tiempo con M grande. Los otros modelos son este núcleo más una restricción.

**5 · Notación común (30 s · acum. 2:20).** Notación única: N clientes, K vehículos, costo c, tiempo t, demanda d, capacidad Q y la variable **x(i,j,k), que vale 1 si el vehículo k va de i a j**. Con esto escribimos todas las variantes.


## B · Modelos matemáticos de las variantes

**6 · OVRP · ruteo abierto (30 s · acum. 2:50).** El vehículo termina en su último cliente y **no regresa al depósito**; se eliminan los arcos de regreso. Aplicación: transportistas externos y rutas escolares.

**7 · DCVRP · distancia máxima (25 s · acum. 3:15).** Además de capacidad, cada ruta tiene un **tope de distancia o jornada L**. Aplicación: mensajería con máximo 8 horas por conductor.

**8 · HFVRP · flota heterogénea (30 s · acum. 3:45).** Cada tipo de vehículo tiene **capacidad, costo fijo y costo por km** propios y una cantidad disponible; el modelo decide cuántos usar de cada tipo. Ejemplo: camiones de reparto y un tractocamión.

**9 · MDVRP · varios depósitos (25 s · acum. 4:10).** **Varios depósitos**: cada ruta sale y vuelve al suyo, y el modelo asigna clientes a depósitos. Ejemplo: supermercados con bodegas regionales.

**10 · LRP · localizar y rutear (35 s · acum. 4:45).** **Localización y ruteo a la vez**: se agrega una variable binaria para abrir cada depósito, con costo fijo y capacidad. Ejemplo real: dónde poner el centro de distribución de las tiendas ARA en Cali; lo resolvemos al final.

**11 · VRPPD y SDVRP (35 s · acum. 5:20).** Recogidas y entregas: el mismo vehículo **recoge antes de entregar**, con precedencia y carga acumulada. Entrega dividida: un cliente con más demanda que un vehículo se atiende entre varios. Aplicaciones: mensajería, taxis compartidos y carga a granel.

**12 · Otras variantes (35 s · acum. 5:55).** Hay más: **tráfico** (tiempos que cambian con la hora), **dos niveles**, flota propia y tercerizada, abiertas y cerradas, estocásticas con demanda incierta, y con drones. Cada una cambia una cosa del modelo y tiene su aplicación.

**13 · Resumen de variantes (20 s · acum. 6:15).** Esta tabla resume el bloque: cada variante **agrega una restricción o una variable** al núcleo.


## C · Algoritmos: heurísticas, metaheurísticas y exactos

**14 · Divisor C (10 s · acum. 6:25).** Pasemos a la pregunta clave: ¿cómo se resuelven cuando son demasiado grandes?

**15 · ¿Por qué no basta lo exacto? (45 s · acum. 7:10).** El VRP es **NP-difícil**: generaliza el TSP y el número de rutas crece factorialmente. En la práctica hay miles de clientes y poco tiempo, y una buena solución rápida vale más que el óptimo tarde. Históricamente: heurísticas simples en los 60–70, programación matemática en los 70–80, metaheurísticas e inteligencia artificial desde 1980.

**16 · Mapa de métodos (35 s · acum. 7:45).** Cuatro familias: **exactos** (branch and bound, cut y price), **heurísticas** (constructivas y de mejora local), **metaheurísticas** (de trayectoria y poblacionales) e **híbridos** o matheurísticas. Ahora veremos el algoritmo de cada una.

**17 · Cómo leer el pseudocódigo (40 s · acum. 8:25).** Antes, cómo leer el pseudocódigo: la **flecha es asignación**, *mientras* y *para cada* son ciclos, *si / si no* es una decisión, *argmin* es el elemento de menor valor y el símbolo vacío es el conjunto vacío. Todos usan el mismo núcleo: depósito 0, clientes, costos c, demandas d y capacidad Q.

**18 · Vecino más cercano (60 s · acum. 9:25).** Línea 1: la ruta empieza en el depósito con carga cero. Línea 2: mientras queden clientes. Línea 3: **candidatos son los clientes sin visitar a los que aún les cabe la carga**. Líneas 4–6: si no hay candidatos, vuelvo al depósito y abro ruta nueva. Líneas 7–10: si no, voy al **candidato más cercano** (argmin de la distancia), sumo su demanda y lo marco. Es muy rápido, pero el final de la ruta suele quedar largo.

**19 · Clarke-Wright · pseudocódigo (70 s · acum. 10:35).** Línea 1: cada cliente empieza con su **propia ruta depósito–cliente–depósito**. Líneas 2–3: calculo para cada par el **ahorro s = c(0,i) + c(0,j) − c(i,j)**: lo que ahorro al unir i y j en una sola ruta. Línea 4: ordeno los ahorros de mayor a menor. Líneas 5–9: recorro los pares y los **uno si están en rutas distintas, son extremos de sus rutas y la carga total cabe en Q**. Es la heurística constructiva más usada para el CVRP.

**20 · Clarke-Wright · ejemplo (70 s · acum. 11:45).** Ejemplo: seis clientes, **Q = 10**. Los ahorros ordenados son 1–2 (7,24), 3–4 (5,96), 2–3 (4,47) y 5–6 (3,16). Uno 1–2 con carga 7; uno 3–4 con carga 8; **2–3 no cabe porque sumaría 15**; uno 5–6 con carga 7. Resultado: tres rutas, **distancia 39,32**. Lo verifiqué con fuerza bruta y es el óptimo; aquí la heurística acertó, pero no siempre pasa.

**21 · Barrido (sweep) (50 s · acum. 12:35).** Línea 1: calculo el **ángulo de cada cliente** respecto al depósito. Línea 2: los ordeno por ángulo. Líneas 4–7: voy agregando clientes en ese orden y, **cuando se llena el vehículo, cierro la ruta y abro otra**. Líneas 8–9: cada grupo lo ordeno resolviendo un TSP pequeño. Funciona bien si los clientes rodean el depósito.

**22 · Inserción más barata (55 s · acum. 13:30).** Línea 1: arranco con un cliente semilla, el más lejano. Líneas 3–4: para cada cliente k y cada par consecutivo (i, j) de la ruta calculo el **costo de insertarlo: c(i,k) + c(k,j) − c(i,j)**. Línea 5: escojo el de **menor aumento** que respete capacidad y ventanas de tiempo. Si no cabe ninguno, abro ruta nueva. Admite ventanas de tiempo.

**23 · 2-opt (60 s · acum. 14:30).** Es una **mejora local**: parte de una ruta existente. Para cada par de arcos calculo **Δ = costo de los dos arcos nuevos − costo de los dos arcos viejos**. Si Δ es negativo, **invierto el tramo del medio**, que elimina el cruce. Repito mientras haya mejora; termina en un **óptimo local**, no necesariamente el global.

**24 · Relocate y swap (50 s · acum. 15:20).** Trabajan entre rutas. **Relocate** pasa un cliente k de la ruta A a otra posición de la ruta B; **swap** intercambia dos clientes. Calculo Δ como el costo nuevo de las dos rutas menos el viejo. Solo acepto si **Δ < 0 y la ruta respeta la capacidad**. Repito hasta que nada mejore.

**25 · Cuatro metaheurísticas (40 s · acum. 16:00).** Las heurísticas se quedan en óptimos locales; las **metaheurísticas** saben salir. **Tabú**: mejora local con memoria. **Recocido**: acepta peores con probabilidad que baja. **Genético**: población con cruce y mutación. **Hormigas**: feromona que guía a las siguientes.

**26 · Búsqueda tabú · pseudocódigo (70 s · acum. 17:10).** Línea 1: solución inicial, la mejor, y lista tabú vacía. Línea 3: genero los **vecinos** con 2-opt, relocate y swap. Líneas 4–6: elijo el **mejor vecino cuyo movimiento no esté en la lista tabú**, o que lo mejore al mejor global: eso es el **criterio de aspiración**. Línea 7–9: me muevo ahí, **aunque empeore**, y anoto el movimiento en la lista, olvidando el más antiguo. Línea 10: guardo la mejor solución vista. Parámetros: tamaño de la lista e iteraciones.

**27 · Tabú · ejemplo (40 s · acum. 17:50).** En la tabla: en la iteración 3 el mejor vecino **empeora** de 44,1 a 45,3, pero se acepta porque los movimientos anteriores están prohibidos; en la 4 llega a 43,0, mejor que todo lo anterior. Así sale del óptimo local. Los valores son ilustrativos.

**28 · Recocido simulado · pseudocódigo (65 s · acum. 18:55).** Línea 1: solución inicial y **temperatura alta T₀**. Línea 4: tomo un vecino al azar y calculo Δ. Línea 6: **si Δ ≤ 0 lo acepto; si empeora, lo acepto con probabilidad e^(−Δ/T)**. Línea 9: **enfrío multiplicando por α, cerca de 0,95**. Con T alta exploro casi todo; con T baja solo acepto mejoras. Parámetros: T inicial, α y repeticiones por temperatura.

**29 · Recocido · gráfico (35 s · acum. 19:30).** La gráfica muestra la probabilidad de aceptar un empeoramiento según la temperatura: **a mayor T, mayor probabilidad; y un empeoramiento grande (Δ = 20 km) es mucho menos probable que uno pequeño (Δ = 5)**.

**30 · Algoritmo genético · pseudocódigo (60 s · acum. 20:30).** Línea 1: población de N **permutaciones de clientes**. Cada generación: evalúo el costo cortando la permutación por capacidad (líneas 3–4). Línea 7: elijo dos padres por **torneo**. Línea 8: **cruce OX**. Línea 9: con baja probabilidad **muto** intercambiando dos clientes. Línea 11: me quedo con los N mejores entre padres e hijos: **elitismo**.

**31 · Colonia de hormigas · pseudocódigo (65 s · acum. 21:35).** Línea 1: feromona τ inicial en todos los arcos y **visibilidad η = 1/costo**. Líneas 3–7: cada hormiga construye una ruta; desde i elige j con **probabilidad proporcional a τ^α · η^β**. Línea 8: **evaporo** la feromona con ρ. Línea 10: cada hormiga **deposita Q dividido por el costo** de su ruta: las rutas cortas dejan más. Así se refuerzan los buenos arcos.

**32 · Genético y hormigas · visual (35 s · acum. 22:10).** Aquí el cruce OX: copio un tramo del padre A (3, 4, 5) y completo el resto con el orden del padre B; el hijo es 6, 1, 3, 4, 5, 2. A la derecha, las fórmulas de las hormigas ya vistas.

**33 · GRASP y VNS (50 s · acum. 23:00).** **GRASP**: construye muchas soluciones voraces con azar, eligiendo entre los mejores candidatos (lista RCL), las mejora con búsqueda local y guarda la mejor. **VNS**: cuando la búsqueda local se estanca, **cambia de vecindario** a uno mayor y vuelve a intentar. **ALNS**, destruir y reparar, es el estado del arte en VRP con muchas restricciones.

**34 · Branch and bound (55 s · acum. 23:55).** Es el método **exacto** y lo que hace el solver. Línea 1: lista con el problema original y cota superior infinita. Líneas 3–4: tomo un subproblema y resuelvo su **relajación lineal**. Línea 5: **si es infactible o su valor no mejora la cota, lo descarto (poda)**. Líneas 6–7: si la solución es entera, actualizo la cota. Líneas 8–10: si no, **ramifico en x=0 y x=1** sobre una variable fraccionaria. Con esto la herramienta calcula el **gap**.

**35 · Exactos y matheurísticas (40 s · acum. 24:35).** Los exactos (B&B, branch and cut con cortes de subtours, branch and price) **garantizan el óptimo pero escalan poco**. Las matheurísticas usan el solver dentro de una búsqueda, por ejemplo fijando parte de la solución y resolviendo el resto con el modelo.

**36 · Parámetros por método (30 s · acum. 25:05).** Cada método tiene sus perillas: el tamaño de la lista en tabú; temperatura y enfriamiento en recocido; población y mutación en genético; α, β y evaporación en hormigas. Se ajustan **probando con casos parecidos a los reales**.

**37 · ¿Cuándo usar cada enfoque? (35 s · acum. 25:40).** **Exacto**: óptimo probado, decenas o pocos cientos de clientes. **Heurística**: segundos, miles de clientes. **Metaheurística**: muy buena calidad, de segundos a minutos. Regla: **heurística para empezar, metaheurística para mejorar y exacto para validar**.

**38 · Guía de decisión (30 s · acum. 26:10).** ¿Pocos clientes y necesito probar el óptimo? **Modelo exacto**. Si no: heurística constructiva con mejora local, metaheurística o matheurística. Una tienda con 25 puntos usa exacto; una distribuidora con 2 000 pedidos combina métodos.


## D · Ejemplos resueltos y cierre

**39 · Divisor D (10 s · acum. 26:20).** Veamos ahora las fórmulas del curso funcionando en 25 tiendas ARA de Cali, con una herramienta propia basada en HiGHS.

**40 · Ejemplo 1 · TSP (45 s · acum. 27:05).** Un supervisor visita 25 tiendas desde el centro de distribución: 26 nodos. Con el modelo del curso, ecuaciones 1 a 3 con MTZ, el resultado es **72,048 km con óptimo probado**. La ruta está dibujada sobre las calles reales.

**41 · Ejemplo 2 · mTSP (55 s · acum. 28:00).** Dos supervisores, tres formas de repartir. **Sin límites**: 72,4 km, pero uno visita 24 tiendas y el otro 1: barato e injusto. **Balanceado** 12 y 13: cuesta 3,2 km más y reparte bien. **Minimizar la ruta más larga**: la peor jornada baja de 71 a 40 km.

**42 · Ejemplo 3 · flota y ventanas (45 s · acum. 28:45).** Camión de reparto con capacidad 5 y tractocamión con 34. Con 14 clientes de peso 1, el óptimo usa **dos camiones llenos y un tractocamión con 4**. Con ventanas de tiempo, comprobé que **todas las llegadas caen dentro de su franja** y ninguna carga supera la capacidad.

**43 · Ejemplo 4 · LRP (50 s · acum. 29:35).** El CD no es un dato: se decide. Con el CD mal ubicado el recorrido es **93,6 km**; con la ubicación óptima entre los candidatos baja a **72,4 km, un 22,7 % menos**. Para cada candidato se resolvió el TSP exacto.

**44 · La herramienta (50 s · acum. 30:25).** Resuelve solo con optimización. Mientras corre muestra la **mejor solución, la cota y el gap**; se puede **parar cuando uno quiera** y ver la mejor solución hasta ahí. También simula los vehículos por las calles y genera un diagrama de Gantt.

**45 · Conclusiones (45 s · acum. 31:10).** Uno: **un mismo núcleo**, todas las variantes agregan restricciones o variables. Dos: modelos pequeños, aplicaciones grandes. Tres: el exacto da el óptimo pero escala poco; las metaheurísticas escalan con buena calidad. Cuatro: **heurística para empezar, metaheurística para mejorar y exacto para validar**.

**46 · Referencias (10 s · acum. 31:20).** Las referencias están en formato APA. Gracias; quedo atento a preguntas.


## Si te preguntan

- **¿Qué es el gap?** (mejor solución − mejor cota) / mejor solución. Con 0 % el óptimo está probado.
- **¿MTZ o DFJ?** MTZ es un solo modelo y es el del curso; DFJ agrega cortes por iteraciones y suele ser más rápido.
- **¿Una heurística garantiza el óptimo?** No. Clarke-Wright acertó en el ejemplo, pero no siempre.
- **¿Qué es un óptimo local?** Una solución que ningún cambio pequeño (2-opt, relocate) mejora, pero que puede no ser la mejor global.
- **¿Qué es NP-difícil?** Que no se conoce un algoritmo que resuelva todos los casos en tiempo polinomial.
- **¿Por qué aceptar soluciones peores?** Para salir de óptimos locales: en tabú y recocido se permite empeorar a propósito.
