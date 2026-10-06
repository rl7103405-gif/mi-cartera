// Prueba de txDinero contra un Firestore SIMULADO.
// Reproduce el caso real del 27-ago-2026 y comprueba que ya no puede repetirse.
import fs from 'fs';

const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const NS  = process.env.NS  || 'cartera';
const PFX = process.env.PFX || '';
const HTML = fs.readFileSync(APP, 'utf8');

// ── Firestore falso ──────────────────────────────────────────
let SERVIDOR = {};                       // ruta -> objeto
const clon = o => JSON.parse(JSON.stringify(o));
// doc(collectionRef) crea una referencia nueva (asi crea txDinero los tramos de rendimiento)
const doc = (db, ...p) => (db && db.col && !p.length) ? docRef(db) : ({ path: p.join('/') });
const collection = (db, c) => ({ col: c });
let autoId = 0;
const docRef = ref => ref.col ? { path: ref.col + '/auto' + (++autoId) } : ref;

// set(...,{merge:true}) hace merge PROFUNDO de mapas (a diferencia de update() sin
// notacion de punto, que reemplaza el mapa anidado entero). Los arrays SI se reemplazan.
function mergeProfundo(viejo, nuevo) {
  const r = { ...viejo };
  for (const k in nuevo) {
    const v = nuevo[k];
    r[k] = (v && typeof v === 'object' && !Array.isArray(v) && r[k] && typeof r[k] === 'object' && !Array.isArray(r[k]))
      ? mergeProfundo(r[k], v) : v;
  }
  return r;
}
let intentos = 0, forzarConflicto = 0, rechazaUndefined = false;
async function runTransaction(db, cb, opts) {
  for (let intento = 0; intento < (opts?.maxAttempts || 5); intento++) {
    intentos++;
    const escrituras = [];
    let leyoDespuesDeEscribir = false;
    const tx = {
      get: async ref => {
        if (escrituras.length) leyoDespuesDeEscribir = true;   // viola la regla de Firestore
        const d = SERVIDOR[ref.path];
        return { exists: () => d !== undefined, data: () => clon(d) };
      },
      set: (ref, data, o) => {
        // Firestore real truena con undefined; solo se exige en las pruebas que lo activan (movimientos sin cuenta)
        if (rechazaUndefined && JSON.stringify(data, (k, v) => v === undefined ? '__UNDEF__' : v).includes('__UNDEF__')) throw new Error('undefined en set');
        escrituras.push({ t: 'set', ref, data, merge: !!(o && o.merge) }); },
      update: (ref, data) => escrituras.push({ t: 'update', ref, data }),
      delete: ref => escrituras.push({ t: 'del', ref })
    };
    const r = await cb(tx);
    if (leyoDespuesDeEscribir) throw new Error('VIOLACION: se leyo despues de escribir');
    if (r && r.error) return r;                    // aborta sin escribir: no aplica nada
    if (forzarConflicto > 0) { forzarConflicto--; continue; }  // simula reintento
    for (const w of escrituras) {
      if (w.t === 'del') delete SERVIDOR[w.ref.path];
      else if (w.merge) SERVIDOR[w.ref.path] = mergeProfundo(SERVIDOR[w.ref.path] || {}, w.data);
      else SERVIDOR[w.ref.path] = clon(w.data);
    }
    return r;
  }
  throw new Error('demasiados reintentos');
}

// ── stubs de la app ──────────────────────────────────────────
const db = {};
let datosCargados = true;
const setSyncDot = () => {};
const hoyLocal = () => '2026-08-27';
const parseFechaLocal = f => { const [a, m, d] = f.split('-').map(Number); return new Date(a, m - 1, d); };
const CUENTAS = { efectivo: 'efectivo', nu: 'NU saldo', cajita1: 'NU cajita 1', cajita2: 'NU cajita 2',
  gbm: 'GBM efectivo', revolut: 'Revolut MXN', revSavings: 'Revolut Savings' };
// calcCompoundAt y modeloComp se extraen del index.html REAL mas abajo (nucleoInteres):
// duplicarlos aqui haria que la prueba validara una copia y no el codigo publicado
const clampCero = v => Math.abs(v) < 0.005 ? 0 : v;
const state = { revTdcDeposito: 0 };
// La tarjeta 2 puede ser normal o garantizada en las copias de Eli y Tono; esa
// decision vive fuera del bloque de txDinero que se extrae abajo, asi que hay que
// inyectarla. En la app de Roberto siempre es garantizada, que es el valor por defecto.
let MODO_TDC = 'garantizada';
const tdcGarantizada = () => MODO_TDC === 'garantizada';
const movSinEfecto = m => m.pendiente === true || (m.porAtajo === true && m.aplicadoSaldo !== true);

// ── extraer txDinero y sus constantes del index.html real ────
function extrae(desde, hasta) {
  const i = HTML.indexOf(desde);
  if (i < 0) throw new Error('no encontrado: ' + desde);
  const j = HTML.indexOf(hasta, i);
  if (j < 0) throw new Error('fin no encontrado: ' + hasta);
  return HTML.slice(i, j);
}
// nucleo del interes por bandas, extraido del HTML real. Se toma cada funcion POR NOMBRE
// (cerrando llaves), no por comentarios: los comentarios cambian entre copias y esta
// prueba tambien corre contra las de Eli, Zoe y Tono (APP=... NS=... PFX=...)
function extraeFuncion(nombre) {
  const i = HTML.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontrado: function ' + nombre);
  let j = HTML.indexOf('{', i), prof = 0;
  for (; j < HTML.length; j++) {
    if (HTML[j] === '{') prof++;
    else if (HTML[j] === '}' && --prof === 0) return HTML.slice(i, j + 1);
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}
const nucleoInteres = extraeFuncion('calcCompoundAt') + '\n' + extraeFuncion('modeloComp');
const { calcCompoundAt, modeloComp } = new Function('parseFechaLocal',
  'const nFin = (v,d=0) => Number.isFinite(v) ? v : d;' + '\n' + nucleoInteres + '\nreturn { calcCompoundAt, modeloComp };')(parseFechaLocal);

// MIFEL_DEF vive arriba del estado (lo usan los defaults); CAMPO_COMP lo referencia. Solo existe en
// la app de Roberto: en las copias el match queda vacio y no cambia nada
const mifelDef = (HTML.match(/const MIFEL_DEF=\{[^}]*\};/) || [''])[0];
const fuente = mifelDef + '\n' + extrae('const nFin = (v,d=0)', '// aplica a memoria el resultado CANONICO');
const { txDinero, CAMPO_COMP } = new Function('db','datosCargados','doc','collection','runTransaction','setSyncDot',
  'hoyLocal','calcCompoundAt','modeloComp','clampCero','CUENTAS','state','movSinEfecto','NS','C_GASTOS','C_INGRESOS','C_TRANSF','C_OPS','tdcGarantizada','parseFechaLocal','PFX',
  fuente + '\nreturn { txDinero, CAMPO_COMP };')(db, datosCargados, doc, collection, runTransaction, setSyncDot,
  hoyLocal, calcCompoundAt, modeloComp, clampCero, CUENTAS, state, movSinEfecto, NS, PFX+'gastos', PFX+'ingresos', PFX+'transferencias', PFX+'stocksOps', tdcGarantizada, parseFechaLocal, PFX);

// las copias (Eli, Zoe, Tono) tienen calcCompoundAt(base, fecha, tasa, ms) sin bandas; las
// expectativas de abajo se calculan con la firma de la copia que se esta probando
const FIRMA_COPIA = /function calcCompoundAt\(base, fechaStr, tasaPct, ms(, diasBase)?\)/.test(HTML);
const calcEsp = FIRMA_COPIA ? ((b, f, ms, m) => calcCompoundAt(b, f, m.tasa, ms)) : calcCompoundAt;

// ── utilidades de prueba ─────────────────────────────────────
let fallos = 0, pruebas = 0;
function chk(nombre, cond, detalle = '') {
  pruebas++;
  if (cond) console.log('  PASA  ' + nombre);
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
const R = p => p.replace('cartera/', NS + '/').replace(/^(gastos|ingresos|transferencias)\//, (m,c)=>PFX+c+'/');
const ef = () => SERVIDOR[R(R('cartera/saldos'))].efectivo;

// ═══════════════ 1. EL CASO REAL DEL 27-AGO ═══════════════
console.log('\n1. El caso real: 10 altas y 10 borrados desde una pestana con memoria VIEJA');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 620, nuSaldo: 0, revMXN: 0, efectivoGBM: 0 } };
autoId = 0;
const creados = [];
for (let i = 0; i < 10; i++) {
  const ref = docRef(collection(db, PFX+'ingresos'));
  await txDinero({ deltas: { efectivo: 200 }, crear: [{ ref, data: { monto: 200, destino: 'efectivo' } }] });
  creados.push(ref);
}
chk('10 altas de $200 suben el saldo a $2,620', ef() === 2620, 'quedo ' + ef());
// ahora se borran, y da igual lo que esta pantalla creyera tener: el delta va sobre la nube
for (const ref of creados) await txDinero({ requerirDocs: [ref], borrar: [ref], deltas: { efectivo: -200 }, permitirNegativo: true });
chk('los 10 borrados devuelven el saldo a $620 (antes quedaba en -$1,380)', ef() === 620, 'quedo ' + ef());
chk('no quedan documentos de ingreso', Object.keys(SERVIDOR).filter(k => k.startsWith(PFX+'ingresos/')).length === 0);

