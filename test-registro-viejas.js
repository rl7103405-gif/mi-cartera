// Referencia para test-registro.mjs: aplicarSaldosRemotos, aplicarRes y saldosPayload TAL COMO ESTABAN
// antes del registro de cuentas (index.html, commit 6f69692). No se carga en la app: es el contrato.
function aplicarSaldosRemotosViejo(d) {
  if(!d) return;
  const num=(k,cur)=>Number.isFinite(d[k])?d[k]:cur;
  state.nuCajita1Base=num('nuCajita1Base',state.nuCajita1Base);
  state.nuCajita1Tasa=num('nuCajita1Tasa',state.nuCajita1Tasa);
  if(typeof d.nuCajita1Fecha==='string') state.nuCajita1Fecha=d.nuCajita1Fecha;
  state.nuCajita2Base=num('nuCajita2Base',state.nuCajita2Base);
  state.nuCajita2Tasa=num('nuCajita2Tasa',state.nuCajita2Tasa);
  if(typeof d.nuCajita2Fecha==='string') state.nuCajita2Fecha=d.nuCajita2Fecha;
  state.revSavingsBase=num('revSavingsBase',state.revSavingsBase);
  state.revSavingsTasa=num('revSavingsTasa',state.revSavingsTasa);
  if(typeof d.revSavingsFecha==='string') state.revSavingsFecha=d.revSavingsFecha;
  state.mifelBase=num('mifelBase',state.mifelBase);
  state.mifelTasa=num('mifelTasa',state.mifelTasa);
  if(typeof d.mifelFecha==='string') state.mifelFecha=d.mifelFecha;
  if(typeof d.mifelVigencia==='string') state.mifelVigencia=d.mifelVigencia;
  ['nuCajita1Tope','nuCajita1TasaExc','nuCajita1Ret','revSavingsTope','revSavingsTasaExc','revSavingsRet','mifelTope','mifelTasaExc','mifelRet']
    .forEach(k=>{ state[k]=num(k,state[k]); });
  state.nuSaldo=num('nuSaldo',state.nuSaldo);
  state.efectivo=num('efectivo',state.efectivo);
  state.reporto=num('reporto',state.reporto);
  state.efectivoGBM=num('efectivoGBM',state.efectivoGBM);
  state.revMXN=num('revMXN',state.revMXN);
}
function aplicarResViejo(res) {
  if (res.campos) {
    const cp = res.campos;
    if (cp.efectivo   !== undefined) state.efectivo    = cp.efectivo;
    if (cp.nuSaldo    !== undefined) state.nuSaldo     = cp.nuSaldo;
    if (cp.revMXN     !== undefined) state.revMXN      = cp.revMXN;
    if (cp.efectivoGBM!== undefined) state.efectivoGBM = cp.efectivoGBM;
    if (cp.nuCajita1Base !== undefined) { state.nuCajita1Base = cp.nuCajita1Base; state.nuCajita1Fecha = cp.nuCajita1Fecha; }
    if (cp.nuCajita2Base !== undefined) { state.nuCajita2Base = cp.nuCajita2Base; state.nuCajita2Fecha = cp.nuCajita2Fecha; }
    if (cp.revSavingsBase!== undefined) { state.revSavingsBase= cp.revSavingsBase;state.revSavingsFecha= cp.revSavingsFecha; }
    if (cp.mifelBase     !== undefined) { state.mifelBase     = cp.mifelBase;     state.mifelFecha     = cp.mifelFecha; }
    // las TASAS tambien: al cambiarlas en "actualizar saldos" se escriben en Firestore, y
    // sin esto calcNu1()/calcRevSavings() pintarian el saldo con la tasa VIEJA hasta que
    // llegara el snapshot (que puede tardar con mala senal o la pestana en segundo plano)
    if (cp.nuCajita1Tasa  !== undefined) state.nuCajita1Tasa  = cp.nuCajita1Tasa;
    if (cp.nuCajita2Tasa  !== undefined) state.nuCajita2Tasa  = cp.nuCajita2Tasa;
    if (cp.revSavingsTasa !== undefined) state.revSavingsTasa = cp.revSavingsTasa;
    if (cp.mifelTasa      !== undefined) state.mifelTasa      = cp.mifelTasa;
    if (cp.mifelVigencia  !== undefined) state.mifelVigencia  = cp.mifelVigencia;
    ['nuCajita1Tope','nuCajita1TasaExc','nuCajita1Ret','revSavingsTope','revSavingsTasaExc','revSavingsRet','mifelTope','mifelTasaExc','mifelRet']
      .forEach(k=>{ if (cp[k] !== undefined) state[k]=cp[k]; });
    if (cp.reporto        !== undefined) state.reporto        = cp.reporto;
  }
  if (res.tarjeta) { state.tarjetaDeuda = res.tarjeta.deuda; state.tarjetaMovimientos = res.tarjeta.movimientos; }
  if (res.fondo)   state.fondo = saneaFondo(res.fondo);
  if (res.tdcRev)  { state.revTdcDeuda = res.tdcRev.deuda; state.revTdcDeposito = res.tdcRev.deposito; state.revTdcMovs = res.tdcRev.movimientos; }
  if (Array.isArray(res.tramos) && res.tramos.length) state.rendimientos = [...(state.rendimientos||[]), ...res.tramos];
}
function saldosPayloadViejo() {
  // OJO: las cotizaciones (ivv*, nvda*, usdMxn*) NO van aqui: viven en cartera/mercado
  return {
    nuCajita1Base:state.nuCajita1Base, nuCajita1Fecha:state.nuCajita1Fecha, nuCajita1Tasa:state.nuCajita1Tasa,
    nuCajita2Base:state.nuCajita2Base, nuCajita2Fecha:state.nuCajita2Fecha, nuCajita2Tasa:state.nuCajita2Tasa,
    nuSaldo:state.nuSaldo, efectivo:state.efectivo,
    reporto:state.reporto, efectivoGBM:state.efectivoGBM,
    revMXN:state.revMXN, revSavingsBase:state.revSavingsBase, revSavingsFecha:state.revSavingsFecha,
    revSavingsTasa:state.revSavingsTasa,
    nuCajita1Tope:state.nuCajita1Tope, nuCajita1TasaExc:state.nuCajita1TasaExc, nuCajita1Ret:state.nuCajita1Ret,
    revSavingsTope:state.revSavingsTope, revSavingsTasaExc:state.revSavingsTasaExc, revSavingsRet:state.revSavingsRet,
    mifelBase:state.mifelBase, mifelFecha:state.mifelFecha, mifelTasa:state.mifelTasa, mifelTope:state.mifelTope,
    mifelTasaExc:state.mifelTasaExc, mifelRet:state.mifelRet, mifelVigencia:state.mifelVigencia
  };
}