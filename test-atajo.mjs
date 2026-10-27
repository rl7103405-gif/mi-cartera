// Prueba del Atajo de iOS (procesarPendientesAtajo) contra un Firestore SIMULADO (27-oct-2026).
// El Atajo mueve saldos por FUERA de txDinero: es dinero real. Esta prueba corre la version actual
// (extraida de index.html) y la de antes del registro de cuentas (test-atajo-viejo.js) sobre los
// MISMOS movimientos pendientes al azar, y exige que dejen el servidor y la memoria identicos.
import fs from 'fs';

const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const VIEJO = fs.readFileSync(new URL('./test-atajo-viejo.js', import.meta.url), 'utf8');

const ini = HTML.indexOf('// ── REGISTRO DE CUENTAS'), fin = HTML.indexOf('// ── fin registro de cuentas');
if (ini < 0 || fin < ini) { console.log('esta copia no tiene registro de cuentas: nada que probar'); process.exit(0); }
const registro = HTML.slice(ini, fin);
function fnDe(nombre, desde = HTML) {
  let i = desde.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontrada: function ' + nombre);
  if (desde.slice(i - 6, i) === 'async ') i -= 6;   // sin esto, una funcion async pierde su await
  let j = desde.indexOf('{', i), d = 0;
  for (; j < desde.length; j++) { if (desde[j] === '{') d++; else if (desde[j] === '}' && --d === 0) return desde.slice(i, j + 1); }
}
function lineaConst(nombre) {
  const m = HTML.match(new RegExp('^\\s*const ' + nombre + '\\s*=.*$', 'm'));
  if (!m) throw new Error('no encontrada: const ' + nombre); return m[0].trim();
}

// ── Firestore falso (mismo modelo que test-dinero.mjs) ──
const clon = o => JSON.parse(JSON.stringify(o));
function mundo() {
  const SERVIDOR = {};
  const doc = (db, ...p) => ({ path: p.join('/') });
  async function runTransaction(db, cb) {
    const escrituras = [];
    const tx = {
      get: async ref => { if (escrituras.length) throw new Error('VIOLACION: lectura despues de escribir');
        const d = SERVIDOR[ref.path]; return { exists: () => d !== undefined, data: () => clon(d) }; },
      set: (ref, data, o) => escrituras.push({ ref, data, merge: !!(o && o.merge) }),
      update: (ref, data) => escrituras.push({ ref, data, merge: true })
    };
    const r = await cb(tx);
    for (const w of escrituras) SERVIDOR[w.ref.path] = w.merge ? { ...(SERVIDOR[w.ref.path] || {}), ...clon(w.data) } : clon(w.data);
    return r;
  }
  return { SERVIDOR, doc, runTransaction };
}
// saneaFondo real: el Atajo lo usa para no tomar dinero apartado
const fondoSrc = HTML.slice(HTML.indexOf('// ── fondo: saneo'), HTML.indexOf('// ── fin saneo fondo'));
const DEPS = registro + '\n' + ['CUENTAS', 'FUENTES_GASTO', 'DESTINOS_INGRESO', 'CAMPO_SIMPLE'].map(lineaConst).join('\n') + '\n' +
  'const nFin = (v,d=0) => Number.isFinite(v) ? v : d;\n' + fondoSrc;
function fabrica(m, state) {
  return new Function('db', 'doc', 'runTransaction', 'state', 'console',
    DEPS + '\n' + fnDe('procesarPendientesAtajo') + '\n' + VIEJO +
    '\nreturn {nueva: procesarPendientesAtajo, vieja: procesarPendientesAtajoViejo};')({}, m.doc, m.runTransaction, state, { error() {} });
}

