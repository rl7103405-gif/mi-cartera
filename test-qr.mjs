// Prueba del codificador QR de Fundview (4-nov-2026), sin navegador. Corre el bloque <fv-qr> del index.html tal cual.
// Tres capas: (1) vectores publicados del estandar (formato, version, Reed-Solomon, capacidades); (2) un lector escrito aqui, aparte del codificador, que valida
// Reed-Solomon bloque por bloque y lee los bytes, tambien binarios y de todas las versiones; (3) un lector ajeno: el filtro quirc de ffmpeg (libquirc), con la imagen en PGM.
// Si no hay ffmpeg con quirc, FALLA: el punto es que lo lea alguien que no soy yo. QR_SIN_LECTOR=1 lo salta y lo dice.
// Lo que pasa en pantalla lo prueba pruebas-sin-senal\fundview\e2e-qr.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const APP = process.env.APP || path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html');
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const ini = HTML.indexOf('// <fv-qr>'), fin = HTML.indexOf('// </fv-qr>');
if (ini < 0 || fin < ini) { console.log('esta copia no tiene QR: nada que probar'); process.exit(0); }
const Q = new Function(HTML.slice(ini, fin) + '\nreturn {fvQrMatriz, fvQrCabe, fvQrFormatoBits, fvQrVersionBits, fvQrGenerador, fvQrResto, fvQrAlineacion, fvQrCodigos, fvQrIntercala};')();
let pasan = 0, fallas = 0;
const ok = (c, t, d = '') => { if (c) pasan++; else { fallas++; console.log('  FALLA', t, d); } };
const igual = (a, b, t) => ok(JSON.stringify(a) === JSON.stringify(b), t, JSON.stringify(a) + ' vs ' + JSON.stringify(b));

