// Prueba del codigo por SMS de Fundview (4-nov-2026): numeros, mascara y errores, sin navegador. Corre el bloque <fv-sms-puras> del index.html tal cual.
// Lo que pasa en pantalla lo prueba pruebas-sin-senal\fundview\e2e-sms.mjs.
import fs from 'node:fs';
const APP = process.env.APP || 'c:/Users/elita/Desktop/CARTERA/mi-cartera/index.html';
const HTML = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const ini = HTML.indexOf('// <fv-sms-puras>'), fin = HTML.indexOf('// </fv-sms-puras>');
if (ini < 0 || fin < ini) { console.log('esta copia no tiene SMS: nada que probar'); process.exit(0); }
const A = new Function(HTML.slice(ini, fin) + '\nreturn {fvTelE164, fvTelMascara, fvErrorSms, fvErrorCodigoSms, fvErrorAlta, fvSmsEsperaLeer, fvSmsEsperaNueva, fvSmsFaltaDe, fvSmsAmbiguo, fvTextoHuerfano, FV_SMS_PAIS, FV_SMS_TOPE, FV_SMS_DESPUES, FV_SIN_RED, FV_DEMASIADOS, FV_SMS_ESPERAS};')();
let pasan = 0, fallas = 0;
const ok = (c, t, d = '') => { if (c) pasan++; else { fallas++; console.log('  FALLA', t, d); } };
const igual = (a, b, t) => ok(a === b, t, JSON.stringify(a) + ' vs ' + JSON.stringify(b));

// ── numeros buenos ──
const BUENOS = [
  ['52', '5512345678', '+525512345678'], ['52', '55 1234 5678', '+525512345678'], ['52', '(55) 1234-5678', '+525512345678'], ['52', '55.1234.5678', '+525512345678'],
  ['52', '+52 55 1234 5678', '+525512345678'], ['52', '+52 1 55 1234 5678', '+525512345678'], ['52', '525512345678', '+525512345678'], ['52', '5215512345678', '+525512345678'],
  ['52', '0445512345678', '+525512345678'], ['52', '0455512345678', '+525512345678'], ['52', '15512345678', '+525512345678'], ['52', '+64 21 123 4567', '+64211234567'],
  ['52', '5255123456', '+525255123456'],   // lada 52: son 10 numeros y no se le quita nada
  ['64', '021 123 4567', '+64211234567'], ['64', '0211234567', '+64211234567'], ['64', '211234567', '+64211234567'], ['64', '+64 21 123 4567', '+64211234567'], ['64', '64211234567', '+64211234567'],
  ['64', '021 123 456', '+6421123456'], ['64', '02 12345678', '+64212345678'], ['64', '+52 55 1234 5678', '+525512345678'], ['64', '0204 123 4567', '+642041234567'],
];
for (const [p, t, e] of BUENOS) igual(A.fvTelE164(p, t).e164, e, 'BUENO ' + p + ' ' + t);
igual(A.fvTelE164('64', '+52 55 1234 5678').pais, '52', 'pegado completo: la lada manda sobre el selector');
igual(A.fvTelE164('52', '+64 21 123 4567').pais, '64', 'igual al reves');

// ── numeros malos ──
const MALOS = [
  ['52', ''], ['52', '   '], ['52', '123'], ['52', '55 1234 567'], ['52', '55 1234 56789'], ['52', '0512345678'], ['52', '1512345678'], ['52', 'abcdefghij'], ['52', '55123x5678'], ['52', '+525512'], ['52', null], ['52', undefined],
  ['64', ''], ['64', '123'], ['64', '09 123 4567'], ['64', '0312345678'], ['64', '02112'], ['64', '021123456789'], ['64', 'hola'],
  ['52', '<script>'], ['52', '55123456781234567890'],
];
for (const [p, t] of MALOS) { const r = A.fvTelE164(p, t); ok(!r.e164 && /revisa tu número/.test(r.error), 'MALO ' + p + ' ' + t, JSON.stringify(r)); }
for (const t of ['+1 650 555 1234', '+61 412 345 678', '+86 138 0013 8000', '+5']) igual(A.fvTelE164('52', t).error, A.FV_SMS_PAIS, 'OTRO PAIS ' + t);

