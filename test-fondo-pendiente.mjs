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
    // un dia de interes lineal: el diario de F es F*TASA_DIA exacto
    (x) => x * (1 + TASA_DIA), () => '2026-10-28', s => new Date(s + 'T00:00:00'),
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

// ── DETALLE DE LA TARJETA CON FONDO (4-nov-2026, decision de Beto) ──
// La tarjeta dice lo que la cajita genera SIN el fondo; lo que gana el fondo se queda en el fondo. Aqui corre el codigo real de
// index.html (modelo, tramos, detalle y las cuentas del resumen) con el reloj fijo. Las cifras NO salen de la app: se calcularon
// aparte, en decimal de 40 digitos, y se pegan como literales. La tasa es 36% entre 360 = 0.1% diario para poder revisarlas a
// mano: 100,000 x 1.001^30 = 103,043.91. diario(F) = g(S) - g(S-F), con g = lo que genera en UN dia (decision de Beto, 4-nov):
// 0.001 por peso sin bandas. Por eso 20,000 x 10 dias = 200.
const CTA = { base: 'B', fecha: 'FB', tasa: 'T', tope: 'TP', tasaExc: 'TE', ret: 'RT', def: { dias: 360, tasa: 0, tope: null, tasaExc: 0, ret: 0 } };
const FNS = ['calcCompoundAt', 'modeloComp', 'calcCompAt', 'getSaldoCuenta', 'deltaFondo', 'apartadoDe', 'tramosFondo', 'pendienteFondoEntre', 'pendienteFondo', 'fondoEnCuenta',
  'saldoTuyo', 'rendFondoRegistrado', 'rendFondoDesdeBase', 'pendienteFondoAntesDeBase', 'rendPropioAcumulado', 'detalleCajita', 'rendFondoEnRango', 'pendienteFondoEnRango', 'rendEstimadoFondoMes',
  'parseFechaLocal', 'msFechaMov', 'hoyLocal', 'saneaTramo', 'tramosDe', 'semillaDe', 'interesTramoEn', 'tramoAbierto', 'interesEnRango', 'inicioHistoria', 'rendAcumulado'];