// ═══════════════ 2. DOBLE BORRADO DEL MISMO MOVIMIENTO ═══════════════
console.log('\n2. Dos borrados del MISMO movimiento (dos dispositivos a la vez)');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 }, [R('ingresos/x1')]: { monto: 200 } };
const rx = { path: R('ingresos/x1') };
const r1 = await txDinero({ requerirDocs: [rx], borrar: [rx], deltas: { efectivo: -200 }, permitirNegativo: true });
const r2 = await txDinero({ requerirDocs: [rx], borrar: [rx], deltas: { efectivo: -200 }, permitirNegativo: true });
chk('el primero resta', r1.ok === true && ef() === 800, 'quedo ' + ef());
chk('el segundo se rechaza y NO resta de nuevo', !!r2.error && ef() === 800, JSON.stringify(r2));

// ═══════════════ 2b. EL MISMO PAGO DE SUSCRIPCION DESDE DOS APARATOS ═══════════════
// 22-sep-2026: el aviso "hoy toca" sale en TODOS los aparatos a la vez (y en la cartera de
// la casa, a tres personas). Cada pago lleva id fijo por mes y requerirAusentes hace que el
// segundo choque DENTRO de la transaccion, en vez de cobrar dos veces.
console.log('\n2b. Dos registros del MISMO pago de suscripcion (dos aparatos a la vez)');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 } };
const rs = { path: R(PFX + 'gastos/sus_limpieza01_2026-09') };
const pago = { cat: 'Casa', monto: 300, nota: 'limpieza', fuente: 'efectivo', suscripcion: 'limpieza01' };
const s1 = await txDinero({ requerirAusentes: [rs], crear: [{ ref: rs, data: pago }], deltas: { efectivo: -300 }, permitirNegativo: true });
const s2 = await txDinero({ requerirAusentes: [rs], crear: [{ ref: rs, data: pago }], deltas: { efectivo: -300 }, permitirNegativo: true });
chk('el primero registra y resta', s1.ok === true && ef() === 700, 'quedo ' + ef());
chk('el segundo se rechaza y NO resta de nuevo', !!s2.error && ef() === 700, JSON.stringify(s2) + ' quedo ' + ef());
chk('queda UN solo gasto de ese pago', Object.keys(SERVIDOR).filter(k => k.endsWith('sus_limpieza01_2026-09')).length === 1);

// ═══════════════ 2c. BORRAR UN PAGO QUE OTRO YA RECREO ═══════════════
// Como los pagos de suscripcion reusan el id del mes, un aparato con la copia VIEJA podia
// borrar el pago que otro acababa de recrear por otro monto y devolver el monto viejo:
// el saldo quedaba descuadrado. verificarIguales compara contra el documento del servidor.
console.log('\n2c. Borrar un pago de suscripcion que otro aparato ya recreo por otro monto');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 },
             [R(PFX + 'gastos/sus_gym000001_2026-09')]: { monto: 200, fuente: 'efectivo', cat: 'Salud' } };
const rg = { path: R(PFX + 'gastos/sus_gym000001_2026-09') };
// esta pantalla todavia cree que el pago era de $100
const malo = await txDinero({ verificarIguales: [{ ref: rg, campos: { monto: 100, fuente: 'efectivo' } }],
  movBorrar: { ref: rg, slot: 'efectivo', signo: 1, monto: 100 }, permitirNegativo: true });
chk('se rechaza borrar con el monto viejo', !!malo.error, JSON.stringify(malo));
chk('no se devolvio dinero de mas', ef() === 1000, 'quedo ' + ef());
chk('el gasto recreado sigue ahi', !!SERVIDOR[R(PFX + 'gastos/sus_gym000001_2026-09')]);
// con el monto correcto si borra
const bueno = await txDinero({ verificarIguales: [{ ref: rg, campos: { monto: 200, fuente: 'efectivo' } }],
  movBorrar: { ref: rg, slot: 'efectivo', signo: 1, monto: 200 }, permitirNegativo: true });
chk('con el monto correcto si borra y devuelve $200', bueno.ok === true && ef() === 1200, JSON.stringify(bueno) + ' quedo ' + ef());

// ═══════════════ 3. NO PISA CAMPOS QUE NO TOCA ═══════════════
console.log('\n3. Un delta a efectivo no debe tocar los demas campos');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 100, nuSaldo: 5000, revMXN: 77, nuCajita1Base: 25000, nuCajita1Fecha: '2026-01-01', nuCajita1Tasa: 13 } };
await txDinero({ deltas: { efectivo: 50 } });
const s3 = SERVIDOR[R('cartera/saldos')];
chk('efectivo sube', s3.efectivo === 150);
chk('nuSaldo intacto', s3.nuSaldo === 5000);
chk('revMXN intacto', s3.revMXN === 77);
chk('la cajita queda intacta', s3.nuCajita1Base === 25000 && s3.nuCajita1Fecha === '2026-01-01');

// ═══════════════ 4. SALDO INSUFICIENTE ═══════════════
console.log('\n4. Salidas sin fondos');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 100 } };
const rNeg = await txDinero({ deltas: { efectivo: -500 } });
chk('una SALIDA sin fondos se rechaza antes de escribir', !!rNeg.error && ef() === 100, JSON.stringify(rNeg));
const rNegOk = await txDinero({ deltas: { efectivo: -500 }, permitirNegativo: true });
chk('con permitirNegativo si pasa (gasto ya ocurrido)', rNegOk.ok === true && ef() === -400, 'quedo ' + ef());
const rEntra = await txDinero({ deltas: { efectivo: 100 } });
chk('con la cuenta en rojo, una ENTRADA nunca se bloquea', rEntra.ok === true && ef() === -300, 'quedo ' + ef());

// ═══════════════ 5. CUENTA DE INTERES COMPUESTO ═══════════════
console.log('\n5. Cajita: el delta se aplica sobre el saldo CON interes, y consolida');
const base = 25000, tasa = 13;
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: base, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: tasa } };
const esperado = calcEsp(base, '2026-08-01', Date.now(), modeloComp(SERVIDOR[R('cartera/saldos')], CAMPO_COMP.cajita1));
await txDinero({ deltas: { cajita1: 1000 } });
const s5 = SERVIDOR[R('cartera/saldos')];
chk('la base nueva = saldo con interes + delta', Math.abs(s5.nuCajita1Base - (Math.round((esperado + 1000) * 100) / 100)) < 0.01,
    'esperado ' + (esperado + 1000).toFixed(2) + ' obtuvo ' + s5.nuCajita1Base);
chk('la fecha base se mueve a hoy', s5.nuCajita1Fecha === '2026-08-27', s5.nuCajita1Fecha);
chk('la tasa NO se toca', s5.nuCajita1Tasa === tasa);

// ═══════════════ 6. IDEMPOTENCIA EN REINTENTOS ═══════════════
console.log('\n6. Un reintento de la transaccion no debe aplicar el delta dos veces');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 } };
forzarConflicto = 2;  // el callback correra 3 veces, solo la ultima escribe
await txDinero({ deltas: { efectivo: 250 } });
chk('tras 2 reintentos el saldo subio UNA sola vez', ef() === 1250, 'quedo ' + ef());

// ═══════════════ 7. TARJETA ═══════════════
console.log('\n7. Tarjeta de credito');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 5000 }, [R('cartera/tarjeta')]: { deuda: 1000, movimientos: [] } };
const rPagoExc = await txDinero({ tarjetaDelta: -2000, deltas: { efectivo: -2000 } });
chk('un pago mayor a la deuda se rechaza', !!rPagoExc.error && SERVIDOR[R('cartera/tarjeta')].deuda === 1000, JSON.stringify(rPagoExc));
chk('y NO descuenta de la cuenta origen', ef() === 5000, 'quedo ' + ef());
const rBorraCargo = await txDinero({ tarjetaDelta: -1500, permitirDeudaNegativa: true });
chk('borrar un cargo SI puede dejar saldo a favor', rBorraCargo.ok === true && SERVIDOR[R('cartera/tarjeta')].deuda === -500);

// ═══════════════ 8. PERSONAS: merge de una sola clave ═══════════════
console.log('\n8. Deudas: agregar a una persona no debe borrar a las otras');
SERVIDOR = { [R('cartera/personas')]: { data: { Papa: { nombre: 'Papa', saldo: 40000, movimientos: [] },
                                            Elita: { nombre: 'Elita', saldo: 144, movimientos: [] } } } };
await txDinero({ persona: { key: 'Papa', deltaSaldo: 500, movAdd: { id: 'm1', monto: 500 } } });
const P = SERVIDOR[R('cartera/personas')].data;
chk('el saldo de Papa sube', P.Papa.saldo === 40500, String(P.Papa.saldo));
chk('Elita sigue existiendo intacta', !!P.Elita && P.Elita.saldo === 144);
const rDup = await txDinero({ persona: { key: 'papa', nombre: 'papa', crear: true } });
chk('no deja crear una persona duplicada (sin distinguir mayusculas)', !!rDup.error, JSON.stringify(rDup));

// ═══════════════ 9. ORDEN LECTURAS / ESCRITURAS ═══════════════
console.log('\n9. Firestore exige TODAS las lecturas antes de escribir');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 100 }, [R('cartera/tarjeta')]: { deuda: 0, movimientos: [] },
             [R('cartera/tarjetaRev')]: { deuda: 0, deposito: 5000, movimientos: [] },
             [R('cartera/personas')]: { data: { A: { nombre: 'A', saldo: 0, movimientos: [] } } }, [R('gastos/g1')]: { monto: 1 } };
