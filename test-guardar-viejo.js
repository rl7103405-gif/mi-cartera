// Referencia para test-guardar-saldos.mjs: guardarManuales TAL COMO ESTABA antes del paso 5b del registro
// (index.html, commit 2e6e9a6). No se carga en la app: es el contrato de las validaciones y del plan.
const guardarManualesViejo = async function() {
  const ids={c1b:'input-cajita1-base',c1f:'input-cajita1-fecha',c1t:'input-cajita1-tasa',
    c1tope:'input-cajita1-tope',c1exc:'input-cajita1-tasa-exc',
    ns:'input-nu-saldo',ef:'input-efectivo',
    rvm:'input-rev-mxn',rsb:'input-rev-savings-base',rsf:'input-rev-savings-fecha',rst:'input-rev-savings-tasa',
    rstope:'input-rev-savings-tope',rsexc:'input-rev-savings-tasa-exc',rsret:'input-rev-savings-ret',
    mfb:'input-mifel-base',mff:'input-mifel-fecha',mft:'input-mifel-tasa',mftope:'input-mifel-tope',
    mfexc:'input-mifel-tasa-exc',mfret:'input-mifel-ret',mfvig:'input-mifel-vigencia',
    rtd:'input-rev-tdc-dep'};
  const labels={c1b:'cajita 1 - saldo base',c1f:'cajita 1 - fecha base',c1t:'cajita 1 - tasa',
    c1tope:'cajita 1 - tope',c1exc:'cajita 1 - tasa excedente',
    ns:'NU saldo',ef:'efectivo',
    rvm:'Revolut MXN',rsb:'Revolut Savings - saldo base',rsf:'Revolut Savings - fecha base',rst:'Revolut Savings - tasa',
    rstope:'Rev Savings - tope',rsexc:'Rev Savings - tasa excedente',rsret:'Rev Savings - retención ISR',
    mfb:'Mifel - saldo base',mff:'Mifel - fecha base',mft:'Mifel - tasa',mftope:'Mifel - tope',
    mfexc:'Mifel - tasa excedente',mfret:'Mifel - retención ISR',mfvig:'Mifel - tasa confirmada hasta',
    rtd:'depósito TDC Revolut'};
  const raw={}; Object.keys(ids).forEach(k=>raw[k]=document.getElementById(ids[k]).value.trim());
  const vals={};
  for(const k of ['c1b','ns','ef','rvm','rsb','mfb']) {
    if(raw[k]===''){ vals[k]=null; continue; }
    const n=parseFloat(raw[k]);
    if(!Number.isFinite(n)){ showToast('monto inválido en '+labels[k]); return; }
    vals[k]=n;
  }
  for(const k of ['c1t','rst','c1exc','rsexc','mft','mfexc']) {
    if(raw[k]===''){ vals[k]=null; continue; }
    const n=parseFloat(raw[k]);
    // Mifel no admite tasa negativa: el motor (retCap) la deja en 0 pero la etiqueta mostraria el negativo
    if(!Number.isFinite(n)||n<=-100||((k==='mft'||k==='mfexc')&&n<0)){ showToast('tasa inválida en '+labels[k]); return; }
    vals[k]=n;
  }
  // tope: 0 explicito = quitar el tope (se guarda 0, modeloComp lo lee como "sin tope")
  for(const k of ['c1tope','rstope','mftope']) {
    if(raw[k]===''){ vals[k]=null; continue; }
    const n=parseFloat(raw[k]);
    if(!Number.isFinite(n)||n<0){ showToast('tope inválido en '+labels[k]); return; }
    vals[k]=n;
  }
  for(const k of ['rsret','mfret']) {
    if(raw[k]===''){ vals[k]=null; continue; }
    const n=parseFloat(raw[k]);
    if(!Number.isFinite(n)||n<0||n>10){ showToast('retención inválida en '+labels[k]+' (0 a 10%)'); return; }
    vals[k]=n;
  }
  // vigencia de la tasa de Mifel: una fecha real (puede ser futura), 0 = quitarla, vacio = no cambiar
  if(raw.mfvig===''){ vals.mfvig=null; }
  else if(raw.mfvig==='0'){ vals.mfvig=''; }
  else {
    if(!fechaCalendarioValida(raw.mfvig)){ showToast('fecha inválida en '+labels.mfvig); return; }
    vals.mfvig=raw.mfvig;
  }
  // deposito TDC Revolut: limite = deposito (regla del producto); rango oficial $250-$75,000
  // y nunca por debajo de la deuda usada (Revolut no permite bajar el limite bajo el saldo)
  if(raw.rtd===''){ vals.rtd=null; }
  else {
    const n=parseFloat(raw.rtd);
    if(!Number.isFinite(n)||n<250||n>75000){ showToast('depósito inválido: debe estar entre $250 y $75,000'); return; }
    if(Math.round(n*100)<Math.round(Math.max(0,state.revTdcDeuda)*100)){ showToast('el depósito no puede ser menor que la deuda usada de la TDC Revolut'); return; }
    vals.rtd=n;
  }
  for(const k of ['c1f','rsf','mff']) {
    if(raw[k]===''){ vals[k]=null; continue; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw[k])){ showToast('fecha inválida en '+labels[k]); return; }
    const d=parseFechaLocal(raw[k]);
    if(isNaN(d.getTime())){ showToast('fecha inválida en '+labels[k]); return; }
    const [ay,am,ad]=raw[k].split('-').map(Number);
    if(d.getFullYear()!==ay||d.getMonth()+1!==am||d.getDate()!==ad){ showToast('fecha inválida en '+labels[k]); return; }
    if(raw[k]>hoyLocal()){ showToast('la fecha no puede ser futura en '+labels[k]); return; }
    vals[k]=raw[k];
  }
  // fecha sin base reancla la base vieja e inventa/borra rendimiento: se rechaza
  if(vals.c1f!==null&&vals.c1b===null){ showToast('captura también el saldo base de cajita 1'); return; }
  if(vals.rsf!==null&&vals.rsb===null){ showToast('captura también el saldo base de Revolut Savings'); return; }
  if(vals.mff!==null&&vals.mfb===null){ showToast('captura también el saldo base de Mifel'); return; }
  // tasa nueva SIN saldo base: hay que consolidar el saldo actual (con la tasa vieja)
  // como nueva base antes de aplicar la tasa nueva; si no, la tasa nueva se aplicaria
  // retroactivamente a dias que ya generaron interes con la anterior. Se hace DENTRO de
  // la transaccion (plan.cristalizar) para que parta del valor canonico, no de esta pantalla.
  // cualquier cambio del MODELO (tasa, tope, tasa excedente, retencion) sin saldo base
  // nuevo consolida primero el interes generado con el modelo viejo
  const cristalizar=[];
  if((vals.c1t!==null||vals.c1tope!==null||vals.c1exc!==null)&&vals.c1b===null) cristalizar.push('cajita1');
  if((vals.rst!==null||vals.rstope!==null||vals.rsexc!==null||vals.rsret!==null)&&vals.rsb===null) cristalizar.push('revSavings');
  if((vals.mft!==null||vals.mftope!==null||vals.mfexc!==null||vals.mfret!==null)&&vals.mfb===null) cristalizar.push('mifel');
  // base sin fecha: la base capturada es el saldo observado HOY; sin esto la fecha
  // queda vacia (la cajita nunca crece) o vieja (genera de golpe interes ya contado)
  if(vals.c1b!==null&&vals.c1f===null) vals.c1f=hoyLocal();
  if(vals.rsb!==null&&vals.rsf===null) vals.rsf=hoyLocal();
  if(vals.mfb!==null&&vals.mff===null) vals.mff=hoyLocal();
  // capturar una tasa de Mifel despues de que vencio la confirmada ES confirmarla: se quita el aviso
  if(vals.mft!==null&&vals.mfvig===null&&typeof state.mifelVigencia==='string'&&state.mifelVigencia&&state.mifelVigencia<hoyLocal()) vals.mfvig='';
  const btn=document.getElementById('manuales-btn');
  if(dineroOcupado){showToast('espera, hay otra operación en curso');return;}
  // SOLO los campos que el usuario realmente tecleo. Antes se escribia el documento
  // COMPLETO desde memoria (saldosPayload), asi que actualizar la cajita borraba el
  // efectivo que otro dispositivo hubiera registrado. Ese era el bug del 27-ago.
  const absolutos={};
  if(vals.c1b!==null) absolutos.nuCajita1Base=vals.c1b;
  if(vals.c1f!==null) absolutos.nuCajita1Fecha=vals.c1f;
  if(vals.c1t!==null) absolutos.nuCajita1Tasa=vals.c1t;
  if(vals.ns!==null)  absolutos.nuSaldo=vals.ns;
  if(vals.ef!==null)  absolutos.efectivo=vals.ef;
  if(vals.rvm!==null) absolutos.revMXN=vals.rvm;
  if(vals.rsb!==null) absolutos.revSavingsBase=vals.rsb;
  if(vals.rsf!==null) absolutos.revSavingsFecha=vals.rsf;
  if(vals.rst!==null) absolutos.revSavingsTasa=vals.rst;
  if(vals.c1tope!==null) absolutos.nuCajita1Tope=vals.c1tope;
  if(vals.c1exc!==null)  absolutos.nuCajita1TasaExc=vals.c1exc;
  if(vals.rstope!==null) absolutos.revSavingsTope=vals.rstope;
  if(vals.rsexc!==null)  absolutos.revSavingsTasaExc=vals.rsexc;
  if(vals.rsret!==null)  absolutos.revSavingsRet=vals.rsret;
  if(vals.mfb!==null)    absolutos.mifelBase=vals.mfb;
  if(vals.mff!==null)    absolutos.mifelFecha=vals.mff;
  if(vals.mft!==null)    absolutos.mifelTasa=vals.mft;
  if(vals.mftope!==null) absolutos.mifelTope=vals.mftope;
  if(vals.mfexc!==null)  absolutos.mifelTasaExc=vals.mfexc;
  if(vals.mfret!==null)  absolutos.mifelRet=vals.mfret;
  if(vals.mfvig!==null)  absolutos.mifelVigencia=vals.mfvig;
  if(!Object.keys(absolutos).length&&!cristalizar.length&&vals.rtd===null){ showToast('no capturaste ningún dato'); return; }
  const plan={absolutos,cristalizar};
  if(vals.rtd!==null) plan.tdcRevDeposito=vals.rtd; // vive en cartera/tarjetaRev
  let res=null,err=null;
  btn.disabled=true; dineroOcupado=true;
  try{ res=await txDinero(plan); }
  catch(e){ err=e; }
  finally{ btn.disabled=false; liberarDinero(); }
  if(err){ console.error('guardarManuales',err); showToast(msgFalloDinero()); return; }
  if(res.error){ showToast(res.error); return; }
  // -- post-commit: se refleja lo que quedo en el SERVIDOR --
  aplicarRes(res);
  Object.values(ids).forEach(id=>document.getElementById(id).value='');
  refrescar(render);
  showToast('guardado y sincronizado');
};
