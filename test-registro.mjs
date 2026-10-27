// Prueba del REGISTRO DE CUENTAS (27-oct-2026): cada lista que antes estaba escrita a mano debe
// salir IGUAL del registro, con el mismo orden (el orden es el de las opciones en pantalla).
// Los valores esperados son los literales que tenia index.html antes del registro: son el contrato.
import fs from 'node:fs';
const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');

const ini = HTML.indexOf('// ── REGISTRO DE CUENTAS'), fin = HTML.indexOf('// ── fin registro de cuentas');
if (ini < 0 || fin < ini) { console.log('esta copia no tiene registro de cuentas: nada que probar'); process.exit(0); }
const registro = HTML.slice(ini, fin);

// la declaracion real (una linea) de cada constante, tal como esta en index.html
function decl(nombre) {
  const m = HTML.match(new RegExp('^\\s*const ' + nombre + '\\s*=.*$', 'm'));
  if (!m) throw new Error('no encontrada: const ' + nombre);
  return m[0].trim();
}
const NOMBRES = ['CUENTAS', 'CAMPO_SIMPLE', 'CAMPO_COMP', 'CTAS_FONDO', 'CTAS_AHORRO', 'METAS_PROYECTABLES',
  'CTAS_STOCK_OP', 'FUENTES_GASTO', 'DESTINOS_INGRESO', 'CUENTAS_DETALLE', 'CTAS_TRANSFER', 'CTAS_INTERES',
  'DEUDA_CUENTAS_ALTA', 'DEUDA_CUENTAS', 'DEUDA_TARJETAS'];
const R = new Function(registro + '\n' + NOMBRES.map(decl).join('\n') +
  '\nreturn {MIFEL_DEF, REG_CUENTAS, ' + NOMBRES.join(', ') + '};')();

const MIFEL_DEF = {dias:360,tasa:10,tope:500000,tasaExc:0,ret:0.9,retCap:true};
const ESPERADO = {
  CUENTAS: {efectivo:'efectivo', nu:'NU saldo', cajita1:'NU cajita 1', cajita2:'NU cajita 2', gbm:'GBM efectivo', revolut:'Revolut MXN', revSavings:'Revolut Savings', mifel:'Mifel', tarjeta:'tarjeta NU', tarjetaRev:'TDC Revolut', revTdcDep:'deposito TDC Revolut', stocks:'Stocks (bolsa)'},
  CAMPO_SIMPLE: {efectivo:'efectivo', nu:'nuSaldo', revolut:'revMXN', gbm:'efectivoGBM'},
  CAMPO_COMP: {
    cajita1:   {base:'nuCajita1Base', fecha:'nuCajita1Fecha', tasa:'nuCajita1Tasa',
                tope:'nuCajita1Tope', tasaExc:'nuCajita1TasaExc', ret:'nuCajita1Ret',
                def:{dias:360,tasa:13,tope:25000,tasaExc:6.5,ret:0}},
    cajita2:   {base:'nuCajita2Base', fecha:'nuCajita2Fecha', tasa:'nuCajita2Tasa',
                def:{dias:360,tasa:6.5,tope:null,tasaExc:0,ret:0}},
    revSavings:{base:'revSavingsBase',fecha:'revSavingsFecha',tasa:'revSavingsTasa',
                tope:'revSavingsTope',tasaExc:'revSavingsTasaExc',ret:'revSavingsRet',
                def:{dias:360,tasa:15,tope:25000,tasaExc:7.3,ret:0.9}},
    mifel:     {base:'mifelBase', fecha:'mifelFecha', tasa:'mifelTasa',
                tope:'mifelTope', tasaExc:'mifelTasaExc', ret:'mifelRet', def:MIFEL_DEF}},
  CTAS_FONDO: ['revolut', 'revSavings', 'nu', 'efectivo', 'cajita1', 'mifel'],
  CTAS_AHORRO: ['cajita1','revSavings','mifel'],
  METAS_PROYECTABLES: ['cajita1','revSavings','mifel','stocks'],
  CTAS_STOCK_OP: ['efectivo','nu','revolut','externo'],
  FUENTES_GASTO: ['efectivo','nu','tarjeta','revolut','tarjetaRev'],
  DESTINOS_INGRESO: ['efectivo','nu','revolut'],
  CUENTAS_DETALLE: ['efectivo','nu','revolut','revSavings','cajita1','mifel'],
  CTAS_TRANSFER: ['efectivo','nu','cajita1','revolut','revSavings','mifel','revTdcDep'],
  CTAS_INTERES: ['cajita1','cajita2','revSavings','mifel'],
  DEUDA_CUENTAS_ALTA: ['externo','efectivo','nu','cajita1','revolut','revSavings','mifel','tarjeta','tarjetaRev'],
  DEUDA_CUENTAS: ['externo','efectivo','nu','cajita1','cajita2','gbm','revolut','revSavings','mifel','tarjeta','tarjetaRev'],
  DEUDA_TARJETAS: ['tarjeta','tarjetaRev']
};

