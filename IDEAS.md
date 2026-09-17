# Ideas pendientes (no implementar sin que Roberto lo pida)

## Lista de amigos + perfil comparativo (pedida 2026-08-26)

Roberto: que el perfil sirva para compararse entre amigos/familia — NO quién
ingresa más ni quién gasta menos, sino un perfil generado en base a la edad y
la situación financiera de cada quien (como el "estándar personal" que ya
existe, pero comparable entre usuarios). "Que tengamos como una lista de
amigos, o algo así."

Notas de diseño para cuando toque:
- Hoy cada app es un namespace aislado en Firestore y las reglas impiden
  deliberadamente leer datos de otro usuario. Compartir un score entre apps
  requiere un espacio NUEVO compartido de solo-lectura cruzada (p.ej. una
  colección `social_scores` donde cada quien escribe SOLO su score agregado,
  nunca sus movimientos) y su regla propia.
- Compartir el score agregado, jamás los datos crudos (montos, movimientos).
- El score ya existe (`calcScore`, 0-100 sobre el último mes completo) y el
  estándar ajustado por perfil también — la pieza nueva es solo publicar y
  leer los scores.

## Pantalla de cuentas configurables (prender/apagar/renombrar) (2026-08-26)

Punto intermedio antes del refactor grande de 8 tandas que Codex desaconsejó:
una pantalla donde cada usuario prende/apaga las cuentas que YA existen como
slots y les pone nombre propio. Evita tocar código en cada clon para esto.

## Segunda vuelta de velocidad de arranque (2026-09-04)

Lo hecho hoy (paralelizar las 14 lecturas, cache persistente, service worker
stale-while-revalidate + SDK precacheado) ya deja la app abriendo al instante y
sin red. Lo que queda, en orden de valor, para cuando la app crezca:

1. ~~**Pintar desde la cache ANTES de que conteste el servidor.**~~ HECHO el
   4-sep-2026 (`pintarDesdeCache`, commit 68db956). Es todo-o-nada, de solo
   lectura, y no marca `datosCargados`: mover dinero sigue esperando al servidor.
   Una banda avisa que se ve la copia local y ofrece reintentar.
2. **Paginar gastos/ingresos/transferencias.** Se leen COMPLETAS en cada
   apertura, sin `limit()`. Hoy no duele, pero crece sin tope y son lecturas
   facturables. Ojo: un `limit()` a secas romperia el Resumen de meses viejos —
   hay que separar "historial visible" (paginado) de "resumen" (consulta por
   rango de fechas del periodo elegido). `stocksOps` puede seguir completa.
3. **Retirar las siembras historicas** (seedJul26V3, seedJul28, seedJul28b,
   seedJul30, seedJul31, seedJul31b, seedAgo04, seedAgo07...). Ya corrieron en
   produccion hace meses y siguen evaluandose en cada arranque: son superficie
   de riesgo y ruido. Antes de borrarlas, confirmar en Firestore que todos los
   marcadores estan puestos.
4. **El HTML son ~335KB en un solo archivo.** Con la cache ya no se baja en
   cada apertura, pero el telefono si lo parsea entero cada vez. Solo vale la
   pena tocarlo si se nota; partirlo romperia el modelo de "un solo archivo".

---

# ~~PLAN~~ HECHO — Investment Dashboard · 9-sep-2026 (pestaña opcional 'inversiones', se enciende en el perfil; commit del mismo dia)

Roberto lo pidió tras ver el dashboard de Google Sheets de **Dividendology**
(video "I Just Bought 2 Undervalued Dividend Growth Stocks!"). Quiere una
pestaña propia entre **movimientos** y **metas**. Aquí queda planeado, NO
implementado.

## De dónde sale cada cosa (lo que YA se puede vs lo que NO)

La app ya tiene el ledger `stocksOps` ({tipo, simbolo, acciones, montoMxn,
montoUsd, cuenta, fecha}), las `posiciones` derivadas, precios de Yahoo en
`accionesMkt` con un año de histórico, y `pieChart()` para donas.

**Se puede hoy, sin fuentes nuevas:**
- Valor de mercado, costo, ganancia en $ y en %  (posiciones × precio).
- Ganancias realizadas (de las ventas del ledger).
- Dona de asignación efectivo vs bolsa (`pieChart` ya existe).
- Barras costo vs valor de mercado por ticker.
- Barras de crecimiento % por ticker.
- Barra de ganadoras contra perdedoras.
- Total de posiciones.
- "Cómo se mueven los mercados hoy": ya se jala el S&P; se puede añadir el
  cambio del día.

**NO se puede sin resolver una fuente de datos:**
- **Dividendos** (ingreso anual, yield sobre costo, calendario). El dashboard
  del video los saca del add-on **tickerdata.com, que es DE PAGO**. La API
  pública de Yahoo que usa la app (`chart`) no trae dividendos; `quoteSummary`
  sí, pero suele tronar por CORS y límites de tasa.