// semilla fija (mulberry32): un caso que falle se puede repetir
let semilla = 7;
const rnd = () => { let t = semilla += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const elige = a => a[Math.floor(rnd() * a.length)];
const CTAS = ['efectivo', 'nu', 'revolut', 'tarjeta', 'tarjetaRev', 'gbm', 'cajita1', 'mifel', 'externo', undefined];
const MONTOS = [50, 999.99, 0, -10, NaN, 12000000, 300.5, 1500];

function escenario() {
  const SERV = {
    'cartera/saldos': { efectivo: elige([500, 0, NaN, 2000, '300', null]), nuSaldo: elige([1000, 50, Infinity, '1e3']), revMXN: elige([30000, 10, null]), efectivoGBM: elige([0, 77, 'x']), otraCosa: 'x' },
    'cartera/tarjeta': { deuda: elige([0, 400]) },
    'cartera/fondo': rnd() < 0.5 ? { saldosPorCuenta: { revolut: elige([0, 29000, 30000]), efectivo: elige([0, 450]) }, movs: [] } : undefined
  };
  if (rnd() < 0.7) SERV['cartera/tarjetaRev'] = { deuda: elige([0, 200]), deposito: elige([250, 1000]), movimientos: [] };
  const gastos = [], ingresos = [];
  const n = 1 + Math.floor(rnd() * 6);
  for (let k = 0; k < n; k++) {
    const esG = rnd() < 0.65, id = (esG ? 'g' : 'i') + k;
    const mov = { monto: elige(MONTOS), cat: elige(['Comida', '', 'Otros']), fecha: elige(['2026-10-2' + k, 'no-fecha']), pendiente: rnd() < 0.9 };
    if (esG) mov.fuente = elige(CTAS); else mov.destino = elige(CTAS);
    SERV[(esG ? 'gastos/' : 'ingresos/') + id] = mov;
    (esG ? gastos : ingresos).push({ id, pendiente: true, fecha: mov.fecha });
  }
  for (const k in SERV) if (SERV[k] === undefined) delete SERV[k];
  return { SERV, gastos, ingresos };
}

let fallos = 0, pruebas = 0;
function chk(nombre, cond, detalle = '') {
  pruebas++;
  if (cond) console.log('  PASA  ' + nombre);
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '\n        ' + detalle : '')); }
}
const txt = o => JSON.stringify(o, (k, v) => Number.isNaN(v) ? 'NaN' : v);

console.log('\nAtajo de iOS: la version actual = la de antes del registro, sobre los mismos pendientes');
let difServ = 0, difState = 0, difRes = 0, aplicados = 0, rechazados = 0, ej = '';
for (let n = 0; n < 3000; n++) {
  const e = escenario();
  const correr = async quien => {
    const m = mundo(); Object.assign(m.SERVIDOR, clon(e.SERV));
    const state = { gastos: clon(e.gastos), ingresos: clon(e.ingresos), efectivo: 1, nuSaldo: 2, revMXN: 3, efectivoGBM: 4,
      tarjetaDeuda: 5, revTdcDeuda: 6, revTdcDeposito: 250 };
    const f = fabrica(m, state);
    const res = await f[quien]();
    return { serv: m.SERVIDOR, state, res };
  };
  const a = await correr('nueva'), b = await correr('vieja');
  if (txt(a.serv) !== txt(b.serv)) { difServ++; ej = ej || txt(e.SERV); }
  if (txt(a.state) !== txt(b.state)) { difState++; ej = ej || txt(e.SERV); }
  if (txt(a.res) !== txt(b.res)) difRes++;
  if (a.res) { aplicados += a.res.aplicados; rechazados += a.res.rechazados; }
}
chk('3,000 lotes: el servidor queda identico', difServ === 0, difServ + ' diferencias · ej ' + ej);
chk('3,000 lotes: la memoria (state) queda identica', difState === 0, difState + ' diferencias · ej ' + ej);
chk('3,000 lotes: el resumen (aplicados/rechazados) es el mismo', difRes === 0, difRes + ' diferencias');
// la prueba sirve solo si ejercita las dos ramas
chk('hubo movimientos aplicados y rechazados (la prueba cubre ambos)', aplicados > 500 && rechazados > 500, aplicados + ' aplicados, ' + rechazados + ' rechazados');

console.log('\nBolsa (operarStock): el mapa cuenta → campo sale del registro');
{
  const R = new Function(registro + '\n' + lineaConst('CAMPO_SIMPLE') + '\n' + lineaConst('CTAS_STOCK_OP') + '\nreturn {CAMPO_SIMPLE, CTAS_STOCK_OP};')();
  const viejo = { efectivo: 'efectivo', nu: 'nuSaldo', revolut: 'revMXN' };
  chk('para cada cuenta de bolsa, el campo es el de antes (externo no toca saldos)',
    R.CTAS_STOCK_OP.every(c => (R.CAMPO_SIMPLE[c] || null) === (viejo[c] || null)), R.CTAS_STOCK_OP.map(c => c + '→' + R.CAMPO_SIMPLE[c]).join(', '));
  const op = fnDe('operarStock');
  chk('operarStock toma el campo de CAMPO_SIMPLE', /const campo=CAMPO_SIMPLE\[d\.cuenta\]\|\|null;/.test(op));
  chk('operarStock aplica el saldo nuevo por ese mismo campo', /if\(campo\) state\[campo\]=res\.nuevoSaldo;/.test(op));
}

console.log('\n==========================================================');
console.log(fallos === 0 ? `TODO PASA — ${pruebas}/${pruebas}` : `${fallos} FALLAS de ${pruebas}`);
process.exit(fallos ? 1 : 0);