let ok9 = true;
try {
  await txDinero({ deltas: { efectivo: -10 }, tarjetaDelta: 5, tdcRevDelta: 5,
                   persona: { key: 'A', deltaSaldo: 1 }, requerirDocs: [{ path: R('gastos/g1') }],
                   borrar: [{ path: R('gastos/g1') }], permitirNegativo: true });
} catch (e) { ok9 = false; console.log('    ' + e.message); }
chk('el plan mas complejo no lee despues de escribir', ok9);

// ═══════════════ 10. CAPTURA MANUAL (guardarManuales) ═══════════════
console.log('\n10. Actualizar saldos a mano escribe SOLO lo capturado');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 620, nuSaldo: 5000, revMXN: 300 } };
SERVIDOR[R('cartera/saldos')].efectivo = 2620;   // lo que registro OTRO dispositivo entretanto
await txDinero({ absolutos: { nuSaldo: 7000 }, cristalizar: [] });
chk('el campo capturado se fija', SERVIDOR[R('cartera/saldos')].nuSaldo === 7000);
chk('NO pisa el efectivo que registro el otro dispositivo', ef() === 2620, 'quedo ' + ef());
chk('NO pisa revMXN', SERVIDOR[R('cartera/saldos')].revMXN === 300);

// ═══════════════ 11. CRISTALIZAR AL CAMBIAR LA TASA ═══════════════
console.log('\n11. Cambiar la tasa sin dar saldo base consolida el interes viejo');
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: 25000, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: 13 } };
const conTasaVieja = calcEsp(25000, '2026-08-01', Date.now(), modeloComp(SERVIDOR[R('cartera/saldos')], CAMPO_COMP.cajita1));
await txDinero({ cristalizar: ['cajita1'], absolutos: { nuCajita1Tasa: 9 } });
const s11 = SERVIDOR[R('cartera/saldos')];
chk('la base se consolida con la tasa VIEJA', Math.abs(s11.nuCajita1Base - Math.round(conTasaVieja * 100) / 100) < 0.01,
    'esperado ' + conTasaVieja.toFixed(2) + ' obtuvo ' + s11.nuCajita1Base);
chk('la fecha se mueve a hoy', s11.nuCajita1Fecha === '2026-08-27');
chk('la tasa nueva queda guardada', s11.nuCajita1Tasa === 9);

// ═══════════════ 12. BORRAR UN MOVIMIENTO DEL ATAJO ═══════════════
console.log('\n12. Borrar decide con las banderas del DOCUMENTO, no con la memoria');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 },
             [R('ingresos/a1')]: { monto: 200, destino: 'efectivo', porAtajo: true, pendiente: false, aplicadoSaldo: true } };
const rA = await txDinero({ permitirNegativo: true, movBorrar: { ref: { path: R('ingresos/a1') }, slot: 'efectivo', signo: -1, monto: 200 } });
chk('si el documento dice APLICADO, borrar SI revierte', rA.movAplicaba === true && ef() === 800, 'quedo ' + ef());

SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 },
             [R('ingresos/a2')]: { monto: 200, destino: 'efectivo', porAtajo: true, pendiente: true } };
const rB = await txDinero({ permitirNegativo: true, movBorrar: { ref: { path: R('ingresos/a2') }, slot: 'efectivo', signo: -1, monto: 200 } });
chk('si sigue PENDIENTE, borrar no toca el saldo', rB.movAplicaba === false && ef() === 1000, 'quedo ' + ef());
chk('y el documento si se borra', SERVIDOR[R('ingresos/a2')] === undefined);

SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 }, [R('cartera/tarjeta')]: { deuda: 500, movimientos: [] },
             [R('gastos/g9')]: { monto: 300, fuente: 'tarjeta', porAtajo: true, pendiente: false, aplicadoSaldo: false } };
const rC = await txDinero({ permitirNegativo: true, permitirDeudaNegativa: true, tarjetaDelta: -300,
                            movBorrar: { ref: { path: R('gastos/g9') }, slot: null, signo: 1, monto: 300 } });
chk('un gasto RECHAZADO del atajo no baja la deuda al borrarlo', rC.movAplicaba === false && SERVIDOR[R('cartera/tarjeta')].deuda === 500,
    'deuda ' + SERVIDOR[R('cartera/tarjeta')].deuda);
const rD = await txDinero({ permitirNegativo: true, movBorrar: { ref: { path: R('gastos/g9') }, slot: null, signo: 1, monto: 300 } });
chk('borrarlo de nuevo se rechaza', !!rD.error, JSON.stringify(rD));

// ═══════════════ 13. PISO DE $250 DEL DEPOSITO REVOLUT ═══════════════
console.log('\n13. Deposito de garantia de la TDC Revolut');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 0 }, [R('cartera/tarjetaRev')]: { deuda: 0, deposito: 1000, movimientos: [] } };
const rP = await txDinero({ deltas: { revTdcDep: -900, efectivo: 900 } });
chk('no deja bajar el deposito de $250', !!rP.error && SERVIDOR[R('cartera/tarjetaRev')].deposito === 1000, JSON.stringify(rP));
const rP2 = await txDinero({ deltas: { revTdcDep: -700, efectivo: 700 } });
chk('bajar hasta $300 si pasa', rP2.ok === true && SERVIDOR[R('cartera/tarjetaRev')].deposito === 300);
const rP3 = await txDinero({ tdcRevDeposito: 80000 });
chk('no deja pasar de $75,000', !!rP3.error, JSON.stringify(rP3));

// ═══════════════ 14. REINTENTOS *AL BORRAR* (el bug que cazo el QA) ═══════════════
// El callback de runTransaction puede correr varias veces. movBorrar SUMA sobre
// deltas[slot]; si ese objeto viniera del plan (y no fuera copia fresca por intento),
// el segundo intento partiria del valor del primero y revertiria el DOBLE.
// Solo en las copias donde la tarjeta 2 se configura (Eli y Tono). En la app de Roberto
// la condicion de limite se evalua siempre y este bloque se salta.
if (HTML.includes('tdcGarantizada()')) {
  console.log('\n13b. Tarjeta 2 en modo NORMAL: el limite del deposito no aplica');
  MODO_TDC = 'normal';
  SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 },
               [R('cartera/tarjetaRev')]: { deuda: 0, deposito: 0, movimientos: [] } };
  let rn = await txDinero({ tdcRevDelta: 100 });
  chk('un cargo de $100 sin deposito SI pasa (antes daba "excede el limite")', !rn.error, rn.error || '');
  chk('y la deuda queda registrada', SERVIDOR[R('cartera/tarjetaRev')].deuda === 100);

  console.log('\n13c. Y en modo GARANTIZADA el limite sigue vigente');
  MODO_TDC = 'garantizada';
  SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 },
               [R('cartera/tarjetaRev')]: { deuda: 0, deposito: 50, movimientos: [] } };
  rn = await txDinero({ tdcRevDelta: 100 });
  chk('un cargo de $100 con deposito de $50 se rechaza', !!rn.error, 'no se rechazo');
  chk('y la deuda NO se movio', SERVIDOR[R('cartera/tarjetaRev')].deuda === 0);
}

console.log('\n14. Borrar un movimiento CON reintentos de la transaccion');
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 },
             [R('ingresos/r1')]: { monto: 200, destino: 'efectivo' } };
forzarConflicto = 2;   // el callback correra 3 veces; solo la ultima escribe
await txDinero({ permitirNegativo: true,
                 movBorrar: { ref: { path: R('ingresos/r1') }, slot: 'efectivo', signo: -1, monto: 200 } });
chk('tras 2 reintentos se resta UNA sola vez (no $600)', ef() === 800, 'quedo ' + ef());

SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000 }, [R('cartera/tarjeta')]: { deuda: 900, movimientos: [] },
             [R('gastos/r2')]: { monto: 300, fuente: 'tarjeta' } };
forzarConflicto = 3;
await txDinero({ permitirNegativo: true, permitirDeudaNegativa: true, tarjetaDelta: -300,
                 movBorrar: { ref: { path: R('gastos/r2') }, slot: null, signo: 1, monto: 300 } });
chk('la deuda de la tarjeta baja UNA sola vez tras 3 reintentos', SERVIDOR[R('cartera/tarjeta')].deuda === 600,
    'quedo ' + SERVIDOR[R('cartera/tarjeta')].deuda);

// un plan con delta normal + reintentos (ya cubierto en 6, pero ahora con dos cuentas)
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 1000, nuSaldo: 500 } };
forzarConflicto = 4;
await txDinero({ deltas: { efectivo: -100, nu: 100 } });
chk('una transferencia con 4 reintentos mueve el monto UNA vez',
    ef() === 900 && SERVIDOR[R('cartera/saldos')].nuSaldo === 600,
    'efectivo ' + ef() + ' nu ' + SERVIDOR[R('cartera/saldos')].nuSaldo);

