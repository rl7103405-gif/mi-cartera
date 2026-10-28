// Prueba del INTERES DEL FONDO SIN REGISTRAR (28-oct-2026, decision de Beto: "los rendimientos del fondo se quedan en
// el fondo"). Extrae de index.html deltaFondo, diaLocal, tramosFondo, pendienteFondoEntre y pendienteFondo, y los corre
// con un modelo de interes simple (sin bandas: el diario es proporcional a lo apartado) y un reloj fijo.
import fs from 'node:fs';
const APP = process.env.APP || new URL('./index.html', import.meta.url);
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const fn = nombre => { const i = HTML.indexOf('function ' + nombre + '('); if (i < 0) throw new Error('no esta ' + nombre);
  let j = HTML.indexOf('{', i), p = 0; for (; j < HTML.length; j++) { if (HTML[j] === '{') p++; else if (HTML[j] === '}' && --p === 0) return HTML.slice(i, j + 1); } };
const decl = HTML.match(/^const diaLocal = .*$/m);
if (!decl) { console.log('esta copia no tiene el interes del fondo por tramos: nada que probar'); process.exit(0); }

const DIA = 86400000, AHORA = new Date('2026-10-28T12:00:00').getTime(), TASA_DIA = 0.0002; // 0.02% diario sobre lo apartado
function motor(fondo, saldo) {
  const RealNow = Date.now; Date.now = () => AHORA;
  const f = new Function('state', 'CAMPO_COMP', 'getSaldoCuenta', 'modeloComp', 'calcCompoundAt', 'hoyLocal', 'parseFechaLocal', 'msFechaMov', 'nFin', 'c2',
    decl[0] + '\n' + ['deltaFondo', 'apartadoDe', 'tramosFondo', 'pendienteFondoEntre', 'pendienteFondo'].map(fn).join('\n') +
    '\nreturn {tramosFondo, pendienteFondoEntre, pendienteFondo, diaLocal};');
  const m = f({ fondo }, { revSavings: {} }, () => saldo, () => ({}),
    // interes lineal: x*(TASA_DIA*360) al año, para que el diario de F sea F*TASA_DIA exacto
    (x) => x * (1 + TASA_DIA * 360), () => '2026-10-28', s => new Date(s + 'T00:00:00'),
    s => { const t = new Date(s).getTime(); return Number.isFinite(t) ? t : null; },
    v => Number.isFinite(v) ? v : 0, n => Math.round(n * 100) / 100);
  return { m, fin: () => { Date.now = RealNow; } };
}
let ok = 0, mal = 0;
const chk = (n, c, d) => { if (c) { ok++; console.log('  PASA  ' + n); } else { mal++; console.log('  FALLA ' + n + '  -> ' + d); } };
const casi = (a, b) => Math.abs(a - b) < 0.011;
const hace = d => new Date(AHORA - d * DIA).toISOString();
const mov = (tipo, monto, dias, extra) => ({ tipo, monto, cuenta: 'revSavings', fecha: hace(dias), ...extra });

{ const { m, fin } = motor({ saldosPorCuenta: {}, movs: [] }, 50000); chk('sin fondo en la cuenta: 0', m.pendienteFondo('revSavings') === 0, m.pendienteFondo('revSavings')); fin(); }
{ const { m, fin } = motor({ saldosPorCuenta: { revSavings: 10000 }, movs: [] }, 50000);
  chk('fondo sin movimientos: 0 (no se inventan 30 dias)', m.pendienteFondo('revSavings') === 0, m.pendienteFondo('revSavings')); fin(); }
{ const { m, fin } = motor({ saldosPorCuenta: { revSavings: 10000 }, movs: [mov('apartar', 10000, 10)] }, 50000);
  chk('apartado hace 10 dias: 10 dias de interes de 10,000', casi(m.pendienteFondo('revSavings'), 10000 * TASA_DIA * 10), m.pendienteFondo('revSavings')); fin(); }
{ // apartar MAS dinero hace 4 dias NO reinicia: 6 dias con 10k + 4 dias con 15k
  const { m, fin } = motor({ saldosPorCuenta: { revSavings: 15000 }, movs: [mov('apartar', 5000, 4), mov('apartar', 10000, 10)] }, 50000);
  const esp = (10000 * 6 + 15000 * 4) * TASA_DIA;
  chk('apartar despues NO reinicia el reloj; cada tramo con lo apartado de entonces', casi(m.pendienteFondo('revSavings'), esp), m.pendienteFondo('revSavings') + ' vs ' + esp); fin(); }
{ // liberar tampoco reinicia
  const { m, fin } = motor({ saldosPorCuenta: { revSavings: 6000 }, movs: [mov('liberar', 4000, 3), mov('apartar', 10000, 10)] }, 50000);
  const esp = (10000 * 7 + 6000 * 3) * TASA_DIA;
  chk('liberar no reinicia el reloj', casi(m.pendienteFondo('revSavings'), esp), m.pendienteFondo('revSavings') + ' vs ' + esp); fin(); }
{ // registrar el abono SI reinicia: solo cuenta desde el abono
  const { m, fin } = motor({ saldosPorCuenta: { revSavings: 10020 }, movs: [mov('rendimiento', 20, 2), mov('apartar', 10000, 10)] }, 50000);
  const esp = 10020 * 2 * TASA_DIA;
  chk('registrar el abono reinicia: solo desde el abono', casi(m.pendienteFondo('revSavings'), esp), m.pendienteFondo('revSavings') + ' vs ' + esp); fin(); }
{ // traspaso hacia la cuenta suma al apartado de ese tramo (y el movimiento en desorden en el arreglo no importa)
  const { m, fin } = motor({ saldosPorCuenta: { revSavings: 12000 }, movs: [mov('apartar', 10000, 10), { tipo: 'traspaso', monto: 2000, cuenta: 'revolut', destino: 'revSavings', fecha: hace(5) }] }, 50000);
  const esp = (10000 * 5 + 12000 * 5) * TASA_DIA;
  chk('traspaso de otra cuenta suma al tramo; el orden del arreglo no importa', casi(m.pendienteFondo('revSavings'), esp), m.pendienteFondo('revSavings') + ' vs ' + esp); fin(); }
{ // antes + despues de una fecha = total
  const { m, fin } = motor({ saldosPorCuenta: { revSavings: 15000 }, movs: [mov('apartar', 5000, 4), mov('apartar', 10000, 10)] }, 50000);
  const corte = m.diaLocal(AHORA - 6 * DIA), antes = m.pendienteFondoEntre('revSavings', null, corte), despues = m.pendienteFondoEntre('revSavings', corte, null);
  chk('lo de antes de una fecha + lo de despues = el total', casi(antes + despues, m.pendienteFondo('revSavings')), antes + ' + ' + despues); fin(); }
{ // nunca mas diario que el saldo: si lo apartado supera el saldo se topa
  const { m, fin } = motor({ saldosPorCuenta: { revSavings: 10000 }, movs: [mov('apartar', 10000, 10)] }, 4000);
  chk('lo apartado arriba del saldo no genera interes', casi(m.pendienteFondo('revSavings'), 4000 * TASA_DIA * 10), m.pendienteFondo('revSavings')); fin(); }

console.log('\n==========================================================');
console.log(mal ? `FALLAN ${mal} de ${ok + mal}` : `TODO PASA — ${ok}/${ok + mal}`);
process.exit(mal ? 1 : 0);