// ── 1. vectores del estandar ──
// formato con nivel M (ISO/IEC 18004, tabla C.1)
const FORMATO_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];
FORMATO_M.forEach((b, k) => igual(Q.fvQrFormatoBits(k), b, 'formato M mascara ' + k));
// version (tabla D.1)
const VERSION = {7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3, 21: 0x15683, 32: 0x209D5, 40: 0x28C69};
for (const [v, b] of Object.entries(VERSION)) igual(Q.fvQrVersionBits(+v), b, 'version ' + v);
// el ejemplo clasico: "HELLO WORLD" en 1-M, sus 16 de datos y sus 10 de correccion
igual(Q.fvQrResto([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], Q.fvQrGenerador(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23], 'Reed-Solomon de HELLO WORLD 1-M');
// el ejemplo de Annex I del estandar: 01234567 en 1-M
igual(Q.fvQrResto([16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17], Q.fvQrGenerador(10)), [165, 36, 212, 193, 237, 54, 199, 135, 44, 85], 'Reed-Solomon de 01234567 1-M');
// capacidad en bytes con nivel M (tabla 7), las 40 versiones
const CABE_M = [14,26,42,62,84,106,122,152,180,213,251,287,331,362,412,450,504,560,624,666,711,779,857,911,997,1059,1125,1190,1264,1370,1452,1538,1628,1722,1809,1911,1989,2099,2213,2331];
CABE_M.forEach((c, i) => igual(Q.fvQrCabe(i + 1), c, 'capacidad version ' + (i + 1)));
// centros de alineacion (tabla E.1)
igual(Q.fvQrAlineacion(1), [], 'alineacion v1');
igual(Q.fvQrAlineacion(2), [6, 18], 'alineacion v2');
igual(Q.fvQrAlineacion(7), [6, 22, 38], 'alineacion v7');
igual(Q.fvQrAlineacion(15), [6, 26, 48, 70], 'alineacion v15');
igual(Q.fvQrAlineacion(32), [6, 34, 60, 86, 112, 138], 'alineacion v32');
igual(Q.fvQrAlineacion(36), [6, 24, 50, 76, 102, 128, 154], 'alineacion v36');
igual(Q.fvQrAlineacion(40), [6, 30, 58, 86, 114, 142, 170], 'alineacion v40');
// lo que no cabe no truena: se queda sin QR y sigue la clave
igual(Q.fvQrMatriz('a'.repeat(2332)), null, '2332 bytes no caben');
ok(Q.fvQrMatriz('a'.repeat(2331)) !== null && Q.fvQrMatriz('a'.repeat(2331)).v === 40, '2331 caben en v40');
igual(Q.fvQrMatriz('').v, 1, 'vacio cabe en v1');
// el mismo texto da siempre lo mismo
ok(Buffer.compare(Buffer.from(Q.fvQrMatriz('abc').m), Buffer.from(Q.fvQrMatriz('abc').m)) === 0, 'determinista');

// ── 2. lector propio: NO usa las funciones de armado (solo sabe del estandar y lee la matriz) ──
const mulGF = (() => { const ex = new Array(512), lg = new Array(256); let x = 1; for (let i = 0; i < 255; i++) { ex[i] = x; lg[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (let i = 255; i < 512; i++) ex[i] = ex[i - 255]; return {ex, lg, m: (a, b) => a && b ? ex[lg[a] + lg[b]] : 0}; })();
function leer({n, m}) {
  const v = (n - 17) / 4, at = (x, y) => m[y * n + x];
  // formato: las dos copias deben coincidir y la mascara sale de ahi
  let f1 = 0, f2 = 0;
  const c1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  c1.forEach(([x, y], i) => { f1 |= at(x, y) << i; });
  for (let i = 0; i < 8; i++) f2 |= at(n - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) f2 |= at(8, n - 15 + i) << i;
  if (f1 !== f2) throw new Error('las dos copias del formato no coinciden');
  const pl = f1 ^ 0x5412;
  if (pl >>> 13 !== 0) throw new Error('el nivel no es M');
  const mask = (pl >>> 10) & 7;
  if (at(8, n - 8) !== 1) throw new Error('falta el modulo negro');
  // que es funcion: se calcula a mano
  const fijo = new Uint8Array(n * n), mf = (x, y) => { fijo[y * n + x] = 1; };
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) mf(x, y);
  for (let y = 0; y < 9; y++) for (let x = n - 8; x < n; x++) mf(x, y);
  for (let y = n - 8; y < n; y++) for (let x = 0; x < 9; x++) mf(x, y);
  for (let i = 0; i < n; i++) { mf(6, i); mf(i, 6); }
  const ALIN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34]};
  let cen = ALIN[v];
  if (!cen) { const na = Math.floor(v / 7) + 2; let paso = v === 32 ? 26 : Math.ceil((n - 13) / (2 * na - 2)) * 2; cen = [6]; for (let p = n - 7; cen.length < na; p -= paso) cen.splice(1, 0, p); }
  for (const ax of cen) for (const ay of cen) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === cen[cen.length - 1]) || (ax === cen[cen.length - 1] && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mf(ax + dx, ay + dy);
    if (!at(ax, ay) || at(ax + 1, ay) || !at(ax + 2, ay)) throw new Error('patron de alineacion mal en ' + ax + ',' + ay);
  }
  if (v >= 7) for (let i = 0; i < 18; i++) { const a = n - 11 + i % 3, b = Math.floor(i / 3); mf(a, b); mf(b, a); }
  // ojos y sincronizacion
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
    if (at(ox + x, oy + y) !== (d !== 2 ? 1 : 0)) throw new Error('ojo mal');
  }
  for (let i = 8; i < n - 8; i++) if (at(i, 6) !== (i + 1) % 2 || at(6, i) !== (i + 1) % 2) throw new Error('sincronizacion mal');
  // zigzag desde la esquina
  const salidas = [];
  let sube = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < n; k++) {
      const y = sube ? n - 1 - k : k;
      for (const x of [col, col - 1]) {
        if (fijo[y * n + x]) continue;
        const M = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x * y) % 2 + (x * y) % 3 === 0, ((x * y) % 2 + (x * y) % 3) % 2 === 0, ((x + y) % 2 + (x * y) % 3) % 2 === 0][mask];
        salidas.push(at(x, y) ^ (M ? 1 : 0));
      }
    }
    sube = !sube;
  }
  const cod = []; for (let i = 0; i + 8 <= salidas.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = b * 2 + salidas[i + j]; cod.push(b); }
  // bloques de la tabla (las mismas cifras que trae el estandar, escritas aparte)
  const ECC = [10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28][v - 1];
  const NB = [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49][v - 1];
  const total = cod.length, corto = Math.floor(total / NB), nCortos = NB - total % NB, dataCorto = corto - ECC;
  const bl = Array.from({length: NB}, () => []);
  let p = 0;
  for (let c = 0; c < dataCorto + 1; c++) for (let b = 0; b < NB; b++) if (c < dataCorto || b >= nCortos) bl[b].push(cod[p++]);
  for (let c = 0; c < ECC; c++) for (let b = 0; b < NB; b++) bl[b].push(cod[p++]);
  if (p !== total) throw new Error('quedaron codigos sin leer');
  // cada bloque: los sindromes de Reed-Solomon dan cero
  for (const b of bl) for (let i = 0; i < ECC; i++) {
    let s = 0; const a = mulGF.ex[i];
    for (const x of b) s = mulGF.m(s, a) ^ x;
    if (s !== 0) throw new Error('Reed-Solomon no cuadra');
  }
  const datos = bl.flatMap(b => b.slice(0, b.length - ECC));
  let bits = ''; for (const b of datos) bits += b.toString(2).padStart(8, '0');
  if (bits.slice(0, 4) !== '0100') throw new Error('no es modo byte');
  const lb = v < 10 ? 8 : 16, largo = parseInt(bits.slice(4, 4 + lb), 2), sal = new Uint8Array(largo);
  for (let i = 0; i < largo; i++) sal[i] = parseInt(bits.slice(4 + lb + i * 8, 12 + lb + i * 8), 2);
  // lo de despues son el fin y el relleno, alternados
  const resto = bits.slice(4 + lb + largo * 8);
  let finBits = resto.slice(0, Math.min(4, resto.length)); if (/1/.test(finBits)) throw new Error('falta el fin');
  const alineado = resto.slice(((4 + lb + largo * 8 + finBits.length) % 8 ? 8 - (4 + lb + largo * 8 + finBits.length) % 8 : 0) + finBits.length);
  for (let i = 0; i + 8 <= alineado.length; i += 8) if (parseInt(alineado.slice(i, i + 8), 2) !== (i / 8 % 2 ? 0x11 : 0xEC)) throw new Error('relleno mal');
  return {bytes: sal, v, mask};
}
const lee = (d, t) => {
  const q = Q.fvQrMatriz(d), want = typeof d === 'string' ? new TextEncoder().encode(d) : d;
  try { const r = leer(q); ok(Buffer.compare(Buffer.from(r.bytes), Buffer.from(want)) === 0, t); return q; } catch (e) { ok(false, t, e.message); return q; }
};
// todos los limites de version, justo al tope y uno mas
CABE_M.forEach((c, i) => { lee('x'.repeat(c), 'lector propio, v' + (i + 1) + ' al tope (' + c + ')'); if (i < 39) { const q = lee('x'.repeat(c + 1), 'lector propio, v' + (i + 1) + ' mas uno'); igual(q.v, i + 2, 'cambia a v' + (i + 2)); } });
// binario: todos los bytes, y varios largos pseudoaleatorios (semilla fija)
lee(Uint8Array.from({length: 256}, (_, i) => i), 'lector propio, los 256 bytes');
let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) >>> 8;
for (let i = 0; i < 40; i++) { const L = 1 + rnd() % 900; lee(Uint8Array.from({length: L}, () => rnd() & 255), 'lector propio, binario de ' + L); }
lee('correo.acentuado+ñandú@ejemplo.mx', 'lector propio, UTF-8');
// las ocho mascaras salen alguna vez (si no, la seleccion esta sesgada o rota)
{ const vistas = new Set(); for (let i = 0; i < 3000 && vistas.size < 8; i++) vistas.add(Q.fvQrMatriz(Uint8Array.from({length: 1 + rnd() % 60}, () => rnd() & 255)).mascara); igual(vistas.size, 8, 'salen las ocho mascaras'); }
// sensibilidad: el lector propio si detecta un QR danado. Si no, las pruebas de arriba no dirian nada
{
  const q = Q.fvQrMatriz('otpauth://totp/Fundview:prueba?secret=JBSWY3DPEHPK3PXP');
  const dan = {n: q.n, m: q.m.slice()};
  dan.m[(q.n - 1) * q.n + q.n - 1] ^= 1;
  let tiro = false; try { leer(dan); } catch (e) { tiro = true; }
  ok(tiro, 'el lector propio rechaza un modulo volteado');
}