// =============== 15. INTERES POR BANDAS (caso real 1-sep-2026) ===============
// el modelo por bandas (tope, base 360, retencion) solo existe en mi-cartera: en las copias se
// saltan estas dos secciones (su interes es tasa nominal simple, y asi lo prueban las demas)
if (!FIRMA_COPIA) {
console.log('\n15. Modelo por bandas: Nu 13%/360 con tope, Revolut neto de ISR');
{
  const unDia = parseFechaLocal('2026-08-02').getTime();
  // Nu Cajita Turbo: $25,000 al 13%/360 = +$9.03 el primer dia (captura de Roberto)
  const nu1 = calcEsp(25000, '2026-08-01', unDia, modeloComp({}, CAMPO_COMP.cajita1));
  chk('Nu: $25,000 gana $9.03 en un dia (13%/360)', Math.abs(nu1 - 25009.03) < 0.005, 'dio ' + nu1);
  const dosDias = parseFechaLocal('2026-08-03').getTime();
  const nu2 = calcEsp(25000, '2026-08-01', dosDias, modeloComp({}, CAMPO_COMP.cajita1));
  chk('Nu: el excedente del tope gana la tasa baja (dia 2 = +$9.03)', Math.abs(nu2 - 25018.06) < 0.005, 'dio ' + nu2);
  // Revolut Savings: saldo real 22,254.95 -> interes del 1-sep +8.72 (15%/360 - 0.90% ISR/365; con la formula vieja tambien redondeaba a 8.72)
  const rev = calcEsp(22254.95, '2026-08-01', unDia, modeloComp({}, CAMPO_COMP.revSavings));
  chk('Revolut: $22,254.95 gana $8.72 en un dia (neto de ISR)', Math.abs(rev - 22263.67) < 0.005, 'dio ' + rev);
  const sinTope = modeloComp({ nuCajita1Tope: 0 }, CAMPO_COMP.cajita1);
  chk('tope 0 en el doc significa SIN tope', sinTope.tope === null, JSON.stringify(sinTope));
  const defs = modeloComp({}, CAMPO_COMP.revSavings);
  chk('doc viejo sin campos -> defaults (tope 25000, exc 7.3, ret 0.9)',
      defs.tope === 25000 && defs.tasaExc === 7.3 && defs.ret === 0.9 && defs.dias === 360, JSON.stringify(defs));
}

// =============== 16. CRISTALIZAR AL CAMBIAR EL TOPE ===============
console.log('\n16. Cambiar tope/tasa excedente consolida con el modelo viejo');
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: 26000, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: 13 } };
const conModeloViejo = calcEsp(26000, '2026-08-01', Date.now(), modeloComp(SERVIDOR[R('cartera/saldos')], CAMPO_COMP.cajita1));
await txDinero({ cristalizar: ['cajita1'], absolutos: { nuCajita1Tope: 30000, nuCajita1TasaExc: 5 } });
const s16 = SERVIDOR[R('cartera/saldos')];
chk('la base se consolida con el tope VIEJO (default 25000)', Math.abs(s16.nuCajita1Base - Math.round(conModeloViejo * 100) / 100) < 0.01,
    'esperado ' + conModeloViejo.toFixed(2) + ' obtuvo ' + s16.nuCajita1Base);
chk('el tope y la tasa excedente nuevos quedan guardados', s16.nuCajita1Tope === 30000 && s16.nuCajita1TasaExc === 5);

// =============== 17. FONDO DE LA UNIVERSIDAD: lo apartado no se toca ===============
// Solo en la app de Roberto (las copias no tienen fondo).
}
if (fuente.includes("'fondo'")) {
  console.log('\n17. Fondo de la universidad: dinero apartado dentro de las cuentas');
  const F = R('cartera/fondo'), S = R('cartera/saldos');
  SERVIDOR = { [S]: { revMXN: 1000, efectivo: 50 } };
  let r = await txDinero({ deltas:{revolut:800000}, fondo:{ delta:{revolut:800000}, mov:{id:'f1',tipo:'entrada',cuenta:'revolut',monto:800000} } });
  chk('entrada: sube el saldo y lo aparta en la MISMA transaccion',
      r.ok && SERVIDOR[S].revMXN === 801000 && SERVIDOR[F].saldosPorCuenta.revolut === 800000, JSON.stringify(r));
  r = await txDinero({ deltas:{revolut:-1500} });
  chk('un gasto normal que tomaria el fondo se rechaza y no mueve nada', !!r.error && SERVIDOR[S].revMXN === 801000, JSON.stringify(r));
  r = await txDinero({ deltas:{revolut:-900} });
  chk('un gasto que cabe en lo libre si pasa', r.ok && SERVIDOR[S].revMXN === 800100);
  r = await txDinero({ deltas:{revolut:500} });
  chk('una entrada normal nunca se bloquea', r.ok && SERVIDOR[S].revMXN === 800600);
  r = await txDinero({ absolutos:{revMXN:100} });
  chk('una captura manual que deja la cuenta bajo lo apartado se rechaza', !!r.error && SERVIDOR[S].revMXN === 800600);
  r = await txDinero({ deltas:{revolut:-10000}, fondo:{ delta:{revolut:-10000}, mov:{id:'f2',tipo:'salida',cuenta:'revolut',monto:10000} } });
  chk('salida del fondo: baja saldo y apartado juntos',
      r.ok && SERVIDOR[S].revMXN === 790600 && SERVIDOR[F].saldosPorCuenta.revolut === 790000, JSON.stringify(SERVIDOR[F]));
  r = await txDinero({ fondo:{ delta:{revolut:-800000}, mov:{id:'f3',tipo:'liberar',cuenta:'revolut',monto:800000} } });
  chk('no se libera mas de lo apartado', !!r.error && SERVIDOR[F].saldosPorCuenta.revolut === 790000);
  r = await txDinero({ fondo:{ delta:{revolut:700}, mov:{id:'f4',tipo:'apartar',cuenta:'revolut',monto:700} } });
  chk('apartar mas de lo que hay libre se rechaza (libre = 600)', !!r.error);
  r = await txDinero({ fondo:{ delta:{revolut:600}, mov:{id:'f5',tipo:'rendimiento',cuenta:'revolut',monto:600} } });
  chk('conciliar rendimiento: aparta exactamente lo libre sin mover el saldo',
      r.ok && SERVIDOR[S].revMXN === 790600 && SERVIDOR[F].saldosPorCuenta.revolut === 790600);
  chk('el historial del fondo va del mas nuevo al mas viejo y sin los rechazados',
      SERVIDOR[F].movs.map(m => m.id).join(',') === 'f5,f2,f1', SERVIDOR[F].movs.map(m => m.id).join(','));
  r = await txDinero({ deltas:{revolut:-5000, efectivo:5000}, fondo:{ delta:{revolut:-5000, efectivo:5000}, mov:{id:'f6',tipo:'traspaso',cuenta:'revolut',destino:'efectivo',monto:5000} } });
  chk('traspaso: saldo y apartado viajan juntos',
      r.ok && SERVIDOR[F].saldosPorCuenta.efectivo === 5000 && SERVIDOR[F].saldosPorCuenta.revolut === 785600 && SERVIDOR[S].efectivo === 5050,
      JSON.stringify(SERVIDOR[F].saldosPorCuenta));
  r = await txDinero({ deltas:{efectivo:-60} });
  chk('en la otra cuenta tambien protege: efectivo solo tiene $50 libres', !!r.error && SERVIDOR[S].efectivo === 5050);
  r = await txDinero({ fondo:{ delta:{efectivo:-5000}, mov:{id:'f7',tipo:'liberar',cuenta:'efectivo',monto:5000} } });
  chk('una cuenta que queda en cero desaparece del mapa', r.ok && SERVIDOR[F].saldosPorCuenta.efectivo === undefined, JSON.stringify(SERVIDOR[F].saldosPorCuenta));
  r = await txDinero({ fondo:{ delta:{gbm:10}, mov:{id:'x',tipo:'apartar',cuenta:'gbm',monto:10} } });
  chk('una cuenta fuera del catalogo del fondo se rechaza', !!r.error);
  // doc del fondo con basura: se sanea en vez de romper la transaccion
  SERVIDOR[F] = { saldosPorCuenta:{revolut:'mucho', nu:-5}, movs:'no' };
  r = await txDinero({ deltas:{revolut:-100} });
  chk('un doc del fondo corrupto no bloquea ni truena', r.ok, JSON.stringify(r));
  // cuenta con interes (Revolut Savings): el saldo final se calcula con su modelo
  SERVIDOR = { [S]: { revSavingsBase:1000, revSavingsFecha:'2026-08-27' }, [F]: { saldosPorCuenta:{revSavings:900}, movs:[] } };
  r = await txDinero({ deltas:{revSavings:-200} });
  chk('Savings: no deja sacar lo apartado', !!r.error);
  r = await txDinero({ deltas:{revSavings:-90} });
  chk('Savings: lo libre si sale', r.ok, JSON.stringify(r));
  // borrar un ingreso que dejaria la cuenta bajo lo apartado tambien se frena
  SERVIDOR = { [S]: { revMXN:1000 }, [F]: { saldosPorCuenta:{revolut:900}, movs:[] }, [R('ingresos/i9')]: { monto:200 } };
  const ri = { path: R('ingresos/i9') };
  r = await txDinero({ requerirDocs:[ri], borrar:[ri], deltas:{revolut:-200}, permitirNegativo:true });
  chk('borrar un ingreso que tomaria el fondo se rechaza (y el ingreso sigue)', !!r.error && !!SERVIDOR[R('ingresos/i9')] && SERVIDOR[S].revMXN === 1000);
  // el plan lo arma la pantalla: txDinero no le cree
  SERVIDOR = { [S]: { revMXN:1000 }, [F]: { saldosPorCuenta:{revolut:500}, movs:[] } };
  r = await txDinero({ deltas:{revolut:100}, fondo:{ delta:{revolut:100}, mov:{id:'t1',tipo:'traspaso',cuenta:'revolut',destino:'revolut',monto:100} } });
  chk('traspaso a la MISMA cuenta se rechaza (crearia dinero de la nada)', !!r.error && SERVIDOR[S].revMXN === 1000 && SERVIDOR[F].saldosPorCuenta.revolut === 500, JSON.stringify(r));
  r = await txDinero({ fondo:{ delta:{revolut:300}, mov:{id:'t2',tipo:'entrada',cuenta:'revolut',monto:300} } });
  chk('una entrada que no sube el saldo se rechaza', !!r.error && SERVIDOR[F].saldosPorCuenta.revolut === 500);
  r = await txDinero({ deltas:{revolut:-100}, fondo:{ delta:{revolut:-100}, mov:{id:'t3',tipo:'liberar',cuenta:'revolut',monto:100} } });
  chk('liberar no puede mover el saldo fisico', !!r.error && SERVIDOR[S].revMXN === 1000);
  r = await txDinero({ deltas:{revolut:500}, fondo:{ delta:{revolut:500}, mov:{id:'t4',tipo:'entrada',cuenta:'revolut',monto:100} } });
  chk('el apartado debe ser el monto del movimiento (no otro)', !!r.error && SERVIDOR[S].revMXN === 1000 && SERVIDOR[F].saldosPorCuenta.revolut === 500);
  r = await txDinero({ deltas:{nu:100}, fondo:{ delta:{nu:100}, mov:{id:'t5',tipo:'entrada',cuenta:'revolut',monto:100} } });
  chk('el apartado debe ir a la cuenta del movimiento', !!r.error && !(SERVIDOR[F].saldosPorCuenta.nu > 0));
  // sin fondo todo sigue igual que siempre
  SERVIDOR = { [S]: { efectivo:10 } };
  r = await txDinero({ deltas:{efectivo:-5} });
  chk('sin doc de fondo nada cambia', r.ok && SERVIDOR[S].efectivo === 5);
}

