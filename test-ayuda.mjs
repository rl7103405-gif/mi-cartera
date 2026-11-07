// Prueba de la AYUDA de Fundview (3-nov-2026): el motor de busqueda y los textos, sin navegador. Corre el bloque
// <fv-ayuda> del index.html tal cual. Corpus: lo que debe contestar, lo que debe escalar y lo que no debe caer en nada.
// Lo que pasa en pantalla lo prueba pruebas-sin-senal\fundview\e2e-ayuda.mjs.
import fs from 'node:fs';
const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const ini = HTML.indexOf('// <fv-ayuda>'), fin = HTML.indexOf('// </fv-ayuda>');
if (ini < 0 || fin < ini) { console.log('esta copia no tiene ayuda: nada que probar'); process.exit(0); }
const A = new Function(HTML.slice(ini, fin) + '\nreturn {AYUDA_BASE, AYUDA_FRASE, AYUDA_CORREO, AYUDA_RAZON, AYUDA_GRUPOS, buscarAyuda, ayNorm, ayTokens, ayudaSinSms};')();

let pasan = 0, fallas = 0;
const ok = (c, t, d = '') => { if (c) pasan++; else { fallas++; console.log('  FALLA', t, d); } };

// ── 1. las bases ──
const ids = A.AYUDA_BASE.map(e => e.id);
ok(new Set(ids).size === ids.length, 'ids sin repetir');
ok(A.AYUDA_BASE.every(e => A.AYUDA_GRUPOS.some(g => g[0] === e.g)), 'cada pregunta en un grupo que existe');
ok(A.AYUDA_BASE.length >= 25, 'unas 25 preguntas o mas', A.AYUDA_BASE.length);
ok(A.AYUDA_BASE.every(e => e.r.length && e.r.join(' ').length < 420), 'respuestas cortas', A.AYUDA_BASE.filter(e => e.r.join(' ').length >= 420).map(e => e.id).join());
ok(A.AYUDA_BASE.every(e => !e.ir === !e.boton), 'cada boton con su destino');
ok(A.AYUDA_BASE.filter(e => e.id !== 'que-es').every(e => e.donde), 'cada respuesta dice donde se hace');
const queEs = A.AYUDA_BASE.find(e => e.id === 'que-es');
ok(queEs.r[0] === 'Fundview es una app donde anotas cuánto tienes en cada lugar, y te dice cuánto tienes en total.', 'la frase fija, palabra por palabra');
ok(/no es un banco/i.test(queEs.r[1]) && /tu dinero se queda donde está/.test(queEs.r[1]) && /no se conecta a tus cuentas/.test(queEs.r[1]), 'y las tres cosas que no es');
ok(A.AYUDA_CORREO === 'fundviewapp@gmail.com', 'el correo');

// ── 2. barrido de los textos que ve la persona ──
const textos = [...A.AYUDA_BASE.flatMap(e => [e.p, e.donde || '', e.boton || '', ...e.r]), ...Object.values(A.AYUDA_RAZON), ...A.AYUDA_GRUPOS.map(g => g[1])];
const prohibidos = [
  ['guion largo', /[—–]/], ['emoji', /\p{Extended_Pictographic}/u],
  ['banco o marca', /\b(nu|revolut|bbva|banorte|santander|banamex|citibanamex|hsbc|klar|mercado pago|hey banco|openbank|mifel|stori|ual[aá]|gbm|cetes|google|microsoft|authenticator|apple|iphone|android|chrome|safari|whatsapp|gmail|yahoo|firebase|visa|mastercard|american express|amex|commbank)\b/i],
  ['promete tiempos', /\b(\d+ ?(horas?|d[ií]as?|minutos?)|en breve|pronto|de inmediato|enseguida|hoy mismo)\b/i],
  ['dice que se mando', /\b(se (mand[oó]|envi[oó])|enviamos|ya (lo )?mandamos|mensaje enviado|recibimos)\b/i],
  ['promete seguridad de mas', /(m[aá]xima|total|absoluta|100 ?%) seguridad|seguridad (m[aá]xima|total|absoluta)|inhackeable|imposible de (robar|hackear)/i],
  ['consejo de dinero', /\b(te conviene (más|mas)|te recomendamos|deber[ií]as (invertir|ahorrar|comprar|vender)|la mejor (cuenta|cajita|tasa))\b/i],
];
for (const [nombre, re] of prohibidos) { const m = textos.filter(t => re.test(t)); ok(!m.length, 'sin ' + nombre, m.join(' | ')); }
ok(/\bgoogle\b/i.test('app de google') && /[—–]/.test('a—b'), 'control: el barrido si detecta lo prohibido');

