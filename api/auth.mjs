// ============================================================
//  Autenticación — GALLO
//  Usa solo WebCrypto (crypto.subtle), que existe igual en Node 18+,
//  Deno, Bun, Cloudflare Workers y Vercel Edge. Sin dependencias npm.
// ============================================================

const enc = new TextEncoder();

// Recomendación OWASP para PBKDF2-SHA256. Además de proteger el hash,
// el costo (~150ms) funciona como freno natural a la fuerza bruta.
export const ITERACIONES = 210000;

function aBase64(buf){
  const bytes = new Uint8Array(buf);
  let s = '';
  for(const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function deBase64(str){
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const aBase64Url = buf => aBase64(buf).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const deBase64Url = str => deBase64(str.replace(/-/g,'+').replace(/_/g,'/'));

// Compara dos arrays de bytes en tiempo constante (no corta en el primer byte distinto)
export function comparaSegura(a, b){
  if(a.length !== b.length) return false;
  let dif = 0;
  for(let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

async function derivar(password, salt, iteraciones){
  const clave = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', salt, iterations: iteraciones, hash:'SHA-256' }, clave, 256);
  return new Uint8Array(bits);
}

// Genera el hash que se guarda en config/admin.json
export async function crearHash(password){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(password, salt, ITERACIONES);
  return `pbkdf2$${ITERACIONES}$${aBase64(salt)}$${aBase64(hash)}`;
}

export async function verificarPassword(password, almacenado){
  const partes = String(almacenado || '').split('$');
  if(partes.length !== 4 || partes[0] !== 'pbkdf2') return false;
  const iteraciones = Number(partes[1]);
  if(!Number.isInteger(iteraciones) || iteraciones < 1000) return false;
  try{
    const hash = await derivar(password, deBase64(partes[2]), iteraciones);
    return comparaSegura(hash, deBase64(partes[3]));
  }catch{
    return false;
  }
}

// ---------- Sesión: token firmado con HMAC, sin estado en el servidor ----------

async function claveHmac(secreto){
  return crypto.subtle.importKey(
    'raw', enc.encode(secreto), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
}

export async function firmarSesion(secreto, horas = 12){
  const cuerpo = aBase64Url(enc.encode(JSON.stringify({ exp: Date.now() + horas * 3600_000 })));
  const firma = await crypto.subtle.sign('HMAC', await claveHmac(secreto), enc.encode(cuerpo));
  return `${cuerpo}.${aBase64Url(firma)}`;
}

export async function verificarSesion(secreto, token){
  const partes = String(token || '').split('.');
  if(partes.length !== 2) return false;
  try{
    const esperada = await crypto.subtle.sign('HMAC', await claveHmac(secreto), enc.encode(partes[0]));
    if(!comparaSegura(new Uint8Array(esperada), deBase64Url(partes[1]))) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(deBase64Url(partes[0])));
    return typeof exp === 'number' && Date.now() < exp;
  }catch{
    return false;
  }
}
