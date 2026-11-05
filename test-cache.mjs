// Prueba de pintarDesdeCache(): la hidratacion instantanea desde la copia local.
// Extrae la funcion REAL del index.html publicado (no una copia) y la corre contra
// una cache simulada. Lo que se comprueba es lo que hace peligrosa a esta funcion:
// que sea TODO O NADA y que no invente datos cuando la copia local esta incompleta.
import fs from 'fs';

const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const NS  = process.env.NS  || 'cartera';
const PFX = process.env.PFX || '';
const HTML = fs.readFileSync(APP, 'utf8');

function extrae(desde, hasta) {
  const i = HTML.indexOf(desde);
  if (i < 0) throw new Error('no encontrado: ' + desde);
  const j = HTML.indexOf(hasta, i);
  if (j < 0) throw new Error('fin no encontrado: ' + hasta);
  return HTML.slice(i, j);
}

// ── cache falsa ─────────────────────────────────────────────
let CACHE = {};              // ruta -> objeto (ausente = no esta en la copia local)
let COLS = {};               // coleccion -> [{id,...}]
let ESCRITURAS = 0;          // esta funcion NO debe escribir NADA
const doc = (db, ...p) => ({ path: p.join('/') });
const collection = (db, c) => ({ col: c });
const query = (ref, ...o) => ref;
const orderBy = () => ({});
const snapDoc = d => ({ exists: () => d !== undefined, data: () => JSON.parse(JSON.stringify(d)) });
async function getDocFromCache(ref) {
  if (!(ref.path in CACHE)) throw new Error('no esta en cache: ' + ref.path);
  return snapDoc(CACHE[ref.path]);
}
async function getDocsFromCache(ref) {
  const c = ref.col;
  if (!(c in COLS)) throw new Error('coleccion no esta en cache: ' + c);
  return { docs: COLS[c].map(x => ({ id: x.id, data: () => { const y = {...x}; delete y.id; return y; } })) };
}
const setDoc = async () => { ESCRITURAS++; };
const getDoc = async () => { ESCRITURAS++; return snapDoc(undefined); };

// ── stubs de la app ─────────────────────────────────────────
const db = {};
let datosCargados = false;
// mismas claves que la app (una-base, 31-oct): las copias prefijan con su espacio
const lsKey = k => NS === 'cartera' ? k : NS + ':' + k;
const localStorage = { _d:{}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=v;} };
const document = { getElementById: () => null };
// la funcion nueva registra un listener de 'online' para reintentar sola
const window = { addEventListener: () => {}, reintentarSync: null };
const loadFromFirebase = async () => true;
const showToast = () => {};
const renderCatSelect = () => {};
const refrescar = () => {};
const renderPersonaSelect = () => {}, render = () => {}, renderMovimientos = () => {}, renderTransferencias = () => {};
let derivadas = 0;
const derivarPosiciones = () => { derivadas++; };
const state = {
  nuCajita1Base:0, nuSaldo:0, efectivo:0, revMXN:0, nuCajita1Fecha:'',
  tarjetaDeuda:0, tarjetaMovimientos:[], revTdcDeuda:0, revTdcDeposito:0, revTdcMovs:[],
  personas:{}, catsGasto:['Otros'], catsIngreso:['Otros'], snapshots:[],
  ivvPrecio:0, usdMxn:0, accionesMkt:{}, cuentasX:{}, fx:null,
  gastos:[], ingresos:[], transferencias:[], stocksOps:[], posiciones:{}
};
const limpio = () => JSON.parse(JSON.stringify(state));
const BASE = limpio();
const reset = () => { Object.assign(state, JSON.parse(JSON.stringify(BASE))); ESCRITURAS = 0; };