// ── 3. preguntas que deben encontrar su respuesta ──
const CONTESTA = {
  'que-es': ['¿Qué es Fundview?', 'que es esto', 'para que sirve', 'qué es la app', 'explicame que es'],
  'no-mueve': ['puedo sacar dinero', '¿cómo mando dinero a otra persona?', 'como retiro mi dinero', 'como deposito dinero', 'puedo enviar dinero desde aqui', 'como saco mi dinero de fundview'],
  'conexion': ['¿se conecta a mi banco?', 'le doy mis claves', 'como sabe cuanto tengo', 'me pide la contraseña del banco', 'se sincroniza con mi banco', 'como vinculo mi banco'],
  'empezar': ['por dónde empiezo', 'como empiezo', 'soy nuevo', 'qué hago primero', 'como la uso'],
  'gasto': ['buenas tardes, quisiera saber como registro un gasto', 'me podrias decir como anoto un gasto', 'como deberia registrar un gasto', '¿Cómo registro un gasto?', 'anotar un gasto', 'como le hago para apuntar lo que gaste', 'registrar gastos', 'donde pongo un gasto', 'gaste 200 en tacos como lo anoto', 'como anoto una compra', 'gasot', 'quiero registrar una compra'],
  'ingreso': ['como registro un ingreso', 'donde anoto mi sueldo', 'me pagaron la quincena como lo registro', 'apuntar mi nomina', 'ingreso'],
  'editar': ['como borro un movimiento', 'me equivoque en un gasto', 'como corrijo un gasto', 'eliminar un ingreso', 'editar movimiento', 'quiero borrar un gasto'],
  'transferir': ['como paso dinero de una cuenta a otra', 'transferir entre cuentas', 'como hago una transferencia', 'mover dinero entre mis cuentas', 'tranferencia', 'traspaso de dinero'],
  'categorias': ['me falta una categoria', 'como agrego una categoria', 'cambiar el nombre de una categoria', 'juntar categorias', 'categorias', 'nueva categoría'],
  'suscripciones': ['como anoto una suscripcion', 'suscripciones', 'tengo un pago fijo cada mes', 'como pongo mi renta mensual'],
  'deudas': ['como anoto una deuda', 'un amigo me debe dinero', 'le preste a un amigo', 'yo debo dinero a alguien', 'como registro un prestamo a un amigo', 'deudas', 'como registro lo que debo', 'me deben dinero'],
  'tarjeta': ['como uso la tarjeta de credito', 'como anoto mi tarjeta de credito', 'tarjeta de crédito', 'como pago mi tarjeta en la app', 'donde anoto el cargo de mi tarjeta', 'mi tdc', 'como registro el pago de la tarjeta'],
  'saldo': ['¿Cómo actualizo un saldo?', 'actualizar saldos', 'cambiar el saldo de mi banco', 'como pongo mi saldo', 'como corrijo mi saldo'],
  'agregar': ['como agrego otra cuenta', 'agregar un banco', 'tengo otro banco', 'cuenta en dolares', 'como agrego una cuenta en euros', 'nueva cuenta', 'cuenta en otra moneda', 'tengo dolares', 'efectivo en otra cuenta'],
  'cajita': ['como uso las cajitas', 'como agrego una cajita', 'cuenta con intereses', 'como pongo la tasa de mi cajita', 'savings', 'cajita', 'cuenta de ahorro con interes', 'rendimiento de mi cajita'],
  // (7-nov-2026) Pico y Beto buscaron la tarjeta en "agregar una cuenta"
  'calendario': ['¿Dónde veo mis gastos en un calendario?', 'donde esta el calendario', 'quiero ver el calendario', 'calendario de gastos', 'ver mis cobros que vienen', 'que cobros vienen este mes'],
  'poner-tarjeta': ['¿Cómo pongo mi tarjeta de crédito?', 'como pongo mi tarjeta de credito', 'como agrego mi tarjeta de credito', 'agregar una tarjeta de credito', 'donde pongo mi tarjeta', 'no encuentro donde poner mi tarjeta', 'como doy de alta mi tarjeta', 'quiero agregar mi tdc', 'añadir tarjeta de crédito', 'nueva tarjeta de credito'],
  'fijas': ['como apago una cuenta', 'como enciendo mi tarjeta', 'cambiar el nombre de mi cuenta', 'renombrar una cuenta', 'apagar una cuenta', 'como prendo una cuenta', 'como cambio el dia de corte'],
  'fondo': ['como aparto dinero', 'crear un fondo', 'fondo para un viaje', 'apartar para emergencias', 'fondos', 'separar dinero para un coche'],
  'bolsa': ['como anoto mis acciones', 'como registro lo que invertí', 'donde veo mis inversiones', 'tablero de inversiones', 'compré acciones como lo registro', 'como anoto una venta de acciones que vendi', 'acciones', 'bolsa'],
  'total': ['donde veo cuanto tengo en total', 'cuanto tengo', 'mi total', 'donde esta mi dinero', 'patrimonio'],
  'resumen': ['donde veo cuanto gaste', 'cuanto gaste este mes', 'resumen', 'donde veo mis gastos', 'graficas de mis gastos', 'reporte del mes'],
  'limite': ['como se usa el limite', 'que pasa si me paso del limite', 'como pongo un limite de gasto', 'presupuesto', 'limite por categoria', 'tope de gasto', 'quiero un maximo de gasto al mes'],
  'metas': ['como pongo una meta', 'metas', 'quiero una meta de ahorro', 'objetivo'],
  'privado': ['como oculto mis montos', 'esconder los montos', 'ocultar cifras', 'el ojo'],
  'perfil-datos': ['como cambio mi foto', 'cambiar el color', 'modo oscuro', 'tema oscuro', 'editar mi nombre', 'cambiar mi foto de perfil'],
  'privacidad': ['quien puede ver mis datos', 'es seguro', 'es segura la app', 'quien ve mi informacion', 'privacidad', '¿es seguro?', 'es seguro el sms'],
  'perdi-app': ['tengo otro numero de celular'],
  'no-llega': ['no me llega el codigo', 'no me llegó el sms', 'no llega el mensaje', 'no me llega el código', 'no recibo el codigo', 'no me ha llegado el sms', 'mandar otro codigo'],
  'descargar': ['como descargo mis datos', 'exportar a excel', 'bajar mis datos', 'respaldo', 'copia de mis datos', 'excel'],
  'borrar': ['quisiera saber como borro mi cuenta', 'como borro mi cuenta', 'quiero darme de baja', 'eliminar mi cuenta', 'cerrar mi cuenta', 'cancelar mi cuenta', 'cierro mi cuenta', 'quiero cerrar mi cuenta', 'salir de mi cuenta y borrarla'],
  'contrasena': ['como cambio mi clave', 'quiero cambiar mi clave', 'olvide mi clave', 'perdí mi contraseña', 'olvidé mi contraseña', 'como cambio mi contraseña', 'recuperar contraseña', 'contrasena', 'olvide mi password', 'contraseña'],
  'instalar': ['como la instalo', 'instalar en mi telefono', 'como la bajo a mi celular', 'la puedo usar en otro aparato', 'usarla en la computadora'],
  'sinsenal': ['no tengo señal en mi telefono', 'funciona sin señal', 'sin internet', 'funciona offline', 'no tengo señal', 'modo avion'],
  'errores': ['que manda la app cuando hay un error', 'reporte de errores', 'mandan mis errores', 'tienen telemetria', 'que mandan cuando truena'],
  // (4-nov-2026, prueba de usuario a 390 px) lo que antes se iba al correo o caia en otra respuesta
  'salir': ['cerrar sesion', 'cerrar sesión', 'cierra sesion', 'cierro sesion', 'como cierro mi sesion', 'quiero cerrar la sesion', 'cerrar la sesion de mi cuenta', 'salir', 'como salgo', 'salir de la app', 'quiero salir', 'logout', 'desloguear', 'puedo salir y volver', 'se pierde lo que anote si salgo', 'si salgo de la app pierdo mis datos', 'puedo cerrar sesion sin perder lo que anote', 'cerre sesion en mi cuenta', 'salir de mi cuenta', 'se perdera lo que anote si salgo'],
  'cuadra': ['mi cajita no cuadra con mi banco', 'mi saldo no cuadra', 'no me cuadra', 'no me cuadra con mi banco', 'no me coincide con el banco', 'el interes de mi cajita no es el del banco', 'mi banco dice otra cantidad', 'no es igual a mi banco', 'hay una diferencia con el banco', 'sale diferente que en mi banco', 'no me sale igual', 'mi cajita dice otra cosa que mi banco', 'la cajita no coincide'],
  'real': ['es real este numero', 'es real lo que dice mi cajita', 'este numero es real', 'es exacto lo que dice', 'los intereses son reales', 'es correcto mi total'],
  'gasto-fecha': ['registrar un gasto con otra fecha', 'cambiar la fecha de un gasto', 'como registro un gasto de ayer', 'como pongo la fecha a un gasto', 'cambiar la fecha de un movimiento', 'un gasto con fecha anterior', 'como cambio la fecha de un ingreso'],
  // (7-nov-2026, prueba de usuario-real de la persona nueva) frases que no encontraban nada o caian en "cuanto cuesta Fundview"
  'ganancia': ['cuanto gané', 'cuánto gané este mes', 'cuánto me pagó la cajita', 'cuanto gane en intereses', 'cuanto me dio la cajita', 'cuanto ha ganado mi dinero'],
  'calendario#': ['pagos que vienen este mes', 'qué me cobran este mes', 'que cobros me tocan este mes', 'cuales son mis pagos del mes', 'que cargos vienen'],
  'deuda-tarjeta': ['cómo pongo lo que debo de mi tarjeta', 'saldo de la tarjeta', 'donde anoto lo que ya debo de mi tarjeta', 'como pongo lo que debo en mi tarjeta de credito', 'saldo de mi tarjeta de credito'],
  'cuesta': ['cuanto me cobran', 'me cobran algo por usar fundview', 'cuanto cuesta', 'es gratis', 'cuánto cuesta fundview', 'precio', 'cobran algo'],
};
for (const [id0, qs] of Object.entries(CONTESTA)) for (const q of qs) {
  const id = id0.replace('#', '');   // 'calendario#': la segunda lista de la misma respuesta (una clave repetida pisaria la primera)
  const r = A.buscarAyuda(q);
  ok(r.tipo === 'respuesta' && r.ids[0] === id, 'CONTESTA ' + id + ': ' + q, JSON.stringify(r).slice(0, 110));
}