// ═══════════════ 16. TRAMOS DE RENDIMIENTO ═══════════════
console.log('\n16. Cada reanclaje de una cuenta de interes guarda el tramo que cerro');
const T = () => Object.entries(SERVIDOR).filter(([k]) => k.startsWith(PFX + 'rendimientos/')).map(([k, v]) => ({ id: k, ...v }));
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: 25000, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: 13 } };
const esperadoT = calcEsp(25000, '2026-08-01', Date.now(), modeloComp(SERVIDOR[R('cartera/saldos')], CAMPO_COMP.cajita1));
const rT = await txDinero({ deltas: { cajita1: 1000 } });
let ts = T();
chk('un deposito a la cajita cierra UN tramo', ts.length === 1, 'hay ' + ts.length);
chk('el tramo va de la fecha base vieja a hoy', ts.length === 1 && ts[0].ini === '2026-08-01' && ts[0].fin === '2026-08-27', JSON.stringify(ts[0]));
chk('el monto del tramo es el interes que se consolido', ts.length === 1 && Math.abs(ts[0].monto - Math.round((esperadoT - 25000) * 100) / 100) < 0.01,
    (ts[0] && ts[0].monto) + ' vs ' + (esperadoT - 25000).toFixed(2));
chk('base y modelo quedan guardados para recalcular por periodo', ts.length === 1 && ts[0].base === 25000 && ts[0].modelo && ts[0].modelo.tasa === 13 && ts[0].motivo === 'movimiento');
chk('la transaccion devuelve el tramo para la memoria', Array.isArray(rT.tramos) && rT.tramos.length === 1);
await txDinero({ deltas: { cajita1: -500 } });
chk('otro movimiento el MISMO dia no genera tramo (cero dias completos)', T().length === 1, 'hay ' + T().length);
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: 25000, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: 13 } };
await txDinero({ absolutos: { nuCajita1Base: 25200, nuCajita1Fecha: '2026-08-15' } });
ts = T();
const hasta15 = calcEsp(25000, '2026-08-01', parseFechaLocal('2026-08-15').getTime(), modeloComp({ nuCajita1Tasa: 13 }, CAMPO_COMP.cajita1));
chk('una captura con fecha PASADA cierra el tramo en esa fecha, no hoy', ts.length === 1 && ts[0].fin === '2026-08-15' && ts[0].motivo === 'captura', JSON.stringify(ts[0]));
chk('el interes del tramo llega solo hasta la fecha capturada', ts.length === 1 && Math.abs(ts[0].monto - Math.round((hasta15 - 25000) * 100) / 100) < 0.01);
chk('la diferencia con lo tecleado se guarda como AJUSTE, no como interes', ts.length === 1 && Math.abs(ts[0].ajuste - Math.round((25200 - hasta15) * 100) / 100) < 0.01, JSON.stringify(ts[0]));
chk('la nueva ancla es lo tecleado en su fecha', SERVIDOR[R('cartera/saldos')].nuCajita1Base === 25200 && SERVIDOR[R('cartera/saldos')].nuCajita1Fecha === '2026-08-15');
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: 25000, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: 13 } };
await txDinero({ cristalizar: ['cajita1'], absolutos: { nuCajita1Tasa: 9 } });
ts = T();
chk('cambiar la tasa cierra el tramo con la tasa VIEJA', ts.length === 1 && ts[0].motivo === 'tasa' && ts[0].modelo.tasa === 13, JSON.stringify(ts[0]));
SERVIDOR = { [R('cartera/saldos')]: { efectivo: 100, nuCajita1Base: 0, nuCajita1Fecha: '' } };
await txDinero({ deltas: { efectivo: 50 } });
await txDinero({ deltas: { cajita1: 100 } });
chk('sin saldo base no se inventa ningun tramo', T().length === 0, 'hay ' + T().length);
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: 25000, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: 13 } };
forzarConflicto = 2;
await txDinero({ deltas: { cajita1: 10 } });
chk('con reintentos el tramo se escribe UNA sola vez', T().length === 1, 'hay ' + T().length);

// (correcciones de la revision de Codex del 16-sep)
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: 25000, nuCajita1Fecha: '2026-08-10', nuCajita1Tasa: 13 } };
const rAtras = await txDinero({ absolutos: { nuCajita1Base: 24000, nuCajita1Fecha: '2026-08-01' } });
chk('una fecha base anterior a la vigente se rechaza (pisaria dias ya cerrados)', !!rAtras.error && SERVIDOR[R('cartera/saldos')].nuCajita1Base === 25000 && T().length === 0, JSON.stringify(rAtras));
const rMix = await txDinero({ absolutos: { nuCajita1Base: 25100, nuCajita1Fecha: '2026-08-15' }, deltas: { cajita1: 100 } });
chk('capturar y mover la misma cuenta en una operacion se rechaza (dejaria un hueco)', !!rMix.error && T().length === 0, JSON.stringify(rMix));
SERVIDOR = { [R('cartera/saldos')]: { nuCajita1Base: 25000, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: 0 } };
await txDinero({ deltas: { cajita1: 100 } });
chk('con tasa cero el tramo se guarda igual: es capital aunque el interes sea 0', T().length === 1 && T()[0].monto === 0, 'hay ' + T().length);

