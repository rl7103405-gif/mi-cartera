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
const doc = (db, ...p) => ({ path: p.join('/') });
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
let intentos = 0, forzarConflicto = 0;
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
      set: (ref, data, o) => escrituras.push({ t: 'set', ref, data, merge: !!(o && o.merge) }),
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
// nucleo del interes por bandas, extraido del HTML real
const nucleoInteres = extrae('// modelo por bandas de saldo', 'function descModelo');
const { calcCompoundAt, modeloComp } = new Function('parseFechaLocal',
  nucleoInteres + '\nreturn { calcCompoundAt, modeloComp };')(parseFechaLocal);

const fuente = extrae('const nFin = (v,d=0)', '// aplica a memoria el resultado CANONICO');
const { txDinero, CAMPO_COMP } = new Function('db','datosCargados','doc','collection','runTransaction','setSyncDot',
  'hoyLocal','calcCompoundAt','modeloComp','clampCero','CUENTAS','state','movSinEfecto','NS','C_GASTOS','C_INGRESOS','C_TRANSF','C_OPS','tdcGarantizada',
  fuente + '\nreturn { txDinero, CAMPO_COMP };')(db, datosCargados, doc, collection, runTransaction, setSyncDot,
  hoyLocal, calcCompoundAt, modeloComp, clampCero, CUENTAS, state, movSinEfecto, NS, PFX+'gastos', PFX+'ingresos', PFX+'transferencias', PFX+'stocksOps', tdcGarantizada);

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
const esperado = calcCompoundAt(base, '2026-08-01', Date.now(), modeloComp(SERVIDOR[R('cartera/saldos')], CAMPO_COMP.cajita1));
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
const conTasaVieja = calcCompoundAt(25000, '2026-08-01', Date.now(), modeloComp(SERVIDOR[R('cartera/saldos')], CAMPO_COMP.cajita1));
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
console.log('\n15. Modelo por bandas: Nu 13%/360 con tope, Revolut neto de ISR');
{
  const unDia = parseFechaLocal('2026-08-02').getTime();
  // Nu Cajita Turbo: $25,000 al 13%/360 = +$9.03 el primer dia (captura de Roberto)
  const nu1 = calcCompoundAt(25000, '2026-08-01', unDia, modeloComp({}, CAMPO_COMP.cajita1));
  chk('Nu: $25,000 gana $9.03 en un dia (13%/360)', Math.abs(nu1 - 25009.03) < 0.005, 'dio ' + nu1);
  const dosDias = parseFechaLocal('2026-08-03').getTime();
  const nu2 = calcCompoundAt(25000, '2026-08-01', dosDias, modeloComp({}, CAMPO_COMP.cajita1));
  chk('Nu: el excedente del tope gana la tasa baja (dia 2 = +$9.03)', Math.abs(nu2 - 25018.06) < 0.005, 'dio ' + nu2);
  // Revolut Savings: saldo real 22,254.95 -> interes del 1-sep +8.72 (15% - 0.90% ISR, /360)
  const rev = calcCompoundAt(22254.95, '2026-08-01', unDia, modeloComp({}, CAMPO_COMP.revSavings));
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
const conModeloViejo = calcCompoundAt(26000, '2026-08-01', Date.now(), modeloComp(SERVIDOR[R('cartera/saldos')], CAMPO_COMP.cajita1));
await txDinero({ cristalizar: ['cajita1'], absolutos: { nuCajita1Tope: 30000, nuCajita1TasaExc: 5 } });
const s16 = SERVIDOR[R('cartera/saldos')];
chk('la base se consolida con el tope VIEJO (default 25000)', Math.abs(s16.nuCajita1Base - Math.round(conModeloViejo * 100) / 100) < 0.01,
    'esperado ' + conModeloViejo.toFixed(2) + ' obtuvo ' + s16.nuCajita1Base);
chk('el tope y la tasa excedente nuevos quedan guardados', s16.nuCajita1Tope === 30000 && s16.nuCajita1TasaExc === 5);

console.log('\n' + '='.repeat(58));
console.log(fallos === 0 ? `TODO PASA — ${pruebas}/${pruebas}` : `${fallos} FALLAS de ${pruebas}`);
process.exit(fallos === 0 ? 0 : 1);
