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
// la regla de polvo (esPolvo, ordenOps, sumaOp) vive junto a derivarPosiciones, fuera de este
// tramo: se toma del HTML real y se antepone
const polvoSrc = extrae('// ── polvo de acciones ──', '// ── fin polvo ──');
const POLVO = Number((HTML.match(/const POLVO_ACCIONES\s*=\s*([\d.]+)\s*[,;]/) || [])[1]);
const { calcCartera, saneaTickers, efectivoDisponible } = new Function(
  'state', polvoSrc + fuente + '\nreturn { calcCartera, saneaTickers, efectivoDisponible };'
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

// ═══ 12. proyeccion: modelo de unidades con tope de yield ═══
console.log('\n12. Proyeccion: una cuenta acotada, no una que explota');
{
  const src = extrae('// ── proyeccion: cuenta PURA', '// ── proyeccion: es una CUENTA');
  const { proyectarCartera } = new Function(src + '\nreturn { proyectarCartera };')();
  const ult = f => f[f.length - 1];
  const a = proyectarCartera(100, 3, 0.08, 0.06, true), b = proyectarCartera(100, 3, 0.08, 0.06, false);
  chk('30 años al 8%: crece, y reinvirtiendo mas que sin reinvertir', ult(a).valor > ult(b).valor && ult(b).valor > 100,
      'con=' + ult(a).valor.toFixed(0) + ' sin=' + ult(b).valor.toFixed(0));
  chk('sin reinvertir el valor es exactamente V0(1+r)^30', Math.abs(ult(b).valor - 100 * Math.pow(1.08, 30)) < 0.01);
  chk('reinvertir SI cambia los dividendos del año (mas unidades pagan mas)', ult(a).divN > ult(b).divN,
      'con=' + ult(a).divN.toFixed(2) + ' sin=' + ult(b).divN.toFixed(2));
  // el caso que explotaba: -10% anual 30 años con reinversion -> antes daba 9x
  const m = proyectarCartera(100, 0.75, -0.10, 0.06, true);
  chk('-10% anual 30 años reinvirtiendo NO explota: termina por DEBAJO de V0', ult(m).valor < 100, 'dio ' + ult(m).valor.toFixed(2));
  const peor = proyectarCartera(100, 3, -0.50, 0.06, true);
  chk('-50% anual: tampoco (antes daba 5.9e102)', ult(peor).valor < 100 && Number.isFinite(ult(peor).valor), 'dio ' + ult(peor).valor);
  const sinDiv = proyectarCartera(100, 0, 0.08, 0.06, true);
  chk('sin dividendos: valor = V0(1+r)^n y dividendos en 0', Math.abs(ult(sinDiv).valor - 100 * Math.pow(1.08, 30)) < 0.01 && ult(sinDiv).divAcum === 0);
  chk('el tope de yield no toca un caso normal (yield 3%, g 6%, r 8%)',
      Math.abs(ult(b).divN - 3 * Math.pow(1.06, 30)) < 0.01, 'divN=' + ult(b).divN.toFixed(2) + ' esperado=' + (3 * Math.pow(1.06, 30)).toFixed(2));
  chk('seis filas: 5,10,...,30', a.length === 6 && a[0].n === 5 && ult(a).n === 30);
  chk('V0 = 0 -> sin filas, sin tronar', proyectarCartera(0, 3, 0.08, 0.06, true).length === 0);
}

// ═══ 13. mesBueno: "cerrar bien" incluye el gasto, no solo la aportacion ═══
console.log('\n13. Mes cerrado bien: gasto Y aportacion contra TU estandar');
{
  const src = extrae('function mesBueno(st)', '// racha de meses buenos');
  const est = {ahorroObj: 20, gastoMax: 75};
  const mesBueno = new Function('estandarDe', 'state', src + '\nreturn mesBueno;')(() => est, {perfil: {}});
  const m = (i, g, a) => ({totalI: i, totalG: g, aporte: a, tieneDatos: true});
  chk('gasto 25% y aporte 25%: cuenta', mesBueno(m(12000, 3000, 3000)) === true);
  // el caso exacto que reporto el usuario-real: 92% de gasto con tope de 75%
  chk('gasto 92% (tope 75%) aunque aporte bien: NO cuenta', mesBueno(m(12000, 11000, 3000)) === false);
  chk('justo en el tope de gasto (75%) y aporte justo (20%): cuenta', mesBueno(m(1000, 750, 200)) === true);
  chk('un peso arriba del tope: no cuenta', mesBueno(m(1000, 751, 200)) === false);
  chk('gasto bien pero aporte corto: no cuenta', mesBueno(m(12000, 3000, 1000)) === false);
  chk('sin ingresos: no cuenta', mesBueno(m(0, 0, 5000)) === false);
  chk('sin datos: no cuenta', mesBueno({totalI: 12000, totalG: 100, aporte: 5000, tieneDatos: false}) === false);
}

// ═══ 14. porQueNoConto: la razon REAL, no una generica ═══
console.log('\n14. Cuando la constancia es 0, decir por que');
{
  const src = extrae('function porQueNoConto(m)', 'function calcScore(m)');
  const porQueNoConto = new Function(src + '\nreturn porQueNoConto;')();
  const est = {ahorroObj: 20, gastoMax: 75};
  const m = (gPct, aPct) => ({gPct, aPct, est});
  chk('sin ingresos lo dice', /no hay ingresos/.test(porQueNoConto(m(null, 0))));
  chk('gastar mas de lo que entra lo dice con el %', /115/.test(porQueNoConto(m(115, 25))));
  // el caso del usuario-real: 92% con tope 75% caia en el generico
  const r = porQueNoConto(m(92, 25));
  chk('gasto arriba del tope: dice el gasto Y el tope, no un generico',
      /92/.test(r) && /75/.test(r) && !/sin movimientos/.test(r), r);
  chk('aportacion corta lo dice con ambos numeros', /7/.test(porQueNoConto(m(50, 7))) && /20/.test(porQueNoConto(m(50, 7))));
  chk('el gasto se reporta ANTES que la aportacion (es la razon mas comun)',
      /92/.test(porQueNoConto(m(92, 5))), porQueNoConto(m(92, 5)));
}

// ═══ 15. graficas del tablero (estilo hoja): nunca NaN, escapan, respetan pendientes ═══
console.log('\n15. Graficas del tablero: nunca NaN, escapan simbolos, respetan pendientes');
{
  const src = extrae('// ── graficas propias del tablero', '// ── pintar el tablero');
  const esc = t => String(t).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const G = new Function('escapeHtml', 'fmt', 'fmtCorto',
    src + '\nreturn { pasoBonito, svgCostoValor, svgCrecimiento, svgGanaPierde, svgMercado };')(
    esc, v => '$' + Number(v).toFixed(2), v => '$' + Math.round(v));
  const limpio = h => !/NaN|Infinity|undefined/.test(h);
  chk('paso bonito: 10,000 en 4 -> 5,000', G.pasoBonito(10000, 4) === 5000, String(G.pasoBonito(10000, 4)));
  chk('paso bonito con rango 0 no truena', G.pasoBonito(0, 4) === 1);
  const pos = [
    {simbolo:'QQQ',  costo:6979.2,  valor:6658.15, gananciaPct:-4.6},
    {simbolo:'SPCX', costo:1040.81, valor:1217.3,  gananciaPct:17},
    {simbolo:'MSFT', costo:null,    valor:644.6,   gananciaPct:null},
    {simbolo:'<b>',  costo:10,      valor:12,      gananciaPct:20}];
  const cv = G.svgCostoValor(pos);
  chk('costo vs valor: sin NaN', limpio(cv));
  chk('costo vs valor: nombra la que no tiene costo', /MSFT/.test(cv) && /falta el monto/.test(cv));
  chk('costo vs valor: escapa el simbolo', !cv.includes('<b>') && cv.includes('&lt;b&gt;'));
  const cr = G.svgCrecimiento(pos);
  chk('crecimiento con negativos: sin NaN y con linea de cero marcada', limpio(cr) && cr.includes('rgba(0,0,0,.45)'));
  chk('crecimiento: la pendiente no tiene barra pero se nombra', /sin barra: MSFT/.test(cr));
  chk('crecimiento sin ningun dato: mensaje, no grafica',
      /faltan datos/.test(G.svgCrecimiento([{simbolo:'X', gananciaPct:null}])));
  const gp = G.svgGanaPierde(176.49, 360.87);
  chk('gana/pierde normal: sin NaN y dos barras', limpio(gp) && (gp.match(/<rect/g) || []).length === 2);
  chk('gana/pierde en cero: sin NaN', limpio(G.svgGanaPierde(0, 0)));
  chk('mercado sin historial: vacio', G.svgMercado([]) === '' && G.svgMercado(null) === '');
  const mk = G.svgMercado([{t:'2026-09-01', c:500}, {t:'2026-09-02', c:505}, {t:'2026-09-03', c:500}]);
  chk('mercado con historial: sin NaN y una barra por cierre', limpio(mk) && (mk.match(/<rect/g) || []).length === 3);
  chk('mercado con precio plano: sin NaN', limpio(G.svgMercado([{t:'a', c:10}, {t:'b', c:10}])));
}

// ═══ 16. el tablero no depende de nada que la copia no tenga ═══
// Al replicar el rediseño, renderMercadoHoy llego a copias que no declaraban REF_MERCADO ni
// lo bajaban: la pestaña habria tronado con ReferenceError y ninguna prueba lo vio.
console.log('\n16. Cada identificador que usa el tablero existe en esta copia');
{
  const declarado = n => new RegExp('(const|let|var|function)\\s+' + n + '\\b').test(HTML);
  for (const n of ['REF_MERCADO', 'renderMercadoHoy', 'renderNotasDash', 'renderProyeccion', 'renderTickerUI',
                   'efectivoDisponible', 'calcCartera', 'pieChart', 'guardarPerfil', 'fmtCorto', 'refrescar',
                   'parseFechaLocal', 'showToast', 'POLVO_ACCIONES', 'derivarPosiciones', 'esPolvo', 'ordenOps', 'sumaOp',
                   'accionesEnFecha']) {
    chk('declarado: ' + n, declarado(n));
  }
  chk('fetchStocks baja la referencia aunque no haya posiciones',
      /const pedir=\[\.\.\.syms,/.test(HTML) && !/if\(!syms\.length\) return true;/.test(HTML));
  chk('notas del tablero en la lista blanca del perfil', /notasInversion:\(typeof pf\.notasInversion==='string'\)/.test(HTML));
}

// ═══ 17. polvo de acciones: lo que sobra al vender con 4 decimales es posicion cerrada ═══
// Moderna, 10-sep-2026: Roberto ya la habia vendido y el tablero la seguia enseñando con
// "0.0%  $0.04" porque la venta dejo 0.0001 acciones.
console.log('\n17. Sobrante minimo tras una venta: no es una posicion abierta');
{
  chk('POLVO_ACCIONES se lee del HTML', Number.isFinite(POLVO) && POLVO > 0 && POLVO <= 0.01, 'POLVO=' + POLVO);
  armar([{tipo:'compra', simbolo:'MRNA', acciones:0.0866, montoMxn:500,  fecha:'2026-08-01'},
         {tipo:'venta',  simbolo:'MRNA', acciones:0.0865, montoMxn:450,  fecha:'2026-09-01'},
         {tipo:'compra', simbolo:'QQQ',  acciones:0.5,    montoMxn:6000, fecha:'2026-08-01'}],
        {MRNA:{precio:25}, QQQ:{precio:600}});
  c = calcCartera();
  chk('MRNA ya no aparece como posicion', !c.pos.some(p => p.simbolo === 'MRNA'));
  chk('QQQ sigue igual', c.pos.length === 1 && c.pos[0].simbolo === 'QQQ');
  chk('lo realizado cuenta la venta COMPLETA (450 - 500)', cerca(c.realizado, -50), 'real=' + c.realizado);

  // una compra chiquita SIN venta nunca se borra
  armar([{tipo:'compra', simbolo:'NVDA', acciones:0.0004, montoMxn:15, fecha:'2026-08-01'}], {NVDA:{precio:180}});
  c = calcCartera();
  chk('una compra de 0.0004 sin vender sigue abierta', c.pos.length === 1);

  // venta sin monto: el polvo cierra la posicion pero lo realizado queda pendiente, no inventado
  armar([{tipo:'compra', simbolo:'MRNA', acciones:0.0866, montoMxn:500, fecha:'2026-08-01'},
         {tipo:'venta',  simbolo:'MRNA', acciones:0.0865, montoMxn:0,   fecha:'2026-09-01'}],
        {MRNA:{precio:25}});
  c = calcCartera();
  chk('venta sin monto: cerrada y lo realizado pendiente', c.pos.length === 0 && c.realizado === null, 'real=' + c.realizado);

  // derivarPosiciones (inicio, cotizaciones y el resto de la app) aplica el mismo criterio
  const der = new Function('state', polvoSrc +
    // fin por el propio cuerpo: el comentario siguiente cambia entre copias
    extrae('function derivarPosiciones()', 'state.posiciones=pos;') + 'state.posiciones=pos;\n}\nreturn derivarPosiciones;')(state);
  armar([{tipo:'compra', simbolo:'MRNA', acciones:0.0866, montoMxn:500, fecha:'2026-08-01'},
         {tipo:'venta',  simbolo:'MRNA', acciones:0.0865, montoMxn:450, fecha:'2026-09-01'},
         {tipo:'compra', simbolo:'NVDA', acciones:0.0004, montoMxn:15,  fecha:'2026-08-01'}]);
  der();
  chk('derivarPosiciones: MRNA en 0 (cerrada; se conserva para su historia)',
      state.posiciones.MRNA && state.posiciones.MRNA.acciones === 0);
  chk('derivarPosiciones: la compra chiquita sin venta sigue', state.posiciones.NVDA && state.posiciones.NVDA.acciones > 0);
  armar([{tipo:'venta',  simbolo:'X', acciones:0.9999, montoMxn:10, fecha:'2026-09-01'},
         {tipo:'compra', simbolo:'X', acciones:1,      montoMxn:9,  fecha:'2026-08-01'}]);
  der();
  chk('derivarPosiciones ordena por fecha antes de decidir el polvo', state.posiciones.X.acciones === 0,
      'acciones=' + state.posiciones.X.acciones);
  armar([{tipo:'compra', simbolo:'Y', acciones:2, montoMxn:10, fecha:'2026-08-01'},
         {tipo:'venta',  simbolo:'Y', acciones:0.5, montoMxn:4, fecha:'2026-09-01'}]);
  der();
  chk('derivarPosiciones: una venta parcial normal no se toca', Math.abs(state.posiciones.Y.acciones - 1.5) < 1e-9);

  // Codex: un umbral fijo borraba posiciones chiquitas legitimas (compra 0.0015, vende 0.001)
  const chica = [{tipo:'compra', simbolo:'Z', acciones:0.0015, montoMxn:30, fecha:'2026-08-01'},
                 {tipo:'venta',  simbolo:'Z', acciones:0.001,  montoMxn:25, fecha:'2026-09-01'}];
  armar(chica, {Z:{precio:900}});
  c = calcCartera();
  chk('calcCartera: compra 0.0015 y vende 0.001 -> quedan 0.0005 abiertas', c.pos.length === 1 && cerca(c.pos[0].acciones, 0.0005, 1e-9));
  armar(chica); der();
  chk('derivarPosiciones: tambien conserva las 0.0005', Math.abs(state.posiciones.Z.acciones - 0.0005) < 1e-9);

  // la grafica y los rendimientos (accionesEnFecha) aplican la misma regla
  const aef = new Function('state', 'parseFechaLocal', polvoSrc +
    extrae('function accionesEnFecha(sym, tms)', 'function derivarPosiciones()') + '\nreturn accionesEnFecha;')(
    state, f => new Date(f + 'T00:00:00'));
  armar([{tipo:'compra', simbolo:'MRNA', acciones:0.0866, montoMxn:500, fecha:'2026-08-01'},
         {tipo:'venta',  simbolo:'MRNA', acciones:0.0865, montoMxn:450, fecha:'2026-09-01'}]);
  const tAntes = new Date('2026-08-15T00:00:00').getTime(), tDespues = new Date('2026-09-05T00:00:00').getTime();
  chk('accionesEnFecha: antes de la venta si tenia las 0.0866', Math.abs(aef('MRNA', tAntes) - 0.0866) < 1e-9);
  chk('accionesEnFecha: despues de la venta ya no cuenta el polvo', aef('MRNA', tDespues) === 0, 'a=' + aef('MRNA', tDespues));
  armar(chica);
  chk('accionesEnFecha: la posicion chiquita legitima sigue', Math.abs(aef('Z', tDespues) - 0.0005) < 1e-9);

  // Codex: cerrar con costo pendiente y recomprar con costo conocido NO debe quedar pendiente
  armar([{tipo:'compra', simbolo:'W', acciones:1, montoMxn:0,   fecha:'2026-07-01'},
         {tipo:'venta',  simbolo:'W', acciones:1, montoMxn:100, fecha:'2026-08-01'},
         {tipo:'compra', simbolo:'W', acciones:1, montoMxn:50,  fecha:'2026-09-01'}], {W:{precio:3}});
  c = calcCartera();
  chk('recompra tras cerrar con costo pendiente: el costo nuevo SI cuenta', c.faltaCosto === false && cerca(c.costo, 50), 'costo=' + c.costo + ' falta=' + c.faltaCosto);

  // orden estable: mismo dia y mismo 'creado' no deben reordenarse al azar
  const ordenOps = new Function(polvoSrc + '\nreturn ordenOps;')();
  chk('ordenOps devuelve 0 si fecha y creado empatan', ordenOps({fecha:'2026-09-01'}, {fecha:'2026-09-01'}) === 0);
}

console.log('\n' + '='.repeat(58));
console.log(fallos === 0 ? `TODO PASA — ${pruebas}/${pruebas}` : `${fallos} FALLAS de ${pruebas}`);
process.exit(fallos === 0 ? 0 : 1);