// =============== 19. MIFEL (25-sep-2026) ===============
// Solo en la app de Roberto. Reloj FIJO en esta seccion: hoyLocal() del arnes dice 2026-08-27 y
// txDinero toma 'ahora' de Date.now(); si no coinciden, el interes depende del dia en que se corra.
if (CAMPO_COMP.mifel) {
  console.log('\n19. Mifel: 10% bruto hasta $500,000, 0% arriba, retencion que no rebasa el interes');
  const nowReal = Date.now;
  Date.now = () => parseFechaLocal('2026-08-27').getTime() + 12 * 3600e3;
  try {
    const S = R('cartera/saldos'), F = R('cartera/fondo');
    const mM = modeloComp({}, CAMPO_COMP.mifel);
    chk('defaults del producto: 10% / tope 500,000 / excedente 0 / ret 0.9 / base 360 / retCap',
        mM.tasa === 10 && mM.tope === 500000 && mM.tasaExc === 0 && mM.ret === 0.9 && mM.dias === 360 && mM.retCap === true, JSON.stringify(mM));
    chk('las demas cuentas NO llevan retCap (su calculo no cambia)',
        modeloComp({}, CAMPO_COMP.revSavings).retCap === false && modeloComp({}, CAMPO_COMP.cajita1).retCap === false);
    const d1 = parseFechaLocal('2026-08-02').getTime();
    const m500 = calcCompoundAt(500000, '2026-08-01', d1, mM);
    // 1-oct-2026: interes /360 y retencion de ISR /365 (como lo documenta Revolut)
    chk('$500,000 gana $126.56 en un dia (10%/360 - 0.9%/365)', Math.abs(m500 - 500126.56) < 0.005, 'dio ' + m500);
    // versionado: un tramo cerrado antes del 1-oct no trae retDias y se recalcula con la formula vieja
    const { retDias: _rd, ...mViejo } = mM;
    chk('modeloComp marca la retencion sobre 365 (retDias)', mM.retDias === 365, JSON.stringify(mM));
    chk('tramo viejo sin retDias conserva su formula ((10% - 0.9%)/360 = +$126.39)', Math.abs(calcCompoundAt(500000, '2026-08-01', d1, mViejo) - 500126.39) < 0.005);
    const m850 = calcCompoundAt(850000, '2026-08-01', d1, mM);
    chk('$850,000: el excedente al 0% no resta retencion (+$126.56, no +$117.93)', Math.abs(m850 - 850126.56) < 0.005, 'dio ' + m850);
    const m850sin = calcCompoundAt(850000, '2026-08-01', d1, { ...mM, retCap: false });
    chk('sin retCap el excedente al 0% resta su retencion (+$117.93)', Math.abs(m850sin - 850117.93) < 0.005, 'dio ' + m850sin);
    chk('tope 0 en el doc = sin tope tambien en Mifel', modeloComp({ mifelTope: 0 }, CAMPO_COMP.mifel).tope === null);

    // el deposito del lunes: cuenta nueva (doc sin campos de Mifel), dinero nuevo al fondo
    SERVIDOR = { [S]: { revMXN: 1000, efectivo: 50 } };
    let r = await txDinero({ deltas: { mifel: 500000 }, fondo: { delta: { mifel: 500000 }, mov: { id: 'm1', tipo: 'entrada', cuenta: 'mifel', monto: 500000 } } });
    chk('primer deposito: base, fecha de hoy y apartado en la MISMA transaccion',
        r.ok && SERVIDOR[S].mifelBase === 500000 && SERVIDOR[S].mifelFecha === '2026-08-27' && SERVIDOR[F].saldosPorCuenta.mifel === 500000, JSON.stringify(r));
    chk('una cuenta recien creada no inventa un tramo', T().length === 0, 'hay ' + T().length);
    chk('el total del doc de saldos conserva lo que no toco', SERVIDOR[S].revMXN === 1000 && SERVIDOR[S].efectivo === 50);
    r = await txDinero({ deltas: { mifel: -1 } });
    chk('no deja sacar un peso de lo apartado en Mifel', !!r.error && SERVIDOR[S].mifelBase === 500000, JSON.stringify(r));
    r = await txDinero({ absolutos: { mifelBase: 400000 } });
    chk('una captura que deja Mifel bajo lo apartado se rechaza', !!r.error && SERVIDOR[S].mifelBase === 500000);

    // traspaso del fondo Revolut Savings -> Mifel: saldo y apartado viajan juntos
    SERVIDOR = { [S]: { revSavingsBase: 400000, revSavingsFecha: '2026-08-27', mifelBase: 0, mifelFecha: '' },
                 [F]: { saldosPorCuenta: { revSavings: 350000 }, movs: [] } };
    r = await txDinero({ deltas: { revSavings: -100000, mifel: 100000 },
                         fondo: { delta: { revSavings: -100000, mifel: 100000 }, mov: { id: 'm2', tipo: 'traspaso', cuenta: 'revSavings', destino: 'mifel', monto: 100000 } } });
    chk('traspaso del fondo Savings -> Mifel', r.ok && SERVIDOR[F].saldosPorCuenta.mifel === 100000 && SERVIDOR[F].saldosPorCuenta.revSavings === 250000
        && SERVIDOR[S].mifelBase === 100000 && SERVIDOR[S].revSavingsBase === 300000, JSON.stringify(SERVIDOR[F].saldosPorCuenta));

    // mover dinero cierra el tramo de Mifel con su modelo (y la opcion retCap viaja en el tramo)
    SERVIDOR = { [S]: { mifelBase: 500000, mifelFecha: '2026-08-20' } };
    const esperado7 = calcCompoundAt(500000, '2026-08-20', Date.now(), mM);
    r = await txDinero({ deltas: { mifel: 100 } });
    const t7 = T();
    chk('mover dinero cierra un tramo de Mifel con 7 dias de interes',
        r.ok && t7.length === 1 && t7[0].slot === 'mifel' && Math.abs(t7[0].monto - Math.round((esperado7 - 500000) * 100) / 100) < 0.01, JSON.stringify(t7[0]));
    chk('el tramo guarda el modelo de Mifel con retCap', t7.length === 1 && t7[0].modelo.tasa === 10 && t7[0].modelo.tope === 500000 && t7[0].modelo.retCap === true, JSON.stringify(t7[0] && t7[0].modelo));
    // versionado del ISR /365: el tramo nuevo lo recuerda, y recalcularlo da su saldoFin (la frontera no salta)
    chk('el tramo nuevo guarda retDias:365', t7.length === 1 && t7[0].modelo.retDias === 365, JSON.stringify(t7[0] && t7[0].modelo));
    if (t7.length === 1 && Number.isFinite(t7[0].saldoFin)) {
      const rec = calcCompoundAt(t7[0].base, t7[0].ini, parseFechaLocal(t7[0].fin).getTime(), t7[0].modelo);
      chk('recalcular el tramo nuevo da su saldoFin (sin salto en la frontera)', Math.abs(rec - t7[0].saldoFin) < 0.005, 'rec ' + rec + ' vs ' + t7[0].saldoFin);
    }

    // cambiar la tasa (fin de la promocion) consolida con la tasa VIEJA
    SERVIDOR = { [S]: { mifelBase: 500000, mifelFecha: '2026-08-20' } };
    r = await txDinero({ cristalizar: ['mifel'], absolutos: { mifelTasa: 7, mifelVigencia: '' } });
    chk('tasa nueva: la base se consolida con el 10% y el tramo cierra por "tasa"',
        r.ok && Math.abs(SERVIDOR[S].mifelBase - Math.round(esperado7 * 100) / 100) < 0.01 && T()[0].motivo === 'tasa' && T()[0].modelo.tasa === 10, JSON.stringify(SERVIDOR[S]));
    chk('la tasa y la vigencia nuevas quedan guardadas', SERVIDOR[S].mifelTasa === 7 && SERVIDOR[S].mifelVigencia === '');

    // una version vieja de la app no debe borrar el apartado de una cuenta que no conoce
    SERVIDOR = { [S]: { revMXN: 2000 },
                 [F]: { saldosPorCuenta: { revolut: 1000, cuentaNueva: 5000 },
                        movs: [{ id: 'aj', tipo: 'entrada', cuenta: 'cuentaNueva', monto: 5000 }, { id: 'k1', tipo: 'entrada', cuenta: 'revolut', monto: 1000 }] } };
    r = await txDinero({ fondo: { delta: { revolut: 500 }, mov: { id: 'k2', tipo: 'apartar', cuenta: 'revolut', monto: 500 } } });
    chk('al reescribir el fondo se conserva el apartado de una cuenta desconocida',
        r.ok && SERVIDOR[F].saldosPorCuenta.cuentaNueva === 5000 && SERVIDOR[F].saldosPorCuenta.revolut === 1500, JSON.stringify(SERVIDOR[F].saldosPorCuenta));
    chk('y sus movimientos, en su orden', SERVIDOR[F].movs.map(m => m.id).join(',') === 'k2,aj,k1', SERVIDOR[F].movs.map(m => m.id).join(','));
  } finally { Date.now = nowReal; }
}