// ── 4. lo que no se contesta: escala, y por que ──
const ESCALA = {
  'consejo': ['qué acciones compro', '¿qué banco me conviene?', 'que me conviene', 'en que cajita me conviene meter mi dinero', '¿cuánto debo ahorrar?', 'cuanto deberia ahorrar al mes', 'vale la pena esta cajita', 'es buena idea pagar mi deuda', 'me recomiendas una tarjeta', 'cual es la mejor cajita', 'mejor banco', 'como ahorro mas', 'como ahorro', 'como gasto menos', 'debería vender mis acciones', 'dame un consejo', 'quiero salir de deudas', 'salir de mis deudas', 'cuanto me paga la cajita', 'cuanto voy a ganar', 'que tarjeta me conviene', 'cuanto debo pagar de mi tarjeta', 'cual banco es mejor', 'en cual banco meto mi dinero', 'cual cajita me da mas', 'deberia comprar acciones', 'necesito un asesor'],
  'inversion': ['¿dónde invierto?', 'como invierto', 'quiero invertir mi dinero', 'inversión', 'como compro acciones', 'cetes', 'cripto', 'bitcoin', 'como vendo acciones', 'afore', 'plazo fijo'],
  'impuestos': ['impuestos', 'como declaro mis intereses', 'cuanto le debo al SAT', 'el isr', 'necesito una factura', 'retencion de impuestos', 'mi rfc', 'declaracion anual', 'son deducibles'],
  // (4-nov-2026) "no cuadra con mi banco" ya NO se escala: tiene su respuesta ('cuadra', en CONTESTA). Lo que sigue al correo es lo que suena a dato perdido o cobro raro
  'cuadra': ['me falta dinero', 'desapareció un gasto', 'el interés está mal', 'el saldo esta mal', 'mi total esta equivocado', 'se borró un movimiento', 'no aparece mi gasto', 'se duplicó un gasto', 'me cobraron de mas', 'no me aparece mi gasto', 'registre un gasto y no esta', 'ya no esta mi gasto', 'ya no estan mis gastos', 'cerre sesion y perdi mis gastos', 'cerré sesión y perdí mis gastos', 'perdi mis gastos', 'perdió todo lo que anoté', 'mi saldo quedo en cero', 'mi cajita no genera interes', 'mi sueldo no se suma', 'mi tarjeta tiene un cargo que no reconozco', 'el tipo de cambio esta mal', 'mi saldo esta raro', 'el total no sale bien'],
  'falla': ['la app no abre', 'no carga', 'sale un error al guardar', 'error', 'tengo un error', 'se cerro sola', 'esta lenta', 'no me deja guardar'],
  'contacto': ['quiero hablar con una persona', 'soporte', 'contactar', 'cual es su correo'],
  'cuenta': ['perdí mi cuenta', 'no puedo entrar', 'no me deja entrar', 'me hackearon', 'alguien entró a mi cuenta', 'me robaron la cuenta', 'me bloquearon', 'recuperar mi cuenta', 'fraude'],
  'perdi-app': ['borré mi clave de la app', 'cambié de app autenticadora', 'perdí mi app autenticadora', 'cambié de teléfono', 'me robaron el celular', 'perdí mi teléfono', 'celular nuevo', 'tengo un telefono nuevo', 'borré la app autenticadora', 'perdí mi clave', 'el codigo no funciona', 'cambié de número', 'perdí mi número', 'ya no tengo ese número', 'se me rompió el celular', 'ya no tengo el autenticador'],
};
for (const [razon, qs] of Object.entries(ESCALA)) for (const q of qs) {
  const r = A.buscarAyuda(q);
  ok(r.tipo === 'escalar' && r.razon === razon, 'ESCALA ' + razon + ': ' + q, JSON.stringify(r).slice(0, 110));
}
ok(Object.keys(ESCALA).every(k => k === 'perdi-app' || A.AYUDA_RAZON[k]), 'cada razon tiene su texto');

