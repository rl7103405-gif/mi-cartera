# Mi Cartera — contexto del proyecto

PWA de finanzas personales de Roberto, hosteada en GitHub Pages. Repo: `rl7103405-gif/mi-cartera`. App en vivo: `https://rl7103405-gif.github.io/mi-cartera`.

## Stack

- **HTML/CSS/JS puro en un solo archivo `index.html`** (~8,100 líneas al 24/09/2026). Sin frameworks, sin build process, sin bundler, sin npm. Todo va directo a GitHub Pages tal cual está en el repo.
- **Firebase Firestore** para sincronización en la nube entre dispositivos.
- **Firebase Authentication** (email/password) para login.
- Archivos del repo: `index.html`, `manifest.json`, `sw.js` (service worker), `icon-192.png`, `icon-512.png`.

### Firebase del proyecto

- Project ID: `mi-cartera-b43e0`
- Auth domain: `mi-cartera-b43e0.firebaseapp.com`
- API Key: `AIzaSyAe5O2FiGD3dHK7F9fc485BjaaiN99Zzd4`
- App ID: `1:31404911125:web:7d01272350b6a2271bbc1c`
- **Usuario autorizado (único):** `rl7103405@gmail.com` — hardcoded como `ALLOWED_EMAIL` en el JS. Esto NO es una regla de seguridad real de Firestore, es solo un gate en la UI. Ojo con esto si algún día se vuelve multiusuario (ver sección "Planes futuros").

## Historia de este proyecto (para que tengas contexto completo)

Este archivo se generó tras varias sesiones de trabajo con Claude en modo web/CLI. Así fue evolucionando:

**Estado inicial (antes de estas sesiones):** la app ya tenía login con Firebase Auth, sincronización entre dispositivos, punto verde/rojo de sync en el nav, PWA instalable, GBM con fallback de precio, historial de deudas, resumen mensual navegable. 5 pestañas: Inicio, Gastos, Ingresos, Deudas, Resumen.

**Sesión 1 — transferencias, gráficas GBM, rendimientos en resumen:**
- Se agregó una sección de **transferencias entre cuentas** (efectivo, NU saldo, cajita 1, cajita 2, GBM efectivo, pago a tarjeta) porque antes solo se podían registrar gastos/ingresos, no mover dinero entre las propias cuentas.
- El fetch de Yahoo Finance para IVVPESO se cambió de `range=2d` a `range=6mo` para tener historial real de precios.
- Se agregaron gráficas SVG (sparkline tipo polyline) para el valor de GBM y el patrimonio total, con snapshots diarios guardados en Firestore.
- Se agregó un panel de "rendimientos del mes" en Resumen (cajita 1, cajita 2, GBM, balance real = ingresos − gastos + rendimientos).
- Bugs corregidos: un ingreso con destino "GBM" no sumaba a ninguna cuenta (se perdía el dinero); las fechas `YYYY-MM-DD` se parseaban como UTC y causaban que la cajita 1 sumara de más el mismo día que se actualizaba (bug de timezone, México vs UTC) — se creó `parseFechaLocal()` para arreglarlo.
- **Problema de despliegue importante:** al subir varios archivos por separado vía la interfaz web de GitHub (subir, renombrar, borrar, subir de nuevo...) se generó un atasco de ~9 deployments de GitHub Pages en cola ("queued") que bloqueaban la publicación. Se resolvió reiniciando la fuente de Pages en Settings → Pages (cambiar branch a "None" y de vuelta a "main"). **Lección aprendida: subir siempre en un solo commit** para no volver a saturar la cola de Pages.
- El service worker (`sw.js`) usaba estrategia cache-first con versión fija (`cartera-v1`), lo que causaba que los usuarios vieran siempre la versión vieja cacheada sin importar que el repo se actualizara. Se cambió a **network-first para el HTML** (siempre intenta bajar versión fresca, cae a caché solo offline) y se subió la versión a `cartera-v2`.

