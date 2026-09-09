// Prueba de calcCartera(): el motor del tablero de inversiones.
// Extrae la funcion REAL del index.html publicado y la corre contra ledgers armados a
// mano. Lo que se comprueba es lo que puede mentirle a Roberto sobre su dinero: el costo
// promedio ponderado con ventas de por medio, y que NUNCA invente una cifra cuando falta
// un dato (un cero se lee como un hecho; "pendiente" no).
import fs from 'fs';

const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const HTML = fs.readFileSync(APP, 'utf8');

function extrae(desde, hasta) {
  const i = HTML.indexOf(desde);
  if (i < 0) throw new Error('no encontrado: ' + desde);
  const j = HTML.indexOf(hasta, i);
  if (j < 0) throw new Error('fin no encontrado: ' + hasta);
  return HTML.slice(i, j);
}

const state = {
  stocksOps: [], posiciones: {}, accionesMkt: {}, tickers: {},
  usdMxn: 20, efectivo: 1000, nuSaldo: 500, revMXN: 300
};
const fuente = extrae('// El doc cartera/tickers lo teclea el usuario', '// ── graficas propias del tablero');
const { calcCartera, saneaTickers, efectivoDisponible } = new Function(
  'state', fuente + '\nreturn { calcCartera, saneaTickers, efectivoDisponible };'
)(state);