// ── 5. sin coincidencia: al correo, nunca una respuesta que no viene al caso ──
const SIN = ['hipoteca', 'quiero comprar un coche', 'cambiar mi correo', 'tiene notificaciones', 'falta un banco en la lista', 'en que idioma esta', 'pizza', 'el clima de hoy', 'seguro de vida', 'quien es el dueño', 'como invito a un amigo a la app de mi hermano del trabajo', 'barco', 'cuanto cuesta un coche nuevo en la agencia', 'quiero un credito para mi negocio'];
for (const q of SIN) { const r = A.buscarAyuda(q); ok(r.tipo === 'sin' || r.tipo === 'escalar', 'SIN COINCIDENCIA: ' + q, JSON.stringify(r).slice(0, 110)); }

// ── 6. bordes ──
ok(A.buscarAyuda('').tipo === 'vacio', 'vacio');
ok(A.buscarAyuda('   ').tipo === 'vacio', 'solo espacios');
ok(A.buscarAyuda('¿?').tipo === 'vacio', 'solo signos');
ok(A.buscarAyuda('hola').tipo === 'vacio', 'un saludo no es una pregunta');
ok(A.buscarAyuda('gracias').tipo === 'vacio', 'las gracias tampoco');
ok(A.buscarAyuda('como registro').tipo === 'vago', 'solo un verbo: pide mas');
ok(A.buscarAyuda('quiero anotar').tipo === 'vago', 'otro verbo solo');
ok(A.buscarAyuda(null).tipo === 'vacio', 'null no truena');
ok(A.buscarAyuda(undefined).tipo === 'vacio', 'undefined no truena');
ok(A.buscarAyuda('<img src=x onerror=alert(1)>').tipo === 'sin', 'una etiqueta es texto cualquiera');
ok(A.buscarAyuda('a'.repeat(5000)).tipo === 'sin', 'muy largo no truena');
{ const t0 = Date.now(); for (let i = 0; i < 300; i++) A.buscarAyuda('como registro un gasto con mi tarjeta de credito ' + i); ok(Date.now() - t0 < 800, '300 busquedas en menos de 0.8 s', Date.now() - t0); }
// mientras escribe: el principio de una palabra ya encuentra, y no escala de mas
ok(A.buscarAyuda('regis', true).tipo === 'vago', 'parcial: "regis" todavia no dice de que');
ok((A.buscarAyuda('cajit', true).ids || [])[0] === 'cajita', 'parcial: "cajit" ya encuentra la cajita', JSON.stringify(A.buscarAyuda('cajit', true)));
ok((A.buscarAyuda('registrar un gas', true).ids || [])[0] === 'gasto', 'parcial: "registrar un gas" ya encuentra el gasto', JSON.stringify(A.buscarAyuda('registrar un gas', true)));
ok(A.buscarAyuda('sueldoo').tipo === 'respuesta', 'error de dedo en palabra larga');
ok(A.buscarAyuda('barco').tipo === 'sin', 'una palabra corta parecida no se corrige');
// mayusculas y acentos no cambian nada
ok(JSON.stringify(A.buscarAyuda('CÓMO REGISTRO UN GASTO')) === JSON.stringify(A.buscarAyuda('como registro un gasto')), 'mayusculas y acentos da igual');
// cada pregunta de la lista se encuentra a si misma (lo que se ve en la lista tiene que poder buscarse)
for (const e of A.AYUDA_BASE) { const r = A.buscarAyuda(e.p);
  ok(r.tipo === 'respuesta' ? r.ids[0] === e.id : (r.tipo === 'escalar' && r.razon === e.id), 'se encuentra a si misma: ' + e.p, JSON.stringify(r).slice(0, 110)); }

