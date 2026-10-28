// Prueba del COLCHON de la calificacion (27-oct-2026): el dinero liquido suma las cuentas del registro
// (disponible y ahorro) MAS las cuentas en otra moneda convertidas a pesos. Al empalmar monedas sobre el
// registro se colo un ';' que partia la expresion en dos y las cuentas x_ se perdian en silencio.
// Extrae la expresion real de index.html y la evalua con datos fijos.
import fs from 'node:fs';
const APP = process.env.APP || new URL('./index.html', import.meta.url);
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const i = HTML.indexOf('const liquido=');
if (i < 0) { console.log('esta copia no tiene colchon: nada que probar'); process.exit(0); }
const fin = HTML.indexOf('\n    const meses=', i);
const expr = HTML.slice(i, fin);
if (!expr.includes('cuentasX')) { console.log('esta copia no tiene cuentas en otra moneda: nada que probar'); process.exit(0); }

let ok = 0, mal = 0;
const chk = (n, c, d) => { if (c) { ok++; console.log('  PASA  ' + n); } else { mal++; console.log('  FALLA ' + n + '  -> ' + d); } };
function liquido(saldos, cuentasX, tcs) {
  // (28-oct-2026) lo liquido de cada cuenta es saldoTuyo (sin el fondo ni su interes); antes disponibleCuenta
  return new Function('ctasGrupo', 'disponibleCuenta', 'saldoTuyo', 'saldoX', 'state', 'tcDe', expr + '\nreturn liquido;')(
    g => ({ disponible: ['efectivo', 'nu'], ahorro: ['cajita1'] })[g] || [],
    c => saldos[c] || 0,
    c => saldos[c] || 0,
    x => x.saldo,
    { cuentasX },
    m => tcs[m] || null);
}
const base = { efectivo: 1000, nu: 2000, cajita1: 5000 };
let v = liquido(base, {}, {});
chk('sin cuentas en otra moneda: solo las del registro', v === 8000, v);
v = liquido(base, { x_abc123: { moneda: 'USD', saldo: 100 } }, { USD: 18.5 });
chk('una cuenta en USD suma convertida a pesos', Math.abs(v - 9850) < 0.001, v);
v = liquido(base, { x_abc123: { moneda: 'USD', saldo: -50 } }, { USD: 18.5 });
chk('una cuenta en otra moneda en rojo no resta', v === 8000, v);
v = liquido(base, { x_abc123: { moneda: 'AUD', saldo: 300 } }, {});
chk('sin tipo de cambio no se inventa: no suma', v === 8000, v);
v = liquido({ efectivo: -500, nu: 2000, cajita1: 5000 }, {}, {});
chk('una cuenta del registro en rojo no resta', v === 7000, v);

console.log('\n==========================================================');
console.log(mal ? `FALLAN ${mal} de ${ok + mal}` : `TODO PASA — ${ok}/${ok + mal}`);
process.exit(mal ? 1 : 0);
