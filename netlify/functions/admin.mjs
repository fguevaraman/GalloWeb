// Adaptador de Netlify. Toda la lógica vive en api/admin.mjs.
// Para mudarse a otra plataforma se escribe un archivo equivalente:
//
//   Vercel      export const config = { runtime:'edge' };
//               export default req => manejar(req, process.env);
//   Cloudflare  export default { fetch: (req, env) => manejar(req, env) };
//   Deno Deploy Deno.serve(req => manejar(req, Deno.env.toObject()));

import { manejar } from '../../api/admin.mjs';

export default async (request) => manejar(request, process.env);

export const config = { path: '/api/admin' };
