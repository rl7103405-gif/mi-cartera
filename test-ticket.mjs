// Prueba de "leer un ticket" (7-nov-2026), sin navegador: corre el bloque <ticket-puras> del index.html tal cual contra textos de tickets
// de Mexico escritos como los da el lector (con sus errores: T0TAL, 45.5O, coma en vez de punto). Lo que pasa en pantalla lo prueba
// pruebas-sin-senal\fundview\e2e-ticket.mjs. Regla que se prueba: ante la duda NO se llena; un monto mal leido es peor que un campo vacio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = process.env.APP || path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html');
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const ini = HTML.indexOf('// <ticket-puras>'), fin = HTML.indexOf('// </ticket-puras>');
if (ini < 0 || fin < ini || HTML.indexOf('// <ticket-puras>', ini + 1) >= 0) { console.log('FALLA: no hay UN bloque <ticket-puras> en ' + APP); process.exit(1); }
const T = new Function(HTML.slice(ini, fin) + '\nreturn {ticketLeer, ticketElegir, ticketMontos, ticketFecha, ticketComercio};')();
const HOY = '2026-11-07';
let pasan = 0, fallas = 0;
const ok = (c, t, d = '') => { if (c) pasan++; else { fallas++; console.log('  FALLA', t, d); } };
const L = a => a.join('\n');