let fallos = 0, pruebas = 0;
function chk(nombre, cond, detalle = '') {
  pruebas++;
  if (cond) console.log('  PASA  ' + nombre);
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
const cerca = (a, b, t = 0.01) => a !== null && Math.abs(a - b) < t;
function armar(ops, mkt, tickers) {
  state.stocksOps = ops;
  state.accionesMkt = mkt || {};
  state.tickers = tickers || {};
}

console.log('\n=== calcCartera: el motor del tablero de inversiones ===');

// ═══ 1. compra simple ═══
console.log('\n1. Una compra y nada mas');
armar([{tipo:'compra', simbolo:'AVGO', acciones:2, montoMxn:1000, fecha:'2026-01-10'}],
      {AVGO:{precio:30}});   // 2 acc * 30 USD * 20 = 1200 MXN
let c = calcCartera();
chk('una posicion abierta', c.pos.length === 1);
chk('costo = lo que se pago', cerca(c.costo, 1000), 'costo=' + c.costo);
chk('valor = acciones x precio x tipo de cambio', cerca(c.valor, 1200), 'valor=' + c.valor);
chk('ganancia = valor - costo', cerca(c.ganancia, 200), 'gan=' + c.ganancia);
chk('ganancia % correcta', cerca(c.gananciaPct, 20), 'pct=' + c.gananciaPct);
chk('sin ventas, lo realizado es 0', c.realizado === 0);

// ═══ 2. COSTO PROMEDIO PONDERADO ═══
console.log('\n2. Dos compras a distinto precio: el costo se promedia');
armar([{tipo:'compra', simbolo:'AVGO', acciones:1, montoMxn:1000, fecha:'2026-01-10'},
       {tipo:'compra', simbolo:'AVGO', acciones:1, montoMxn:2000, fecha:'2026-02-10'}],
      {AVGO:{precio:100}});   // 2 acc * 100 * 20 = 4000
c = calcCartera();
chk('el costo suma las dos compras', cerca(c.costo, 3000), 'costo=' + c.costo);
chk('la ganancia sale sobre el costo total', cerca(c.ganancia, 1000), 'gan=' + c.ganancia);

// ═══ 3. venta parcial ═══
console.log('\n3. Venta parcial: se lleva su parte del costo');
armar([{tipo:'compra', simbolo:'AVGO', acciones:4, montoMxn:4000, fecha:'2026-01-10'},
       {tipo:'venta',  simbolo:'AVGO', acciones:1, montoMxn:1500, fecha:'2026-03-10'}],
      {AVGO:{precio:60}});   // quedan 3 acc * 60 * 20 = 3600
c = calcCartera();
chk('quedan 3 acciones', cerca(c.pos[0].acciones, 3));
chk('el costo baja proporcionalmente (4000 - 1000)', cerca(c.costo, 3000), 'costo=' + c.costo);
chk('lo realizado = 1500 recibidos - 1000 de costo', cerca(c.realizado, 500), 'real=' + c.realizado);
chk('la ganancia NO realizada usa el costo que queda', cerca(c.ganancia, 600), 'gan=' + c.ganancia);

// ═══ 4. cerrar posicion y RECOMPRAR ═══
console.log('\n4. Vender todo y volver a comprar: el costo arranca de cero');
armar([{tipo:'compra', simbolo:'AVGO', acciones:2, montoMxn:2000, fecha:'2026-01-10'},
       {tipo:'venta',  simbolo:'AVGO', acciones:2, montoMxn:3000, fecha:'2026-02-10'},
       {tipo:'compra', simbolo:'AVGO', acciones:1, montoMxn:500,  fecha:'2026-03-10'}],
      {AVGO:{precio:40}});   // 1 acc * 40 * 20 = 800
c = calcCartera();
chk('queda 1 accion', cerca(c.pos[0].acciones, 1));
chk('el costo es SOLO el de la recompra', cerca(c.costo, 500), 'costo=' + c.costo);
chk('lo realizado quedo de la venta anterior', cerca(c.realizado, 1000), 'real=' + c.realizado);
chk('la ganancia no arrastra el costo viejo', cerca(c.ganancia, 300), 'gan=' + c.ganancia);

// ═══ 5. ventas parciales encadenadas ═══
console.log('\n5. Tres ventas seguidas: cada una toma el promedio del momento');
armar([{tipo:'compra', simbolo:'X', acciones:10, montoMxn:1000, fecha:'2026-01-01'},
       {tipo:'venta',  simbolo:'X', acciones:5,  montoMxn:700,  fecha:'2026-02-01'},
       {tipo:'venta',  simbolo:'X', acciones:3,  montoMxn:500,  fecha:'2026-03-01'}],
      {X:{precio:10}});   // quedan 2 acc * 10 * 20 = 400
c = calcCartera();
// costo unitario 100/acc: venta1 se lleva 500 (gana 200), venta2 se lleva 300 (gana 200)
chk('el costo restante es el de 2 acciones', cerca(c.costo, 200), 'costo=' + c.costo);
chk('lo realizado suma las dos ventas', cerca(c.realizado, 400), 'real=' + c.realizado);

// ═══ 6. montoMxn faltante — LO MAS IMPORTANTE ═══
console.log('\n6. Compra sin monto capturado: PENDIENTE, nunca cero');
armar([{tipo:'compra', simbolo:'AVGO', acciones:2, montoMxn:0, fecha:'2026-01-10'}],
      {AVGO:{precio:30}});
c = calcCartera();
chk('marca que falta el costo', c.faltaCosto === true);
chk('el costo NO se reporta como 0', c.pos[0].costo === null, 'costo=' + c.pos[0].costo);
chk('la ganancia NO se inventa', c.ganancia === null, 'gan=' + c.ganancia);
chk('pero el valor de mercado si se muestra', cerca(c.valor, 1200), 'valor=' + c.valor);

console.log('\n6b. Venta de una posicion con costo pendiente: tampoco inventa lo realizado');
armar([{tipo:'compra', simbolo:'AVGO', acciones:2, montoMxn:0,    fecha:'2026-01-10'},
       {tipo:'venta',  simbolo:'AVGO', acciones:1, montoMxn:1500, fecha:'2026-02-10'}],
      {AVGO:{precio:30}});
c = calcCartera();
chk('lo realizado queda en pendiente', c.realizado === null, 'real=' + c.realizado);

// ═══ 7. falta el precio o el tipo de cambio ═══
console.log('\n7. Sin cotizacion o sin tipo de cambio: pendiente, no cero');
armar([{tipo:'compra', simbolo:'RARO', acciones:2, montoMxn:1000, fecha:'2026-01-10'}], {});
c = calcCartera();
chk('marca que falta el precio', c.faltaPrecio === true);
chk('el valor de esa posicion es null, no 0', c.pos[0].valor === null);
chk('la ganancia no se calcula', c.ganancia === null);

const fxPrev = state.usdMxn; state.usdMxn = null;
armar([{tipo:'compra', simbolo:'AVGO', acciones:2, montoMxn:1000, fecha:'2026-01-10'}], {AVGO:{precio:30}});
c = calcCartera();
chk('sin tipo de cambio tampoco inventa valor', c.pos[0].valor === null && c.faltaPrecio === true);
state.usdMxn = fxPrev;

console.log('\n7b. Ticker que no cotiza en dolares: no se multiplica por el tipo de cambio');
armar([{tipo:'compra', simbolo:'MEX', acciones:2, montoMxn:1000, fecha:'2026-01-10'}],
      {MEX:{precio:30, moneda:'MXN'}});
c = calcCartera();
chk('se trata como pendiente en vez de falsear', c.pos[0].valor === null && c.faltaPrecio === true);

// ═══ 8. dividendos y yields ═══
console.log('\n8. Dividendos: yield actual y sobre costo');
armar([{tipo:'compra', simbolo:'AVGO', acciones:10, montoMxn:1000, fecha:'2026-01-10'}],
      {AVGO:{precio:10}},                    // valor = 10*10*20 = 2000
      {AVGO:{divAnual:1, sector:'Tecnologia'}});  // div = 10*1*20 = 200
c = calcCartera();
chk('dividendo anual en pesos', cerca(c.divAnual, 200), 'div=' + c.divAnual);
chk('yield ACTUAL sobre lo que vale hoy (200/2000)', cerca(c.yieldActual, 10), 'y=' + c.yieldActual);
chk('yield sobre costo, mas alto porque usa el precio viejo (200/1000)', cerca(c.yieldCosto, 20), 'y=' + c.yieldCosto);
chk('el sector viaja a la posicion', c.pos[0].sector === 'Tecnologia');

console.log('\n8b. Sin dividendo capturado no se inventa un yield');
armar([{tipo:'compra', simbolo:'AVGO', acciones:10, montoMxn:1000, fecha:'2026-01-10'}], {AVGO:{precio:10}});
c = calcCartera();
chk('dividendo total en 0 y yield nulo', c.divAnual === 0 && c.yieldActual === null);
chk('marca que falta capturarlo', c.faltaDiv === true);

// ═══ 9. defensa contra datos corruptos ═══
console.log('\n9. Ledger con basura: se ignora sin tumbar el tablero');
armar([null, {tipo:'compra'}, {tipo:'compra', simbolo:'AVGO', acciones:-5, montoMxn:100, fecha:'2026-01-01'},
       {tipo:'compra', simbolo:'AVGO', acciones:2, montoMxn:1000, fecha:'2026-01-10'},
       {tipo:'venta',  simbolo:'AVGO', acciones:99, montoMxn:500, fecha:'2026-02-10'}],
      {AVGO:{precio:30}});
c = calcCartera();
chk('no truena', !!c);
chk('la venta imposible no deja acciones negativas', c.pos.length === 0 || c.pos[0].acciones >= 0);
chk('ni costo negativo', c.costo >= 0, 'costo=' + c.costo);

// ═══ 10. saneaTickers ═══
console.log('\n10. Los datos capturados a mano se sanean');
let t = saneaTickers({AVGO:{sector:'Tecnologia', divAnual:2.36, crecDiv:12}});
chk('un dato bueno pasa entero', t.AVGO.sector === 'Tecnologia' && t.AVGO.divAnual === 2.36 && t.AVGO.crecDiv === 12);
t = saneaTickers({AVGO:{divAnual:'mucho', crecDiv:500, sector:123}});
chk('texto donde va un numero se ignora', t.AVGO === undefined || t.AVGO.divAnual === undefined);
chk('un crecimiento absurdo se ignora', !t.AVGO || t.AVGO.crecDiv === undefined);
t = saneaTickers({'no-es-ticker':{sector:'X'}, 'AVGO':{sector:'Tecnologia'}});
chk('un simbolo invalido se descarta', t['no-es-ticker'] === undefined && !!t.AVGO);
chk('null no truena', Object.keys(saneaTickers(null)).length === 0);
// un campo guardado como null (asi se BORRA con merge:true) debe leerse como ausente
t = saneaTickers({AVGO:{sector:null, divAnual:null, crecDiv:5}});
chk('null explicito en un campo = campo ausente, sin tumbar los demas',
    !!t.AVGO && t.AVGO.sector === undefined && t.AVGO.divAnual === undefined && t.AVGO.crecDiv === 5, JSON.stringify(t));

// ═══ 11. efectivo disponible ═══
console.log('\n11. Efectivo disponible');
chk('suma efectivo + NU + Revolut', cerca(efectivoDisponible(), 1800), 'da=' + efectivoDisponible());

console.log('\n' + '='.repeat(58));
console.log(fallos === 0 ? `TODO PASA — ${pruebas}/${pruebas}` : `${fallos} FALLAS de ${pruebas}`);
process.exit(fallos === 0 ? 0 : 1);