// ── con el SMS apagado (CFG.sms false): lo que solo vale con SMS se va y nada lo menciona. Al final a proposito: ayudaSinSms cambia las bases ──
{
  const conSms = A.AYUDA_BASE.length;
  ok(A.AYUDA_BASE.some(e => e.id === 'no-llega'), 'prendido: esta "no me llega el codigo"');
  ok(/SMS/.test(A.AYUDA_BASE.find(e => e.id === 'perdi-app').r.join(' ')), 'prendido: perdi la app habla del SMS');
  A.ayudaSinSms();
  ok(A.AYUDA_BASE.length === conSms - 1 && !A.AYUDA_BASE.some(e => e.id === 'no-llega'), 'apagado: sin "no me llega el codigo"');
  const visibles = A.AYUDA_BASE.flatMap(e => [e.p, e.donde || '', e.boton || '', ...e.r]).join(' | ');
  ok(!/\bSMS\b/i.test(visibles), 'apagado: ninguna pregunta ni respuesta menciona el SMS', (visibles.match(/.{60}\bSMS\b.{20}/i) || [''])[0]);
  ok(!/tu número/i.test(visibles), 'apagado: ninguna habla de tu número', (visibles.match(/.{60}tu número.{20}/i) || [''])[0]);
  const perdi = A.AYUDA_BASE.find(e => e.id === 'perdi-app');
  ok(perdi.p === 'Perdí mi app autenticadora o cambié de teléfono' && perdi.donde === 'En tu app autenticadora', 'apagado: la pregunta de la app con su texto de antes');
  ok(A.buscarAyuda('Perdí mi app autenticadora o cambié de teléfono').tipo === 'escalar', 'apagado: perdi la app sigue escalando al correo');
  { const r = A.buscarAyuda('no me llega el codigo'); ok(r.tipo !== 'respuesta' || !r.ids.includes('no-llega'), 'apagado: buscar lo del SMS no truena ni lo enseña', JSON.stringify(r).slice(0, 110)); }
  // cada pregunta de la lista de ese modo se sigue encontrando a si misma
  for (const e of A.AYUDA_BASE) { const r = A.buscarAyuda(e.p);
    ok(r.tipo === 'respuesta' ? r.ids[0] === e.id : (r.tipo === 'escalar' && r.razon === e.id), 'apagado, se encuentra a si misma: ' + e.p, JSON.stringify(r).slice(0, 110)); }
}