// ═══════════════ EDITAR UN MOVIMIENTO (movEditar, 5-oct-2026) ═══════════════
// Editar = revertir lo viejo y aplicar lo nuevo con el MISMO id, en una sola transaccion.
// Solo corre si la copia ya trae movEditar.
if (fuente.includes('movEditar')) {
  console.log('\nE. Editar monto y cuenta de un gasto/ingreso');
  const G = R(PFX + 'gastos/e1'), I = R(PFX + 'ingresos/e2'), S = R('cartera/saldos');
  const tj = () => (SERVIDOR[R('cartera/tarjeta')] || {}).deuda;
  const gasto = (monto, fuente, extra = {}) => ({ cat: 'Comida', monto, nota: 'x', fuente, fecha: '2026-08-20T00:00:00Z', creado: '2026-08-20T18:00:00Z', ...extra });
  const editar = (ref, signo, a, d, campos, extra = {}) => txDinero({ permitirNegativo: true, permitirDeudaNegativa: true,
    movEditar: { ref: { path: ref }, signo, antes: a, despues: d, datos: campos }, ...extra });

  // E1: subir el monto en la misma cuenta = saca solo la diferencia
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: gasto(100, 'efectivo') };
  let r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: 'efectivo' },
    { verificarIguales: [{ ref: { path: G }, campos: { monto: 100, fuente: 'efectivo' } }] });
  chk('E1 subir de 100 a 150 saca 50 mas', r.ok && ef() === 950, JSON.stringify(r) + ' ef ' + ef());
  chk('E1 el gasto queda con el monto nuevo y el mismo id', SERVIDOR[G].monto === 150 && SERVIDOR[G].fuente === 'efectivo');
  chk('E1 no se pierden campos que no se editaron (nota, creado)', SERVIDOR[G].nota === 'x' && SERVIDOR[G].creado === '2026-08-20T18:00:00Z');

  // E2: cambiar de cuenta = regresa a la vieja y saca de la nueva
  SERVIDOR = { [S]: { efectivo: 1000, nuSaldo: 500 }, [G]: gasto(100, 'efectivo') };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'nu', monto: 100 }, { monto: 100, fuente: 'nu' });
  chk('E2 de efectivo a NU: efectivo +100, NU -100', r.ok && ef() === 1100 && SERVIDOR[S].nuSaldo === 400, JSON.stringify(SERVIDOR[S]));

  // E3: editar = borrar + crear en saldos (misma foto final)
  SERVIDOR = { [S]: { efectivo: 1000, nuSaldo: 500 }, [G]: gasto(120, 'efectivo') };
  await editar(G, 1, { slot: 'efectivo', monto: 120 }, { slot: 'nu', monto: 80 }, { monto: 80, fuente: 'nu' });
  const editado = { ...SERVIDOR[S] };
  SERVIDOR = { [S]: { efectivo: 1000, nuSaldo: 500 }, [G]: gasto(120, 'efectivo') };
  await txDinero({ permitirNegativo: true, movBorrar: { ref: { path: G }, slot: 'efectivo', signo: 1, monto: 120 } });
  await txDinero({ permitirNegativo: true, deltas: { nu: -80 } });
  chk('E3 editar deja los mismos saldos que borrar y volver a crear', editado.efectivo === SERVIDOR[S].efectivo && editado.nuSaldo === SERVIDOR[S].nuSaldo,
    JSON.stringify(editado) + ' vs ' + JSON.stringify(SERVIDOR[S]));

  // E4: de efectivo a tarjeta: regresa el efectivo y sube la deuda
  SERVIDOR = { [S]: { efectivo: 1000 }, [R('cartera/tarjeta')]: { deuda: 300, movimientos: [] }, [G]: gasto(100, 'efectivo') };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: null, monto: 100 }, { monto: 100, fuente: 'tarjeta' }, { tarjetaDelta: 100 });
  chk('E4 de efectivo a tarjeta: efectivo +100, deuda +100', r.ok && ef() === 1100 && tj() === 400, 'ef ' + ef() + ' deuda ' + tj());
  // y de tarjeta a efectivo
  SERVIDOR = { [S]: { efectivo: 1000 }, [R('cartera/tarjeta')]: { deuda: 300, movimientos: [] }, [G]: gasto(100, 'tarjeta') };
  r = await editar(G, 1, { slot: null, monto: 100 }, { slot: 'efectivo', monto: 100 }, { monto: 100, fuente: 'efectivo' }, { tarjetaDelta: -100 });
  chk('E4b de tarjeta a efectivo: deuda -100, efectivo -100', r.ok && ef() === 900 && tj() === 200, 'ef ' + ef() + ' deuda ' + tj());

  // E5: pendiente del Atajo: cambian los datos, NO los saldos (el Atajo aplicara el monto nuevo)
  SERVIDOR = { [S]: { efectivo: 1000 }, [R('cartera/tarjeta')]: { deuda: 300, movimientos: [] }, [G]: gasto(100, 'efectivo', { porAtajo: true, pendiente: true }) };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: null, monto: 250 }, { monto: 250, fuente: 'tarjeta' }, { tarjetaDelta: 250 });
  chk('E5 pendiente del Atajo: saldos y deuda intactos', r.ok && ef() === 1000 && tj() === 300, 'ef ' + ef() + ' deuda ' + tj());
  chk('E5 pero los datos si cambian y las banderas del Atajo se conservan', SERVIDOR[G].monto === 250 && SERVIDOR[G].fuente === 'tarjeta' && SERVIDOR[G].pendiente === true && SERVIDOR[G].porAtajo === true);

  // E6: otro aparato ya lo cambio: verificarIguales aborta sin mover nada
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: gasto(130, 'efectivo') };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: 'efectivo' },
    { verificarIguales: [{ ref: { path: G }, campos: { monto: 100, fuente: 'efectivo' } }] });
  chk('E6 si otro aparato lo cambio, aborta sin escribir', !!r.error && ef() === 1000 && SERVIDOR[G].monto === 130, JSON.stringify(r));

  // E7: ya no existe
  SERVIDOR = { [S]: { efectivo: 1000 } };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: 'efectivo' });
  chk('E7 si ya lo borraron, aborta y no lo resucita', !!r.error && ef() === 1000 && SERVIDOR[G] === undefined, JSON.stringify(r));

  // E8: reintentos de la transaccion: no se aplica dos veces
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: gasto(100, 'efectivo') };
  forzarConflicto = 2;
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 300 }, { monto: 300, fuente: 'efectivo' });
  chk('E8 con dos reintentos solo se saca la diferencia una vez', r.ok && ef() === 800, 'ef ' + ef());

  // E9: ingreso: bajar el monto y cambiar de cuenta (signo -1)
  SERVIDOR = { [S]: { efectivo: 1000, nuSaldo: 500 }, [I]: { cat: 'Trabajo', monto: 400, destino: 'efectivo', fecha: '2026-08-20T00:00:00Z' } };
  r = await editar(I, -1, { slot: 'efectivo', monto: 400 }, { slot: 'nu', monto: 350 }, { monto: 350, destino: 'nu' });
  chk('E9 ingreso de 400 en efectivo a 350 en NU: efectivo -400, NU +350', r.ok && ef() === 600 && SERVIDOR[S].nuSaldo === 850, JSON.stringify(SERVIDOR[S]));

  // E10: dejar una cuenta en rojo se permite (se avisa en pantalla)
  SERVIDOR = { [S]: { efectivo: 50 }, [G]: gasto(10, 'efectivo') };
  r = await editar(G, 1, { slot: 'efectivo', monto: 10 }, { slot: 'efectivo', monto: 100 }, { monto: 100, fuente: 'efectivo' });
  chk('E10 subir un gasto que deja la cuenta en rojo se registra (permitirNegativo)', r.ok && ef() === -40 && r.saldos.efectivo === -40, JSON.stringify(r));

  // E11: cuenta de interes: se reancla y se cierra el tramo, como en un alta
  if (CAMPO_COMP.cajita1) {
    SERVIDOR = { [S]: { efectivo: 0, nuCajita1Base: 10000, nuCajita1Fecha: '2026-08-01', nuCajita1Tasa: 13, nuCajita1Tope: 0 },
                 [I]: { cat: 'Trabajo', monto: 1000, destino: 'efectivo', fecha: '2026-08-20T00:00:00Z' } };
    r = await editar(I, -1, { slot: 'efectivo', monto: 1000 }, { slot: 'cajita1', monto: 1000 }, { monto: 1000, destino: 'cajita1' });
    const tramos = Object.keys(SERVIDOR).filter(k => k.includes('rendimientos'));
    chk('E11 mover un ingreso a la cajita reancla su base y cierra un tramo', r.ok && SERVIDOR[S].nuCajita1Fecha === '2026-08-27' && SERVIDOR[S].nuCajita1Base > 11000 && tramos.length === 1,
      JSON.stringify(SERVIDOR[S]) + ' tramos ' + tramos.length);
  }

  // E12: Atajo RECHAZADO en el servidor: nunca fue dinero, editar monto/cuenta aborta sin escribir
  // (sin verificarIguales: asi se prueba la rama del propio txDinero, no la comparacion de banderas)
  SERVIDOR = { [S]: { efectivo: 1000, nuSaldo: 500 }, [G]: gasto(100, 'efectivo', { porAtajo: true, pendiente: false, aplicadoSaldo: false }) };
  const antes12 = JSON.stringify(SERVIDOR);
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'nu', monto: 150 }, { monto: 150, fuente: 'nu' });
  chk('E12 rechazado en el servidor: aborta con mensaje y no escribe nada', !!r.error && /rechazado/.test(r.error) && JSON.stringify(SERVIDOR) === antes12, JSON.stringify(r));

  // E13: el resultado trae el documento fusionado con las banderas del SERVIDOR
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: gasto(100, 'efectivo', { porAtajo: true, pendiente: false, aplicadoSaldo: true }) };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 160 }, { monto: 160, fuente: 'efectivo' });
  chk('E13 movEditado trae banderas del servidor + lo escrito', r.ok && r.movEditado && r.movEditado.aplicadoSaldo === true && r.movEditado.porAtajo === true
      && r.movEditado.pendiente === false && r.movEditado.monto === 160 && r.movEditado.nota === 'x' && r.movEditado.cat === 'Comida', JSON.stringify(r.movEditado));

  // E14: datos sin cat/nota/fecha NO tocan esos campos (otro aparato pudo haberlos corregido)
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: gasto(100, 'efectivo', { cat: 'Casa', nota: 'corregida en otro aparato', fecha: '2026-08-11T00:00:00Z' }) };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 120 }, { monto: 120, fuente: 'efectivo' });
  chk('E14 cat, nota y fecha del servidor quedan intactas', r.ok && SERVIDOR[G].cat === 'Casa' && SERVIDOR[G].nota === 'corregida en otro aparato'
      && SERVIDOR[G].fecha === '2026-08-11T00:00:00Z' && SERVIDOR[G].monto === 120, JSON.stringify(SERVIDOR[G]));
  // un movimiento legado SIN fecha: no se le inventa una (y nunca viaja undefined)
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: { cat: 'Comida', monto: 100, fuente: 'efectivo' } };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 120 }, { monto: 120, fuente: 'efectivo' });
  chk('E14b legado sin fecha: se edita el monto y no aparece fecha', r.ok && !('fecha' in SERVIDOR[G]) && SERVIDOR[G].monto === 120, JSON.stringify(SERVIDOR[G]));

  // E15: verificarIguales con banderas del Atajo distintas a las que vio la pantalla: aborta
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: gasto(100, 'efectivo', { porAtajo: true, pendiente: false, aplicadoSaldo: true }) };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: 'efectivo' },
    { verificarIguales: [{ ref: { path: G }, campos: { monto: 100, fuente: 'efectivo', pendiente: true, aplicadoSaldo: undefined } }] });
  chk('E15 banderas distintas a las vistas: aborta sin escribir', !!r.error && /cambió en otro aparato/.test(r.error) && ef() === 1000 && SERVIDOR[G].monto === 100, JSON.stringify(r));
  // y las MISMAS banderas (incluso ausentes, undefined===undefined) pasan
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: gasto(100, 'efectivo') };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: 'efectivo' },
    { verificarIguales: [{ ref: { path: G }, campos: { monto: 100, fuente: 'efectivo', pendiente: undefined, aplicadoSaldo: undefined } }] });
  chk('E15b banderas ausentes iguales a las vistas: pasa', r.ok && ef() === 950, JSON.stringify(r));
  // un campo de metadatos cambiado en otro aparato tambien aborta
  SERVIDOR = { [S]: { efectivo: 1000 }, [G]: gasto(100, 'efectivo', { nota: 'otra' }) };
  r = await editar(G, 1, { slot: 'efectivo', monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: 'efectivo', nota: 'mia' },
    { verificarIguales: [{ ref: { path: G }, campos: { monto: 100, fuente: 'efectivo', nota: 'x' } }] });
  chk('E15c nota cambiada en otro aparato y editada aqui: aborta', !!r.error && SERVIDOR[G].nota === 'otra' && ef() === 1000, JSON.stringify(r));

  // E16: fondo de la universidad: subir un gasto en una cuenta con apartado debe bloquear
  if (fuente.includes("'fondo'")) {
    const F = R('cartera/fondo');
    SERVIDOR = { [S]: { revMXN: 1000 }, [F]: { saldosPorCuenta: { revolut: 900 }, movs: [] }, [G]: gasto(50, 'revolut') };
    r = await editar(G, 1, { slot: 'revolut', monto: 50 }, { slot: 'revolut', monto: 200 }, { monto: 200, fuente: 'revolut' });
    chk('E16 subir un gasto que tomaria el dinero del fondo se rechaza y no escribe', !!r.error && /fondo/.test(r.error) && SERVIDOR[S].revMXN === 1000 && SERVIDOR[G].monto === 50, JSON.stringify(r));
    r = await editar(G, 1, { slot: 'revolut', monto: 50 }, { slot: 'revolut', monto: 140 }, { monto: 140, fuente: 'revolut' });
    chk('E16b subirlo hasta lo libre (cabe) si pasa', r.ok && SERVIDOR[S].revMXN === 910 && SERVIDOR[G].monto === 140, JSON.stringify(r));
  }

  // E17: TDC Revolut: un cargo editado que excede el deposito (limite) se rechaza
  SERVIDOR = { [S]: { efectivo: 1000 }, [R('cartera/tarjetaRev')]: { deuda: 900, deposito: 1000, movimientos: [] }, [G]: gasto(100, 'tarjetaRev') };
  r = await editar(G, 1, { slot: null, monto: 100 }, { slot: null, monto: 300 }, { monto: 300, fuente: 'tarjetaRev' }, { tdcRevDelta: 200 });
  chk('E17 editar un cargo de TDC Revolut por encima del deposito: error y no escribe', !!r.error && /límite/.test(r.error)
      && SERVIDOR[G].monto === 100 && SERVIDOR[R('cartera/tarjetaRev')].deuda === 900, JSON.stringify(r));

  // E18: movimiento SIN cuenta (legado o del Atajo, sin fuente/destino). Nunca afecto ninguna cuenta:
  // antes.slot = null (no se revierte nada), y NUNCA viaja undefined a tx.set ni en datos.
  rechazaUndefined = true;
  try {
    const sinCta = (monto, extra = {}) => ({ cat: 'Comida', monto, nota: 'x', fecha: '2026-08-20T00:00:00Z', ...extra });
    const igualesSin = { monto: 100, fuente: undefined, pendiente: undefined, aplicadoSaldo: undefined };
    // control: el simulador SI detecta un undefined en datos (si no, las pruebas de abajo no probarian nada)
    SERVIDOR = { [S]: { efectivo: 1000 }, [G]: sinCta(100) };
    let truena = false;
    try { await editar(G, 1, { slot: null, monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: undefined }); } catch (e) { truena = /undefined/.test(e.message); }
    chk('E18 control: el simulador rechaza un undefined en datos', truena);
    // el usuario elige cuenta: no se revierte nada (nunca afecto), solo se saca lo nuevo
    SERVIDOR = { [S]: { efectivo: 1000 }, [G]: sinCta(100) };
    r = await editar(G, 1, { slot: null, monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: 'efectivo' },
      { verificarIguales: [{ ref: { path: G }, campos: igualesSin }] });
    chk('E18 gasto sin fuente + eligen efectivo: saca 150 y no devuelve nada', r.ok && ef() === 850 && SERVIDOR[G].fuente === 'efectivo' && SERVIDOR[G].monto === 150, JSON.stringify(r) + ' ef ' + ef());
    // ingreso sin destino + eligen NU
    SERVIDOR = { [S]: { efectivo: 1000, nuSaldo: 500 }, [I]: { cat: 'Trabajo', monto: 400, fecha: '2026-08-20T00:00:00Z' } };
    r = await editar(I, -1, { slot: null, monto: 400 }, { slot: 'nu', monto: 300 }, { monto: 300, destino: 'nu' },
      { verificarIguales: [{ ref: { path: I }, campos: { monto: 400, destino: undefined, pendiente: undefined, aplicadoSaldo: undefined } }] });
    chk('E18 ingreso sin destino + eligen NU: suma 300 solo ahi, efectivo intacto', r.ok && SERVIDOR[S].nuSaldo === 800 && ef() === 1000 && SERVIDOR[I].destino === 'nu', JSON.stringify(SERVIDOR[S]));
    // pendiente del Atajo sin cuenta: solo cambia el monto; datos sin campo de cuenta, nada se escribe con undefined
    SERVIDOR = { [S]: { efectivo: 1000 }, [G]: sinCta(100, { porAtajo: true, pendiente: true }) };
    r = await editar(G, 1, { slot: null, monto: 100 }, { slot: null, monto: 200 }, { monto: 200 },
      { verificarIguales: [{ ref: { path: G }, campos: { monto: 100, fuente: undefined, pendiente: true, aplicadoSaldo: undefined } }] });
    chk('E18 pendiente del Atajo sin cuenta: cambia el monto, saldos intactos, sin campo fuente', r.ok && ef() === 1000 && SERVIDOR[G].monto === 200 && !('fuente' in SERVIDOR[G]), JSON.stringify(SERVIDOR[G]));
    // si otro aparato le puso cuenta mientras tanto, verificarIguales (undefined !== 'nu') aborta
    SERVIDOR = { [S]: { efectivo: 1000, nuSaldo: 500 }, [G]: sinCta(100, { fuente: 'nu' }) };
    r = await editar(G, 1, { slot: null, monto: 100 }, { slot: 'efectivo', monto: 150 }, { monto: 150, fuente: 'efectivo' },
      { verificarIguales: [{ ref: { path: G }, campos: igualesSin }] });
    chk('E18 otro aparato ya le asigno cuenta: aborta sin mover saldos', !!r.error && ef() === 1000 && SERVIDOR[G].fuente === 'nu', JSON.stringify(r));
    // el codigo REAL de la pantalla: datos solo lleva el campo de cuenta si hay cuenta
    const iG = HTML.indexOf('window.guardarEdicionMov = async function'), cuerpoG = HTML.slice(iG, HTML.indexOf('\n};', iG));
    chk('E18 guardarEdicionMov arma datos sin undefined (campo de cuenta condicionado)', /if\(cuenta\) datos\[campo\]=cuenta/.test(cuerpoG) && !/const datos=\{[^}]*\[campo\]:cuenta/.test(cuerpoG));
    chk('E18 guardarEdicionMov exige cuenta si el movimiento tiene efecto', /if\(!cuenta && !movSinEfecto\(it\)\)\{ showToast\(/.test(cuerpoG));
    // el texto del efecto no dice "undefined" cuando no hay cuenta original
    const iT = HTML.indexOf('function textoEfectoEdit('); let dd = 0, jj = HTML.indexOf('{', iT);
    for (; jj < HTML.length; jj++) { if (HTML[jj] === '{') dd++; else if (HTML[jj] === '}') { dd--; if (!dd) break; } }
    const textoEfecto = new Function('CUENTAS', 'fmt', 'c2', HTML.slice(iT, jj + 1) + '\nreturn textoEfectoEdit;')(CUENTAS, n => '$' + n, n => Math.round(n * 100) / 100);
    const t1 = textoEfecto('gasto', undefined, 100, 'efectivo', 150), t2 = textoEfecto('ingreso', undefined, 100, 'nu', 150), t3 = textoEfecto('gasto', undefined, 100, 'tarjeta', 150);
    chk('E18 el texto del efecto sin cuenta original no dice undefined', !/undefined|null/.test(t1 + t2 + t3) && /saca \$150/.test(t1) && /suma \$150/.test(t2) && /sube \$150/.test(t3), [t1, t2, t3].join(' | '));
    // el modal no pinta pastilla para una cuenta ausente
    const iE = HTML.indexOf('window.editarMovimiento = function'), cuerpoE = HTML.slice(iE, HTML.indexOf('\n};', iE));
    chk('E18 editarMovimiento no agrega pastilla para una cuenta ausente', /if \(it\[campo\] && !opciones\.includes\(it\[campo\]\)\) opciones\.unshift/.test(cuerpoE) && /sin cuenta registrada/.test(cuerpoE));
  } finally { rechazaUndefined = false; }
}

console.log('\n' + '='.repeat(58));
console.log(fallos === 0 ? `TODO PASA — ${pruebas}/${pruebas}` : `${fallos} FALLAS de ${pruebas}`);
process.exit(fallos === 0 ? 0 : 1);