// ── 3. lector ajeno: quirc de ffmpeg ──
const LIGAS = [
  'otpauth://totp/Fundview:a%40b.mx?secret=JBSWY3DPEHPK3PXP&issuer=Fundview&algorithm=SHA1&digits=6',
  'otpauth://totp/Fundview:' + encodeURIComponent('una.persona+etiqueta@correo-largo.example.com') + '?secret=' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' + '&issuer=Fundview&algorithm=SHA1&digits=6',
  'otpauth://totp/Fundview:' + encodeURIComponent('ñ'.repeat(30) + '@x.mx') + '?secret=' + 'A'.repeat(32) + '&issuer=Fundview&algorithm=SHA1&digits=6',
  'otpauth://totp/Fundview:' + encodeURIComponent('z'.repeat(240) + '@x.mx') + '?secret=' + 'B'.repeat(32) + '&issuer=Fundview&algorithm=SHA1&digits=6',
  ...[1, 13, 14, 15, 26, 27, 62, 63, 106, 107, 152, 153, 213, 214, 287, 288, 450, 451, 800, 900].map(n => 'L'.repeat(n)),
];
function porQuirc(q, modulo = 4) {
  const lado = (q.n + 8) * modulo, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-')), f = path.join(dir, 'q.pgm');
  const px = Buffer.alloc(lado * lado, 255);
  for (let y = 0; y < q.n; y++) for (let x = 0; x < q.n; x++) if (q.m[y * q.n + x]) for (let a = 0; a < modulo; a++) px.fill(0, (y + 4) * modulo * lado + a * lado + (x + 4) * modulo, (y + 4) * modulo * lado + a * lado + (x + 5) * modulo);
  fs.writeFileSync(f, Buffer.concat([Buffer.from(`P5\n${lado} ${lado}\n255\n`), px]));
  // por el registro, no con file=-: print_file de vf_metadata corta en 128 caracteres (lo que se leia como "quirc lee mal" a los 105 bytes de payload)
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-i', f, '-vf', 'quirc,metadata=mode=print', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 24});
  fs.rmSync(dir, {recursive: true, force: true});
  if (r.error) return {error: r.error.message};
  const m = (r.stderr || '').match(/lavfi\.quirc\.0\.payload=(.*)/);
  return {texto: m ? m[1].trim() : null};
}
const hayQuirc = (spawnSync('ffmpeg', ['-hide_banner', '-filters'], {encoding: 'utf8'}).stdout || '').includes('quirc');
if (!hayQuirc) {
  if (process.env.QR_SIN_LECTOR) console.log('OJO: sin lector ajeno (ffmpeg con quirc): la capa 3 NO corrio');
  else ok(false, 'hace falta ffmpeg con el filtro quirc');
} else {
  let n = 0;
  for (const l of LIGAS) {
    const q = Q.fvQrMatriz(l), r = porQuirc(q);
    n++;
    ok(r.texto === l, 'quirc lee v' + q.v + ' (' + l.length + ' bytes)', String(r.texto).slice(0, 60));
  }
  console.log('lector ajeno (ffmpeg/quirc): ' + n + ' imagenes');
}

console.log(pasan + ' pasan, ' + fallas + ' fallan');
process.exit(fallas ? 1 : 0);
