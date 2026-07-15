# Mi Cartera — contexto del proyecto

PWA de finanzas personales de Roberto, hosteada en GitHub Pages. Repo: `rl7103405-gif/mi-cartera`. App en vivo: `https://rl7103405-gif.github.io/mi-cartera`.

## Stack

- **HTML/CSS/JS puro en un solo archivo `index.html`** (~1200 líneas). Sin frameworks, sin build process, sin bundler, sin npm. Todo va directo a GitHub Pages tal cual está en el repo.
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

## Estructura de la app — 5 pestañas

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

## Categorías

- **Gastos (default):** Comida, Transporte, Salidas, Zoe, Ropa, Salud, Suscripciones, Educacion, Casa, Entretenimiento, Viajes, Regalos, Otros — más las que el usuario agregue desde la app (persisten en `cartera/categorias.catsGasto`).
- **Ingresos (default):** Trabajo, Quini, Maicitos, Brownies, Regalos, Deudas cobradas, Inversiones, Otros — más las agregadas por el usuario (`cartera/categorias.catsIngreso`).
- **Fuentes de pago para gastos:** efectivo, NU saldo, tarjeta NU (suma a la deuda de la tarjeta automáticamente).
- **Destinos de ingreso:** efectivo, NU saldo, GBM efectivo.

## Estructura de datos en Firestore

- `cartera/saldos` — doc único: todos los saldos manuales/base de cajitas, efectivo, GBM, historial de precios IVVPESO.
- `cartera/personas` — doc único: `{data: {Papa: {...}, Elita: {...}, Mama: {...}}}`, cada persona con `saldo` y array `movimientos`.
- `cartera/tarjeta` — doc único: `{deuda, movimientos}`.
- `cartera/historial` — doc único: `{snapshots: [{f: 'YYYY-MM-DD', total, gbm}, ...]}`, un snapshot diario para las gráficas de patrimonio.
- `cartera/categorias` — doc único: `{catsGasto: [...], catsIngreso: [...]}`.
- `gastos` (colección) — cada doc: `{cat, monto, nota, fuente, fecha}`.
- `ingresos` (colección) — cada doc: `{cat, monto, nota, destino, fecha}`.
- `transferencias` (colección) — cada doc: `{origen, destino, monto, nota, fecha}`.

Las tres colecciones (`gastos`, `ingresos`, `transferencias`) se leen completas al cargar (sin paginación) y se guarda el `id` del doc en el objeto en memoria para poder borrarlo (`deleteDoc`) desde el botón × del historial.

## Deudas — datos actuales (junio/julio 2026)

- **Papá:** ~$40,973 (le debe). 63+ movimientos históricos desde enero 2025 — préstamos mensuales de $4,500–$5,000, gasolina que él paga (resta), eventos, medicina, etc. Están hardcodeados como `PERSONAS_DEFAULT` en el JS (solo se usan si Firestore no tiene el doc todavía — después de la primera carga, Firestore manda).
- **Elita (hermana):** ~$144 (le debe). 5 movimientos históricos.
- **Mamá:** $0.
- **Lógica:** positivo (+) = le deben más, negativo (−) = pagaron o él debe.

## Diseño

Dark mode. Colores: purple `#a78bfa`, green `#34d399`, red `#f87171`, gold `#fbbf24`. Estilo minimalista tipo iOS. Sin frameworks CSS, todo en un `<style>` dentro de `index.html`.

## Cosas importantes que debes saber para trabajar en este repo

1. **Todo vive en un solo archivo `index.html`.** No hay build step. Cualquier cambio se sube tal cual.
2. **El sitio en vivo se publica desde la rama `main`** (GitHub Pages, "Deploy from a branch"). No hay workflow de GitHub Actions custom — es el deploy clásico de Pages.
3. **SIEMPRE subir en un solo commit.** Ya se atascó la cola de deploys de Pages dos veces por subir varios commits seguidos muy rápido. Si vas a cambiar algo, junta todos los cambios y haz un solo commit/push.
4. **El service worker (`sw.js`) cachea el HTML con estrategia network-first** (`cartera-v2`). Si cambias la lógica de cacheo, sube también la versión del `CACHE` const para invalidar el caché viejo de los usuarios.
5. **`ALLOWED_EMAIL` es solo un gate de UI, no seguridad real.** No hay reglas de Firestore restrictivas conocidas — cualquiera con las credenciales del proyecto Firebase (visibles en el propio `index.html`, es código cliente) técnicamente podría leer/escribir. Esto es aceptable para un proyecto personal de un solo usuario, pero es relevante si se toca el tema de multiusuario.
6. **Interés compuesto de cajitas:** `calcCompoundAt(base, fechaStr, tasaPct, ms)` es la función central — cualquier cajita nueva o cambio de tasa debe pasar por ahí, nunca hardcodear un monto fijo por día otra vez.
7. **`parseFechaLocal()`** existe específicamente para evitar el bug de timezone (parsear `YYYY-MM-DD` como local en vez de UTC). Úsalo siempre que se lea una fecha en ese formato desde el estado.

## Planes futuros (mencionados por Roberto, NO implementar sin que lo pida explícitamente)

1. **Apps individuales para su familia** (papá, mamá, hermanas, novia) — cada quien con su propia copia independiente del código y su propio proyecto de Firebase (no multiusuario dentro de esta misma app). Es básicamente clonar el repo y cambiar el `firebaseConfig` + `ALLOWED_EMAIL`.
2. **Cartera compartida entre Roberto y sus hermanas** — van a vivir juntos y quieren controlar gastos/ingresos comunes del hogar. Esto es un **proyecto totalmente aparte**, diseñado desde cero para multiusuario real (varias personas viendo/registrando en el mismo fondo, con aportes/roles por persona) — no es una adaptación de "Mi Cartera" personal.

Roberto fue explícito: **"todo lo que tú me dices, obviamente no lo voy a hacer de una en multiusuario, sería totalmente diferente"** — o sea, no conviertas esta app en multiusuario por iniciativa propia.

## Workflow de deploy

Cualquier cambio a `index.html` (o `sw.js`) se sube directo al repo en GitHub y GitHub Pages lo publica en ~1 minuto. Si usas VS Code con Claude Code, puedes hacer `git push` normal a `main` (o a una rama y luego merge) — solo respeta la regla de **un solo commit por tanda de cambios** para no saturar la cola de Pages.