let fallos = 0, pruebas = 0;
function chk(nombre, cond, detalle = '') {
  pruebas++;
  if (cond) console.log('  PASA  ' + nombre);
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '\n        ' + detalle : '')); }
}
console.log('\nRegistro de cuentas: cada lista derivada = el literal de antes, en el mismo orden');
// JSON.stringify compara tambien el ORDEN de llaves y elementos
for (const n of NOMBRES) chk(n, JSON.stringify(R[n]) === JSON.stringify(ESPERADO[n]),
  'sale ' + JSON.stringify(R[n]) + '\n        esperado ' + JSON.stringify(ESPERADO[n]));
chk('Mifel: CAMPO_COMP usa el MISMO objeto MIFEL_DEF (no una copia)', R.CAMPO_COMP.mifel.def === R.MIFEL_DEF);
chk('MIFEL_DEF no cambio', JSON.stringify(R.MIFEL_DEF) === JSON.stringify(MIFEL_DEF));
const ids = R.REG_CUENTAS.map(c => c.id);
chk('ids unicos', new Set(ids).size === ids.length, ids.join(','));
// dos cuentas en la misma posicion de una lista dejarian el orden al azar del sort
const listas = new Set(R.REG_CUENTAS.flatMap(c => Object.keys(c.en)));
for (const l of listas) {
  const pos = R.REG_CUENTAS.filter(c => c.en[l]).map(c => c.en[l]);
  chk('posiciones unicas en ' + l, new Set(pos).size === pos.length, pos.join(','));
}
// ctasEn filtra por valor verdadero: una posicion 0 sacaria la cuenta de la lista en silencio
chk('toda posicion es un entero desde 1', R.REG_CUENTAS.every(c => Object.values(c.en).every(v => Number.isInteger(v) && v >= 1)));
// que nadie vuelva a escribir una de estas listas a mano junto al registro
chk('las listas salen del registro (no hay literal paralelo)', NOMBRES.every(n => /ctasEn\(|REG_CUENTAS/.test(decl(n))),
  NOMBRES.filter(n => !/ctasEn\(|REG_CUENTAS/.test(decl(n))).join(','));
// una cuenta de gasto, ingreso o bolsa sin campo de saldo ni tarjeta se trataria como 'externo':
// el Atajo y la bolsa la darian por aplicada SIN mover dinero
chk('toda cuenta de gasto, ingreso o bolsa tiene campo de saldo o es tarjeta',
  R.REG_CUENTAS.filter(c => c.en.gasto || c.en.ingreso || c.en.stock).every(c => c.simple || c.tarjeta));
chk('ingresos y bolsa solo a cuentas de saldo simple (no a tarjetas)',
  R.REG_CUENTAS.filter(c => c.en.ingreso || c.en.stock).every(c => c.simple));
chk('una cuenta no es simple y compuesta a la vez', R.REG_CUENTAS.every(c => !(c.simple && c.comp)));
chk('toda cuenta en la lista simple trae su campo', R.REG_CUENTAS.every(c => !c.en.simple || typeof c.simple === 'string'));
chk('toda cuenta en la lista comp trae su modelo', R.REG_CUENTAS.every(c => !c.en.comp || (c.comp && c.comp.base && c.comp.fecha && c.comp.def)));
chk('las legadas no se dan de alta en gasto, ingreso, fondo ni transferencias',
  R.REG_CUENTAS.filter(c => c.legada).every(c => !c.en.gasto && !c.en.ingreso && !c.en.fondo && !c.en.transfer && !c.en.deudaAlta));

// ── paso 2 (27-oct-2026): aplicarSaldosRemotos, aplicarRes y saldosPayload salen del registro ──
// test-registro-viejas.js trae las tres funciones tal como estaban antes. Se corren contra las nuevas
// con miles de entradas al azar (corruptas, ausentes, textos donde van numeros): mismo estado o falla.
function fnDe(nombre) {
  const i = HTML.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontrada: function ' + nombre);
  let j = HTML.indexOf('{', i), d = 0;
  for (; j < HTML.length; j++) { if (HTML[j] === '{') d++; else if (HTML[j] === '}' && --d === 0) return HTML.slice(i, j + 1); }
}
console.log('\nCampos de saldos: las funciones nuevas = las de antes');
{
  const VIEJAS = fs.readFileSync(new URL('./test-registro-viejas.js', import.meta.url), 'utf8');
  const camposNum = ['nuCajita1Base','nuCajita1Tasa','nuCajita2Base','nuCajita2Tasa','revSavingsBase','revSavingsTasa','mifelBase','mifelTasa',
    'nuCajita1Tope','nuCajita1TasaExc','nuCajita1Ret','revSavingsTope','revSavingsTasaExc','revSavingsRet','mifelTope','mifelTasaExc','mifelRet',
    'nuSaldo','efectivo','reporto','efectivoGBM','revMXN'];
  const camposTxt = ['nuCajita1Fecha','nuCajita2Fecha','revSavingsFecha','mifelFecha','mifelVigencia'];
  const N = new Function(registro + '\nreturn {CAMPOS_SALDO_NUM, CAMPOS_SALDO_TXT};')();
  const ordenado = a => JSON.stringify([...a].sort());
  chk('CAMPOS_SALDO_NUM = los 22 numeros de antes', ordenado(N.CAMPOS_SALDO_NUM) === ordenado(camposNum), N.CAMPOS_SALDO_NUM.join(','));
  chk('CAMPOS_SALDO_TXT = las 5 fechas y la vigencia de antes', ordenado(N.CAMPOS_SALDO_TXT) === ordenado(camposTxt), N.CAMPOS_SALDO_TXT.join(','));
  const fabrica = st => new Function('state', 'saneaFondo', registro + '\n' + VIEJAS + '\n' +
    fnDe('aplicarSaldosRemotos') + '\n' + fnDe('aplicarRes') + '\n' + fnDe('saldosPayload') +
    '\nreturn {aplicarSaldosRemotos, aplicarRes, saldosPayload, aplicarSaldosRemotosViejo, aplicarResViejo, saldosPayloadViejo};')(st, x => x);
  // semilla fija: un caso que falle se puede repetir
  let semilla = 20261027;
  // mulberry32: con Math.imul no se desbordan los 53 bits de un double
  const rnd = () => { let t = semilla += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const raro = () => [undefined, null, NaN, Infinity, 'texto', '2026-10-27', '', 0, -5, 123.45, 1e9, {}, []][Math.floor(rnd() * 13)];
  const todos = [...camposNum, ...camposTxt, 'ivvPrecio', 'otraCosa', 'tarjetaDeuda'];
  const estadoBase = () => Object.fromEntries(todos.map(k => [k, camposTxt.includes(k) ? '2026-01-01' : 100]));
  const entrada = () => Object.fromEntries(todos.filter(() => rnd() < 0.6).map(k => [k, raro()]));
  const txt = o => JSON.stringify(o, (k, v) => Number.isNaN(v) ? 'NaN' : v === Infinity ? 'Inf' : v === undefined ? 'undef' : v);
  const ord = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  let difRem = 0, difRes = 0, difPay = 0, ej = '';
  for (let n = 0; n < 5000; n++) {
    const sA = estadoBase(), sB = estadoBase(), fA = fabrica(sA), fB = fabrica(sB), d = entrada();
    fA.aplicarSaldosRemotos(d); fB.aplicarSaldosRemotosViejo(d);
    if (txt(ord(sA)) !== txt(ord(sB))) { difRem++; ej = ej || txt(d); }
    const cp = entrada(), res = rnd() < 0.2 ? {} : {campos: cp};
    fA.aplicarRes(res); fB.aplicarResViejo(res);
    if (txt(ord(sA)) !== txt(ord(sB))) { difRes++; ej = ej || txt(cp); }
    // el orden de llaves del respaldo exportado puede cambiar; el contenido no
    if (txt(ord(fA.saldosPayload())) !== txt(ord(fB.saldosPayloadViejo()))) difPay++;
  }
  chk('aplicarSaldosRemotos: 5,000 casos al azar, mismo estado', difRem === 0, difRem + ' diferencias · ej ' + ej);
  chk('aplicarRes: 5,000 casos al azar, mismo estado', difRes === 0, difRes + ' diferencias · ej ' + ej);
  chk('saldosPayload: mismos campos y valores', difPay === 0, difPay + ' diferencias');
  // la carga saneada (loadFromFirebase) conserva su lista literal de fechas a proposito; debe ser la misma
  const mCarga = HTML.match(/\[([^\]]*'mifelVigencia'[^\]]*)\]\.forEach\(k => \{\s*if \(typeof state\[k\] !== 'string'\)/);
  const fechasCarga = mCarga ? mCarga[1].split(',').map(x => x.trim().replace(/'/g, '')) : [];
  chk('la carga saneada sanea las mismas fechas que CAMPOS_SALDO_TXT', ordenado(fechasCarga) === ordenado(N.CAMPOS_SALDO_TXT), fechasCarga.join(','));
}

// ── paso 3 (27-oct-2026): la suma del patrimonio sale de los grupos del registro ──
console.log('\nGrupos: las cuentas que antes se sumaban a mano en inicio, el coach, la distribucion y el colchon');
{
  const G = new Function(registro + '\nreturn {ctasGrupo};')();
  chk('disponible = efectivo, NU saldo, Revolut MXN (en ese orden)', JSON.stringify(G.ctasGrupo('disponible')) === '["efectivo","nu","revolut"]', JSON.stringify(G.ctasGrupo('disponible')));
  chk('ahorro = cajita 1, Revolut Savings, Mifel (en ese orden)', JSON.stringify(G.ctasGrupo('ahorro')) === '["cajita1","revSavings","mifel"]', JSON.stringify(G.ctasGrupo('ahorro')));
  chk('ninguna legada suma al patrimonio', R.REG_CUENTAS.every(c => !(c.legada && c.grupo)));
  // las que SI tienen saldo (simple o compuesta) y no son legadas deben sumar: olvidar el grupo
  // en una cuenta nueva la sacaria del patrimonio, del coach y del colchon en silencio
  chk('toda cuenta de saldo no legada tiene grupo valido',
    R.REG_CUENTAS.filter(c => !c.legada && (c.simple || c.comp)).every(c => ['disponible', 'ahorro'].includes(c.grupo)),
    R.REG_CUENTAS.filter(c => !c.legada && (c.simple || c.comp) && !['disponible', 'ahorro'].includes(c.grupo)).map(c => c.id).join(','));
  // sumaGrupo real contra las formulas de antes (inicio, distribucion y coach), con saldos y apartados al azar
  const S = new Function('getSaldoCuenta', 'apartadoDe', registro + '\n' + fnDe('sumaGrupo') + '\nreturn sumaGrupo;');
  let semilla = 4242, peor = 0;
  const rnd = () => { let t = semilla += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let n = 0; n < 2000; n++) {
    const sal = {}, ap = {};
    for (const c of ['efectivo', 'nu', 'revolut', 'cajita1', 'revSavings', 'mifel']) { sal[c] = (rnd() - 0.1) * 1e6; ap[c] = rnd() < 0.5 ? rnd() * 9e5 : 0; }
    const sumaGrupo = S(c => sal[c], c => ap[c] || 0);
    const viejoFisico = sal.cajita1 + sal.nu + sal.efectivo + sal.revolut + sal.revSavings + sal.mifel;
    const viejoAhorro = sal.cajita1 + sal.revSavings + sal.mifel - ap.cajita1 - ap.revSavings - ap.mifel;
    const viejoDisp = sal.efectivo + sal.nu + sal.revolut - ap.efectivo - ap.nu - ap.revolut;
    peor = Math.max(peor, Math.abs(sumaGrupo('ahorro') + sumaGrupo('disponible') - viejoFisico),
      Math.abs(sumaGrupo('ahorro', true) - viejoAhorro), Math.abs(sumaGrupo('disponible', true) - viejoDisp));
  }
  // solo cambia el orden de la suma: diferencias de redondeo de flotante, muy por debajo de un centavo
  chk('sumaGrupo = las formulas de antes (2,000 casos, < 1e-6)', peor < 1e-6, 'peor diferencia ' + peor);
}

// ── paso 5 (27-oct-2026): selects y botones de cuentas salen del registro ──
// ESPERADO: value|texto de cada opcion tal como estaba escrita en el HTML antes del registro (commit b4a0786)
console.log('\nSelects y botones de cuentas: iguales al HTML de antes (valor, texto, orden y marca de tarjeta)');
{
  const ESPERADO = {"transfer-origen":["efectivo|efectivo","nu|NU saldo","cajita1|NU cajita 1","revolut|Revolut MXN","revSavings|Revolut Savings","mifel|Mifel","revTdcDep|depósito TDC Revolut (solo retirable)"],"transfer-destino":["nu|NU saldo","efectivo|efectivo","cajita1|NU cajita 1","revolut|Revolut MXN","revSavings|Revolut Savings","mifel|Mifel","tarjeta|tarjeta NU (pago)","tarjetaRev|TDC Revolut (pago)","revTdcDep|depósito TDC Revolut (sube tu límite)"],"tarjeta-pago-fuente":["nu|NU saldo","efectivo|efectivo","cajita1|NU cajita 1","revolut|Revolut MXN","revSavings|Revolut Savings","externo|otro (no descontar de mis cuentas)"],"tarjeta-rev-pago-fuente":["revolut|Revolut MXN","efectivo|efectivo","nu|NU saldo","externo|otro (no descontar de mis cuentas)"],"deuda-cuenta":["externo|externo · no toca mis cuentas","efectivo|efectivo","nu|NU saldo","cajita1|NU cajita 1","revolut|Revolut MXN","revSavings|Revolut Savings","mifel|Mifel","tarjeta|tarjeta NU (crédito)|soloSale","tarjetaRev|TDC Revolut (crédito)|soloSale"],"stock-cuenta":["revolut|Revolut MXN","efectivo|efectivo","nu|NU saldo","externo|externo · no toca mis cuentas"],"gasto-fuente-toggle":["efectivo|efectivo","nu|NU saldo","tarjeta|tarjeta NU","revolut|Revolut","tarjetaRev|TDC Revolut"],"ingreso-destino-toggle":["efectivo|efectivo","nu|NU saldo","revolut|Revolut"]};
  const cajas = {};
  const elem = () => { const e = { hijos: [], dataset: {}, className: '', value: '', _t: '',
    appendChild(h) { this.hijos.push(h); return h; }, addEventListener() {} };
    Object.defineProperty(e, 'textContent', { get() { return this._t; }, set(v) { this._t = v; if (v === '') this.hijos = []; } });
    return e; };
  const document = { getElementById: id => (cajas[id] = cajas[id] || elem()), createElement: () => elem() };
  const pinta = new Function('document', 'window', registro + '\n' +
    ['FUENTES_GASTO', 'DESTINOS_INGRESO', 'CTA_EXTERNO'].map(decl).join('\n') + '\n' +
    fnDe('pintarListasCuentas') + '\nreturn pintarListasCuentas;')(document, {});
  pinta();
  for (const id of Object.keys(ESPERADO)) {
    const sale = (cajas[id] ? cajas[id].hijos : []).map(o => (o.value || o.dataset.cuenta) + '|' + o.textContent + (o.dataset.soloSale ? '|soloSale' : ''));
    chk(id, JSON.stringify(sale) === JSON.stringify(ESPERADO[id]), 'sale ' + JSON.stringify(sale));
  }
  const g = cajas['gasto-fuente-toggle'].hijos;
  // el boton activo al abrir es el primero; state arranca con fuenteGasto/destinoIngreso = 'efectivo'.
  // Si el orden cambia, la pantalla marcaria una cuenta y se guardaria otra
  const ini = (HTML.match(/fuenteGasto:'(\w+)'/) || [])[1], iniI = (HTML.match(/destinoIngreso:'(\w+)'/) || [])[1];
  chk('el primer boton de gasto e ingreso es la cuenta por defecto del estado',
    g[0].dataset.cuenta === ini && cajas['ingreso-destino-toggle'].hijos[0].dataset.cuenta === iniI, ini + ' / ' + iniI);
  chk('solo el primer boton de gasto empieza activo', g.map(b => / active/.test(b.className)).join() === [true, false, false, false, false].join());
  chk('los botones ya no dependen de la posicion (setFuente usa data-cuenta)', !/\]\[i\]===f/.test(HTML.match(/window\.setFuente = .*$/m)[0]));
  chk('las validaciones de pago de tarjeta usan la misma lista que su select',
    HTML.includes("[...ctasEn('pagoTj'),'externo']") && HTML.includes("[...ctasEn('pagoTjRev'),'externo']"));
}

console.log('\n==========================================================');
console.log(fallos === 0 ? `TODO PASA — ${pruebas}/${pruebas}` : `${fallos} FALLAS de ${pruebas}`);
process.exit(fallos ? 1 : 0);