const fuente = extrae('// ── ARRANQUE INSTANTANEO', 'async function loadFromFirebase()');
// esta copia puede no tener tarjeta Revolut ni bolsa (cartera-casa)
const HAY_TDCREV = fuente.includes("'tarjetaRev'");
const HAY_STOCKS = fuente.includes('C_OPS') || fuente.includes("'stocksOps'");
// sin las cotizaciones la bolsa valdria 0 y el patrimonio saldria mas bajo del real
const HAY_MERCADO = fuente.includes("'mercado'");
// el fondo de la universidad (solo la app de Roberto): sin el cacheado, inicio pintaria lo apartado como tuyo
const HAY_FONDO = fuente.includes("'fondo'");
// Eli y Toño (16-oct): la configuracion de cuentas entra al todo o nada (sin ella se capturaria con las de fabrica)
const HAY_CUENTAS = fuente.includes("'cuentas'");
// (27-oct-2026) CTAS_FONDO sale del registro de cuentas: se carga antes que el saneo del fondo
const registroSrc = HTML.includes('// ── REGISTRO DE CUENTAS') ? extrae('// ── REGISTRO DE CUENTAS', '// ── fin registro de cuentas') : '';
// (20-oct-2026) cuentas en otra moneda: su doc entra al todo o nada, y el tipo de cambio sale de mercado
const HAY_CX = fuente.includes('docCX()');
function extraeFn(nombre) {
  const i = HTML.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontrado: function ' + nombre);
  let j = HTML.indexOf('{', i), prof = 0;
  for (; j < HTML.length; j++) { if (HTML[j] === '{') prof++; else if (HTML[j] === '}' && --prof === 0) return HTML.slice(i, j + 1); }
  throw new Error('llaves sin cerrar en ' + nombre);
}
const cxSrc = HAY_CX ? 'const nFin = (v,d=0) => Number.isFinite(v) ? v : d; const c2 = n => Math.round(n*100)/100;\n'
  + extrae('const MONEDAS_X =', '// que hay que DEVOLVER') + '\n' + extrae('const FX_BANDAS =', 'function saneaFx(') + '\n' + extraeFn('saneaFx') + '\n' : '';
const fondoSrc = HAY_FONDO ? registroSrc + extrae('// ── fondo: saneo', '// ── fin saneo fondo') : '';
// la casa (30-sep): la carga normaliza las categorías de ingreso con conCatPapa ("Mes papá" primero)
const papaSrc = HTML.includes('const conCatPapa')
  ? HTML.slice(HTML.indexOf('const CAT_PAPA ='), HTML.indexOf('\n', HTML.indexOf('const conCatPapa'))+1) : '';
// (4-nov-2026) 'Educacion' -> 'Educación' en Fundview: los ayudantes viven antes de CATS_GASTO_DEFAULT
const HAY_EDU = HTML.includes('const CAT_EDU_VIEJA');
const eduSrc = HAY_EDU ? extrae('const CAT_EDU_VIEJA', 'const CATS_GASTO_DEFAULT') : '';
const CFG_PRUEBA = {};   // window.CFG de la copia: cada caso le pone multi (Fundview)
const ARGS = ['CFG','db','doc','collection','query','orderBy','getDocFromCache','getDocsFromCache',
  'state','derivarPosiciones','document','localStorage','console',
  'NS','C_GASTOS','C_INGRESOS','C_TRANSF','C_OPS','C_REND','lsKey',
  'window','loadFromFirebase','showToast','renderCatSelect','refrescar',
  'renderPersonaSelect','render','renderMovimientos','renderTransferencias','datosCargados'];
const VALS = [CFG_PRUEBA,db, doc, collection, query, orderBy, getDocFromCache, getDocsFromCache,
  state, derivarPosiciones, document, localStorage, console,
  NS, PFX+'gastos', PFX+'ingresos', PFX+'transferencias', PFX+'stocksOps', PFX+'rendimientos', lsKey,
  window, loadFromFirebase, showToast, renderCatSelect, refrescar,
  renderPersonaSelect, render, renderMovimientos, renderTransferencias, datosCargados];