**Sesión 2 — transferencias avanzadas, resumen por periodo, categorías personalizadas, cajitas con interés compuesto real:**
- **Pago de tarjeta NU con origen:** al pagar la tarjeta, ahora se elige de qué cuenta sale el dinero (NU saldo, efectivo, cajitas, GBM, o "externo" si no se quiere descontar de ninguna cuenta trackeada). Se descuenta de la cuenta origen y queda registrado también como transferencia.
- **Resumen por día/semana/mes/año:** toggle de periodo que aplica a gastos, ingresos, balance y rendimientos (con cálculo de rango de fechas real, no solo mes calendario).
- **Gráficas de pastel (donut SVG) con porcentajes:** "a dónde se va tu dinero" (gastos por categoría) y "de dónde viene tu dinero" (ingresos por categoría).
- **Eliminar movimientos:** botón × en gastos, ingresos y transferencias para borrar registros hechos por error. Al borrar, el dinero se revierte a su cuenta original y se elimina el documento de Firestore (se empezó a guardar el `id` del documento de Firestore en cada item para poder hacer `deleteDoc`).
- **Categorías personalizadas:** los selects de categoría de gastos e ingresos dejaron de ser listas fijas en HTML — ahora tienen una opción "+ agregar categoría..." que pide el nombre por `prompt()`, lo guarda en Firestore (`cartera/categorias`) y se sincroniza entre dispositivos.
- **Refactor grande de las cajitas NU (el cambio más importante técnicamente):** originalmente Cajita 1 sumaba **$9.03 fijos por día** (un valor hardcoded que ya no correspondía a la realidad) y Cajita 2 usaba **6% anual hardcoded**. Roberto reportó una discrepancia de $0.07 entre lo que mostraba la app y lo que mostraba la app real de Nu, y mandó una captura de pantalla de Nu mostrando que "Cajita Turbo" en realidad paga **13% anual compuesto** y "cajita 2" paga **6.5% anual**. Se rediseñó todo el modelo: ambas cajitas ahora usan el mismo esquema — `saldoBase + fechaBase + tasaAnual%` con interés compuesto diario real (`calcCompoundAt()`), y la tasa es **editable desde la UI** ("actualizar saldos") en vez de estar quemada en el código. Así, si Nu cambia el porcentaje en el futuro, solo se actualiza un número.
- Se volvió a repetir el mismo patrón de deploy: subir varios cambios en commits separados vuelve a saturar la cola de Pages. Ya con permiso de escritura de la GitHub App activo, el flujo que funcionó fue: commitear en la rama de trabajo, y luego aplicar el mismo `index.html` directo sobre `main` en un solo commit (`git show <rama>:index.html > main`, commit, push a main) para evitar duplicar el historial de commits raros que ya tiene `main` (viene de subidas manuales por la interfaz web con nombres tipo "Rename index (4).html to index.html").

## Estructura de la app

**Al 24/09/2026 son 9 pestañas** (botones `<button class="tab">`): inicio, movimientos, inversiones*, fondo*, metas, perfil, noticias, deudas y resumen (* se prenden desde perfil). La lista de abajo es la de las primeras sesiones, cuando eran 5; se conserva como historia.

### Las 5 originales

1. **Inicio** — patrimonio total + tarjetas de cada cuenta (con detalle expandible) + formulario "actualizar saldos" + "transferir entre cuentas" + tarjeta de crédito NU.
2. **Gastos** — registro con categoría (personalizable), fuente de pago, historial con opción de eliminar.
3. **Ingresos** — registro con categoría (personalizable), destino, historial con opción de eliminar.
4. **Deudas** — balance total de personas que le deben / debe, historial completo por persona (documento único `cartera/personas`, no colección — todo el árbol de personas y movimientos vive en un solo doc).
5. **Resumen** — selector de periodo (día/semana/mes/año) con navegación ‹ ›, gastos e ingresos por categoría (barras + gráficas de pastel con %), rendimientos del periodo (cajita 1, cajita 2, GBM), balance real, gráfica de valor de GBM, tabla de cierre mensual de GBM, gráfica de patrimonio total.

## Cuentas que trackea

