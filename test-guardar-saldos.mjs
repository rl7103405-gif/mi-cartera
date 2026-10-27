// Prueba de "actualizar saldos" (27-oct-2026, paso 5b del registro): guardarManuales ya no tiene ids
// fijos, recorre el registro. Corre la version de ANTES (test-guardar-viejo.js, el contrato) y la de
// ahora con la MISMA tabla de capturas, sobre todo las que se rechazan, y exige el mismo resultado:
// mismo aviso, mismo plan para txDinero y mismos campos limpiados. La foto de Inicio cubre el guardado
// valido contra el emulador; esto cubre las ramas de rechazo. Reloj fijo: hoy = 2026-10-27.
import fs from 'node:fs';
const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const VIEJO = fs.readFileSync(new URL('./test-guardar-viejo.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const corte = (desde, hasta) => { const i = HTML.indexOf(desde), f = HTML.indexOf(hasta, i);
  if (i < 0 || f < 0) throw new Error('no encontrado: ' + desde); return HTML.slice(i, f); };
const registro = corte('// ── REGISTRO DE CUENTAS', '// ── fin registro de cuentas');
const ayudas = corte('// ids de los campos de una cuenta compuesta', 'function pintarTarjetasInicio');
const fechas = corte('function parseFechaLocal(', '// movimientos legados guardaron fecha');
const nuevo = corte('window.guardarManuales = async function() {', '\n};\n') + '\n};';

// una corrida: campos capturados + estado de partida -> {toast, plan, limpiados}
function correr(cual, campos, est) {
  const f = new Function('campos', 'est', `
    const out={toast:null, plan:null, limpiados:[]};
    const els={};
    const document={getElementById:id=>{ if(!els[id]) els[id]={value:campos[id]??'', disabled:false}; return els[id]; }};
    const state=Object.assign({revTdcDeuda:0, mifelVigencia:'2026-10-31'}, est);
    let dineroOcupado=false;
    const showToast=t=>{ out.toast=t; };
    const hoyLocal=()=> '2026-10-27';
    const txDinero=async plan=>{ out.plan=JSON.parse(JSON.stringify(plan)); return {}; };
    const liberarDinero=()=>{ dineroOcupado=false; };
    const aplicarRes=()=>{}, refrescar=()=>{}, render=()=>{}, msgFalloDinero=()=>'fallo';
    const window={};
    ${registro}
    const CAMPO_COMP=Object.fromEntries(ctasEn('comp').map(id=>[id,REG_CUENTAS.find(c=>c.id===id).comp]));
    ${ayudas}
    ${fechas}
    ${nuevo}
    ${VIEJO}
    const fn=${cual==='viejo' ? 'guardarManualesViejo' : 'window.guardarManuales'};
    return fn().then(()=>{ out.limpiados=Object.keys(els).filter(id=>(campos[id]??'')!==''&&els[id].value==='').sort(); return out; });
  `);
  return f(campos, est);
}

// la version vieja abreviaba "Rev Savings" en dos avisos; la nueva dice el nombre completo (cosmetico)
const normal = t => t && t.replace(/^(tope|tasa|retención) inválid([oa]) en Rev Savings/, '$1 inválid$2 en Revolut Savings');
// el orden de las llaves de absolutos no importa (es un update de Firestore): se comparan ordenadas
const plano = p => p && {...p, absolutos: Object.fromEntries(Object.entries(p.absolutos).sort())};

const CASOS = [
  ['nada capturado', {}],
  ['saldos simples validos', {'input-efectivo':'1500', 'input-nu-saldo':'-20', 'input-rev-mxn':'32000.5'}],
  ['monto basura en NU saldo', {'input-nu-saldo':'abc'}],
  ['cajita: base sola (fecha = hoy)', {'input-cajita1-base':'18500'}],
  ['cajita: base y fecha', {'input-cajita1-base':'18500', 'input-cajita1-fecha':'2026-10-01'}],
  ['cajita: fecha sin base', {'input-cajita1-fecha':'2026-10-01'}],
  ['cajita: fecha futura', {'input-cajita1-base':'1', 'input-cajita1-fecha':'2026-10-28'}],
  ['cajita: fecha imposible', {'input-cajita1-base':'1', 'input-cajita1-fecha':'2026-02-30'}],
  ['cajita: fecha mal escrita', {'input-cajita1-base':'1', 'input-cajita1-fecha':'27/10/2026'}],
  ['cajita: tasa sin base (cristaliza)', {'input-cajita1-tasa':'12.5'}],
  ['cajita: tasa negativa permitida', {'input-cajita1-tasa':'-5'}],
  ['cajita: tasa -100', {'input-cajita1-tasa':'-100'}],
  ['cajita: tope y excedente', {'input-cajita1-tope':'0', 'input-cajita1-tasa-exc':'6'}],
  ['cajita: tope negativo', {'input-cajita1-tope':'-1'}],
  ['savings: retencion valida (cristaliza)', {'input-rev-savings-ret':'0.9'}],
  ['savings: retencion 10.5', {'input-rev-savings-ret':'10.5'}],
  ['savings: retencion negativa', {'input-rev-savings-ret':'-1'}],
  ['savings: tope negativo', {'input-rev-savings-tope':'-3'}],
  ['savings: excedente basura', {'input-rev-savings-tasa-exc':'x'}],
  ['savings: todo junto con base', {'input-rev-savings-base':'900000', 'input-rev-savings-tasa':'15',
    'input-rev-savings-tope':'30000', 'input-rev-savings-tasa-exc':'7', 'input-rev-savings-ret':'0.9'}],
  ['mifel: tasa negativa', {'input-mifel-tasa':'-1'}],
  ['mifel: excedente negativo', {'input-mifel-tasa-exc':'-0.5'}],
  ['mifel: tasa con vigencia vigente', {'input-mifel-tasa':'9.5'}],
  ['mifel: tasa con vigencia vencida (la quita)', {'input-mifel-tasa':'9.5'}, {mifelVigencia:'2026-10-01'}],
  ['mifel: tasa y vigencia nueva', {'input-mifel-tasa':'9.5', 'input-mifel-vigencia':'2026-11-30'}, {mifelVigencia:'2026-10-01'}],
  ['mifel: vigencia 0 (sin fecha)', {'input-mifel-vigencia':'0'}],
  ['mifel: vigencia basura', {'input-mifel-vigencia':'mañana'}],
  ['mifel: vigencia imposible', {'input-mifel-vigencia':'2026-13-01'}],
  ['mifel: base y retencion', {'input-mifel-base':'6500', 'input-mifel-ret':'0'}],
  ['TDC: deposito 249', {'input-rev-tdc-dep':'249'}],
  ['TDC: deposito 75001', {'input-rev-tdc-dep':'75001'}],
  ['TDC: deposito valido', {'input-rev-tdc-dep':'3000'}],
  ['TDC: deposito bajo la deuda', {'input-rev-tdc-dep':'500'}, {revTdcDeuda:800}],
  ['TDC: deposito igual a la deuda', {'input-rev-tdc-dep':'800'}, {revTdcDeuda:800}],
  ['todo valido a la vez', {'input-efectivo':'1', 'input-cajita1-base':'2', 'input-rev-savings-tasa':'14',
    'input-mifel-tope':'400000', 'input-rev-tdc-dep':'2500'}],
  ['valido + un error al final', {'input-efectivo':'1', 'input-mifel-vigencia':'zz'}]
];

let ok = 0, mal = 0;
for (const [nombre, campos, est] of CASOS) {
  const v = await correr('viejo', campos, est || {}), n = await correr('nuevo', campos, est || {});
  const a = JSON.stringify({toast: normal(v.toast), plan: plano(v.plan), limpiados: v.limpiados});
  const b = JSON.stringify({toast: n.toast, plan: plano(n.plan), limpiados: n.limpiados});
  if (a === b) { ok++; console.log('  ok  ' + nombre + '  →  ' + (n.toast || '')); }
  else { mal++; console.log('  MAL ' + nombre + '\n      antes: ' + a + '\n      ahora: ' + b); }
}
console.log('\n==========================================================');
console.log(mal ? `FALLAN ${mal} de ${ok + mal}` : `TODO PASA — ${ok}/${ok + mal}`);
process.exit(mal ? 1 : 0);
