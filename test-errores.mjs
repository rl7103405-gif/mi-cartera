// Prueba del reporte de errores de Fundview (4-nov-2026): el bloque <fv-errores> del index.html tal cual, sin navegador. Lo que se comprueba: un mensaje con un monto,
// una nota, un nombre o un correo NO sale, y lo tecnico si. En pantalla y contra la funcion: pruebas-sin-senal\fundview\e2e-errores.mjs.
import fs from 'node:fs';
const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const ini = HTML.indexOf('// <fv-errores>'), fin = HTML.indexOf('// </fv-errores>');
if (ini < 0 || fin < ini) { console.log('esta copia no tiene el reporte de errores: nada que probar'); process.exit(0); }
const A = new Function(HTML.slice(ini, fin) + '\nreturn {FV_ERR_TIPOS, FV_ERR_PASOS, FV_ERR_PAGINAS, FV_ERR_PALABRAS, fvErrMensaje, fvErrTipo, fvErrCodigo, fvErrMarco, fvErrPila, fvErrNavegador, fvErrPantalla, fvErrArmar};')();

let pasan = 0, fallas = 0;
const ok = (c, t, d = '') => { if (c) pasan++; else { fallas++; console.log('  FALLA', t, d); } };
const M = A.fvErrMensaje;

// ── 1. lo que no debe salir, venga como venga ──
const DATOS = [
  ['monto con signo', 'No se pudo guardar $1,234.50 en tu cuenta', /1,?234|\$/],
  ['monto suelto', 'saldo 98765.43 negativo', /98765|43/],
  ['monto sin decimales ni signo', 'Cannot read 45000', /45000/],
  ['correo', 'auth failed for ana.belen@correo.com.mx', /ana|belen|correo|@/],
  ['correo solo', 'rl@gmail.com', /rl|gmail|@/],
  ['nota en minusculas', 'renta de marzo para la casa de mi mama', /renta|marzo|casa|mama/],
  ['nota con acentos', 'pagué el préstamo de Toño', /pagu|pr.stamo|To.o/],
  ['nombre con mayuscula', 'Error de Ana Belen Linares', /Ana|Belen|Linares/],
  ['nombre entre comillas', 'No existe la cuenta "Ahorro para Sydney"', /Ahorro|Sydney/],
  ['nombre en una propiedad', "Cannot read properties of undefined (reading 'Revolut')", /Revolut/],
  ['telefono', 'sms a +52 55 1234 5678 fallo', /52|55|1234|5678/],
  ['uid', 'usuarios/aBcD3fGh1JkLmN0pQrStUvWxYz12/gastos', /aBcD|usuarios|gastos/],
  ['ruta', 'Missing document usuarios/x/cartera/saldos', /usuarios|cartera|saldos/],
  ['liga', 'failed to fetch https://app.fundview.mx/?probar-sms=1#invitacion', /fundview|probar|invitacion|https/],
  ['codigo de invitacion', 'FV-ABCD-EFGH-JKMN-PQRS', /ABCD|FV/],
  ['palabra con numero', 'cuenta1 usuario2', /cuenta|usuario/],
  ['json', '{"monto":150,"nota":"tacos","cat":"Comida"}', /monto|150|tacos|Comida|nota/],
  ['sql o html', '<img src=x onerror=alert(1)>', /img|alert|</],
  ['salto de linea', 'Error\nrenta 500\nmas', /renta|500|\n/],
  ['backticks', 'Error `Ana` en `cuenta`', /Ana|cuenta|`/],
  ['cifras en palabra permitida', 'error404 failed500', /404|500/],
  ['constructor no es palabra suya por ser de Object.prototype', '__proto__ toString hasOwnProperty', /proto|toString|hasOwn/],
  // (4-nov-2026, revision) palabras sueltas que tambien dice una persona: ya no estan en la lista
  ['una frase que termina en no', 'hola mama no', /hola|mama|\bno\b/],
  ['palabras comunes de la lista vieja', 'play a name value set range position no', /play|name|value|\bset\b|range|position|\bno\b|\ba\b/],
];
for (const [nombre, m, re] of DATOS) {
  const s = M(m);
  ok(!re.test(s), 'no sale: ' + nombre, JSON.stringify(s));
  ok(!/[0-9@$]/.test(s), 'sin numeros, arrobas ni signos de pesos: ' + nombre, JSON.stringify(s));
}
ok(M('x'.repeat(5000)).length <= 120 && M('error '.repeat(200)).length <= 120, 'nunca pasa de 120 caracteres');
ok(M(undefined) === '' && M(null) === '' && M('') === '', 'sin mensaje, vacio');
ok(typeof M({toString() { return 'renta 500'; }}) === 'string' && !/renta|500/.test(M({toString() { return 'renta 500'; }})), 'un objeto que se vuelve texto pasa por lo mismo');

// ── 2. lo tecnico si sale, para que sirva ──
const TECNICOS = [
  ["Cannot read properties of undefined (reading 'x')", "Cannot read properties of undefined (reading '_')"],
  ['x is not a function', '_ is not _ function'],
  ['x is not defined', '_ is not defined'],
  ['Failed to fetch', 'Failed to fetch'],
  ['Missing or insufficient permissions.', 'Missing or insufficient permissions.'],
  ['Unexpected token } in JSON at position 12', 'Unexpected token _ in JSON at _'],
  ['Firebase: Error (auth/network-request-failed).', 'Firebase: Error (auth/network-request-failed).'],
  ['Quota exceeded.', 'Quota exceeded.'],
  // (5-nov-2026, mejora 4) el rechazo de un SMS: lo que diga la funcion o Auth tiene que llegar entero para saber su forma real
  ['Firebase: fv-sms-tope (auth/internal-error).', 'Firebase: fv-sms-tope (auth/internal-error).'],
  ['HTTP Cloud Function returned an error: RESOURCE_EXHAUSTED fv-sms-intenta-despues', 'HTTP Cloud Function returned an error: RESOURCE_EXHAUSTED fv-sms-intenta-despues'],
  ['Firebase: Error (auth/too-many-requests).', 'Firebase: Error (auth/too-many-requests).'],
  // palabras sueltas en español NO pasan; solo el token exacto de las funciones (y 'fv' suelto tampoco)
  ['tope de gasto de mi tipo', '_'],
  ['intenta despues en el pais', '_'],
  ['fv', '_'],
  ['fv sms', '_ sms'],
  ['fv-sms-tope', 'fv-sms-tope'],
  ['fv-sms-tope-extra', '_'],
  ['mi fv-sms-pais.', '_ fv-sms-pais.'],
  ['FV-SMS-TOPE', '_'],
  ['Failed to execute "put" on "IDBObjectStore"', 'Failed to execute "_" on "_"'],
  ['Maximum call stack size exceeded', 'Maximum call stack size exceeded'],
  ['The operation was aborted', 'The operation was aborted'],
];
for (const [m, e] of TECNICOS) ok(M(m) === e, 'sale: ' + m, JSON.stringify(M(m)));
// ninguna palabra que salga esta fuera de la lista, con cualquier texto de una app de dinero
const LIBRE = 'Quincena Renta Súper $450 "viaje a Sydney" Ana abc123 ñandú déposito casa tarjeta nu efectivo cajita BBVA ahorro meta fondo universidad gastos ingresos';
ok(M(LIBRE).split(/[\s_:,.()'"\/-]+/).filter(Boolean).every(p => A.FV_ERR_PALABRAS.has(p.toLowerCase())), 'de un texto cualquiera solo salen palabras de la lista', M(LIBRE));
const SACADAS = ['play', 'position', 'name', 'value', 'set', 'range', 'no', 'a'];
ok(!SACADAS.some(p => A.FV_ERR_PALABRAS.has(p)), 'la lista ya no tiene las palabras comunes de las personas', SACADAS.filter(p => A.FV_ERR_PALABRAS.has(p)).join());
const DE_DINERO = ['monto', 'saldo', 'gasto', 'gastos', 'ingreso', 'nota', 'renta', 'tarjeta', 'cuenta', 'banco', 'dinero', 'pesos', 'nombre', 'correo', 'mi', 'tu', 'de', 'la', 'el'];
ok(!DE_DINERO.some(p => A.FV_ERR_PALABRAS.has(p)), 'la lista no tiene palabras de dinero ni de la persona', DE_DINERO.filter(p => A.FV_ERR_PALABRAS.has(p)).join());

// ── 3. tipo y codigo ──
ok(A.fvErrTipo(new TypeError('x')) === 'TypeError', 'tipo normal');
class Raro extends Error { constructor(m) { super(m); this.name = 'Ana Belen'; } }
ok(A.fvErrTipo(new Raro('x')) === 'Otro', 'un name inventado no sale: Otro');
ok(A.fvErrTipo('renta 500') === 'Rechazo' && A.fvErrTipo(undefined) === 'Rechazo' && A.fvErrTipo({monto: 5}) === 'Rechazo', 'un rechazo que no es Error');
ok(A.fvErrCodigo({code: 'permission-denied'}) === 'permission-denied' && A.fvErrCodigo({code: 'auth/network-request-failed'}) === 'auth/network-request-failed', 'codigo de Firebase');
ok(A.fvErrCodigo({code: 20}) === undefined && A.fvErrCodigo({code: 'Ana Belen'}) === undefined && A.fvErrCodigo({code: 'a@b.mx'}) === undefined && A.fvErrCodigo({code: 'a'.repeat(61)}) === undefined && A.fvErrCodigo(null) === undefined, 'lo que no parece un codigo no sale');

// ── 4. archivo:linea:columna ──
const H = 'app.fundview.mx';
ok(A.fvErrMarco('https://app.fundview.mx/', 12, 5, H) === 'index.html:12:5', 'la raiz es index.html');
ok(A.fvErrMarco('https://app.fundview.mx/index.html?probar-sms=1#invitacion', 1, 2, H) === 'index.html:1:2', 'sin parametros ni marcas de la direccion');
ok(A.fvErrMarco('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', 1, 2, H) === 'firebase-auth.js:1:2', 'las librerias con su nombre');
ok(A.fvErrMarco('https://malo.com/ana-belen.js', 1, 2, H) === 'otro:1:2', 'un script ajeno no dice su nombre');
// (4-nov-2026, revision) el nombre del archivo solo sale si esta en una lista corta, aunque sea del mismo sitio: la direccion la puede escribir cualquiera
ok(A.fvErrMarco('https://app.fundview.mx/Juan-Perez', 1, 1, H) === 'otro:1:1', 'una ruta con nombre de persona en el mismo sitio es otro');
ok(A.fvErrMarco('https://app.fundview.mx/renta-de-marzo.js', 3, 4, H) === 'otro:3:4', 'un archivo del mismo sitio fuera de la lista es otro');
ok(A.fvErrMarco('https://app.fundview.mx/sw.js', 3, 4, H) === 'sw.js:3:4', 'sw.js si sale');
ok(A.fvErrMarco('https://www.gstatic.com/firebasejs/10.12.0/Juan-Perez.js', 1, 2, H) === 'otro:1:2', 'una libreria con nombre fuera de la lista es otro');
ok(A.fvErrMarco('https://malo.com/index.html', 1, 2, H) === 'otro:1:2' && A.fvErrMarco('https://malo.com/firebase-auth.js', 1, 2, H) === 'otro:1:2', 'un nombre de la lista en un sitio ajeno es otro');
ok(A.fvErrMarco('https://www.google.com/recaptcha/enterprise.js', 1, 2, H) === 'enterprise.js:1:2' && A.fvErrMarco('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', 1, 2, H) === 'exceljs.min.js:1:2', 'reCAPTCHA y Excel con su nombre');
ok(A.fvErrMarco('blob:x', 1, 2, H) === null, 'lo que no es http no cuenta');
const v8 = "TypeError: Cannot read properties of null (reading 'monto')\n    at altaGasto (https://app.fundview.mx/:9000:12)\n    at https://app.fundview.mx/:9100:3\n    at async x (https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js:1:2)\n    at y (https://app.fundview.mx/:1:1)";
const pila = A.fvErrPila(v8, H);
ok(JSON.stringify(pila.marcos) === JSON.stringify(['index.html:9000:12', 'index.html:9100:3', 'firebase-firestore.js:1:2']), 'Chrome: tres marcos, sin nombres de funcion', JSON.stringify(pila));
ok(!/monto|altaGasto/.test(JSON.stringify(pila)), 'ni el mensaje ni la funcion');
ok(JSON.stringify(A.fvErrPila('altaGasto@https://app.fundview.mx/:9000:12\ny@https://app.fundview.mx/index.html:5:6', H).marcos) === JSON.stringify(['index.html:9000:12', 'index.html:5:6']), 'Safari y Firefox');
ok(A.fvErrPila('at x (chrome-extension://abc/x.js:1:1)', H).ajeno === true, 'un error de una extension se reconoce');
// la pila empieza donde empiezan los marcos; el mensaje (primera linea del stack en Chrome) es texto de quien sea
const conLiga = 'Error: https://app.fundview.mx/Juan-Perez:1:1\n    at f (https://app.fundview.mx/:5:6)';
ok(JSON.stringify(A.fvErrPila(conLiga, H).marcos) === JSON.stringify(['index.html:5:6']), 'una liga en el mensaje no es un marco', JSON.stringify(A.fvErrPila(conLiga, H)));
ok(A.fvErrPila('Error: https://app.fundview.mx/Juan-Perez:1:1', H).marcos.length === 0, 'un stack que es solo mensaje no da marcos');
ok(A.fvErrPila('hola mama no\nhttps://app.fundview.mx/Juan-Perez:1:1', H).marcos.length === 0, 'una linea suelta con liga, sin at ni @, no es marco');
ok(JSON.stringify(A.fvErrPila('Error: ana@http://x:1:1 hola\n  at g (https://app.fundview.mx/sw.js:7:8)', H).marcos) === JSON.stringify(['sw.js:7:8']), 'una arroba con espacios en el mensaje no abre la pila');
ok(A.fvErrPila('Error: extension-chrome-extension://x:1:1\n  at g (https://app.fundview.mx/:1:1)', H).ajeno === false, 'chrome-extension dentro del mensaje no hace ajeno el error');
const rj = A.fvErrArmar({host: H, ua: 'Mozilla/5.0 (iPhone) AppleWebKit Version/17 Mobile Safari/604', version: 'abc123', pantalla: 'inicio', error: Object.assign(new Error('x'), {stack: 'Error: https://app.fundview.mx/Juan-Perez:1:1'}), archivo: 'https://app.fundview.mx/Juan-Perez', linea: 1, columna: 1});
ok(!/Juan|Perez/.test(JSON.stringify(rj)), 'el reporte no lleva el nombre de la ruta', JSON.stringify(rj));

// ── 5. el reporte completo ──
const armar = o => A.fvErrArmar({host: H, ua: 'Mozilla/5.0 (iPhone) AppleWebKit Version/17 Mobile Safari/604', version: 'abc123', pantalla: 'inicio', ...o});
const e1 = new Error('Renta de Ana $1,234.50 a ana@correo.mx'); e1.code = 'permission-denied'; e1.stack = 'Error\n at f (https://app.fundview.mx/:5:6)';
const r1 = armar({error: e1});
ok(JSON.stringify(Object.keys(r1).sort()) === JSON.stringify(['codigo', 'mensaje', 'navegador', 'pantalla', 'pila', 'tipo', 'version']), 'solo las llaves de la lista', Object.keys(r1).join());
ok(!/Renta|Ana|1,234|correo/.test(JSON.stringify(r1)) && !('uid' in r1) && !('correo' in r1), 'sin datos en ninguna llave', JSON.stringify(r1));
ok(r1.navegador === 'safari-movil' && r1.version === 'abc123' && r1.pantalla === 'inicio' && r1.codigo === 'permission-denied', 'con lo que sirve', JSON.stringify(r1));
ok(armar({mensaje: 'ResizeObserver loop completed with undelivered notifications.'}) === null, 'el ruido de ResizeObserver no se manda');
ok(armar({error: Object.assign(new Error('x'), {stack: 'at x (chrome-extension://abc/x.js:1:1)'})}) === null, 'lo de una extension no se manda');
ok(armar({mensaje: 'x', archivo: 'moz-extension://abc/x.js', linea: 1, columna: 1}) === null, 'tampoco sin pila, por el archivo');
const r2 = armar({mensaje: 'Script error.', archivo: '', linea: 0, columna: 0});
ok(r2.tipo === 'Rechazo' ? false : true, 'un error sin objeto no se cuenta como rechazo', JSON.stringify(r2));
const r3 = armar({error: 'renta de 500 pesos'});
ok(r3.tipo === 'Rechazo' && !/renta|500/.test(JSON.stringify(r3)), 'rechazo con un texto: sin el texto', JSON.stringify(r3));
const r4 = armar({tipo: 'ScriptNoCargo', archivo: 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js', linea: 0, columna: 0});
ok(r4.tipo === 'ScriptNoCargo' && r4.pila[0] === 'firebase-firestore.js:0:0', 'un script que no cargo', JSON.stringify(r4));

// ── 6. navegador y pantalla ──
const UA = {
  'chrome-movil': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
  'chrome': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
  'safari-movil': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'safari': 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  'firefox': 'Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0',
  'edge': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0',
  'samsung-movil': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  'otro': 'curl/8.0',
};
for (const [n, ua] of Object.entries(UA)) ok(A.fvErrNavegador(ua) === n, 'navegador ' + n, A.fvErrNavegador(ua));
ok(A.fvErrPantalla('inicio', null) === 'inicio' && A.fvErrPantalla(null, 'codigo') === 'entrada-codigo' && A.fvErrPantalla(null, null) === 'carga', 'pantalla');
ok(A.fvErrPantalla('Ana', null) === 'otra' && A.fvErrPantalla(null, 'Ana') === 'otra', 'lo que no esta en la lista es otra');

// ── 7. mutaciones: si alguien afloja la limpieza, esta prueba lo tiene que ver ──
const BLOQUE = HTML.slice(ini, fin);
const fuga = (a, b) => { if (BLOQUE.split(a).length !== 2) return 'sin el texto'; const X = new Function(BLOQUE.replace(a, b) + '\nreturn {fvErrMensaje};')(); return DATOS.filter(([, m, re]) => re.test(X.fvErrMensaje(m)) || /[0-9@$]/.test(X.fvErrMensaje(m))).length; };
ok(fuga('FV_ERR_PALABRAS.has(p.toLowerCase())', 'true') >= 5, 'mutacion: sin la lista de palabras, salen datos', fuga('FV_ERR_PALABRAS.has(p.toLowerCase())', 'true'));
ok(fuga('/^[A-Za-z]+$/.test(p)&&FV_ERR_PALABRAS.has(p.toLowerCase())', 'true') >= 10, 'mutacion: sin ninguna revision, salen montos y correos');

console.log('\n' + (fallas ? fallas + ' FALLAS' : 'TODO PASA') + ' — ' + pasan + '/' + (pasan + fallas));
process.exit(fallas ? 1 : 0);