- **NU Cajita 1** ("Cajita Turbo" en la app real de Nu): `nuCajita1Base` + `nuCajita1Fecha` + `nuCajita1Tasa` (default 13% anual), interés compuesto diario vía `calcCompoundAt()`.
- **NU Cajita 2**: mismo esquema — `nuCajita2Base` + `nuCajita2Fecha` + `nuCajita2Tasa` (default 6.5% anual).
- **NU Saldo disponible** (`nuSaldo`): manual.
- **Tarjeta NU** (`tarjetaDeuda` + `tarjetaMovimientos`): deuda actual, corte el día 18 de cada mes, barra de progreso, registro de cargos y pagos (con origen del pago). Se guarda en `cartera/tarjeta`.
- **GBM**: 45 títulos de IVVPESO (ETF S&P 500 en pesos). Precio se jala de Yahoo Finance vía proxies CORS (`allorigins.win`, `corsproxy.io`) con 6 meses de historial (`ivvHistory`). Fallback al último precio guardado si el fetch falla. También trackea `reporto` (Reporto LF, editable) y `efectivoGBM` (efectivo GBM, editable).
- **Efectivo** (`efectivo`): manual.
- **Mifel** (slot `mifel`, desde el 25/09/2026): Cuenta Digital con interés, mismo esquema que Revolut Savings: `mifelBase` + `mifelFecha` + `mifelTasa`/`mifelTope`/`mifelTasaExc`/`mifelRet`, defaults en `MIFEL_DEF` (10% bruto hasta $500,000, 0% arriba, retención 0.90%). Lleva `retCap:true`: la retención de ISR no rebasa el interés de su banda (una banda al 0% no resta). Es opción SOLO de Mifel y viaja dentro de cada tramo cerrado; las demás cuentas calculan como siempre. `mifelVigencia` = hasta cuándo está confirmada la tasa (default 31-oct-2026, que es la fecha de la GAT que Mifel actualiza cada seis meses, NO el fin de la promoción: la tasa la pueden cambiar cualquier día); pasada esa fecha la tarjeta avisa y todo lo de Mifel se etiqueta estimado. Entra al fondo (`CTAS_FONDO`), a transferencias y a `CTAS_AHORRO` (aportaciones, intereses, "cuánto gana tu dinero"). NO está en gastos, ingresos, pago de tarjeta NU ni semilla histórica. **Sí está en deudas desde el 16/10/2026** (Roberto pidió todas sus formas de pago).
- **Registro de cuentas (27/10/2026, rama `registro-cuentas-2026-10-27`):** `REG_CUENTAS` (bloque `// ── REGISTRO DE CUENTAS`, arriba del estado) define cada cuenta; `CUENTAS`, `CAMPO_SIMPLE`, `CAMPO_COMP`, `CTAS_FONDO`, `CTAS_AHORRO`, `FUENTES_GASTO`, `DESTINOS_INGRESO`, `DEUDA_*`, `CTAS_TRANSFER`, etc. salen de él con `ctasEn(lista)`; en `en`, el número es la POSICIÓN en esa lista (orden de pantalla, desde 1). `test-registro.mjs` compara cada lista contra el literal de antes. Pasos pendientes (otras sesiones): mapas de campos de `state`, sumas por grupo, Atajo/`operarStock`, HTML por plantilla. **Paso 5b (27/10/2026, rama `registro-5b-2026-10-27`):** cada cuenta lleva `ui` (ícono, `pref`/`disp`/`det` para los ids de su tarjeta, `inp` para los del formulario, textos y ejemplos) y posiciones `en.inicio`/`en.form`. `pintarTarjetasInicio()` arma las tarjetas genéricas y acomoda las propias (tarjeta NU, TDC Revolut, bolsa: HTML fijo con `data-inicio`); `pintarFormSaldos()` arma "actualizar saldos" y "rendimiento histórico"; `render()` y `guardarManuales` recorren el registro (`ctasInicio`, `ctasForm`, `idsTarjeta`, `idsFormComp`, `calcCompAt`, `avisoVigencia`). La vigencia de tasa es `vigencia:'mifelVigencia'` en la entrada (antes `textos`). Los ids no se renombran. Red de seguridad: `foto-inicio.mjs` en `pruebas-sin-senal` (debe salir idéntico salvo el letrero de versión). **Paso 6 (27/10/2026, cierra la sesión 1):** `getSaldoCuenta` sale de `CAMPO_SIMPLE`/`CAMPO_COMP` (`Object.hasOwn`), la suma del patrimonio es UNA función (`patrimonioFisico(bolsa)`, Inicio y coach), y los subtítulos del donut salen de los grupos (`ui.dist`). Las listas de movimientos de las tarjetas se repintan en cada `render()` (abiertas) o se vacían (cerradas): el modo privado ya no deja montos a la vista. `test-guardar-saldos.mjs` compara las validaciones de "actualizar saldos" contra `test-guardar-viejo.js`.
- **Cuentas nuevas, regla (al 27/10/2026, con el registro completo):** una cuenta simple o compuesta nueva es UNA entrada en `REG_CUENTAS` (con su `ui` y sus posiciones `en`). Lo único que sigue a mano son los casos especiales: tarjetas de crédito, bolsa y el depósito de la TDC. Al reescribir `cartera/fondo`, `fondoAjeno`/`movsFondoConservados` conservan apartados de cuentas que esa versión no conoce. Aun así, **una versión VIEJA abierta en otro aparato puede borrar el apartado de la cuenta nueva**: antes de usarla, actualizar la app en todos los aparatos.

## Dónde vive cada forma (30/09/2026)

