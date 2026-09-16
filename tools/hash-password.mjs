// Genera el valor de ADMIN_PASSWORD_HASH y un SESSION_SECRET.
//
//   node tools/hash-password.mjs "la-contraseña-del-dueño"
//
// Pegá el resultado en las variables de entorno del hosting.
// La contraseña en sí no queda guardada en ningún lado.

import { crearHash } from '../api/auth.mjs';

const password = process.argv[2];

if(!password){
  console.error('Uso: node tools/hash-password.mjs "tu-contraseña"');
  process.exit(1);
}
if(password.length < 10){
  console.error('Usá una contraseña de 10 caracteres o más.');
  process.exit(1);
}

const secreto = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

console.log('\nVariables de entorno para el hosting:\n');
console.log(`ADMIN_PASSWORD_HASH=${await crearHash(password)}`);
console.log(`SESSION_SECRET=${secreto}`);
console.log('\nFaltan además GITHUB_TOKEN y GITHUB_REPO (ver README).\n');