const fecha = dias => { const d = new Date(AHORA - dias * DIA); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function motorReal(b, baseHace, modelo, movs, sp, extra) {
  const RealNow = Date.now; Date.now = () => AHORA;
  const CAMPO_COMP = { revSavings: { ...CTA, def: { ...CTA.def, retCap: !!modelo.cap } } };
  const state = { B: b, FB: baseHace === null ? '' : fecha(baseHace), T: modelo.tasa, TP: modelo.tope || 0, TE: modelo.exc || 0, RT: modelo.ret || 0,
    fondo: { saldosPorCuenta: sp === undefined ? {} : { revSavings: sp }, movs }, rendimientos: (extra && extra.tramos) || [] };
  const f = new Function('state', 'CAMPO_COMP', 'CAMPO_SIMPLE', 'CTAS_FONDO', 'esFechaReal', 'nFin', 'c2',
    decl[0] + '\n' + FNS.map(fn).join('\n') + '\nreturn {' + FNS.join(',') + ',diaLocal};');
  const m = f(state, CAMPO_COMP, {}, ['revSavings'], s => /^\d{4}-\d{2}-\d{2}$/.test(s), v => Number.isFinite(v) ? v : 0, n => Math.round(n * 100) / 100);
  return { m, state, fin: () => { Date.now = RealNow; } };
}
const c = v => Math.round(v * 100);
const M36 = { tasa: 36 };
const ap = (monto, dias, extra) => mov('apartar', monto, dias, extra);
// [nombre, B, base hace, modelo, movs, A, esperado]; esperado a mano: S total tarjeta base rend fondo pend
const CASOS = [
  ['C1 fondo ANTES de la base', 100000, 30, M36, [ap(20000, 40)], 20000,
    { tarjeta: 82243.91, base: 79800, rend: 2443.91, fondo: 600, total: 3043.91, pend: 800 }],
  ['C2 fondo DESPUES de la base (el bug: antes decia $0.00)', 100000, 30, M36, [ap(20000, 10)], 20000,
    { tarjeta: 82843.91, base: 80000, rend: 2843.91, fondo: 200, total: 3043.91, pend: 200 }],
  ['C3 apartado total el dia de la base', 10000, 30, M36, [ap(10000, 30)], 10000,
    { tarjeta: 4.39, base: 0, rend: 4.39, fondo: 300, total: 304.39, pend: 300 }],
  ['C4 apartado total despues de la base', 10000, 30, M36, [ap(10000, 10)], 10000,
    { tarjeta: 204.39, base: 0, rend: 204.39, fondo: 100, total: 304.39, pend: 100 }],
  ['C5 varias aportaciones (5,000 y 10,000)', 100000, 30, M36, [ap(5000, 20), ap(10000, 10)], 15000,
    { tarjeta: 87843.91, base: 85000, rend: 2843.91, fondo: 200, total: 3043.91, pend: 200 }],
  ['C5b dos fondos con etiqueta: mismos tramos que uno solo', 100000, 30, M36, [ap(5000, 20, { fondo: 'f_viaje1' }), ap(10000, 10)], 15000,
    { tarjeta: 87843.91, base: 85000, rend: 2843.91, fondo: 200, total: 3043.91, pend: 200 }],
  ['C6 liberar parte del fondo', 100000, 30, M36, [ap(20000, 20), mov('liberar', 5000, 5)], 15000,
    { tarjeta: 87668.91, base: 85000, rend: 2668.91, fondo: 375, total: 3043.91, pend: 375 }],
  ['C6b apartado antes de la base y liberar despues (antes el rendimiento subia 5,000: decia 7,352.20)', 100000, 30, M36, [ap(20000, 40), mov('liberar', 5000, 5)], 15000,
    { tarjeta: 87268.91, base: 84800, rend: 2468.91, fondo: 575, total: 3043.91, pend: 775 }],
  ['C7 retirar del fondo: la salida reancla', 95000, 10, M36, [ap(20000, 40), mov('salida', 5000, 10)], 15000,
    { tarjeta: 80204.29, base: 79400, rend: 804.29, fondo: 150, total: 954.29, pend: 750 }],
  ['C8 abono registrado despues de la base', 100000, 30, M36, [ap(20000, 40), mov('rendimiento', 50, 5)], 20050,
    { tarjeta: 82893.66, base: 80000, rend: 2893.66, fondo: 150.25, total: 3043.91, pend: 100.25 }],
  ['C9 abono registrado antes de la base: ya venia en ella', 100000, 30, M36, [ap(20000, 60), mov('rendimiento', 50, 40)], 20050,
    { tarjeta: 82191.91, base: 79749.50, rend: 2442.41, fondo: 601.50, total: 3043.91, pend: 802 }],
  ['C10 tope 25,000 y 18% arriba', 30000, 30, { tasa: 36, tope: 25000, exc: 18 }, [ap(10000, 10)], 10000,
    { tarjeta: 20760.17, base: 20000, rend: 760.17, fondo: 70.84, total: 831.01, pend: 70.84 }],
  ['C11 retencion 3.65% entre 365 = 0.01% diario', 100000, 30, { tasa: 36, ret: 3.65 }, [ap(20000, 10)], 20000,
    { tarjeta: 82555.53, base: 80000, rend: 2555.53, fondo: 180, total: 2735.53, pend: 180 }],
  ['C12 retCap: tope 50,000, 0% arriba, retencion 3.65%', 100000, 30, { tasa: 36, tope: 50000, exc: 0, ret: 3.65, cap: true }, [ap(20000, 10)], 20000,
    { tarjeta: 81350, base: 80000, rend: 1350, fondo: 0, total: 1350, pend: 0 }],
];
console.log('\nDetalle de la tarjeta con fondo (cifras calculadas aparte):');
for (const [n, B, h0, mod, movs, A, e] of CASOS) {
  const { m, fin } = motorReal(B, h0, mod, movs, A);
  const d = m.detalleCajita('revSavings');
  const mal1 = [['tarjeta', m.saldoTuyo('revSavings')], ['base', d.base], ['rend', d.rend], ['fondo', d.fondo], ['total', d.total], ['pend', m.pendienteFondo('revSavings')]].filter(([k, v]) => c(v) !== c(e[k]));
  chk(n + ': cada cifra al centavo', !mal1.length, JSON.stringify(mal1));
  chk(n + ': sin el fondo + lo del fondo = total', c(d.rend) + c(d.fondo) === c(d.total), [d.rend, d.fondo, d.total].join(' '));
  chk(n + ': base + lo generado = lo que dice la tarjeta', c(d.base) + c(d.rend) === c(m.saldoTuyo('revSavings')), [d.base, d.rend, m.saldoTuyo('revSavings')].join(' '));
  // el mismo periodo en las cuentas del resumen (a menos de un centavo: el resumen no redondea el estimado)
  const ini = m.parseFechaLocal(fecha(h0)), hoy = new Date(AHORA);
  const resumen = m.interesEnRango('revSavings', ini.getTime(), AHORA) - m.rendFondoEnRango(ini, hoy) - m.pendienteFondoEnRango(ini, hoy);
  chk(n + ': coincide con el resumen', Math.abs(resumen - d.rend) < 0.011, resumen + ' vs ' + d.rend);
  fin();
}
{ // sin fondo: exactamente lo de hoy, incluso con la base vacia
  const { m, fin } = motorReal(100000, 30, M36, [], undefined);
  const d = m.detalleCajita('revSavings');
  chk('C0 sin fondo: base y rendimiento de siempre (103,043.91 - 100,000)', d.base === 100000 && c(d.rend) === 304391 && d.fondo === 0, JSON.stringify(d));
  chk('C0 sin fondo: el acumulado no cambia', c(m.rendPropioAcumulado('revSavings')) === 304391, m.rendPropioAcumulado('revSavings')); fin();
  const v = motorReal(undefined, null, M36, [], undefined), dv = v.m.detalleCajita('revSavings');
  chk('C0 base vacia: sigue sin inventar nada', dv.base === undefined && dv.rend === 0, JSON.stringify(dv)); v.fin();
}
{ // lo apartado pasa del saldo: la app ya lo avisa como 'sincronizando'. Aqui la suma NO da el total, y no se fuerza
  const { m, fin } = motorReal(1000, 10, M36, [ap(1500, 5)], 1500);
  const d = m.detalleCajita('revSavings');
  chk('C13 apartado mayor que el saldo: nada es tuyo, base 0 y rend 0; los $10.05 de interes no van a nadie (queda dicho)', d.base === 0 && d.rend === 0 && d.fondo === 0 && c(d.total) === 1005 && m.saldoTuyo('revSavings') === 0, JSON.stringify(d)); fin();
}
{ // apartar como capital interes ya ganado: la suma da, la base no baja de cero y por eso base + rend no es la tarjeta (queda dicho)
  const { m, fin } = motorReal(1000, 10, M36, [ap(1005, 1)], 1005);
  const d = m.detalleCajita('revSavings');
  chk('C14 apartar mas que la base: suma al centavo, base 0 (1.005 en binario queda abajo del medio centavo: 1.00 del fondo)', c(d.rend) === 905 && c(d.fondo) === 100 && c(d.total) === 1005 && d.base === 0 && c(m.saldoTuyo('revSavings')) === 405, JSON.stringify(d)); fin();
}
{ // ganado en total: nunca abajo de lo de la ultima fecha base, ni con el fondo anterior a la historia
  const a = motorReal(100000, 30, M36, [ap(20000, 40)], 20000);
  chk('C1 ganado en total = 2,443.91: lo del fondo de antes de la historia no estaba en el acumulado', c(a.m.rendPropioAcumulado('revSavings')) === 244391, a.m.rendPropioAcumulado('revSavings')); a.fin();
  const b = motorReal(100000, 30, M36, [ap(20000, 10)], 20000);
  chk('C2 ganado en total = 2,843.91', c(b.m.rendPropioAcumulado('revSavings')) === 284391, b.m.rendPropioAcumulado('revSavings')); b.fin();
  // con historia cerrada: un tramo de 10,000 x 10 dias a 0.1% = 100.45 antes de la base; apartar hace 10 no le quita nada de esos
  const tr = { slot: 'revSavings', motivo: 'movimiento', ini: fecha(40), fin: fecha(30), base: 10000, monto: 100.45, modelo: { tasa: 36, tope: null, tasaExc: 0, ret: 0, dias: 360, retDias: 365 } };
  const e = motorReal(100000, 30, M36, [ap(20000, 10)], 20000, { tramos: [tr] }), ee = e.m.detalleCajita('revSavings');
  chk('C15 con un tramo cerrado de 100.45: ganado en total 2,944.36 y de eso, desde la base, 2,843.91', c(e.m.rendPropioAcumulado('revSavings')) === 294436 && c(ee.rend) === 284391, e.m.rendPropioAcumulado('revSavings') + ' ' + ee.rend); e.fin();
  // apartado total con historia: 100.45 de antes + 304.39 del periodo - 300 del fondo
  const g = motorReal(10000, 30, M36, [ap(10000, 30)], 10000, { tramos: [tr] });
  chk('C16 apartado total con historia: ganado en total 104.84', c(g.m.rendPropioAcumulado('revSavings')) === 10484, g.m.rendPropioAcumulado('revSavings')); g.fin();
  // el acumulado con semilla no se toca: lo del banco ya incluye todo lo de antes
  const sem = { slot: 'revSavings', motivo: 'semilla', fin: fecha(30), monto: 500 };
  const h1 = motorReal(100000, 30, M36, [ap(20000, 40)], 20000, { tramos: [sem] });
  chk('C17 con semilla de 500: 500 + 3,043.91 - 800 = 2,743.91', c(h1.m.rendPropioAcumulado('revSavings')) === 274391, h1.m.rendPropioAcumulado('revSavings')); h1.fin();
}

{ // (4-nov, decision de Beto) el resumen se topa igual que la tarjeta: 10,000 apartados hace 30 dias, saldo capturado ayer. Lo estimado son 300 y en
  // el saldo solo caben 10. Antes el resumen daba 10 - 300 = -290 con la tarjeta en $0.00
  const { m, fin } = motorReal(10000, 1, M36, [ap(10000, 30)], 10000);
  const hoy = new Date(AHORA), todo = m.parseFechaLocal(fecha(30)), ayer = m.parseFechaLocal(fecha(1));
  const res = ini => m.interesEnRango('revSavings', ini.getTime(), AHORA) - m.rendFondoEnRango(ini, hoy) - m.pendienteFondoEnRango(ini, hoy);
  chk('C19 topado: toda la historia da 0.00, igual que la tarjeta', c(res(todo)) === 0 && c(m.saldoTuyo('revSavings')) === 0, res(todo));
  chk('C19 topado: lo que se resta en toda la historia es lo que cupo (10.00)', c(m.pendienteFondoEnRango(todo, hoy)) === 1000, m.pendienteFondoEnRango(todo, hoy));
  chk('C19 topado: cada periodo se lleva su parte (un dia de 30: 0.33)', c(m.pendienteFondoEnRango(ayer, hoy)) === 33, m.pendienteFondoEnRango(ayer, hoy));
  chk('C19 topado: ningun periodo sale negativo', res(ayer) >= 0 && res(todo) >= -1e-9, res(ayer) + ' ' + res(todo));
  fin();
}
{ // sin tope, el rango no cambia: 200 de 10 dias
  const { m, fin } = motorReal(100000, 30, M36, [ap(20000, 10)], 20000);
  chk('C20 sin tope: el resumen resta lo de siempre', c(m.pendienteFondoEnRango(m.parseFechaLocal(fecha(10)), new Date(AHORA))) === 20000, m.pendienteFondoEnRango(m.parseFechaLocal(fecha(10)), new Date(AHORA)));
  chk('C20 lo que agrega el fondo al mes: 20,000 x 0.001 x 30 = 600', c(m.rendEstimadoFondoMes()) === 60000, m.rendEstimadoFondoMes());
  fin();
}
{ // tasa real de 13%: el fondo ya no sale 6.8% alto. 20,000 x 13% / 360 x 30 = 216.67
  const { m, fin } = motorReal(100000, 30, { tasa: 13 }, [ap(20000, 30)], 20000);
  chk('C21 a 13%, 30 dias sobre 20,000: 216.67 (con el año compuesto salia 231.4, estimado)', c(m.pendienteFondo('revSavings')) === 21667, m.pendienteFondo('revSavings'));
  fin();
}
{ // el fondo es casi todo el saldo: lo estimado del fondo pasaba del total de la cuenta y el rendimiento salia negativo
  const { m, fin } = motorReal(10000, 30, M36, [ap(9900, 30)], 9900);
  const d = m.detalleCajita('revSavings');
  chk('C18 fondo casi todo el saldo: el rendimiento no sale negativo', d.rend >= 0, d.rend);
  chk('C18 lo del fondo no pasa del total de la cuenta', d.fondo <= d.total + 1e-9, [d.fondo, d.total].join(' '));
  chk('C18 sin el fondo + lo del fondo sigue dando el total', c(d.rend) + c(d.fondo) === c(d.total), [d.rend, d.fondo, d.total].join(' '));
  fin();
}
// ── INTERES DE LAS CAJITAS AGREGADAS (4-nov-2026, prueba de usuario): "Cuanto gano tu dinero" decia +$0.00 mientras la tarjeta decia +$64.39 ──
// Corre interesCajitasX, saldoX, modeloX y calcCompoundAt reales con el reloj fijo. Tasa 36% / 360 = 0.1% diario. Cifras calculadas APARTE con BigInt
// (base x (1001/1000)^n al centavo): 100,000 a 10 dias = 101,004.51; a 6 dias = 100,601.50; 1,000 AUD: 1,010.05 y 1,006.02.
{
  console.log('\nInteres de las cajitas agregadas (cifras calculadas aparte):');
  const consts = ['porCreadaX', 'tcDe'].map(n => { const m = HTML.match(new RegExp('^const ' + n + ' = [^\\n]*(?:\\n  [^\\n]*)*;?$', 'm')); if (!m) throw new Error('no esta ' + n); return m[0]; }).join('\n');
  const mk = (cfgMulti, cuentasX, fx) => {
    const RealNow = Date.now; Date.now = () => AHORA;
    const f = new Function('state', 'CFG', 'parseFechaLocal', 'c2', consts + '\n' + ['calcCompoundAt', 'modeloX', 'saldoX', 'interesCajitasX'].map(fn).join('\n') + '\nreturn {interesCajitasX};');
    const m = f({ cuentasX, fx }, { multi: cfgMulti }, s => new Date(s + 'T00:00:00'), n => Math.round(n * 100) / 100);
    return { m, fin: () => { Date.now = RealNow; } };
  };
  const caj = (nombre, moneda, saldo, dias, extra) => ({ nombre, moneda, tipo: 'cajita', on: true, saldo, tasa: 36, tope: 0, tasaExc: 0, fecha: fecha(dias), creada: '2026-10-01T00:00:00.000Z', ...extra });
  const ms = dias => AHORA - dias * DIA;
  const cc = v => Math.round(v * 100);
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Klar cajita', 'MXN', 100000, 10) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(4), AHORA);
    chk('X1 fecha base ANTES del periodo: 101,004.51 - 100,601.50 = 403.01, completo (no parcial)', cc(r.total) === 40301 && !r.parcial && r.lista.length === 1 && r.lista[0].parcial === false, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Klar cajita', 'MXN', 100000, 10) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(20), AHORA);
    chk('X2 fecha base DENTRO del periodo: 101,004.51 - 100,000.00 = 1,004.51 y queda marcado parcial', cc(r.total) === 100451 && r.parcial && r.lista[0].parcial === true, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Klar cajita', 'MXN', 100000, 10) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(30), ms(12));
    chk('X3 el periodo cerro ANTES de la fecha base y la cuenta ya existia (creada 2026-10-01): fila "-" y parcial, no omision silenciosa (4-nov)', r.total === 0 && r.lista.length === 1 && r.lista[0].motivo === 'cerrado' && r.lista[0].pesos === null && r.lista[0].desde === null && r.parcial === true, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Klar cajita', 'MXN', 100000, 10, { creada: '2026-10-20T00:00:00.000Z' }) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(30), ms(12));
    chk('X3b el periodo cerro antes de que la cuenta se creara: no existia, se omite', r.total === 0 && r.lista.length === 0 && !r.parcial, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Klar cajita', 'MXN', 100000, 10, { creada: '' }) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(30), ms(12));
    chk('X3c sin fecha de creacion valida no se sabe si existia: se omite (no inventa una fila)', r.total === 0 && r.lista.length === 0 && !r.parcial, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Klar cajita', 'MXN', 100000, 10, { on: false }), x_bbbbbb: caj('En cero', 'MXN', 0, 10), x_cccccc: caj('En rojo', 'MXN', -50, 10) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(20), AHORA);
    chk('X3d apagada, en cero o en rojo: no entran (no encienden "+$0.00 - parcial")', r.lista.length === 0 && r.total === 0 && !r.parcial, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Klar cajita', 'MXN', 100000, 10) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(20), AHORA);
    chk('X3e base dentro del periodo: la fila lleva base:true y su fecha (de ahi sale "sin historia antes del ...")', r.lista[0].base === true && r.lista[0].x.fecha === fecha(10), JSON.stringify(r.lista[0])); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Kiwi cajita', 'AUD', 1000, 10) }, { mxnPor: { AUD: 12 } });
    const r = m.interesCajitasX(ms(4), AHORA);
    chk('X4 otra moneda: (1,010.05 - 1,006.02) x 12 = 4.03 x 12 = 48.36 pesos', cc(r.total) === 4836 && cc(r.lista[0].pesos) === 4836, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Kiwi cajita', 'AUD', 1000, 10), x_bbbbbb: caj('Klar cajita', 'MXN', 100000, 10, { creada: '2026-10-02T00:00:00.000Z' }) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(4), AHORA);
    chk('X5 sin tipo de cambio: esa cuenta sale "pendiente" (pesos null, parcial), NO en cero, y no suma; la de pesos si', r.lista.length === 2 && r.lista[0].pesos === null && r.parcial && cc(r.total) === 40301, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: { nombre: 'Efectivo propio', moneda: 'MXN', tipo: 'banco', on: true, saldo: 5000, creada: '2026-10-01T00:00:00.000Z' } }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(4), AHORA);
    chk('X6 una cuenta que no es cajita no genera nada', r.total === 0 && r.lista.length === 0, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(false, { x_aaaaaa: caj('Klar cajita', 'MXN', 100000, 10) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(4), AHORA);
    chk('X7 las carteras de la familia cuentan sus cajitas igual (decision de Beto, 4-nov)', cc(r.total) === 40301 && r.lista.length === 1, JSON.stringify(r)); fin(); }
  { const { m, fin } = mk(true, { x_aaaaaa: caj('Sin tasa', 'MXN', 100000, 10, { tasa: 0 }) }, { mxnPor: {} });
    const r = m.interesCajitasX(ms(4), AHORA);
    chk('X8 una cajita sin tasa genera cero (no inventa) y no sale como fila', r.total === 0 && r.lista.length === 0 && !r.parcial, JSON.stringify(r)); fin(); }
}


// ── APORTACIONES A UNA CAJITA AGREGADA (4-nov-2026, revision): sus intereses entraban al resumen y sus depositos no a la aportacion ──
// Cifras a mano: deposito de 5,000 desde Efectivo a la cajita = +5,000; retiro de 1,200 = -1,200; neto +3,800.
// Cajita a cajita = 0 (traspaso). Cajita a banco agregado (x_ no cajita) = cuenta como la cajita (+/-). La familia: nada.
{
  console.log('\nAportaciones a cajitas agregadas (cifras a mano):');
  const mkAp = (multi, cuentasX, transferencias) => {
    const f = new Function('state', 'CFG', 'CTAS_AHORRO', 'esIdX', 'msFechaMov', 'parseFechaLocal', 'flujosDeudaAhorro',
      fn('aportacionesEnRango') + '\nreturn aportacionesEnRango;');
    return f({ cuentasX, transferencias, stocksOps: [] }, { multi }, ['cajita1'], k => typeof k === 'string' && /^x_[a-z0-9]{6,16}$/.test(k),
      s => new Date(s).getTime(), s => new Date(s + 'T00:00:00'), () => []);
  };
  const D = (a, b) => [new Date('2026-11-01T00:00:00'), new Date('2026-12-01T00:00:00')];
  const cx = { x_caja01: { tipo: 'cajita', moneda: 'MXN' }, x_caja02: { tipo: 'cajita', moneda: 'MXN' }, x_banco1: { tipo: 'banco', moneda: 'MXN' }, x_aud001: { tipo: 'cajita', moneda: 'AUD' } };
  const T = (origen, destino, monto, extra) => ({ origen, destino, monto, fecha: '2026-11-10T12:00:00', ...extra });
  const suma = r => Object.values(r).reduce((q, v) => q + v, 0);
  { const r = mkAp(true, cx, [T('efectivo', 'x_caja01', 5000), T('x_caja01', 'nu', 1200)])(...D());
    chk('P1 deposito 5,000 y retiro 1,200 de la cajita: +3,800 en cajitasX', r.cajitasX === 3800 && suma(r) === 3800, JSON.stringify(r)); }
  { const r = mkAp(true, cx, [T('x_caja01', 'x_caja02', 700)])(...D());
    chk('P2 de una cajita a otra: un traspaso, no cuenta dos veces ni una', (r.cajitasX || 0) === 0 && suma(r) === 0, JSON.stringify(r)); }
  { const r = mkAp(true, cx, [T('x_banco1', 'x_caja01', 900)])(...D());
    chk('P3 de un banco agregado a una cajita: +900', r.cajitasX === 900, JSON.stringify(r)); }
  { const r = mkAp(true, cx, [T('efectivo', 'x_banco1', 900)])(...D());
    chk('P4 a un banco agregado (no cajita) no es aportacion de ahorro', (r.cajitasX || 0) === 0 && suma(r) === 0, JSON.stringify(r)); }
  { const r = mkAp(true, cx, [T('efectivo', 'x_aud001', 1800, { montoDestino: 100, monedaDestino: 'AUD', tc: 18 })])(...D());
    chk('P5 cajita en otra moneda: cuenta el lado en PESOS (monto 1,800), no 100 AUD', r.cajitasX === 1800, JSON.stringify(r)); }
  { const r = mkAp(true, cx, [T('efectivo', 'x_caja01', 5000, { fecha: '2026-10-31T12:00:00' })])(...D());
    chk('P6 fuera del periodo no cuenta', (r.cajitasX || 0) === 0, JSON.stringify(r)); }
  { const r = mkAp(false, cx, [T('efectivo', 'x_caja01', 5000)])(...D());
    chk('P7 las carteras de la familia (sin CFG.multi): sin cambios, no hay clave nueva', !('cajitasX' in r) && suma(r) === 0, JSON.stringify(r)); }
  { const r = mkAp(true, cx, [T('efectivo', 'x_caja01', 5000), T('cajita1', 'x_caja01', 300)])(...D());
    chk('P8 de una cajita fija a una agregada: la fija baja 300 y la agregada sube 5,300 (neto no es dinero nuevo: 5,000)', r.cajitasX === 5300 && r.cajita1 === -300 && suma(r) === 5000, JSON.stringify(r)); }
}
console.log('\n==========================================================');
console.log(mal ? `FALLAN ${mal} de ${ok + mal}` : `TODO PASA — ${ok}/${ok + mal}`);
process.exit(mal ? 1 : 0);