Inicio quedó solo con lo esencial: tarjetas de saldo, "actualizar saldos" y "transferir entre cuentas". Las **formas de tarjeta de crédito** (cargos y pagos) viven en **Movimientos > registrar**, como tercera opción del selector "gasto · ingreso · tarjeta" (`#mov-tipo-tarjeta` → `#form-tarjeta-wrap`; con una sola tarjeta visible se abre sola, y la visibilidad se mide con `offsetParent`, no con `.hidden`, porque Zoe esconde la BBVA por CSS). Si en una copia no queda ninguna tarjeta encendida, el botón "tarjeta" desaparece. **Pagos de tarjeta en el historial:** salen en Movimientos solo con filtro "todos", como renglón neutro ("no cuenta como gasto", gris, sin botones), leídos de `tarjetaMovimientos`/`revTdcMovs` vía `pagosTarjetaHist()` — NUNCA de `transferencias`, que duplicaría los pagos que salen de una cuenta propia. No entran a ningún total: lo gastado con la tarjeta ya es gasto. Los pagos desde el 30/09/2026 guardan `fuente` (cuenta origen o `externo`); los viejos se ven sin "desde". **"Bolsa · registrar operación"** vive en el **tablero de Inversiones** (`div.dop`); si el tablero está apagado en el perfil, "+ compré / − vendí" solo avisan que se encienda (decisión de Roberto: ahí empieza quien quiere invertir). En las copias con cuentas que se apagan, la visibilidad esconde el `details.acc` de la tarjeta, NUNCA su `.sec` (que ahora es toda la columna de registrar). La gráfica de inversiones del Resumen tiene dos lecturas: "con lo que metiste" y "solo ganancia" (`serieGananciaPortafolio`: valor − aportaciones netas, sin GBM ni dividendos). El selector va en pastillas chicas en la línea del título (`#gbm-modos` dentro de `.chart-titulo`), NUNCA dentro del panel: Roberto quiere las dos gráficas del resumen del mismo alto y con la misma estructura. Igual en las cuatro carteras (Roberto, Eli, Toño, Zoe).

## Categorías

- **Gastos (default):** Comida, Transporte, Salidas, Zoe, Ropa, Salud, Suscripciones, Educacion, Casa, Entretenimiento, Viajes, Regalos, Otros — más las que el usuario agregue desde la app (persisten en `cartera/categorias.catsGasto`).
- **Ingresos (default):** Trabajo, Quini, Maicitos, Brownies, Regalos, Deudas cobradas, Inversiones, Otros — más las agregadas por el usuario (`cartera/categorias.catsIngreso`).
- **Fuentes de pago para gastos:** efectivo, NU saldo, tarjeta NU (suma a la deuda de la tarjeta automáticamente).
- **Destinos de ingreso:** efectivo, NU saldo, GBM efectivo.

## Estructura de datos en Firestore

- `cartera/saldos` — doc único: todos los saldos manuales/base de cajitas, efectivo, GBM, historial de precios IVVPESO.
- `cartera/personas` — doc único: `{data: {<clave>: {nombre, saldo, movimientos}}}`, cada persona con `saldo` y array `movimientos`.
- `cartera/tarjeta` — doc único: `{deuda, movimientos}`.
- `cartera/historial` — doc único: `{snapshots: [{f: 'YYYY-MM-DD', total, gbm}, ...]}`, un snapshot diario para las gráficas de patrimonio.
- `cartera/categorias` — doc único: `{catsGasto: [...], catsIngreso: [...]}`.
- `gastos` (colección) — cada doc: `{cat, monto, nota, fuente, fecha}`.
- `ingresos` (colección) — cada doc: `{cat, monto, nota, destino, fecha}`.
- `transferencias` (colección) — cada doc: `{origen, destino, monto, nota, fecha}`.

Las tres colecciones (`gastos`, `ingresos`, `transferencias`) se leen completas al cargar (sin paginación) y se guarda el `id` del doc en el objeto en memoria para poder borrarlo (`deleteDoc`) desde el botón × del historial.

## Deudas — esquema (sin cifras reales aquí, el repo es público)

- `state.personas` es un objeto `{clave: {nombre, saldo, movimientos:[...]}}`, una entrada por persona a la que se le presta o se le debe. Se agregan/quitan personas desde la propia app (pantalla Deudas).
- `PERSONAS_DEFAULT` en el JS está vacío (`{}`) a propósito: los saldos y movimientos reales viven SOLO en Firestore (`cartera/personas`); no se escriben en el código ni en esta documentación porque el repo es público. El default vacío solo sirve de estado inicial antes de que cargue la copia local o el servidor.
- **Lógica:** positivo (+) = le deben más, negativo (−) = pagaron o él debe.

## Diseño

Tema por defecto **claro, verde salvia** (tokens en `:root`: `--bg`, `--text`, `--muted`, `--accent`…) y 6 temas más vía `html[data-tema]`: azul, morado, arena, rosa, fucsia y **grafito** (el único oscuro). El tema se aplica antes de pintar (script al inicio del `<head>`); si nunca se eligió uno (`localStorage` sin la clave `tema`, que NO es lo mismo que `''` = verde elegido) y el sistema está en oscuro, arranca en grafito sin guardarlo.

