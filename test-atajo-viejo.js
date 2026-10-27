// Referencia para test-atajo.mjs: procesarPendientesAtajo TAL COMO ESTABA antes del registro de cuentas
// (index.html, commit 600b22b). No se carga en la app: es el contrato.
async function procesarPendientesAtajoViejo() {
  // los MAS ANTIGUOS primero: si algun dia hay >100, ninguno queda atorado bajo el corte
  const porFecha=(a,b)=>String(a.fecha).localeCompare(String(b.fecha));
  const candG=state.gastos.filter(g=>g.pendiente===true).sort(porFecha).slice(0,100);
  const candI=state.ingresos.filter(g=>g.pendiente===true).sort(porFecha).slice(0,100);
  if(!candG.length&&!candI.length) return null;
  const saldosRef=doc(db,'cartera','saldos'), tarjetaRef=doc(db,'cartera','tarjeta'), tarjetaRevRef=doc(db,'cartera','tarjetaRev');
  const resumen={aplicados:0,rechazados:0,error:false};
  try{
    const resultado=await runTransaction(db, async tx=>{
      const sSnap=await tx.get(saldosRef), tSnap=await tx.get(tarjetaRef), trvSnap=await tx.get(tarjetaRevRef);
      // lo apartado del fondo: un gasto del Atajo que lo tomaria se rechaza como los invalidos
      const fSnapAt=await tx.get(doc(db,'cartera','fondo'));
      const apAt=saneaFondo(fSnapAt.exists()?fSnapAt.data():null).saldosPorCuenta;
      const s=sSnap.exists()?sSnap.data():{};
      const cuentas={
        efectivo:Number.isFinite(s.efectivo)?s.efectivo:0,
        nuSaldo:Number.isFinite(s.nuSaldo)?s.nuSaldo:0,
        revMXN:Number.isFinite(s.revMXN)?s.revMXN:0,
        efectivoGBM:Number.isFinite(s.efectivoGBM)?s.efectivoGBM:0
      };
      let tarjetaDeuda=(tSnap.exists()&&Number.isFinite(tSnap.data().deuda))?tSnap.data().deuda:0;
      let revTdcDeuda=(trvSnap.exists()&&Number.isFinite(trvSnap.data().deuda))?trvSnap.data().deuda:0;
      const revTdcDeposito=(trvSnap.exists()&&Number.isFinite(trvSnap.data().deposito))?trvSnap.data().deposito:state.revTdcDeposito;
      let cambioCuentas=false, cambioTarjeta=false, cambioTarjetaRev=false;
      const estados=[];
      // fase de LECTURA (en paralelo, todas ANTES de cualquier escritura, como exige la transaccion):
      // solo lee y devuelve el dato crudo, sin validar ni acumular todavia
      const lee=async (c,tipo)=>{
        const ref=doc(db,tipo==='gasto'?'gastos':'ingresos',c.id);
        const snap=await tx.get(ref);
        if(!snap.exists()||snap.data().pendiente!==true) return null; // otro dispositivo ya lo proceso
        return {ref,id:c.id,tipo,d:snap.data()};
      };
      const leidosG=await Promise.all(candG.map(c=>lee(c,'gasto')));
      const leidosI=await Promise.all(candI.map(c=>lee(c,'ingreso')));
      // fase de VALIDACION/ACUMULACION: secuencial, en el orden original (candG luego candI
      // por fecha), para que el limite de tarjetaRev se evalue de forma determinista
      const procesa=(r)=>{
        if(!r) return;
        const {ref,id,tipo,d}=r;
        const cta=tipo==='gasto'?d.fuente:d.destino;
        const listas=tipo==='gasto'?FUENTES_GASTO:DESTINOS_INGRESO;
        let valido=Number.isFinite(d.monto)&&d.monto>0&&d.monto<=10000000
          &&typeof d.cat==='string'&&d.cat.trim()!==''
          &&listas.includes(cta)&&Number.isFinite(Date.parse(d.fecha));
        // TDC Revolut: limite = deposito; aqui SI se valida contra los valores canonicos
        // (este es el unico flujo genuinamente concurrente); si excede, se rechaza
        if(valido&&cta==='tarjetaRev'&&Math.round((Math.max(0,revTdcDeuda)+d.monto)*100)>Math.round(revTdcDeposito*100)) valido=false;
        if(valido&&tipo==='gasto'){
          const campoAt={efectivo:'efectivo',nu:'nuSaldo',revolut:'revMXN'}[cta];
          if(campoAt&&apAt[cta]&&Math.round((cuentas[campoAt]-d.monto)*100)<Math.round(apAt[cta]*100)) valido=false;
        }
        if(valido){
          const sgn=tipo==='gasto'?-1:1;
          if(cta==='efectivo') cuentas.efectivo+=sgn*d.monto;
          else if(cta==='nu') cuentas.nuSaldo+=sgn*d.monto;
          else if(cta==='revolut') cuentas.revMXN+=sgn*d.monto;
          else if(cta==='gbm') cuentas.efectivoGBM+=sgn*d.monto;
          else if(cta==='tarjeta'){ tarjetaDeuda+=d.monto; cambioTarjeta=true; }
          else if(cta==='tarjetaRev'){ revTdcDeuda+=d.monto; cambioTarjetaRev=true; }
          if(cta!=='tarjeta'&&cta!=='tarjetaRev') cambioCuentas=true;
        }
        estados.push({ref,id,tipo,aplicado:valido});
      };
      leidosG.forEach(procesa);
      leidosI.forEach(procesa);
      estados.forEach(e=>tx.update(e.ref,{pendiente:false,aplicadoSaldo:e.aplicado}));
      // update PARCIAL con valores canonicos: no pisa el resto del doc de saldos
      if(cambioCuentas) tx.update(saldosRef,{efectivo:cuentas.efectivo,nuSaldo:cuentas.nuSaldo,revMXN:cuentas.revMXN,efectivoGBM:cuentas.efectivoGBM});
      if(cambioTarjeta) tx.update(tarjetaRef,{deuda:tarjetaDeuda});
      // set con merge: el doc tarjetaRev puede no existir todavia (update fallaria);
      // si es doc nuevo, incluir movimientos:[] para no dejarlo sin ese campo
      if(cambioTarjetaRev) tx.set(tarjetaRevRef, trvSnap.exists()?{deuda:revTdcDeuda,deposito:revTdcDeposito}:{deuda:revTdcDeuda,deposito:revTdcDeposito,movimientos:[]}, {merge:true});
      return {estados,cuentas,tarjetaDeuda,revTdcDeuda,cambioCuentas,cambioTarjeta,cambioTarjetaRev};
    });
    // reflejar en memoria lo que la transaccion dejo en Firestore
    resultado.estados.forEach(e=>{
      const arr=e.tipo==='gasto'?state.gastos:state.ingresos;
      const it=arr.find(x=>x.id===e.id);
      if(it){ it.pendiente=false; it.aplicadoSaldo=e.aplicado; }
      if(e.aplicado) resumen.aplicados++; else { resumen.rechazados++; console.error('movimiento del atajo rechazado',e.id); }
    });
    if(resultado.cambioCuentas){
      state.efectivo=resultado.cuentas.efectivo; state.nuSaldo=resultado.cuentas.nuSaldo;
      state.revMXN=resultado.cuentas.revMXN; state.efectivoGBM=resultado.cuentas.efectivoGBM;
    }
    if(resultado.cambioTarjeta) state.tarjetaDeuda=resultado.tarjetaDeuda;
    if(resultado.cambioTarjetaRev) state.revTdcDeuda=resultado.revTdcDeuda;
  }catch(e){ console.error('procesarPendientesAtajo',e); resumen.error=true; }
  return resumen;
}