// (4-nov-2026, revision) el texto de dos respuestas: salir no empieza con un "Si." suelto y cuadra termina mandando al correo
{
  const salir = A.AYUDA_BASE.find(e => e.id === 'salir'), cuadra = A.AYUDA_BASE.find(e => e.id === 'cuadra');
  ok(salir.r[0].startsWith('Puedes salir y volver cuando quieras.'), 'salir empieza "Puedes salir y volver cuando quieras."', salir.r[0].slice(0, 50));
  ok(!new RegExp('^S[ií][.]').test(salir.r[0]), 'salir no empieza con un "Si." suelto');
  ok(cuadra.r[cuadra.r.length - 1] === 'Si la diferencia no es de intereses (por ejemplo, falta o sobra un movimiento), revisa Movimientos o escríbenos.', 'cuadra termina con la salida al correo', cuadra.r[cuadra.r.length - 1]);
  ok(cuadra.correo === true, 'cuadra lleva el boton de correo');
  const iRev = cuadra.r.join(' ').indexOf('no falta ningún movimiento'), iGuardar = cuadra.r.join(' ').indexOf('Guardar saldo');
  ok(iRev > -1 && iRev < iGuardar, '"Guardar saldo" va condicionado a que no falte un movimiento (despues de revisar)');
}

console.log('\n' + (fallas ? fallas + ' FALLAS de ' + (pasan + fallas) : 'TODO PASA: ' + pasan + '/' + pasan));
process.exit(fallas ? 1 : 0);