// ── mascara ──
igual(A.fvTelMascara('+525512345678'), '+52 ••• ••• 5678', 'mexico');
igual(A.fvTelMascara('+64211234567'), '+64 ••• ••• 4567', 'nueva zelanda');
igual(A.fvTelMascara('+52*******5678'), '+52 ••• ••• 5678', 'tapado por el servidor, con lada');
igual(A.fvTelMascara('+*******5678'), '••• ••• 5678', 'tapado por el servidor, sin lada');
igual(A.fvTelMascara(''), 'tu teléfono', 'sin dato');
igual(A.fvTelMascara(undefined), 'tu teléfono', 'indefinido');
igual(A.fvTelMascara('12'), 'tu teléfono', 'muy corto');
for (const t of ['+525512345678', '+64211234567']) ok(!A.fvTelMascara(t).includes('1234'), 'no enseña lo de en medio ' + t);

// ── errores al mandar ──
const E = (code, message = '') => Object.assign(new Error(message), {code});
const BLOQ = f => 'Firebase: HTTP Cloud Function returned an error. Code: 403, Message: ' + f + ' (auth/internal-error).';
igual(A.fvErrorSms(E('auth/internal-error', BLOQ('fv-sms-tope'))), A.FV_SMS_TOPE, 'tope');
igual(A.fvErrorSms(E('auth/internal-error', BLOQ('fv-sms-pais'))), A.FV_SMS_PAIS, 'pais');
igual(A.fvErrorSms(E('auth/internal-error', BLOQ('fv-sms-intenta-despues'))), A.FV_SMS_DESPUES, 'intenta despues');
igual(A.fvErrorSms(E('auth/internal-error', BLOQ('fv-sms-tipo'))), A.FV_SMS_DESPUES, 'tipo (un fv- que no conoce): el generico');
igual(A.fvErrorSms(E('auth/internal-error', 'Firebase: Error (auth/internal-error).')), A.FV_SMS_DESPUES, 'internal sin fv-');
// (5-nov-2026, mejora 4) el tope con el codigo de antes de la funcion (resource-exhausted) tambien se reconoce, por si llega asi en el texto
igual(A.fvErrorSms(E('auth/internal-error', 'Firebase: HTTP Cloud Function returned an error: RESOURCE_EXHAUSTED (auth/internal-error).')), A.FV_SMS_TOPE, 'RESOURCE_EXHAUSTED en el texto: tope');
igual(A.fvErrorSms(E('auth/internal-error', 'resource-exhausted')), A.FV_SMS_TOPE, 'resource-exhausted en el texto: tope');
igual(A.fvErrorSms(E('auth/quota-exceeded')), A.FV_SMS_TOPE, 'cuota de Firebase');
igual(A.fvErrorSms(E('auth/invalid-phone-number')), 'ese número no está bien escrito: revísalo y vuelve a intentar', 'numero invalido');
igual(A.fvErrorSms(E('auth/network-request-failed')), A.FV_SIN_RED, 'sin red');
igual(A.fvErrorSms(E('auth/too-many-requests')), A.FV_DEMASIADOS, 'demasiados');
for (const c of ['auth/captcha-check-failed', 'auth/invalid-app-credential', 'auth/operation-not-allowed', 'fv/plazo', '']) igual(A.fvErrorSms(E(c)), A.FV_SMS_DESPUES, 'generico ' + c);
igual(A.fvErrorSms(null), A.FV_SMS_DESPUES, 'reCAPTCHA puede rechazar con null');
igual(A.fvErrorSms('Timeout'), A.FV_SMS_DESPUES, 'o con un texto');
// ── errores al revisar el codigo ──
ok(/no coincide/.test(A.fvErrorCodigoSms(E('auth/invalid-verification-code'))), 'codigo malo');
ok(/ya venció/.test(A.fvErrorCodigoSms(E('auth/code-expired'))), 'codigo vencido');
igual(A.fvErrorCodigoSms(E('auth/too-many-requests')), A.FV_DEMASIADOS, 'demasiados');
igual(A.fvErrorCodigoSms(E('auth/network-request-failed')), A.FV_SIN_RED, 'sin red');
// ── crear cuenta ──
const SIN = 'ese correo no tiene una invitación pendiente: usa el mismo correo al que te llegó tu código', REV = 'no pudimos revisar tu invitación en este momento: vuelve a intentar en un minuto';
const a1 = A.fvErrorAlta(E('auth/internal-error', BLOQ('fv-sin-invitacion')));
ok(a1.texto === SIN && !a1.reintenta, 'sin invitacion: su texto, sin reintento', JSON.stringify(a1));
{ const a = A.fvErrorAlta(E('auth/internal-error', BLOQ('fv-intenta-despues'))); ok(a.texto === REV && a.reintenta, 'fv-intenta-despues: reintenta', JSON.stringify(a)); }
{ const a = A.fvErrorAlta(E('auth/internal-error', BLOQ('fv-proveedor'))); ok(a.texto === REV && !a.reintenta, 'fv-proveedor es un rechazo definitivo: NO reintenta (4-nov)', JSON.stringify(a)); }
const a2 = A.fvErrorAlta(E('auth/internal-error', 'Firebase: Error (auth/internal-error).'));
ok(a2.texto === REV && a2.reintenta, 'internal sin fv-: reintenta', JSON.stringify(a2));
const a3 = A.fvErrorAlta(E('auth/internal-error', BLOQ('fv-otro')));
ok(a3.texto === REV && !a3.reintenta, 'un fv- que no conoce: el texto, sin reintento', JSON.stringify(a3));
for (const c of ['auth/email-already-in-use', 'auth/weak-password', 'auth/network-request-failed']) ok(!A.fvErrorAlta(E(c)).texto && !A.fvErrorAlta(E(c)).reintenta, c + ': no es de la funcion');
ok(A.fvErrorAlta(E('auth/internal-error', BLOQ('fv-sin-invitacion'))).texto === A.fvErrorAlta(E('auth/internal-error', BLOQ('fv-sin-invitacion ya usada'))).texto, 'el texto no separa no existe de ya usada');
// ── textos ──
for (const t of [A.FV_SMS_PAIS, A.FV_SMS_TOPE, A.FV_SMS_DESPUES, SIN, REV]) ok(!/m[aá]xima seguridad/i.test(t), 'sin prometer de mas');
ok(A.FV_SMS_ESPERAS[0] >= 60, 'la espera empieza en 60 s como minimo');
ok(A.FV_SMS_ESPERAS.every((s, i, l) => !i || s >= l[i - 1]), 'y nunca baja');