**Accesibilidad que ya se cuida (no romperla):** `--muted` da ≥4.5:1 contra `--bg`, `--bg3` y `--g5` en los temas claros (recalcular si se toca un color); foco visible con `:focus-visible`; las pestañas son `<button>` con `aria-current`; los encabezados de cuentas/tarjetas son `role="button"` con `aria-controls`/`aria-expanded` y responden a Enter/Espacio (un solo listener en el script); Enter en monto o nota de gasto/ingreso pulsa su botón; el aviso `#toast` es `role="status"`; objetivos táctiles de 44 px. **Confirmar un borrado** (desde el 2/10/2026, en las cinco carteras) es `await confirmarDeslizando({titulo, texto, verbo})`: un `<dialog>` con perilla que se arrastra, o se toca para mostrar "sí, <verbo>" (la vía de teclado y lector). Ya no hay `confirm()`; no agregar ninguno. Como no bloquea, **todo llamador revalida después del `await`**: `sigueIgual()` por id, los candados (`susOcupado`, `catOcupado`, `apartadoOcupado`, `dineroOcupado`) y, si guarda una lista completa, reconstruirla desde el estado vigente. Pendiente consciente: las fechas siguen como texto AAAA-MM-DD (un `type=date` a medio escribir llega vacío y se registraría como "hoy").

## Cosas importantes que debes saber para trabajar en este repo

1. **Todo vive en un solo archivo `index.html`.** No hay build step. Cualquier cambio se sube tal cual.
2. **El sitio en vivo se publica desde la rama `main`** (GitHub Pages, "Deploy from a branch"). No hay workflow de GitHub Actions custom — es el deploy clásico de Pages.
3. **SIEMPRE subir en un solo commit.** Ya se atascó la cola de deploys de Pages dos veces por subir varios commits seguidos muy rápido. Si vas a cambiar algo, junta todos los cambios y haz un solo commit/push.
4. **El service worker (`sw.js`, `cartera-v9`) usa stale-while-revalidate:** abre al instante con lo cacheado, baja el HTML nuevo en segundo plano, lo compara y muestra "hay una versión nueva". Cambiar solo `index.html` NO requiere subir `CACHE`; súbelo solo si cambias `sw.js`, su estrategia o recursos que se sirven de caché primero.
5. **`ALLOWED_EMAIL` es solo un gate de UI.** La seguridad real son las reglas de Firestore, y **no viven en este repo**: el proyecto `mi-cartera-b43e0` tiene un solo ruleset para todas las carteras, en `Desktop\CARTERA\cartera-casa\firestore.rules` (un correo exacto por copia y todo lo demás negado). Se despliega **solo desde `cartera-casa`**. El 13-oct-2026 se sacaron de este repo un `firestore.rules` viejo (dejaba a dos correos leer y escribir todo) y su `firebase.json`, para que nadie lo despliegue por accidente; siguen en el historial de git. Una colección nueva necesita su regla allá antes de usarse aquí. No convertir esto en multiusuario por iniciativa propia. Más contexto: `Desktop\CARTERA\ARCHITECTURE-mi-cartera.md` (fuera del repo porque el repo es público).
6. **Interés compuesto de cajitas:** `calcCompoundAt(base, fechaStr, tasaPct, ms)` es la función central — cualquier cajita nueva o cambio de tasa debe pasar por ahí, nunca hardcodear un monto fijo por día otra vez.
7. **`parseFechaLocal()`** existe específicamente para evitar el bug de timezone (parsear `YYYY-MM-DD` como local en vez de UTC). Úsalo siempre que se lea una fecha en ese formato desde el estado.

## Sin señal (15/10/2026, copiado del rancho; consenso con Codex en 3 rondas)

