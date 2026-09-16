// ============================================================
//  Credenciales del panel — GALLO
//
//  La contraseña del panel vive hasheada en config/admin.json, que es
//  un archivo más del repo. Para cambiarla se regenera ese archivo
//  (node tools/hash-password.mjs "nueva-contraseña") y se commitea:
//  no hay que tocar variables de entorno en ningún hosting.
//
//  Leer un archivo del proyecto es lo único que cambia de un runtime a
//  otro, así que las tres formas posibles están acá y se prueban en
//  orden hasta que una funcione.
// ============================================================

const RUTA = 'config/admin.json';
let cache = null;

function valido(datos){
  return datos && typeof datos.passwordHash === 'string' && datos.passwordHash.startsWith('pbkdf2$');
}

async function leer(){
  // 1) Módulo JSON. Lo resuelve el bundler (esbuild en Netlify, que lo deja
  //    inline en la función) o el runtime: Node 22+, Deno, Bun, Workers.
  try{
    const modulo = await import('../config/admin.json', { with: { type: 'json' } });
    if(valido(modulo?.default)) return modulo.default;
  }catch{ /* sigue */ }

  // 2) Archivo al lado del código. Sirve en Node/Deno/Bun sin bundle.
  try{
    const { readFile } = await import('node:fs/promises');
    const datos = JSON.parse(await readFile(new URL(`../${RUTA}`, import.meta.url), 'utf8'));
    if(valido(datos)) return datos;
  }catch{ /* sigue */ }

  // 3) Archivo desde la raíz del proyecto, que es como lo ve una función
  //    empaquetada (Netlify con included_files, Vercel, un Express propio).
  try{
    const { readFile } = await import('node:fs/promises');
    const datos = JSON.parse(await readFile(`${process.cwd()}/${RUTA}`, 'utf8'));
    if(valido(datos)) return datos;
  }catch{ /* sigue */ }

  return null;
}

// Devuelve { passwordHash, ... } o null si el archivo no está o está mal.
export async function credenciales(){
  if(!cache) cache = await leer();
  return cache;
}