const { pintarDesdeCache, marcarCopiaLocal, marcarSincronizado, APAG } = new Function(
  ...ARGS, papaSrc + fondoSrc + cxSrc + eduSrc + fuente + '\nreturn { pintarDesdeCache, marcarCopiaLocal, marcarSincronizado, APAG: (typeof APAGADAS !== "undefined" ? APAGADAS : new Set()) };'
)(...VALS);
// cuentas apagadas: es el Set real del registro de la app (ctaApagada = id => APAGADAS.has(id)); cada caso lo ajusta
const apagar = (...ids) => { APAG.clear(); ids.forEach(i => APAG.add(i)); };

// ── utilidades ──────────────────────────────────────────────
let fallos = 0, pruebas = 0;
function chk(nombre, cond, detalle = '') {
  pruebas++;
  if (cond) console.log('  PASA  ' + nombre);
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
const DOCS_OPC = HAY_TDCREV ? ['tarjetaRev'] : [];
function cacheCompleta() {
  CACHE = {
    [`${NS}/saldos`]:     { nuCajita1Base:20000, nuSaldo:1500, efectivo:3000, revMXN:400, nuCajita1Fecha:'2026-09-01' },
    [`${NS}/tarjeta`]:    { deuda:1500, movimientos:[{id:'a',monto:100}] },
    [`${NS}/personas`]:   { data:{ Papa:{nombre:'Papa', saldo:40973.31, movimientos:[{monto:1}]} } },
    [`${NS}/categorias`]: { catsGasto:['Comida','Casa'], catsIngreso:['Trabajo'] },
    [`${NS}/historial`]:  { snapshots:[{f:'2026-09-01',total:100,gbm:0}] },
  };
  if (HAY_TDCREV) CACHE[`${NS}/tarjetaRev`] = { deuda:200, deposito:1000, movimientos:[] };
  if (HAY_MERCADO) CACHE[`${NS}/mercado`] = { ivvPrecio:154.2, usdMxn:18.5, accionesMkt:{NVDA:{precio:120}} };
  if (HAY_CUENTAS) CACHE[`${NS}/cuentas`] = { slots:{ tarjeta:{on:false} } };
  if (HAY_CX) {
    CACHE[`${NS}/cuentasX`] = { cuentas:{ x_abc123:{nombre:'CommBank', moneda:'AUD', tipo:'banco', on:true, saldo:500, creada:'2026-10-20'},
                                          x_malo:{nombre:'rota', moneda:'XYZ', saldo:1} } };
    if (HAY_MERCADO) CACHE[`${NS}/mercado`].fx = { fecha:'2026-10-20', bajado:'2026-10-20', mxnPor:{AUD:12.94, XYZ:5}, fuente:'BCE' };
  }
  if (HAY_FONDO) CACHE[`${NS}/fondo`] = { saldosPorCuenta:{revolut:800000, gbm:5}, movs:[{id:'f1',tipo:'entrada',cuenta:'revolut',monto:800000,fecha:'2026-09-28',creado:'2026-09-28T10:00:00Z'}] };
  COLS = {
    [PFX+'gastos']:         [{id:'g1',monto:150,cat:'Comida',fecha:'2026-09-02T00:00:00Z'},
                             {id:'g2',monto:80, cat:'Casa',  fecha:'2026-09-03T00:00:00Z'}],
    [PFX+'ingresos']:       [{id:'i1',monto:5000,cat:'Trabajo',fecha:'2026-09-01T00:00:00Z'}],
    [PFX+'transferencias']: [{id:'t1',monto:400,origen:'efectivo',destino:'nu',fecha:'2026-09-01T00:00:00Z'}],
  };
  if (HAY_STOCKS) COLS[PFX+'stocksOps'] = [{id:'o1',simbolo:'NVDA',acciones:0.19,tipo:'compra',fecha:'2026-07-23'}];
  // tramos de rendimiento: en un aparato recien actualizado la coleccion esta vacia, y eso NO invalida la copia local
  COLS[PFX+'rendimientos'] = [];
}

console.log('\n=== pintarDesdeCache: hidratacion instantanea desde la copia local ===');

// ═══ 1. copia local COMPLETA ═══
console.log('\n1. Con la copia local completa, pinta y NO escribe nada');
reset(); cacheCompleta();
let ok = await pintarDesdeCache();
chk('devuelve true', ok === true);
chk('aplica los saldos', state.nuCajita1Base === 20000 && state.efectivo === 3000, 'base='+state.nuCajita1Base);
chk('aplica la tarjeta NU', state.tarjetaDeuda === 1500 && state.tarjetaMovimientos.length === 1);
if (HAY_TDCREV) chk('aplica la TDC Revolut', state.revTdcDeuda === 200 && state.revTdcDeposito === 1000);
chk('aplica las personas', !!state.personas.Papa && state.personas.Papa.saldo === 40973.31);
chk('aplica las categorias', state.catsGasto.length === 2 && state.catsGasto[0] === 'Comida');
chk('aplica el historial', state.snapshots.length === 1);
chk('carga los gastos', state.gastos.length === 2);
chk('los ordena por fecha desc', state.gastos[0].id === 'g2', state.gastos.map(g=>g.id).join(','));
chk('carga ingresos y transferencias', state.ingresos.length === 1 && state.transferencias.length === 1);
if (HAY_STOCKS) chk('carga stocksOps y deriva posiciones', state.stocksOps.length === 1 && derivadas > 0);
if (HAY_MERCADO) chk('aplica las cotizaciones (si no, el patrimonio saldria de menos)',
  state.ivvPrecio === 154.2 && state.usdMxn === 18.5 && !!state.accionesMkt.NVDA,
  JSON.stringify({p:state.ivvPrecio,fx:state.usdMxn,mk:state.accionesMkt}));
if (HAY_FONDO) chk('aplica el fondo (si no, inicio pintaria lo apartado como tuyo)',
  state.fondo && state.fondo.saldosPorCuenta.revolut === 800000 && state.fondo.movs.length === 1, JSON.stringify(state.fondo));
if (HAY_FONDO) chk('el fondo se sanea: una cuenta fuera del catalogo no entra', state.fondo && state.fondo.saldosPorCuenta.gbm === undefined);
if (HAY_CX) chk('aplica las cuentas en otra moneda (si no, el total saldria bajo)',
  state.cuentasX.x_abc123 && state.cuentasX.x_abc123.saldo === 500 && state.cuentasX.x_abc123.moneda === 'AUD', JSON.stringify(state.cuentasX));
if (HAY_CX) chk('una cuenta con id o moneda raros se descarta', !state.cuentasX.x_malo && Object.keys(state.cuentasX).length === 1);
if (HAY_CX && HAY_MERCADO) chk('aplica el tipo de cambio y descarta monedas fuera del catalogo',
  state.fx && state.fx.mxnPor.AUD === 12.94 && state.fx.mxnPor.XYZ === undefined, JSON.stringify(state.fx));
chk('NO escribio NADA en Firestore', ESCRITURAS === 0, 'escrituras=' + ESCRITURAS);

// ═══ 2. TODO O NADA ═══
console.log('\n2. Si falta CUALQUIER pieza, no pinta nada (todo o nada)');
for (const falta of ['saldos','tarjeta','personas','categorias','historial',...DOCS_OPC,
                     ...(HAY_MERCADO?['mercado']:[]), ...(HAY_FONDO?['fondo']:[]), ...(HAY_CUENTAS?['cuentas']:[]),
                     ...(HAY_CX?['cuentasX']:[])]) {
  reset(); cacheCompleta(); delete CACHE[`${NS}/${falta}`];
  ok = await pintarDesdeCache();
  chk('sin ' + falta + ' -> false y estado intacto', ok === false && state.efectivo === 0,
      'ok=' + ok + ' efectivo=' + state.efectivo);
}
for (const falta of ['gastos','ingresos','transferencias',...(HAY_STOCKS?['stocksOps']:[])]) {
  reset(); cacheCompleta(); delete COLS[PFX+falta];
  ok = await pintarDesdeCache();
  chk('sin la coleccion ' + falta + ' -> false y estado intacto', ok === false && state.gastos.length === 0);
}

// ═══ 2b. el documento esta cacheado pero VACIO ═══
console.log('\n2b. Cacheado pero inexistente: tampoco alcanza (no inventar deudas default)');
for (const vacio of ['saldos','personas','tarjeta']) {
  reset(); cacheCompleta(); CACHE[`${NS}/${vacio}`] = undefined;
  ok = await pintarDesdeCache();
  chk(vacio + ' inexistente -> false', ok === false, 'ok=' + ok);
}

// ═══ 2c. tarjeta apagada (Fundview, o una copia configurable con la tarjeta 1 apagada) ═══
console.log('\n2c. Tarjeta apagada: su documento no se exige (nunca se crea); encendida, si');
for (const [etiqueta, ponerCache] of [['cacheado como inexistente', c => { c[`${NS}/tarjeta`] = undefined; }],
                                      ['ni siquiera en cache', c => { delete c[`${NS}/tarjeta`]; }]]) {
  reset(); cacheCompleta(); ponerCache(CACHE); apagar('tarjeta');
  ok = await pintarDesdeCache();
  chk('apagada y sin doc tarjeta (' + etiqueta + ') -> hay copia local', ok === true, 'ok=' + ok);
  chk('  y pinta el resto sin inventar la tarjeta', state.efectivo === 3000 && state.tarjetaDeuda === 0 && state.tarjetaMovimientos.length === 0,
      'efectivo=' + state.efectivo + ' deuda=' + state.tarjetaDeuda);
  apagar();
  reset(); cacheCompleta(); ponerCache(CACHE);
  ok = await pintarDesdeCache();
  chk('encendida y sin doc tarjeta (' + etiqueta + ') -> NO hay copia local', ok === false && state.efectivo === 0, 'ok=' + ok);
}
reset(); cacheCompleta(); apagar('tarjeta');
ok = await pintarDesdeCache();
chk('apagada pero con doc tarjeta guardado -> lo carga como siempre', ok === true && state.tarjetaDeuda === 1500);
reset(); cacheCompleta(); CACHE[`${NS}/saldos`] = undefined; apagar('tarjeta'); CACHE[`${NS}/tarjeta`] = undefined;
ok = await pintarDesdeCache();
chk('apagada pero sin saldos -> sigue sin haber copia local', ok === false);
apagar();

// ═══ 2d. Fundview: cuenta nueva, con solo cuentas agregadas (3-nov-2026) ═══
console.log('\n2d. Cuenta nueva con solo cuentas agregadas (saldos y personas: la cache SABE que no existen)');
for (const multi of [true, false]) {
  CFG_PRUEBA.multi = multi;
  reset(); cacheCompleta();
  CACHE[`${NS}/saldos`] = undefined; CACHE[`${NS}/personas`] = undefined; CACHE[`${NS}/tarjeta`] = undefined;
  const r2d = await pintarDesdeCache();
  if (multi) {
    chk('Fundview: alcanza para abrir con la copia local', r2d === true);
    chk('Fundview: sus cuentas agregadas si se pintan', !HAY_CX || Object.keys(state.cuentasX).length === 1);
    chk('Fundview: no escribe nada', ESCRITURAS === 0);
    // nunca leida (la cache no sabe nada): sigue siendo todo o nada
    reset(); cacheCompleta(); delete CACHE[`${NS}/saldos`];
    chk('Fundview: un documento que la cache nunca vio sigue tumbando la copia local', await pintarDesdeCache() === false);
  } else chk('la familia: sin saldos no pinta, como siempre', r2d === false);
}
delete CFG_PRUEBA.multi;

// ═══ 3. copia local vacia (primera vez en el aparato) ═══
console.log('\n3. Aparato nuevo: no hay copia local');
reset(); CACHE = {}; COLS = {};
ok = await pintarDesdeCache();
chk('devuelve false sin tocar el estado', ok === false && state.efectivo === 0 && state.gastos.length === 0);
chk('y sin escribir nada', ESCRITURAS === 0);

// ═══ 4. datos corruptos en la copia local ═══
console.log('\n4. Copia local con basura: se ignora, no se propaga');
reset(); cacheCompleta();
CACHE[`${NS}/saldos`] = { nuCajita1Base:'no-es-numero', efectivo:NaN, nuSaldo:777, revMXN:null };
ok = await pintarDesdeCache();
chk('sigue pintando', ok === true);
chk('el campo bueno si entra', state.nuSaldo === 777);
chk('el texto en un numero se ignora', state.nuCajita1Base === 0, 'quedo ' + state.nuCajita1Base);
chk('NaN se ignora', state.efectivo === 0, 'quedo ' + state.efectivo);
chk('null se ignora', state.revMXN === 0, 'quedo ' + state.revMXN);

// ═══ 5. personas en formato viejo (array) ═══
console.log('\n5. personas guardado como ARRAY (formato viejo): no se intenta migrar aqui');
reset(); cacheCompleta();
CACHE[`${NS}/personas`] = { data: [{nombre:'Papa', saldo:100, movimientos:[]}] };
ok = await pintarDesdeCache();
chk('pinta el resto igual', ok === true && state.efectivo === 3000);
chk('deja personas vacio en vez de inventar', Object.keys(state.personas).length === 0,
    JSON.stringify(state.personas));

// ═══ 6. persona con campos faltantes ═══
console.log('\n6. Persona sin saldo ni movimientos: se sanea');
reset(); cacheCompleta();
CACHE[`${NS}/personas`] = { data:{ Mama:{nombre:'Mama'} } };
ok = await pintarDesdeCache();
chk('saldo faltante -> 0', ok === true && state.personas.Mama.saldo === 0);
chk('movimientos faltantes -> []', Array.isArray(state.personas.Mama.movimientos));

// ═══ 7. la banda de aviso ═══
console.log('\n7. La banda dice claramente que es la copia local');
const textos = [];
const el = { hidden:true, textContent:'' };
// el boton de reintentar se crea con createElement cuando la sincronizacion falla
const hijos = [];
el.appendChild = n => hijos.push(n);
const doc2 = { getElementById: id => (id === 'banda-cache' ? el : null),
               createElement: () => ({ style:{}, set textContent(v){this._t=v;}, get textContent(){return this._t;} }) };
// se sustituye 'document' (posicion 9 de ARGS) por uno falso que SI tiene la banda
const VALS2 = VALS.slice(); VALS2[ARGS.indexOf('document')] = doc2;
const { marcarCopiaLocal: mcl, marcarSincronizado: ms } = new Function(
  ...ARGS, papaSrc + fondoSrc + eduSrc + fuente + '\nreturn { marcarCopiaLocal, marcarSincronizado };'
)(...VALS2);
mcl(true);
chk('al sincronizar se ve y lo dice', el.hidden === false && /copia local/.test(el.textContent), el.textContent);
mcl(true, true);
chk('si falla la red avisa que NO esta confirmada', /SIN confirmar/.test(el.textContent), el.textContent);
chk('y ofrece un boton para reintentar', hijos.length === 1 && hijos[0].textContent === 'reintentar',
    'hijos=' + hijos.length);
ms();
chk('al confirmar servidor se esconde', el.hidden === true);
chk('y guarda la fecha de la ultima sincronizacion', !!localStorage.getItem(lsKey('ultimaSync')));
mcl(true);
chk('esa fecha se le muestra al usuario', /última vez al día/.test(el.textContent), el.textContent);

// ═══ 8. la foto del dia (maybeSnapshot) no escribe sin señal (4-nov-2026, Fundview) ═══
console.log('\n8. maybeSnapshot: en Fundview, con la copia local o sin red, no encola la foto del dia');
{
  let escrituras = 0, enLinea = true, desdeCacheFlag = false;
  const estado = { snapshots: [{ f: '2026-11-03', total: 100, gbm: 0 }] };
  const cfg = {};
  const auth = { currentUser: { uid: 'u' } };
  const setDocC = () => { escrituras++; return Promise.resolve(); };
  const navigator = { get onLine() { return enLinea; } };
  const correr = (multi, cache, linea, total) => {
    escrituras = 0; cfg.multi = multi; enLinea = linea; estado.snapshots = [{ f: '2026-11-03', total: 100, gbm: 0 }];
    const f2 = new Function('CFG', 'datosCargados', 'cargaDesdeCache', 'auth', 'state', 'hoyLocal', 'setDoc', 'doc', 'db', 'NS', 'navigator',
      'let snapshotEnVuelo = false;\n' + extraeFn('maybeSnapshot') + '\nreturn maybeSnapshot;')(cfg, true, cache, auth, estado, () => '2026-11-04', setDocC, () => ({}), {}, 'ns', navigator);
    f2(total, 0);
    return escrituras;
  };
  chk('Fundview en línea y de la nube: escribe la foto de hoy (el caso normal)', correr(true, false, true, 5000) === 1);
  chk('Fundview con la carga venida de la copia local: no escribe', correr(true, true, true, 5000) === 0);
  chk('Fundview sin red (navigator.onLine falso): no escribe, aunque datosCargados siga verdadero', correr(true, false, false, 5000) === 0);
  chk('Fundview sin red: tampoco toca la memoria (la foto de hoy no se inventa)', (correr(true, false, false, 5000), estado.snapshots.length === 1));
  chk('la familia: sin cambio (escribe como siempre, ver IDEAS.md)', correr(false, true, true, 5000) === 1 && correr(false, false, false, 5000) === 1);
}
chk('las posiciones: en Fundview no se escriben desde la copia local ni sin red (la línea tiene su guardia)',
  /if\(!\(CFG\.multi&&\(desdeCache\|\|\(typeof navigator!=='undefined'&&navigator\.onLine===false\)\)\)\) setDoc\(doc\(db,NS,'posiciones'\), posMap\)/.test(HTML) || !HTML.includes("'posiciones'"));

// ═══ 9. 'Educacion' y 'Educación' son la misma categoria en Fundview (4-nov-2026), sin reescribir nada ═══
console.log('\n9. Categoria Educacion/Educación: se junta al leer, solo en Fundview, y no se escribe nada');
if (HAY_EDU) {
  for (const multi of [true, false]) {
    CFG_PRUEBA.multi = multi;
    reset(); cacheCompleta();
    CACHE[NS + '/categorias'] = { catsGasto: ['Comida', 'Educacion', 'Casa', 'Educación'], catsIngreso: ['Trabajo'] };
    COLS[PFX + 'gastos'] = [{ id: 'g1', monto: 100, cat: 'Educacion', fecha: '2026-09-02T00:00:00Z' }, { id: 'g2', monto: 50, cat: 'Educación', fecha: '2026-09-03T00:00:00Z' }, { id: 'g3', monto: 5, cat: 'Comida', fecha: '2026-09-04T00:00:00Z' }];
    await pintarDesdeCache();
    const cats = state.catsGasto.join(','), conTilde = state.gastos.filter(g => g.cat === 'Educación').length, sinTilde = state.gastos.filter(g => g.cat === 'Educacion').length;
    if (multi) {
      chk('Fundview: la lista de categorías junta las dos en una (sin repetir)', cats === 'Comida,Educación,Casa', cats);
      chk('Fundview: los gastos viejos se ven como "Educación" (resumen y límites no la parten en dos)', conTilde === 2 && sinTilde === 0, conTilde + '/' + sinTilde);
    } else chk('la familia: nada cambia (cada texto es su categoría)', cats === 'Comida,Educacion,Casa,Educación' && sinTilde === 1, cats + ' ' + sinTilde);
    chk('  y no escribió nada (se junta en memoria, el documento no se reescribe)', ESCRITURAS === 0);
  }
  delete CFG_PRUEBA.multi;
  // los límites por categoría
  const lim = multi => new Function('CFG', 'catFV', extraeFn('saneaLimitesCat') + '; return saneaLimitesCat;')({ multi }, c => (multi && c === 'Educacion') ? 'Educación' : c);
  const entrada = [{ cat: 'Educacion', monto: 900 }, { cat: 'Comida', monto: 3000 }, { cat: 'Educación', monto: 500 }];
  chk('límites en Fundview: Educacion y Educación se juntan y se queda el menor', JSON.stringify(lim(true)(entrada)) === JSON.stringify([{ cat: 'Educación', monto: 500 }, { cat: 'Comida', monto: 3000 }]), JSON.stringify(lim(true)(entrada)));
  chk('límites en Fundview: un límite viejo solo se ve como Educación', JSON.stringify(lim(true)([{ cat: 'Educacion', monto: 900 }])) === JSON.stringify([{ cat: 'Educación', monto: 900 }]));
  chk('límites en la familia: igual que siempre', JSON.stringify(lim(false)(entrada)) === JSON.stringify([{ cat: 'Educacion', monto: 900 }, { cat: 'Comida', monto: 3000 }, { cat: 'Educación', monto: 500 }]));
  // las consultas por nombre al servidor buscan los dos textos (juntar o quitar la categoría no deja gastos viejos atrás)
  const llamadas = [];
  const W = new Function('CFG', 'where', eduSrc + '; return whereCat;');
  const wf = multi => W({ multi }, (...a) => { llamadas.push(a); return a; });
  llamadas.length = 0; wf(true)('gasto', 'Educación'); chk('whereCat Fundview: Educación busca los dos textos', JSON.stringify(llamadas[0]) === JSON.stringify(['cat', 'in', ['Educación', 'Educacion']]), JSON.stringify(llamadas[0]));
  llamadas.length = 0; wf(true)('gasto', 'Comida'); chk('whereCat Fundview: otra categoría, igualdad de siempre', JSON.stringify(llamadas[0]) === JSON.stringify(['cat', '==', 'Comida']));
  llamadas.length = 0; wf(true)('ingreso', 'Educación'); chk('whereCat Fundview: una categoría de ingreso con ese nombre no se toca', JSON.stringify(llamadas[0]) === JSON.stringify(['cat', '==', 'Educación']));
  llamadas.length = 0; wf(false)('gasto', 'Educación'); chk('whereCat familia: igualdad de siempre', JSON.stringify(llamadas[0]) === JSON.stringify(['cat', '==', 'Educación']));
} else console.log('  (esta copia no tiene el cambio de Educación: se salta)');

// ═══ 10. el nombre del fondo de fabrica (4-nov-2026) ═══
console.log('\n10. nombreFondoU: lo que la persona escribió se respeta');
if (HTML.includes('const nombreFondoU')) {
  const nf = multi => new Function('CFG', extrae('const FONDO_U_FV', 'const nombreFondoF') + '; return nombreFondoU;')({ multi });
  const fv = nf(true), fam = nf(false);
  chk('Fundview: sin entrada o vacía -> "Mi fondo"', fv(undefined) === 'Mi fondo' && fv('') === 'Mi fondo' && fv(null) === 'Mi fondo');
  chk('Fundview: el "universidad" en minúscula que dejaba la app por omisión -> "Mi fondo"', fv('universidad') === 'Mi fondo');
  chk('Fundview: "Universidad" escrito a propósito se respeta', fv('Universidad') === 'Universidad');
  chk('Fundview: cualquier otro nombre se respeta', fv('Mi universidad') === 'Mi universidad' && fv('Viaje') === 'Viaje' && fv('UNIVERSIDAD') === 'UNIVERSIDAD');
  chk('la familia: igual que siempre', fam(undefined) === 'universidad' && fam('Universidad') === 'Universidad' && fam('Beca') === 'Beca');
}

console.log('\n' + '='.repeat(58));
console.log(fallos === 0 ? `TODO PASA — ${pruebas}/${pruebas}` : `${fallos} FALLAS de ${pruebas}`);
process.exit(fallos === 0 ? 0 : 1);