// cada caso: texto, y lo que se espera (monto null = NO debe llenar el monto; fecha null = se queda la de hoy)
const CASOS = [
  {n: 'Oxxo con efectivo y cambio', esp: {monto: 56.5, fecha: '2026-11-06', comercio: 'Oxxo', confianza: 'alta'}, t: L([
    'OXXO', 'CADENA COMERCIAL OXXO SA DE CV', 'RFC CCO8605231N4', 'SUC. AV REFORMA 123 COL CENTRO', 'FECHA: 06/11/2026 HORA: 18:42', 'TICKET 4567 CAJA 2',
    '1 COCA COLA 600ML 18.50', '1 SABRITAS ORIG 45G 21.00', '1 GANSITO 17.00', 'ARTICULOS: 3', 'TOTAL $56.50', 'EFECTIVO $100.00', 'CAMBIO $43.50', 'GRACIAS POR SU COMPRA'])},
  {n: 'Walmart con subtotal, IVA y tarjeta', esp: {monto: 1000, fecha: '2026-11-05', comercio: 'Walmart', confianza: 'alta'}, t: L([
    'WALMART', 'NUEVA WAL MART DE MEXICO S DE RL DE CV', 'NWM9709244W4', 'SUPERCENTER COYOACAN', 'LECHE LALA 1L 2 52.00', 'HUEVO 18 PZ 62.90', 'DETERGENTE 3KG 189.00',
    'SUBTOTAL 862.07', 'IVA 16% 137.93', 'TOTAL 1,000.00', 'TARJETA DEBITO 1,000.00', 'NO. ARTICULOS 12', '05/11/26 14:22:10', 'TC# 1234 5678 9012 3456'])},
  {n: 'Soriana: TOTAL A PAGAR y mes con letras', esp: {monto: 2345.6, fecha: '2026-11-03', comercio: 'Soriana', confianza: 'media'}, t: L([
    'ORGANIZACION SORIANA SAB DE CV', 'TIENDA 0123 HIPER LINDAVISTA', 'FECHA 03-NOV-2026 11:05', 'ATUN DOLORES 3 PZ 66.00', 'ARROZ 1KG 32.50',
    'TOTAL A PAGAR $ 2,345.60', 'TOTAL ARTICULOS 27'])},
  {n: 'gasolinera: IMPORTE confirmado por litros por precio', esp: {monto: 500, fecha: '2026-11-07', comercio: 'Pemex', confianza: 'media'}, t: L([
    'SERVICIO LOS PINOS SA DE CV', 'ESTACION PEMEX 5678', 'R.F.C. SLP010101AB1', '2026-11-07 08:12', 'BOMBA 04 MAGNA', 'LITROS 20.931', 'PRECIO $23.89', 'IMPORTE $500.00'])},
  {n: 'restaurante con propina sugerida', esp: {monto: 580, fecha: '2026-11-04', comercio: 'Taqueria El Fogon', confianza: 'alta'}, t: L([
    'TAQUERIA EL FOGON', 'AV. INSURGENTES SUR 1500', 'MESA 7 MESERO: JUAN', 'FECHA 4 DE NOVIEMBRE DE 2026', 'CANT DESCRIPCION IMPORTE', '4 TACOS PASTOR 120.00',
    '2 GRINGAS 140.00', '3 AGUAS 240.00', 'SUBTOTAL 500.00', 'IVA 80.00', 'TOTAL 580.00', 'PROPINA SUGERIDA 10% 58.00', 'TOTAL CON PROPINA 638.00'])},
  {n: 'Farmacias Guadalajara con VISA', esp: {monto: 389, fecha: '2026-11-02', comercio: 'Farmacias Guadalajara', confianza: 'alta'}, t: L([
    'FARMACIAS GUADALAJARA', 'SUC 1234 ZAPOPAN', '02/11/2026 20:15', 'PARACETAMOL 500MG 89.00', 'OMEPRAZOL 20MG 300.00', 'TOTAL M.N. $ 389.00', 'VISA ****1234 389.00'])},
  {n: 'Farmacias del Ahorro: el monto abajo del letrero', esp: {monto: 1234.56, fecha: '2026-10-28', comercio: 'Farmacias del Ahorro', confianza: 'media'}, t: L([
    'FARMACIAS DEL AHORRO', 'FECHA: 28/10/2026', 'MEDICAMENTOS VARIOS', 'TOTAL A PAGAR:', '$1,234.56', 'GRACIAS'])},
  {n: 'lectura con errores: T0TAL y 45.5O', esp: {monto: 45.5, fecha: '2026-11-01', comercio: '7-Eleven', confianza: 'alta'}, t: L([
    '7-ELEVEN MEXICO', '01/11/2026', 'CAFE GRANDE 35.50', 'DONA 10.00', 'T0TAL $ 45.5O', 'EFECTIVO 50.00', 'CAMBIO 4.50'])},
  {n: 'coma en vez de punto', esp: {monto: 150, fecha: null, comercio: 'Fonda Doña Lupe', confianza: 'media'}, t: L([
    'FONDA DOÑA LUPE', 'COMIDA CORRIDA 2', 'TOTAL 150,00'])},
  {n: 'Chedraui con cambio mas grande que el total', esp: {monto: 23, fecha: '2026-11-06', comercio: 'Chedraui', confianza: 'alta'}, t: L([
    'TIENDAS CHEDRAUI SA DE CV', '06.11.2026 09:01', 'BOLILLO 6 PZ 23.00', 'TOTAL 23.00', 'EFECTIVO 500.00', 'CAMBIO 477.00'])},
  {n: 'Starbucks con fecha en ingles', esp: {monto: 132, fecha: '2026-11-05', comercio: 'Starbucks', confianza: 'alta'}, t: L([
    'STARBUCKS COFFEE MEXICO', 'NOV 05, 2026 07:45 AM', 'LATTE GRANDE 82.00', 'CROISSANT 50.00', 'SUBTOTAL 113.79', 'IVA 18.21', 'TOTAL 132.00', 'VISA 132.00'])},
  {n: 'fecha dia/mes ambigua: se lee como en Mexico', esp: {monto: 99.9, fecha: '2026-07-11', comercio: 'La Comer', confianza: 'media'}, t: L([
    'LA COMER', '11/07/26', 'TOTAL $99.90'])},
  {n: 'fecha con mes corto: 01/NOV/26', esp: {monto: 410.25, fecha: '2026-11-01', comercio: 'Costco', confianza: 'media'}, t: L([
    'COSTCO DE MEXICO', 'FECHA: 01/NOV/26', 'TOTAL 410.25'])},
  // ── los que NO deben llenar ──
  {n: 'NO: solo subtotal e IVA, sin total', esp: {monto: null, fecha: '2026-11-03', comercio: 'Super Lupita', confianza: 'baja'}, t: L([
    'SUPER LUPITA', '03/11/2026', 'SUBTOTAL 100.00', 'IVA 16.00'])},
  {n: 'NO: lectura ilegible', esp: {monto: null, fecha: null, comercio: null, confianza: 'baja'}, t: L([
    '~~ ,,; Iil |', '.. 12 :: 4', '%% $$ ^^'])},
  {n: 'NO: fecha futura (se queda la de hoy), monto si', esp: {monto: 75, fecha: null, comercio: 'Oxxo', confianza: 'media'}, t: L([
    'OXXO', 'FECHA 15/12/2026', 'TOTAL $75.00'])},
  {n: 'NO: total en cero', esp: {monto: null, fecha: null, comercio: 'Oxxo', confianza: 'baja'}, t: L([
    'OXXO', 'TOTAL $0.00', 'EFECTIVO $0.00'])},
  {n: 'NO: total absurdo', esp: {monto: null, fecha: null, comercio: 'Walmart', confianza: 'baja'}, t: L([
    'WALMART', 'TOTAL 9,999,999.00'])},
  {n: 'NO: fecha de hace mas de un año', esp: {monto: 60, fecha: null, comercio: 'Oxxo', confianza: 'media'}, t: L([
    'OXXO', '12/03/2023', 'TOTAL 60.00'])},
  {n: 'NO: dos totales distintos sin nada que los confirme', esp: {monto: null, fecha: null, comercio: 'Taller Mecanico Ruiz', confianza: 'baja'}, t: L([
    'TALLER MECANICO RUIZ', 'TOTAL 120.00', 'TOTAL 210.00'])},
  // ── los de la revision del 7-nov (code-reviewer): antes llenaban un monto EQUIVOCADO ──
  {n: 'descuento: gana TOTAL A PAGAR, no el TOTAL de antes', esp: {monto: 180, fecha: null, comercio: 'Soriana', confianza: 'alta'}, t: L([
    'SORIANA', 'TOTAL 200.00', 'AHORRO 20.00', 'TOTAL A PAGAR 180.00', 'EFECTIVO 200.00', 'CAMBIO 20.00'])},
  {n: 'descuento sin centavos: A PAGAR confirmado por pago menos cambio', esp: {monto: 180, fecha: null, comercio: 'Oxxo', confianza: 'media'}, t: L([
    'OXXO', 'SUBTOTAL 250', 'TOTAL 250', 'DESCUENTO 70', 'TOTAL A PAGAR 180', 'EFECTIVO 200', 'CAMBIO 20'])},
  {n: 'NO: miles con espacio (1 234.50) no se adivina', esp: {monto: null, fecha: null, comercio: 'Oxxo', confianza: 'baja'}, t: L(['OXXO', 'TOTAL 1 234.50'])},
  {n: 'NO: miles con espacio, ni con pago y cambio', esp: {monto: null, fecha: null, comercio: 'Oxxo', confianza: 'baja'}, t: L([
    'OXXO', 'TOTAL 1 234.50', 'EFECTIVO 1 500.00', 'CAMBIO 265.50'])},
  {n: 'NO: total sin punto (15000 por 150.00)', esp: {monto: null, fecha: null, comercio: 'Oxxo', confianza: 'baja'}, t: L(['OXXO', 'SUBTOTAL 129.31', 'IVA 20.69', 'TOTAL 15000'])},
  {n: 'NO: TOTAL 3', esp: {monto: null, fecha: null, comercio: 'Oxxo', confianza: 'baja'}, t: L(['OXXO', 'TOTAL 3'])},
  {n: 'NO: un folio abajo del letrero TOTAL', esp: {monto: null, fecha: null, comercio: 'Oxxo', confianza: 'baja'}, t: L(['OXXO', 'TOTAL', '4521'])},
  {n: 'NO: encabezado IMPORTE con el primer articulo abajo', esp: {monto: null, fecha: null, comercio: null, confianza: 'baja'}, t: L(['IMPORTE', '25.00'])},
  {n: 'NO: monto autorizado de la terminal', esp: {monto: null, fecha: null, comercio: 'Oxxo', confianza: 'baja'}, t: L(['OXXO', 'MONTO AUTORIZADO 150.00'])},
  {n: 'total sin centavos pero confirmado por subtotal e IVA', esp: {monto: 150, fecha: null, comercio: 'Oxxo', confianza: 'media'}, t: L(['OXXO', 'SUBTOTAL 129.31', 'IVA 20.69', 'TOTAL 150'])},
  {n: 'NO: texto vacio', esp: {monto: null, fecha: null, comercio: null, confianza: 'baja'}, t: ''},
  {n: 'NO: un numero suelto sin letrero (un folio, no un total)', esp: {monto: null, fecha: null, comercio: 'Papeleria Lupita', confianza: 'baja'}, t: L([
    'PAPELERIA LUPITA', 'FOLIO 004512', '35.00'])},
];
let aciertosCampo = 0, camposTotales = 0;
for (const c of CASOS) {
  const r = T.ticketLeer(c.t, HOY);
  for (const k of ['monto', 'fecha', 'comercio', 'confianza']) {
    camposTotales++;
    const bien = r[k] === c.esp[k];
    if (bien) aciertosCampo++;
    ok(bien, c.n + ' · ' + k, JSON.stringify(r[k]) + ' (esperaba ' + JSON.stringify(c.esp[k]) + ')');
  }
}
// ── piezas sueltas ──
ok(JSON.stringify(T.ticketMontos('TOTAL $1,234.56')) === '[{"v":1234.56,"dec":true,"peso":true}]', 'montos: 1,234.56 con signo');
ok(T.ticketMontos('TARJETA 1234 5678 9012 3456').length === 4 && T.ticketMontos('NO. 12345678').length === 0, 'montos: un numero de mas de 7 cifras no es monto');
ok(T.ticketMontos('HORA 18:42').length === 0, 'montos: una hora no es monto');
ok(T.ticketMontos('IVA 16% 137.93').map(x => x.v).join() === '137.93', 'montos: un porcentaje no es monto');
ok(T.ticketFecha('FECHA 29/02/2025', HOY) === null && T.ticketFecha('FECHA 31/04/2026', HOY) === null, 'fecha: dias que no existen no valen');
ok(T.ticketFecha('29/02/2024', '2024-03-10') === '2024-02-29', 'fecha: 29 de febrero en año bisiesto');
ok(T.ticketFecha('07/11/2026', HOY) === HOY, 'fecha: hoy vale');
ok(T.ticketFecha('08/11/2026', HOY) === null, 'fecha: mañana no vale');
ok(T.ticketFecha('TEL 55-12-34 FECHA 02/11/2026', HOY) === '2026-11-02', 'fecha: gana la que esta junto a FECHA');
const r0 = T.ticketLeer('OXXO\nTOTAL $45.00', HOY);
ok(Object.keys(r0).sort().join() === 'comercio,confianza,fecha,monto,motivo', 'ticketLeer devuelve solo {monto, fecha, comercio, confianza, motivo}');

