// Genera (o cambia) la contraseña del panel.
//
//   node tools/hash-password.mjs "la-contraseña-del-dueño"
//
// Escribe el hash en config/admin.json. Después: commit y push, y en el
// próximo deploy la contraseña nueva ya está andando. La contraseña en sí
// no queda guardada en ningún lado, ni acá ni en el hosting.

import { writeFile } from 'node:fs/promises';
import { crearHash } from '../api/auth.mjs';

const ARCHIVO = new URL('../config/admin.json', import.meta.url);
const password = process.argv[2];

if(!password){
  console.error('Uso: node tools/hash-password.mjs "tu-contraseña"');
  process.exit(1);
}
if(password.length < 12){
  console.error('Usá una contraseña de 12 caracteres o más: el hash queda en el repo,');
  console.error('así que la única defensa real es que la contraseña sea larga.');
  process.exit(1);
}

const datos = {
  _nota: 'Contraseña del panel, hasheada. Para cambiarla: node tools/hash-password.mjs "nueva-contraseña"',
  passwordHash: await crearHash(password),
  actualizado: new Date().toISOString().slice(0, 10)
};

await writeFile(ARCHIVO, JSON.stringify(datos, null, 2) + '\n');

console.log('\n✓ config/admin.json actualizado.\n');
console.log('  Falta commitear el cambio para que llegue al sitio:');
console.log('    git add config/admin.json && git commit -m "Cambio de contraseña del panel" && git push\n');
console.log('  (el único dato que sigue viviendo en el hosting es GITHUB_TOKEN)\n');
