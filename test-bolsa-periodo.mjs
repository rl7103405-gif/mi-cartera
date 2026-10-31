// periodoBolsa / diarioBolsa (30-oct-2026): casos calculados a mano.
// Correr: node test-bolsa-periodo.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tramo = (a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('no encontre ' + a); return src.slice(i, j); };
const codigo = [
  tramo('function parseFechaLocal(f)', '\n'),
  tramo('function fechaCalendarioValida(f) {', '\n}') + '\n}',
  tramo('const POLVO_ACCIONES', '\nfunction derivarPosiciones'),
  tramo('function libroBolsa(opsCrudas) {', '\nfunction calcCartera'),
  "const REF_MERCADO='VOO';",
  // hasta antes de la tarjeta (su codigo usa window y el DOM)
  tramo('const BOLSA_RANGOS=', '\n// ── la tarjeta "tu bolsa por periodo"'),
].join('\n');
const ctx = { state: {} };
vm.createContext(ctx);
vm.runInContext(codigo, ctx);

let ok = 0, mal = 0;
const cerca = (a, b, tol = 1e-6) => a !== null && b !== null && Math.abs(a - b) < tol;
const caso = (n, c, x) => { if (c) { ok++; console.log('  OK  ' + n); } else { mal++; console.log('  MAL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const h = pares => pares.map(([t, c]) => ({ t, c }));
const poner = (ops, qqq, voo, fx) => {
  ctx.state.stocksOps = ops;
  ctx.state.accionesMkt = { QQQ: { moneda: 'USD', hist: h(qqq) }, VOO: { moneda: 'USD', hist: h(voo) } };
  ctx.state.usdMxnHistory = h(fx);
};
const QQQ = [['2026-10-01', 100], ['2026-10-02', 110], ['2026-10-05', 121]];
const VOO = [['2026-10-01', 500], ['2026-10-02', 505], ['2026-10-05', 510]];
const FX20 = [['2026-10-01', 20], ['2026-10-02', 20], ['2026-10-05', 20]];
const compra = (id, fecha, acciones, montoMxn) => ({ id, tipo: 'compra', simbolo: 'QQQ', acciones, montoMxn, fecha, creado: fecha + 'T10:00:00Z' });
const venta = (id, fecha, acciones, montoMxn) => ({ id, tipo: 'venta', simbolo: 'QQQ', acciones, montoMxn, fecha, creado: fecha + 'T11:00:00Z' });

console.log('A · una compra, el precio sube 10% dos dias:');
poner([compra('a', '2026-10-01', 1, 2000)], QQQ, VOO, FX20);
let p = ctx.periodoBolsa('todo');
caso('todo: valor 2420', cerca(p.valor, 2420));
caso('todo: metido 2000, ganancia 420', cerca(p.metido, 2000) && cerca(p.ganancia, 420), p);
caso('todo: rendimiento 21%', cerca(p.twr, 0.21));
caso('todo: S&P de 500 a 510 = 2%', cerca(p.sp, 0.02));
caso('todo: nada realizado', cerca(p.realizada, 0) && cerca(p.noRealizada, 420));
p = ctx.periodoBolsa('1d');
caso('hoy: del viernes (2200) al lunes (2420): +220 y 10%', cerca(p.ganancia, 220) && cerca(p.twr, 0.1) && p.desde === '2026-10-02', p);
caso('hoy: S&P 505 → 510', cerca(p.sp, 510 / 505 - 1));
p = ctx.periodoBolsa('1m');
caso('1 mes con 3 dias de historia: empieza en cero y avisa', p.recortado === true && cerca(p.ganancia, 420));

console.log('B · comprar mas a mitad del periodo NO cambia el rendimiento:');
poner([compra('a', '2026-10-01', 1, 2000), compra('b', '2026-10-02', 1, 2200)], QQQ, VOO, FX20);
p = ctx.periodoBolsa('todo');
caso('rendimiento sigue en 21%', cerca(p.twr, 0.21), p.twr);
caso('ganancia = 4840 − 4200 = 640', cerca(p.ganancia, 640), p.ganancia);
caso('la serie trae lo que pusiste (escalon)', p.serie.map(x => x.aport).join() === '2000,4200,4200', p.serie);

console.log('C · venta en SABADO: entra el lunes, con su realizado:');
poner([compra('a', '2026-10-01', 1, 2000), compra('b', '2026-10-02', 1, 2200), venta('c', '2026-10-03', 1, 2300)], QQQ, VOO, FX20);
p = ctx.periodoBolsa('1d');
caso('cambio −1980, metido −2300, ganancia +320', cerca(p.cambio, -1980) && cerca(p.metido, -2300) && cerca(p.ganancia, 320), p);
caso('realizada 2300 − 2100 (costo promedio) = 200; no realizada 120', cerca(p.realizada, 200) && cerca(p.noRealizada, 120), p);
caso('rendimiento (115 + 121) / 220 − 1', cerca(p.twr, 236 / 220 - 1), p.twr);
const q = p.porAccion.find(x => x.simbolo === 'QQQ');
caso('por accion: QQQ gana 320 y realizo 200', q && cerca(q.ganancia, 320) && cerca(q.realizada, 200), q);
caso('contribucion de QQQ = rendimiento total (una sola accion)', q && cerca(q.contribucion, p.twr), q);

console.log('D · el dolar tambien cuenta:');
poner([compra('a', '2026-10-01', 1, 2000)], QQQ, VOO, [['2026-10-01', 20], ['2026-10-02', 20], ['2026-10-05', 21]]);
p = ctx.periodoBolsa('1d');
caso('121 × 21 − 110 × 20 = 341', cerca(p.ganancia, 121 * 21 - 2200), p.ganancia);
caso('el S&P tambien en pesos', cerca(p.sp, (510 * 21) / (505 * 20) - 1), p.sp);

console.log('E · operacion sin monto: solo afecta su periodo:');
poner([compra('a', '2026-10-01', 1, 2000), compra('b', '2026-10-02', 1, 0)], QQQ, VOO, FX20);
caso('todo: ganancia pendiente (no se inventa)', ctx.periodoBolsa('todo').ganancia === null);
p = ctx.periodoBolsa('1d');
caso('hoy (despues de la compra sin monto): si se calcula, 2 × 11 × 20 = 440', cerca(p.ganancia, 440), p.ganancia);

console.log('F · un dia sin precio no se dibuja y su flujo pasa al siguiente:');
poner([compra('a', '2026-10-01', 1, 2000), compra('b', '2026-10-02', 1, 2200)], [['2026-10-01', 100], ['2026-10-05', 121]], VOO, FX20);
const d = ctx.diarioBolsa();
caso('solo dos dias dibujados', d.dias.length === 2, d.dias.map(x => x.t));
caso('la compra del viernes entra el lunes', cerca(d.dias[1].f, 2200), d.dias[1]);

console.log('G · sin operaciones:');
poner([], QQQ, VOO, FX20);
caso('dice que no hay compras', /no registras/.test(ctx.periodoBolsa('1m').vacio || ''));

console.log('H · venta total que deja polvo: cierra la posicion y realiza todo:');
poner([compra('a', '2026-10-01', 1, 2000), venta('c', '2026-10-05', 0.9996, 2420)], QQQ, VOO, FX20);
p = ctx.periodoBolsa('1d');
caso('valor final 0 (el polvo no cuenta)', cerca(p.valor, 0), p.valor);
caso('realizada = 2420 − 2000 = 420', cerca(p.realizada, 420), p.realizada);

// ── casos que pidio la revision del 30-oct ──
const comp2 = (id, sim, fecha, acciones, montoMxn) => ({ id, tipo: 'compra', simbolo: sim, acciones, montoMxn, fecha, creado: fecha + 'T10:00:' + id.padStart(2, '0') + 'Z' });
const vent2 = (id, sim, fecha, acciones, montoMxn) => ({ id, tipo: 'venta', simbolo: sim, acciones, montoMxn, fecha, creado: fecha + 'T11:00:' + id.padStart(2, '0') + 'Z' });
// historia diaria de dias habiles entre dos fechas, con precio que da f(i)
const habiles = (desde, n, f) => { const out = []; const d = new Date(desde + 'T00:00:00'); let i = 0;
  while (out.length < n) { const w = d.getDay(); if (w !== 0 && w !== 6) { out.push([d.toISOString().slice(0, 10), f(i++)]); } d.setDate(d.getDate() + 1); } return out; };
const poner2 = (ops, mk, fx) => { ctx.state.stocksOps = ops; ctx.state.accionesMkt = mk; ctx.state.usdMxnHistory = h(fx); };

console.log('I · rango con dia base REAL y posicion previa (1 sem):');
{ const dias = habiles('2026-09-01', 30, i => 100 + i);            // QQQ sube 1 USD por dia habil
  const fx = dias.map(([t]) => [t, 20]);
  poner2([comp2('1', 'QQQ', '2026-09-01', 1, 2000)], { QQQ: { moneda: 'USD', hist: h(dias) }, VOO: { moneda: 'USD', hist: h(dias.map(([t, c]) => [t, c * 5])) } }, fx);
  const p = ctx.periodoBolsa('1s');
  const fin = dias[dias.length - 1], corte = ctx.fechaMenosDias(fin[0], 7);
  const base = dias.filter(([t]) => t <= corte).pop();
  caso('el dia base es el ultimo en o antes del corte de 7 dias', p.desde === base[0] && !p.recortado, { desde: p.desde, base: base[0] });
  caso('ganancia = (fin − base) × 20, sin metido', cerca(p.ganancia, (fin[1] - base[1]) * 20) && cerca(p.metido, 0), p.ganancia);
  caso('rendimiento = fin/base − 1', cerca(p.twr, fin[1] / base[1] - 1), p.twr);
  caso('S&P (VOO = 5× QQQ) da lo mismo', cerca(p.sp, fin[1] / base[1] - 1), p.sp); }

console.log('J · dos acciones: por accion suma el total y las contribuciones suman el rendimiento:');
{ const q = [['2026-10-01', 100], ['2026-10-02', 104], ['2026-10-05', 99], ['2026-10-06', 110]];
  const n = [['2026-10-01', 50], ['2026-10-02', 45], ['2026-10-05', 52], ['2026-10-06', 51]];
  const fx = q.map(([t]) => [t, 20]);
  poner2([comp2('1', 'QQQ', '2026-10-01', 2, 4000), comp2('2', 'NVDA', '2026-10-01', 3, 3000), comp2('3', 'NVDA', '2026-10-05', 1, 1040), vent2('4', 'QQQ', '2026-10-05', 1, 1980)],
    { QQQ: { moneda: 'USD', hist: h(q) }, NVDA: { moneda: 'USD', hist: h(n) }, VOO: { moneda: 'USD', hist: h(q) } }, fx);
  const p = ctx.periodoBolsa('todo');
  const sumaG = p.porAccion.reduce((s, x) => s + x.ganancia, 0), sumaC = p.porAccion.reduce((s, x) => s + x.contribucion, 0);
  caso('suma de ganancias por accion = ganancia total', cerca(sumaG, p.ganancia), { sumaG, g: p.ganancia });
  caso('suma de contribuciones = rendimiento (exacto)', cerca(sumaC, p.twr, 1e-9), { sumaC, twr: p.twr });
  caso('ganancia total = valor final − lo metido', cerca(p.ganancia, (1 * 110 + 4 * 51) * 20 - (4000 + 3000 + 1040 - 1980)), p.ganancia);
  caso('"todo" desde la primera operacion; el rendimiento no cubre el primer dia', p.desde === '2026-10-01' && p.twrParcial === true && p.recortado === false, p); }

console.log('K · hoy con un solo dia de historia:');
poner([compra('a', '2026-10-05', 1, 2420)], [['2026-10-05', 121]], VOO, FX20);
caso('dice que no hay dia anterior (no da la historia como "hoy")', /día de mercado anterior/.test(ctx.periodoBolsa('1d').vacio || ''), ctx.periodoBolsa('1d'));

console.log('L · VOO que dejo de refrescarse:');
poner([compra('a', '2026-10-01', 1, 2000)], QQQ, [['2026-09-01', 480]], FX20);
caso('S&P sin dato (null), no 0%', ctx.periodoBolsa('todo').sp === null, ctx.periodoBolsa('todo').sp);

console.log('M · dolar faltante un dia:');
poner([compra('a', '2026-10-01', 1, 2000)], QQQ, VOO, [['2026-10-01', 20], ['2026-10-05', 20]]);
{ const d = ctx.diarioBolsa();
  caso('el viernes sin dolar... usa el del jueves (1 dia de antiguedad, dentro del tope)', d.dias.length === 3, d.dias.map(x => x.t)); }
poner([compra('a', '2026-10-01', 1, 2000)], QQQ, VOO, [['2026-09-01', 20], ['2026-10-05', 20]]);
{ const d = ctx.diarioBolsa();
  caso('dolar de hace un mes no vale: esos dias no se dibujan', d.dias.length === 1 && d.dias[0].t === '2026-10-05', d.dias.map(x => x.t));
  const p = ctx.periodoBolsa('todo');
  caso('y "todo" avisa que empieza tarde (recortado)', p.recortado === true && p.desde === '2026-10-01', p); }

console.log('N · compra, venta total y recompra:');
poner([compra('a', '2026-10-01', 1, 2000), venta('b', '2026-10-02', 1, 2200), compra('c', '2026-10-05', 1, 2420)], QQQ, VOO, FX20);
{ const p = ctx.periodoBolsa('todo');
  caso('ganancia 200 (lo de la venta), realizada 200, no realizada 0', cerca(p.ganancia, 200) && cerca(p.realizada, 200) && cerca(p.noRealizada, 0), p); }

console.log('O · venta de una accion cuyo historial termina antes:');
poner2([comp2('1', 'NVDA', '2026-10-01', 1, 1000), vent2('2', 'NVDA', '2026-10-05', 1, 1300), comp2('3', 'QQQ', '2026-10-01', 1, 2000)],
  { QQQ: { moneda: 'USD', hist: h(QQQ) }, NVDA: { moneda: 'USD', hist: h([['2026-10-01', 50], ['2026-10-02', 60]]) }, VOO: { moneda: 'USD', hist: h(VOO) } }, FX20);
{ const p = ctx.periodoBolsa('todo');
  caso('el lunes NVDA ya se vendio: el dia se dibuja con QQQ', p.hasta === '2026-10-05', p.hasta);
  caso('ganancia = 2420 − (2000 + 1000 − 1300) + ... = 420 de QQQ + 300 de NVDA', cerca(p.ganancia, 720), p.ganancia);
  caso('NVDA realizo 300', cerca(p.porAccion.find(x => x.simbolo === 'NVDA').realizada, 300)); }

console.log('P · operacion con tipo invalido:');
poner([compra('a', '2026-10-01', 1, 2000), { id: 'z', tipo: 'regalo', simbolo: 'QQQ', acciones: 1, montoMxn: 2000, fecha: '2026-10-02', creado: 'x' }], QQQ, VOO, FX20);
{ const p = ctx.periodoBolsa('todo');
  caso('ganancia null con motivo (no inventa una ganancia fantasma)', p.ganancia === null && /inválid/.test(p.motivo), p); }

console.log('Q · dato corrupto (lo metido en un dia mayor que lo que vale todo):');
// una COMPRA de medio titulo registrada por 99,999: el valor del dia queda muy por debajo de lo metido
poner([compra('a', '2026-10-01', 1, 2000), compra('b', '2026-10-02', 0.5, 99999)], QQQ, VOO, FX20);
{ const p = ctx.periodoBolsa('1d');
  const pt = ctx.periodoBolsa('todo');
  caso('rendimiento null en vez de un numero absurdo', pt.twr === null, pt.twr); }

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