- **Sector / industria** por ticker: misma historia.
- **Proyección a 5/10/…/30 años**: el cálculo es trivial, pero necesita una
  tasa de crecimiento de dividendos que hay que sacar de algún lado.

**Salida propuesta para los tres huecos:** capturarlos A MANO por ticker, en
un documento `cartera/tickers` ({AVGO:{sector:'Tecnologia', divAnual:2.36,
crecimientoDiv:12}}). Son 5-6 posiciones, no 27: se teclea una vez y se
corrige cuando cambie. Nada de meter una fuente de pago ni un scraper frágil
por una tabla que cambia dos veces al año.

## Fase 1 — lo que se puede hoy (una sesión)

Pestaña nueva con: tarjeta de resumen (valor, costo, ganancia $ y %,
realizadas), dona de asignación, barras costo vs valor por ticker, barras de
crecimiento %, ganadoras vs perdedoras, y total de posiciones. Todo con datos
que ya existen. **Sin dividendos y sin sectores** — esos van en la fase 2, y
la pestaña debe verse completa y honesta sin ellos, no con huecos vacíos.

## Fase 2 — dividendos y sectores (otra sesión)

Documento `cartera/tickers` capturado a mano, más: ingreso por dividendos,
yield sobre costo, dona por sector, y la tabla de proyección a 30 años con el
interruptor de reinvertir. La proyección DEBE decir en pantalla que es un
escenario con supuestos, no una promesa — es exactamente el tipo de cifra que
se lee como si fuera un hecho.

## Dos advertencias de diseño, no de código

1. **Ya hay 7 pestañas** (inicio, movimientos, resumen, deudas, metas, perfil,
   noticias). Una octava no cabe cómoda en la barra del teléfono. O el
   dashboard **absorbe la pestaña "resumen"** (que ya trae rendimientos y
   gráficas y se traslapa bastante), o la navegación necesita otra solución.
   Recomendación: fusionar con "resumen", no sumar una octava.
2. **El dashboard del video tiene 27 posiciones; Roberto tiene ~5.** Las donas
   y las barras de ese video se ven bien porque hay con qué llenarlas. Con 5
   posiciones, media pantalla se ve vacía. Conviene diseñarlo para lo que hay,
   no calcarlo.

## Del agente `usuario-real` sobre el tablero (9/10-sep-2026) — decisiones de Roberto

Probo el tablero tres veces como lo usaria Beto en el celular. Todo lo rojo y lo
amarillo se corrigio (ver la bitacora). Quedan tres cosas que son DECISION suya,
no bugs:



1. **Editar una operación de bolsa.** El ledger `stocksOps` es inmutable a
   propósito (se registra la inversa). Pero si a una compra le falta el monto en
   pesos, hoy el tablero lo nombra y no hay dónde corregirlo. Opciones: permitir
   editar SOLO `montoMxn` y `montoUsd` (no acciones ni fecha), o un "ajuste" que
   registre la corrección como operación aparte. **10-sep:** el usuario real lo
   volvió a marcar en rojo con el tablero estilo hoja: "falta el monto en pesos de
   MSFT" aparece en cinco tarjetas y ninguna dice dónde se arregla, porque no hay
   dónde. Sigue siendo la decisión más urgente de esta lista.
2. **Paneles que repiten dato.** Con ~5 posiciones, "cómo se mueve el mercado"
   repite los precios de "acciones"; "efectivo 26%" sale dos veces; "lo que
   pusiste vs lo que vale" y "cómo va cada posición" son el mismo hecho; y "tus
   inversiones frente a otras opciones" del perfil quedó redundante. Roberto pidió
   "casi idéntico con los mismos gráficos", así que se dejaron todos. Si algún día
   estorban, el agente propone quedarse con cinco. **10-sep, tablero estilo hoja:**
   en la primera pantalla compiten tres cifras de pérdida ("$ ganancia/perdida" en
   Acciones, "$ perdida" y "vas perdiendo (con lo vendido)" en Tu portafolio, y el
   total que pierde en la gráfica verde). Se aclaró con texto por qué difieren,
   pero Acciones y Tu portafolio siguen repitiendo valor y ganancia porque la hoja
   original también lo hace. Si Roberto quiere una sola cifra, se quita de Acciones.
3. Detalle de dedo: los botones tipo `type-opt` miden 34 px de alto (el resto de la
   app 44-46). Es un patrón viejo de toda la app, no del tablero.

---

# Fondo de la universidad — HECHO 14-sep-2026 (solo en la app de Roberto)

Pestaña "fondo": el dinero del seguro educativo (~MXN 813,600, *estimado*; deposito 28-sep)
vive MEZCLADO en sus cuentas (casi todo Revolut) y se lleva como **apartado contable** en
`cartera/fondo`. Inicio, metas, coach, score, resumen y tablero usan "tu dinero" (fisico menos
apartado). Ninguna operacion normal (gastos, transferencias, tarjetas, bolsa, Atajo, capturas
manuales) puede dejar una cuenta bajo lo apartado. Diseño revisado y tumbado primero por Codex.