// varias pasadas del lector (ticketElegir): una confirmada gana; dos que no coinciden no llenan
const E = (a, b) => T.ticketElegir([a, b], HOY);
ok(E('OXXO\nTOTAL $56.50', 'OXXO\nTOTAL $56.50\nEFECTIVO 100.00\nCAMBIO 43.50').monto === 56.5, 'elegir: la confirmada gana');
ok(E('OXXO\nTOTAL $5150.00', 'OXXO\nTOTAL $150.00').monto === null && E('OXXO\nTOTAL $5150.00', 'OXXO\nTOTAL $150.00').motivo === 'pasadas-distintas', 'elegir: dos pasadas con totales distintos no llenan');
ok(E('OXXO\nTOTAL $75.00', 'basura ilegible').monto === 75, 'elegir: si la otra pasada no ve nada, se queda la que si (no la contradice)');
ok(E('TOTAL $75.00', 'OXXO\nFECHA 02/11/2026\nTOTAL $75.00').comercio === 'Oxxo' && E('TOTAL $75.00', 'OXXO\nFECHA 02/11/2026\nTOTAL $75.00').fecha === '2026-11-02', 'elegir: fecha y comercio de la otra pasada si la primera no los vio');
ok(T.ticketElegir([], HOY).monto === null, 'elegir: sin pasadas, nada');
const montosBien = CASOS.filter(c => T.ticketLeer(c.t, HOY).monto === c.esp.monto).length;
const llenoMal = CASOS.filter(c => { const r = T.ticketLeer(c.t, HOY); return r.monto !== null && r.monto !== c.esp.monto; }).length;
console.log(`tickets: ${CASOS.length} · monto correcto (o correctamente vacio) en ${montosBien} · montos llenados MAL: ${llenoMal} · campos bien ${aciertosCampo}/${camposTotales}`);
ok(llenoMal === 0, 'ningun ticket llena un monto equivocado');
console.log(fallas ? `\n${fallas} FALLAN, ${pasan} pasan` : `\nTODO PASA (${pasan} bien)`);
process.exit(fallas ? 1 : 0);