// ── la espera entre un SMS y el siguiente (4-nov-2026): UN valor {hasta, n, uid} ──
{
  const t0 = 1_800_000_000_000, Q = 'uid-ana', S = v => JSON.stringify(v);
  igual(A.fvSmsFaltaDe(A.fvSmsEsperaLeer(null, Q, t0), t0), 0, 'sin nada guardado: no hay espera');
  const w1 = A.fvSmsEsperaNueva(null, Q, t0);
  ok(w1.n === 1 && w1.uid === Q && w1.hasta === t0 + 60000, 'el primer SMS: 60 s, n=1', S(w1));
  const w2 = A.fvSmsEsperaNueva(S(w1), Q, t0 + 61000);
  ok(w2.n === 2 && w2.hasta === t0 + 61000 + 120000, 'el segundo: 120 s (la escalera sigue aunque se recargue)', S(w2));
  const w3 = A.fvSmsEsperaNueva(S(w2), Q, t0 + 200000), w4 = A.fvSmsEsperaNueva(S(w3), Q, t0 + 500000), w5 = A.fvSmsEsperaNueva(S(w4), Q, t0 + 900000);
  ok(w3.hasta - (t0 + 200000) === 240000 && w4.hasta - (t0 + 500000) === 240000 && w5.hasta - (t0 + 900000) === 240000 && w5.n === 5, 'del tercero en adelante: 240 s, sin pasar de ahi', S([w3, w4, w5]));
  const otra = A.fvSmsEsperaNueva(S(w3), 'otra-cuenta', t0 + 1000);
  ok(otra.n === 1 && otra.hasta === t0 + 1000 + 60000, 'la escalera de una cuenta NO pasa a otra', S(otra));
  igual(A.fvSmsFaltaDe(A.fvSmsEsperaLeer(S(w3), 'otra-cuenta', t0 + 201000), t0 + 201000), 0, 'ni su espera: otra cuenta no espera por la de Ana');
  igual(A.fvSmsFaltaDe(A.fvSmsEsperaLeer(S(w1), Q, t0 + 1000), t0 + 1000), 59, 'falta redondea hacia arriba (59 s a 1 s de empezar)');
  igual(A.fvSmsFaltaDe(A.fvSmsEsperaLeer(S(w1), Q, t0 + 60000), t0 + 60000), 0, 'y llega a cero');
  // si salta el reloj (el aparato se adelanto y volvio, o alguien lo escribio a mano): nunca mas de 240 s
  igual(A.fvSmsFaltaDe(A.fvSmsEsperaLeer(S({hasta: t0 + 99_999_999, n: 3, uid: Q}), Q, t0), t0), 240, 'con el reloj saltado, la espera topa a 240 s');
  for (const [nombre, raw] of [['un numero suelto (el formato viejo)', '1700000000000'], ['texto', 'hola'], ['vacio', ''], ['null', 'null'], ['n cero', S({hasta: t0 + 5000, n: 0, uid: Q})], ['n fraccion', S({hasta: t0 + 5000, n: 1.5, uid: Q})],
    ['hasta texto', S({hasta: 'x', n: 1, uid: Q})], ['sin uid', S({hasta: t0 + 5000, n: 1})], ['arreglo', '[1,2]']])
    igual(A.fvSmsFaltaDe(A.fvSmsEsperaLeer(raw, Q, t0), t0), 0, 'valor roto o viejo no cuenta: ' + nombre);
  igual(A.fvSmsEsperaNueva('basura', Q, t0).n, 1, 'sobre un valor roto se empieza de cero');
  igual(A.fvSmsFaltaDe(A.fvSmsEsperaLeer(S(w1), null, t0 + 1000), t0 + 1000), 0, 'sin saber de quien es, no hay espera');
  // fallos ambiguos: pudo salir el SMS
  const EA = (c, m = '') => Object.assign(new Error(m), {code: c});
  ok(A.fvSmsAmbiguo(EA('fv/plazo')), 'se acabo el plazo: ambiguo');
  ok(A.fvSmsAmbiguo(EA('auth/internal-error', 'Firebase: Error (auth/internal-error).')), 'internal-error sin fv-: ambiguo');
  ok(!A.fvSmsAmbiguo(EA('auth/internal-error', BLOQ('fv-sms-tope'))) && !A.fvSmsAmbiguo(EA('auth/internal-error', BLOQ('fv-sms-intenta-despues'))), 'un rechazo de nuestra funcion (fv-) NO es ambiguo: no salio nada');
  for (const c of ['auth/network-request-failed', 'auth/captcha-check-failed', 'auth/invalid-phone-number', 'auth/too-many-requests', 'auth/quota-exceeded', '']) ok(!A.fvSmsAmbiguo(EA(c)), c + ': no es ambiguo');
  ok(!A.fvSmsAmbiguo(null) && !A.fvSmsAmbiguo('texto'), 'null y texto: no');
  ok(/^Ya te mandamos un código, pero esta pantalla no lo recuerda; puedes pedir otro en 45 s\.$/.test(A.fvTextoHuerfano(45)), 'el texto de huerfano dice cuanto falta', A.fvTextoHuerfano(45));
  ok(/no lo recuerda: pide otro\.$/.test(A.fvTextoHuerfano(0)), 'y al llegar a cero, que ya se puede pedir', A.fvTextoHuerfano(0));
}

console.log(fallas ? '\n' + fallas + ' FALLAS de ' + (pasan + fallas) : '\nTODO PASA: ' + pasan + '/' + pasan);
process.exit(fallas ? 1 : 0);
