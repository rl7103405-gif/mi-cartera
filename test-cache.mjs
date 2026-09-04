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
  ivvPrecio:0, usdMxn:0, accionesMkt:{},
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
const ARGS = ['db','doc','collection','query','orderBy','getDocFromCache','getDocsFromCache',
  'state','derivarPosiciones','document','localStorage','console',
  'NS','C_GASTOS','C_INGRESOS','C_TRANSF','C_OPS',
  'window','loadFromFirebase','showToast','renderCatSelect','refrescar',
  'renderPersonaSelect','render','renderMovimientos','renderTransferencias','datosCargados'];
const VALS = [db, doc, collection, query, orderBy, getDocFromCache, getDocsFromCache,
  state, derivarPosiciones, document, localStorage, console,
  NS, PFX+'gastos', PFX+'ingresos', PFX+'transferencias', PFX+'stocksOps',
  window, loadFromFirebase, showToast, renderCatSelect, refrescar,
  renderPersonaSelect, render, renderMovimientos, renderTransferencias, datosCargados];
const { pintarDesdeCache, marcarCopiaLocal, marcarSincronizado } = new Function(
  ...ARGS, fuente + '\nreturn { pintarDesdeCache, marcarCopiaLocal, marcarSincronizado };'
)(...VALS);

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
    [`${NS}/saldos`]:     { nuCajita1Base:25000, nuSaldo:51.03, efectivo:2200, revMXN:9.26, nuCajita1Fecha:'2026-09-01' },
    [`${NS}/tarjeta`]:    { deuda:1500, movimientos:[{id:'a',monto:100}] },
    [`${NS}/personas`]:   { data:{ Papa:{nombre:'Papa', saldo:40973.31, movimientos:[{monto:1}]} } },
    [`${NS}/categorias`]: { catsGasto:['Comida','Casa'], catsIngreso:['Trabajo'] },
    [`${NS}/historial`]:  { snapshots:[{f:'2026-09-01',total:100,gbm:0}] },
  };
  if (HAY_TDCREV) CACHE[`${NS}/tarjetaRev`] = { deuda:200, deposito:438.67, movimientos:[] };
  if (HAY_MERCADO) CACHE[`${NS}/mercado`] = { ivvPrecio:154.2, usdMxn:18.5, accionesMkt:{NVDA:{precio:120}} };
  COLS = {
    [PFX+'gastos']:         [{id:'g1',monto:150,cat:'Comida',fecha:'2026-09-02T00:00:00Z'},
                             {id:'g2',monto:80, cat:'Casa',  fecha:'2026-09-03T00:00:00Z'}],
    [PFX+'ingresos']:       [{id:'i1',monto:5000,cat:'Trabajo',fecha:'2026-09-01T00:00:00Z'}],
    [PFX+'transferencias']: [{id:'t1',monto:400,origen:'efectivo',destino:'nu',fecha:'2026-09-01T00:00:00Z'}],
  };
  if (HAY_STOCKS) COLS[PFX+'stocksOps'] = [{id:'o1',simbolo:'NVDA',acciones:0.19,tipo:'compra',fecha:'2026-07-23'}];
}

console.log('\n=== pintarDesdeCache: hidratacion instantanea desde la copia local ===');

// ═══ 1. copia local COMPLETA ═══
console.log('\n1. Con la copia local completa, pinta y NO escribe nada');
reset(); cacheCompleta();
let ok = await pintarDesdeCache();
chk('devuelve true', ok === true);
chk('aplica los saldos', state.nuCajita1Base === 25000 && state.efectivo === 2200, 'base='+state.nuCajita1Base);
chk('aplica la tarjeta NU', state.tarjetaDeuda === 1500 && state.tarjetaMovimientos.length === 1);
if (HAY_TDCREV) chk('aplica la TDC Revolut', state.revTdcDeuda === 200 && state.revTdcDeposito === 438.67);
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
chk('NO escribio NADA en Firestore', ESCRITURAS === 0, 'escrituras=' + ESCRITURAS);

// ═══ 2. TODO O NADA ═══
console.log('\n2. Si falta CUALQUIER pieza, no pinta nada (todo o nada)');
for (const falta of ['saldos','tarjeta','personas','categorias','historial',...DOCS_OPC,
                     ...(HAY_MERCADO?['mercado']:[])]) {
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
chk('pinta el resto igual', ok === true && state.efectivo === 2200);
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
  ...ARGS, fuente + '\nreturn { marcarCopiaLocal, marcarSincronizado };'
)(...VALS2);
mcl(true);
chk('al sincronizar se ve y lo dice', el.hidden === false && /copia local/.test(el.textContent), el.textContent);
mcl(true, true);
chk('si falla la red avisa que NO esta confirmada', /SIN confirmar/.test(el.textContent), el.textContent);
chk('y ofrece un boton para reintentar', hijos.length === 1 && hijos[0].textContent === 'reintentar',
    'hijos=' + hijos.length);
ms();
chk('al confirmar servidor se esconde', el.hidden === true);
chk('y guarda la fecha de la ultima sincronizacion', !!localStorage.getItem('ultimaSync'));
mcl(true);
chk('esa fecha se le muestra al usuario', /ultima vez al dia/.test(el.textContent), el.textContent);

console.log('\n' + '='.repeat(58));
console.log(fallos === 0 ? `TODO PASA — ${pruebas}/${pruebas}` : `${fallos} FALLAS de ${pruebas}`);
process.exit(fallos === 0 ? 0 : 1);
