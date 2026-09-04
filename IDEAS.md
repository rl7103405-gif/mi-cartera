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

1. **Pintar desde la cache ANTES de que conteste el servidor.** Hoy el
   Promise.all todavia espera a que las 14 lecturas vuelvan. Firestore permite
   leer explicitamente de la copia local (`getDocFromCache`/`getDocsFromCache`)
   y sincronizar despues. Lo señalo Codex: `getDoc` normal espera al servidor y
   solo cae a cache si falla, o sea que la mejora de hoy es "un viaje en vez de
   14", no "cero viajes". Requiere separar dos banderas: una que permita PINTAR
   datos posiblemente viejos (solo lectura) y otra que habilite escribir dinero.
   Sin esa separacion no se debe hacer: `datosCargados` hoy autoriza escrituras.
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
