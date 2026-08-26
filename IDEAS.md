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