Pendientes y decisiones:
- **Pruebas que solo puede hacer Roberto con su Firebase real:** registrar la primera entrada y
  ver que `cartera/fondo` se crea; el interruptor del perfil; conciliar un rendimiento real y
  verlo restado en Resumen; dos dispositivos a la vez.
- **El interes del fondo no se aparta solo:** hay que registrarlo como "el banco abono rendimiento"
  (la app sugiere el monto estimado). Automatizarlo exigiria cristalizar la atribucion marginal en
  cada movimiento de la cuenta — no se hizo a proposito.
- Las reglas desplegadas (las de cartera-casa) ya cubren `cartera/{documento=**}`. El archivo
  `mi-cartera/firestore.rules` sigue divergente: NO desplegar desde aqui.
- Copias (Eli, Zoe, Toño, casa, plantilla): no tienen fondo. Si alguien lo pide, portar el bloque
  "fondo: saneo" + la validacion de txDinero + las tres transacciones.
- El tope de 15% de Revolut ya lo ocupa su propio ahorro: el fondo gana el excedente (7.3% bruto).
- Tablero: la tarjeta alta de "lo que gana y lo que pierde" deja un hueco debajo en escritorio
  (CSS grid sin masonry). Cosmetico, sin arreglar.

## Bancos en la pestaña de inversiones (pedido 14-sep-2026, pendiente de platicar)

Roberto lo volvio a pedir tras quitar "efectivo disponible" y "acciones y efectivo" del tablero:
quiere ver "cuanto dinero tengo bien ahorrado" junto a las inversiones. Recomendacion de Claude:
UNA tarjeta "tus ahorros en bancos" (cajita Nu y Revolut Savings, SIN el fondo de la universidad)
con saldo, tasa y rendimiento estimado al mes; no mezclar cuentas de gasto (efectivo, NU saldo,
Revolut MXN). Queda para decidirlo con el.

Hecho el mismo dia: sector automatico para tickers conocidos (SECTOR_CONOCIDO; SPCX = SpaceX
cuenta como Industrial, se puede cambiar), dividendo de 12 meses desde Yahoo cuando no esta
capturado, y "dividendos cobrados" = ingresos con categoria "Dividendos".

## Pendientes del 16-sep-2026

- **Proxy propio para Yahoo.** corsproxy.io dejo de aceptar uso anonimo (exige clave de pago) y
  allorigins responde una de cada dos o tres veces (500/522). Hoy la app reintenta con varios proxies
  publicos, pero la solucion durable es un Cloudflare Worker propio (gratis) que haga de proxy:
  necesita una cuenta de Roberto. Mientras, precios y dividendos pueden tardar o quedarse en los
  ultimos guardados; el dividendo por accion se puede capturar a mano en "datos de cada accion".
- **La plantilla esta desactualizada.** mi-cartera-plantilla sigue en la arquitectura de dinero
  anterior al 27-ago (aplicarDelta/backupCuentas, sin txDinero), asi que no recibio ni el fondo ni
  los tramos de rendimiento. Antes de clonar una copia nueva hay que ponerla al dia (o clonar desde
  cartera-eli, que si esta al corriente).
- **Excel de deudas.** Roberto quiere descargar la cuenta con una persona (papa) como Excel bonito,
  con periodo (1 semana / 1 mes / 3 / 6 / 1 año / todo / rango). Ejemplo generado con sus datos:
  Desktop/CARTERA/manuales/ejemplo-cuenta-papa.xlsx. Falta su OK al formato para construirlo en la
  app (ExcelJS desde cdnjs, carga perezosa al pulsar "descargar").
- **Rendimiento historico: la semilla.** La historia de intereses empieza hoy; lo ganado antes se
  captura una vez en "actualizar saldos > rendimiento historico" (lo que el banco reporta hasta una
  fecha). Cajita 2 (retirada) queda fuera del seguimiento a proposito.

## Amigos y competencia entre carteras (pedido 16-sep-2026, para la siguiente sesion)

Roberto: "ya es hora de ponerlos como amigos y empezar la competitividad" (Eli, Tono y Zoe ya
tienen su app). Hoy las cuatro carteras estan AISLADAS a proposito por reglas de Firestore (cada
correo solo lee su namespace). Compartir algo requiere: (1) decidir QUE se compara — propuesta:
solo indicadores sin montos (score de manejo del dinero, % de ahorro del mes, racha de meses
buenos, constancia de aportes), nunca saldos ni gastos; (2) un documento publico por persona
(p. ej. coleccion `ranking/{uid}`) que cada app escribe con SUS indicadores y todos pueden leer,
con reglas nuevas; (3) que cada quien acepte participar desde su perfil (apagado por defecto);
(4) una pestaña o tarjeta "amigos" con la tabla y quien va ganando el mes. Diseño a debatir con
Codex antes de construir; una feature, una sesion.
