// libroBolsa (30-oct-2026) debe dar EXACTAMENTE lo mismo que la cuenta de costo promedio que vivia
// dentro de calcCartera antes de extraerla: mismas posiciones, mismo realizado (igualdad estricta, no
// "casi") y misma bandera de pendiente. Ademas, la suma de las ventas debe ser el total.
// Correr: node test-libro-bolsa.mjs   (lee la version vieja de `git show 66a0995:index.html`)
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import vm from 'node:vm';

const nuevo = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const viejo = execSync('git show 66a0995:index.html', { cwd: new URL('.', import.meta.url), maxBuffer: 64 << 20 }).toString().replace(/\r\n/g, '\n');
const tramo = (src, a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('no encontre ' + a); return src.slice(i, j + b.length); };

const helpers = tramo(nuevo, 'const POLVO_ACCIONES', '\nfunction sumaOp');
const libro = tramo(nuevo, 'function libroBolsa(opsCrudas) {', '  return {acc, ventas, realizado, realizadoPendiente};\n}');
// la cuenta vieja: el arranque de calcCartera hasta el fin del recorrido, envuelta en una funcion
const cuerpoViejo = tramo(viejo, '  const ops = (state.stocksOps || [])', `        t.acciones = 0; t.costo = 0; t.costoPendiente = false;
      }
    }
  });`);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(helpers.replace('\nfunction sumaOp', '') + '\n' + libro + `
function libroViejo(stocksOps) { const state = { stocksOps };
${cuerpoViejo}
  return {acc, realizado, realizadoPendiente}; }`, ctx);

let semilla = 7;
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const SIMS = ['QQQ', 'VOO', 'NVDA'];
function secuencia() {
  const n = 1 + Math.floor(azar() * 14), ops = [], tiene = {};
  for (let k = 0; k < n; k++) {
    const simbolo = SIMS[Math.floor(azar() * SIMS.length)];
    const venta = (tiene[simbolo] || 0) > 0 && azar() < 0.45;
    let acciones;
    if (venta) {
      const r = azar();
      acciones = r < 0.15 ? tiene[simbolo]                         // vende todo
        : r < 0.25 ? tiene[simbolo] * 1.3                           // vende de mas (dato corrupto)
        : r < 0.4 ? tiene[simbolo] - 0.0004                         // deja polvo
        : +(tiene[simbolo] * azar()).toFixed(8);
    } else acciones = +(0.01 + azar() * 3).toFixed(8);
    if (!(acciones > 0)) continue;
    const r = azar();
    const montoMxn = r < 0.08 ? 0 : r < 0.12 ? null : +(acciones * (500 + azar() * 9000)).toFixed(2);
    const fecha = `2026-0${1 + Math.floor(azar() * 9)}-1${Math.floor(azar() * 9)}`;
    ops.push({ id: 'op' + k, tipo: venta ? 'venta' : 'compra', simbolo, acciones, montoMxn, fecha, creado: `2026-10-30T00:00:${String(k).padStart(2, '0')}Z` });
    tiene[simbolo] = Math.max(0, (tiene[simbolo] || 0) + (venta ? -acciones : acciones));
  }
  if (azar() < 0.1) ops.push(null, { simbolo: 'X', acciones: -1, tipo: 'compra' });   // basura que se filtra
  return ops.sort(() => azar() - 0.5);                                              // llegan desordenadas
}

let ok = 0, mal = 0, conVentas = 0, conPendiente = 0, conPolvo = 0;
for (let k = 0; k < 20000; k++) {
  const ops = secuencia();
  const a = ctx.libroViejo(JSON.parse(JSON.stringify(ops)));
  const b = ctx.libroBolsa(JSON.parse(JSON.stringify(ops)));
  const igual = JSON.stringify(a.acc) === JSON.stringify(b.acc) && Object.is(a.realizado, b.realizado) && a.realizadoPendiente === b.realizadoPendiente;
  // la suma de las ventas reproduce el total cuando nada esta pendiente
  const suma = b.ventas.reduce((s, v) => s + (v.realizado ?? 0), 0);
  const cuadra = b.realizadoPendiente || Math.abs(suma - b.realizado) < 1e-6;
  const pendBien = b.realizadoPendiente === b.ventas.some(v => v.realizado === null);
  if (b.ventas.length) conVentas++;
  if (b.realizadoPendiente) conPendiente++;
  if (b.ventas.some((v, i) => Object.values(b.acc).some(x => x.acciones === 0))) conPolvo++;
  if (igual && cuadra && pendBien) ok++;
  else { mal++; if (mal <= 3) console.log('MAL', JSON.stringify({ ops, viejo: a, nuevo: b, suma })); }
}
console.log(`secuencias: ${ok + mal} (con ventas ${conVentas}, con pendiente ${conPendiente}, con posicion cerrada ${conPolvo})`);
console.log(`${ok} iguales, ${mal} distintas`);
process.exit(mal ? 1 : 0);