- **Ver:** si `loadFromFirebase` sale de la caché (cualquiera de sus 17 lecturas con `metadata.fromCache`), `cargaDesdeCache=true`: banda "copia local SIN confirmar", punto rojo, y `armarReintentoSenal` recarga sola con espera creciente. Nunca se marca sincronizado ni verde con datos de caché. Las bandas viven en `.bandas-conexion`, debajo de las pestañas.
- **Capturar:** solo **gasto e ingreso** van a la bandeja (IndexedDB propia `cartera-bandeja-<carpeta>`; las carteras comparten dominio). Comando inmutable con el id de Firestore fijado al capturar y el uid de quien capturó. Sube en serie por la MISMA `txDinero` con `requerirAusentes:[ref]`; `ya-existe` = confirmado. No toca saldos hasta subir. Todo lo demás (transferencias, tarjeta, deudas, saldos, bolsa, suscripciones) pide señal: `txDinero` falla al instante sin red.
- **Regla que no se rompe:** `altaGasto`/`altaIngreso` llevan `requerirAusentes:[ref]` desde el PRIMER intento. Sin eso, si el commit llega y se pierde la respuesta, el SDK reintenta y cobra dos veces (reproducido el 15-oct interceptando `:commit`).
- **Orden en pantalla:** soltar el candado (`liberarDinero` drena snapshots) y DESPUÉS `aplicarRes`. Al revés, un snapshot viejo pisa el saldo confirmado.
- **Pruebas de punta a punta** con emuladores (nunca producción): `Desktop\CARTERA\pruebas-sin-senal\` (fuera del repo).
- **Copias (16-oct):** llevado a Eli, Toño y Zoe en ramas `sin-senal-2026-10-16`. Al trasladar un parche a las copias: `patch --fuzz=0` (con fuzz alto los pedazos caían en otra función), comparar las líneas +/- contra la referencia, y ajustar a mano la lista de `desdeCache` y los nombres de colección (`C_GASTOS`/`C_INGRESOS`).

## Deudas con tarjeta (16/10/2026, en las cinco carteras; diseño criticado por Codex)

- "Me deben" y "le pagué" (dinero que SALE) aceptan las tarjetas de crédito: suben su deuda (`tarjetaDelta`/`tdcRevDelta`); el patrimonio neto no cambia (persona +m, tarjeta +m). En "me pagaron"/"yo debo" las tarjetas se apagan (`ajustarCuentasDeuda`, opciones `data-solo-sale`) y `registrarDeuda` también lo rechaza. Borrar revierte con `permitirDeudaNegativa` y avisa del saldo a favor. Cada copia ofrece solo sus tarjetas: Eli/Toño según su configuración (`CAPS.tarjeta.deuda=1`), Zoe solo la NU, la casa el crédito BBVA.
- **Regla que no se rompe:** `txDinero` revisa ANTES de los límites si el documento ya trae el id de `persona.movAdd`, `tarjetaMovAdd` o `tdcRevMovAdd`, y devuelve `codigo:'ya-existe'`; quien llama lo trata como éxito con `yaAplicado()` (limpia la forma, espera la recarga y repinta Deudas). Sin eso, un cargo de tarjeta con la respuesta perdida se cobraba dos veces (reproducido: 0 → 80 por un cargo de 40).
- Los movimientos de deudas en cuentas de ahorro cuentan en `aportacionesEnRango` y en el rendimiento ponderado (`flujosDeudaAhorro`).
- Pruebas (emulador, nunca producción): `deudas-tarjeta.mjs` y `deudas-doble.mjs` en `Desktop\CARTERA\pruebas-sin-senal\`.

## Cuentas en otra moneda (20/10/2026, en las cinco carteras; sesión 0 del plan `documentos\plan-de-codeo\`)

- Cuentas que la persona agrega sola en Perfil (nombre, moneda AUD/USD/EUR/CNY, tipo banco/efectivo), como Revolut. Viven en `<NS>/cuentasX` = `{cuentas:{x_<id>:{nombre,moneda,tipo,on,saldo,creada}}}`, APARTE de saldos; el saldo va en SU moneda. Ids `x_[a-z0-9]{6,16}` (`esIdX`). Máximo 8. Apagar solo con saldo 0; nunca se borran ni cambian de moneda.
- **Un gasto/ingreso en otra moneda guarda `monto` YA EN PESOS** (al tipo del día de captura) + `montoOrig`, `moneda`, `tc`, `tcFecha`. Todo lo que suma montos (resumen, promedio, calificación, coach) sigue en pesos sin tocarse; solo el saldo de la cuenta usa `montoOrig`. Transferencias solo pesos↔otra moneda: `monto` = el lado en pesos, más `montoOrigen/monedaOrigen/montoDestino/monedaDestino/tc` (lo que salió y lo que llegó; la diferencia es la comisión).
- **Regla que no se rompe:** una cuenta `x_` NUNCA va en `plan.deltas`/`absolutos` (txDinero lanza error); va en `plan.fx = {deltas, absolutos, crear, editar}`. Altas por su camino (`altaMovX`, `registrarTransferenciaX`), nunca por `FUENTES_GASTO`/`EDIT_CUENTAS`. Al borrar, la reversa sale del documento del SERVIDOR (`reversaX`); editar con la plumita solo cambia categoría/nota/fecha.
- **Reglas de Firestore** (`cartera-casa/firestore.rules`, `creaX`/`borraX`/`editaX`): crear o borrar un movimiento `x_` exige que en la misma operación cambie el saldo de ESA cuenta en `cuentasX`; no se le puede cambiar monto, moneda, cuenta ni banderas del Atajo. Así una versión vieja de la app no puede borrarlo sin devolver el dinero. **Desplegar las reglas ANTES de publicar la app.**
- **Tipo de cambio:** Frankfurter (BCE), una vez al día local, solo si hay cuentas en otra moneda (al crear la primera se fuerza). Se guarda en `<NS>/mercado.fx` con `mergeFields`. Bandas por moneda (`FX_BANDAS`, estimadas), base MXN obligatoria, salto >15% contra un tipo de ≤30 días se rechaza, y una moneda que no llegó o llegó mal HEREDA la anterior. Si falta el tipo de una cuenta con saldo: "pendiente" y no se guarda la foto del día (nunca cero).
- Copias: Eli/Toño tienen el paso 8 de `aplicarConfigCuentas` que normaliza la fuente elegida: reconoce `x_` encendidas. Los botones nuevos usan `data-cx` (NUNCA `data-cta`, que esas copias usan para esconder lo que no es cuenta fija). La casa pide quién captura en altas, transferencias, saldo y alta de cuenta, y deja rastro en `casa_ajustes` con el saldo del servidor.
- Pruebas: `test-dinero.mjs` sección X (corre en las copias con APP/NS/PFX), `test-cache.mjs`, `pruebas-sin-senal\reglas-monedas.mjs` (emulador, 138 casos), `pruebas-sin-senal\e2e-monedas.mjs [sitio ns pfx correo]` (Chrome contra el emulador 2, 42 casos), `pruebas-sin-senal\casa\test-monedas-casa.mjs` y los `qa-*.mjs`.
- Pendientes conscientes: moneda principal distinta de pesos, tarjetas/deudas/suscripciones/fondo/metas/bolsa en otra moneda, y transferencias entre dos cuentas en otra moneda (fuera de v1). Cuando se conserva un tipo viejo por salto sospechoso, la etiqueta dice la fecha nueva.

## Planes futuros (mencionados por Roberto, NO implementar sin que lo pida explícitamente)

1. **Apps individuales para su familia** (papá, mamá, hermanas, novia) — cada quien con su propia copia independiente del código y su propio proyecto de Firebase (no multiusuario dentro de esta misma app). Es básicamente clonar el repo y cambiar el `firebaseConfig` + `ALLOWED_EMAIL`.
2. **Cartera compartida entre Roberto y sus hermanas** — van a vivir juntos y quieren controlar gastos/ingresos comunes del hogar. Esto es un **proyecto totalmente aparte**, diseñado desde cero para multiusuario real (varias personas viendo/registrando en el mismo fondo, con aportes/roles por persona) — no es una adaptación de "Mi Cartera" personal.

Roberto fue explícito: **"todo lo que tú me dices, obviamente no lo voy a hacer de una en multiusuario, sería totalmente diferente"** — o sea, no conviertas esta app en multiusuario por iniciativa propia.

## Workflow de deploy

Cualquier cambio a `index.html` (o `sw.js`) se sube directo al repo en GitHub y GitHub Pages lo publica en ~1 minuto. Si usas VS Code con Claude Code, puedes hacer `git push` normal a `main` (o a una rama y luego merge) — solo respeta la regla de **un solo commit por tanda de cambios** para no saturar la cola de Pages.

## Noche del 27 al 28-oct-2026 (rama `fondo-y-cuentas-2026-10-28`, SIN publicar)

- **Interés del fondo = del fondo** (decisión de Roberto). `tramosFondo(slot)`: desde el último `rendimiento` registrado de esa cuenta (o el primer movimiento del fondo), tramo por tramo con lo apartado de cada periodo (`deltaFondo`), días locales completos (`diaLocal`). `fondoEnCuenta(c)` = apartado + pendiente, topado al saldo; `saldoTuyo(c)` es LA regla de "lo tuyo" (tarjetas, mis cuentas, metas, colchón). `sumaGrupo(g,true)` y el total NO recortan a cero a propósito (deben cuadrar con el banco). La ganancia del mes y el resumen restan `pendienteFondoEnRango`. Las transferencias siguen validando contra lo apartado registrado. Prueba: `test-fondo-pendiente.mjs`.
- **Mis cuentas**: subpestaña del perfil (`perfilSub('cuentas')`, `renderMisCuentas`). `banco` en cada entrada del registro.
- **Cuentas que tú agregas** (sobre monedas): `MONEDAS_X.MXN` local (tc 1, `MONEDAS_FX` excluye MXN de Frankfurter); tipo `cajita` con `tasa/tope/tasaExc/fecha`; `saldoX(x)` es el saldo de HOY (interés compuesto; en rojo no genera); txDinero reancla la cajita en cada movimiento y al cambiar la tasa. `transferirEntreX` = entre dos cuentas agregadas de la misma moneda; una cuenta a ella misma se rechaza también en txDinero. `altaMovX` en MXN usa `tcFecha = hoyLocal()`.
- **Varios fondos**: `saldosPorCuenta` sigue siendo el TOTAL; cada movimiento nuevo lleva `fondo:'f_xxx'` (sin etiqueta = universidad `'u'`); `apartadoFondoEn(fd,fid,c)` suma los movimientos del fondo y la universidad es el resto. Lista en `cartera/fondo.fondos` (txDinero la conserva; `cambiarListaFondos` la escribe con mergeFields en una transacción). Un fondo con movimientos que no está en la lista (versión vieja) sigue existiendo. El recorte a 2000 movimientos no tira los de otros fondos. Pestaña fondo con subpestañas (`fondoActual`).
- **Asistente** (`abrirAsistente`): preguntas fijas; al final una sola operación de txDinero (efectivo + cuentas agregadas) y los fondos. Se abre solo con una cartera vacía (`esCarteraNueva`: saldos en cero, sin movimientos).
- **Pruebas nuevas**: `test-fondo-pendiente.mjs`, `test-dinero` secciones Y y VF; en `pruebas-sin-senal`: `e2e-cuentas-propias.mjs`, `e2e-fondos.mjs`, `e2e-asistente.mjs` (emulador 2).
- **Antes de publicar**: actualizar la app en TODOS los aparatos (una versión vieja no conoce las cuentas en pesos, el tipo cajita ni la lista de fondos). Falta portar a Eli, Toño, Zoe y la casa (las copias no tienen registro de cuentas ni fondo).

## Metas de fondo y gráfica del fondo (28-oct-2026, tarde)

- **Apartados → fondos.** "Mis apartados" de Metas (`cartera/apartados`) era solo letrero; ahora Metas muestra "mis fondos" con su avance y los apartados viejos salen aparte con "pasar a fondo" (crea el fondo con la misma meta y quita el apartado). No hay migración automática.
- **Meta de cada fondo** en un doc PROPIO `cartera/metasFondos` = `{metas:{<fid>:{objetivo, fecha:'AAAA-MM'|''}}}`, con `setDoc` merge (objetivo 0 = sin meta). Nunca dentro de `cartera/fondo`: txDinero lo reescribe entero y una versión vieja borraría la meta. `guardarMetaFondo` falla al instante sin señal (regla de "Sin señal").
- **Reparto del interés estimado entre fondos por tramos** (`tramosDeFondo`): cada tramo según lo que cada fondo tenía en ese tramo; la universidad es el resto; un fondo cerrado no genera (pasa a la universidad); se divide entre `max(F, suma)`. `generadoFondoEn` y `serieFondo` usan lo mismo.
- **Gráfica del fondo:** `chartBlock(..., {ancho})` ensancha el viewBox para quedar del alto del resumen; `serieFondo` da un punto por día y escalones en cada movimiento; `pts.diario` = lo que genera al día.
- Prueba: `pruebas-sin-senal\e2e-metas-fondos.mjs` (emulador 2). Falta portar a las copias junto con varios fondos.
- **Metas (28-oct, tarde 2):** Metas muestra SOLO las metas de los fondos ("metas de tus fondos"); ahí no se crean fondos ni se pone meta (Roberto: que no se confunda). **Mis cuentas:** todo en cuadritos iguales (`caja`, `.mc-grid`): bancos, Efectivo, Fondos, Inversiones, cada uno con etiqueta de qué es y total; si una cuenta en otra moneda no tiene tipo de cambio, el cuadrito lo dice. **Excel de mis datos:** portada "Resumen" con ligas, encabezados verdes, total al pie con `SUBTOTAL(109)` (con su resultado guardado) separado del filtro por una fila vacía, hojas "Gastos/Ingresos por categoría" (12 meses seguidos). Las fechas 'AAAA-MM-DD' van por `parseFechaLocal` (antes salían un día antes). Prueba: `pruebas-sin-senal\e2e-cuentas-excel.mjs`.

## Límite de gasto del mes (30-oct-2026, en Roberto, Eli, Toño y Zoe; ramas `limite-mes-2026-10-30`, SIN publicar)

- `limiteMes` en `<NS>/perfil` (merge con `guardarPerfil`; null = sin límite). **Informa, nunca bloquea** (regla de Roberto del 19-oct). Se edita en el perfil (`details#limite-acc`); en Inicio, `#limite-panel` arriba de "cómo vas este mes" con barra, rayita del ritmo del mes y "te quedan $X para N días".
- `gastoDelMes()` = gastos del mes en curso con `movValido` (la tarjeta el día del cargo, otra moneda ya en pesos, el Atajo pendiente cuenta). Lo de la bandeja sin señal NO cuenta hasta subir.
- `avisoLimite(monto, fecha)` tras `altaGasto` y `altaMovX`: avisa al cruzar 50/75/90 y en cada gasto pasado el 100; gana sobre `avisoCategoria`. La casa no lo tiene (no tiene perfil personal).
- `mesLocalDe` acepta 'AAAA-MM-DD' suelta como día local (antes el día 1 caía en el mes anterior).
- Prueba: `pruebas-sin-senal\e2e-limite-mes.mjs [sitio ns pfx correo]` (21 casos). Plan del fin: `documentos\plan-de-codeo\plan-fin-de-semana-2026-10-31.md` (fuera del repo).
