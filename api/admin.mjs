// ============================================================
//  Panel de administración — núcleo portable
//
//  Firma Web estándar: (Request, env) -> Response.
//  No importa nada específico de una plataforma. Para mover el sitio
//  a otro host alcanza con escribir un adaptador de pocas líneas
//  (ver netlify/functions/admin.mjs).
//
//  La contraseña no es una variable de entorno: vive hasheada en
//  config/admin.json, adentro del repo (ver api/credenciales.mjs).
//
//  Variables de entorno necesarias:
//    GITHUB_TOKEN   token fine-grained, permiso Contents: read & write
//    GITHUB_REPO    "usuario/repositorio"
//    GITHUB_BRANCH  opcional, por defecto "main"
// ============================================================

import { verificarPassword, firmarSesion, verificarSesion } from './auth.mjs';
import { credenciales } from './credenciales.mjs';
import { crearCliente } from './github.mjs';

const RUTA_JSON     = 'productos.json';
const DIR_IMAGENES  = 'assets/productos';
const MAX_PRODUCTOS = 300;
const MAX_IMAGENES  = 3;
const MAX_BYTES_IMG = 1_500_000;      // ya llegan convertidas a webp desde el panel
const HORAS_SESION  = 12;

// Una imagen ya guardada, o un asset del sitio usado como ejemplo
const RUTA_EXISTENTE = /^assets\/[\w./-]+\.(webp|jpg|jpeg|png)$/i;
const RUTA_NUEVA     = /^nueva:(\d+)$/;

const responder = (datos, estado = 200) => new Response(JSON.stringify(datos), {
  status: estado,
  headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }
});

const error = (mensaje, estado = 400) => responder({ error: mensaje }, estado);

function texto(valor, max, { multilinea = false } = {}){
  // En descripciones conservamos el salto de línea (\u000A); el resto de los
  // caracteres de control se van siempre.
  const control = multilinea
    ? /[\u0000-\u0009\u000B-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  let s = String(valor ?? '').replace(control, '');
  s = multilinea
    ? s.replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
    : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

function slug(nombre){
  return (nombre || 'producto')
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'producto';
}

function faltaConfig(env){
  const faltan = ['GITHUB_TOKEN','GITHUB_REPO'].filter(clave => !env[clave]);
  return faltan.length ? faltan : null;
}

// La clave con la que se firman las sesiones sale del token de GitHub (que es
// secreto y ya tiene que estar configurado) más el hash de la contraseña. Así
// no hay un secreto más para administrar, nada secreto viaja en el repo, y
// cambiar la contraseña invalida solo las sesiones abiertas.
const claveSesion = (env, hash) => `${env.GITHUB_TOKEN}|${hash}|sesion-gallo`;

// Convierte lo que mandó el panel en el estado final del catálogo,
// resolviendo los "nueva:N" a rutas reales dentro del repo.
function normalizar(productos, archivosEntrantes){
  if(!Array.isArray(productos)) throw new Error('El catálogo tiene que ser una lista.');
  if(productos.length > MAX_PRODUCTOS) throw new Error(`Máximo ${MAX_PRODUCTOS} productos.`);

  const imagenesNuevas = [];   // { ruta, contenido, binario:true }
  const usadas = new Set();

  const limpios = productos.map((producto, indice) => {
    const nombre = texto(producto?.nombre, 120);
    if(!nombre) throw new Error(`El producto #${indice + 1} no tiene nombre.`);

    const precioCrudo = producto?.precio;
    let precio = null;
    if(precioCrudo !== null && precioCrudo !== undefined && precioCrudo !== ''){
      const numero = Number(precioCrudo);
      if(!Number.isFinite(numero) || numero < 0) throw new Error(`Precio inválido en "${nombre}".`);
      precio = Math.round(numero);
    }

    const entrantes = Array.isArray(producto?.imagenes) ? producto.imagenes : [];
    if(entrantes.length > MAX_IMAGENES) throw new Error(`"${nombre}" supera las ${MAX_IMAGENES} imágenes.`);

    const imagenes = entrantes.map(referencia => {
      const valor = String(referencia || '');

      if(RUTA_EXISTENTE.test(valor) && !valor.includes('..')){
        usadas.add(valor);
        return valor;
      }

      const nueva = RUTA_NUEVA.exec(valor);
      if(!nueva) throw new Error(`Imagen inválida en "${nombre}".`);

      const archivo = archivosEntrantes[Number(nueva[1])];
      if(!archivo?.contenido) throw new Error(`Falta el archivo de una imagen de "${nombre}".`);

      // base64 -> bytes aproximados, para cortar antes de mandarlo a GitHub
      const bytes = Math.floor(archivo.contenido.length * 3 / 4);
      if(bytes > MAX_BYTES_IMG) throw new Error(`Una imagen de "${nombre}" pesa demasiado.`);

      const ruta = `${DIR_IMAGENES}/${slug(nombre)}-${Date.now().toString(36)}-${
        Math.random().toString(36).slice(2, 7)}.webp`;
      imagenesNuevas.push({ ruta, contenido: archivo.contenido, binario: true });
      usadas.add(ruta);
      return ruta;
    });

    return {
      id: texto(producto?.id, 64) || `p-${Date.now().toString(36)}-${indice}`,
      nombre,
      descripcion: texto(producto?.descripcion, 600, { multilinea: true }),
      precio,
      imagenes
    };
  });

  return { limpios, imagenesNuevas, usadas };
}

export async function manejar(request, env){
  if(request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if(request.method !== 'POST')    return error('Method Not Allowed', 405);

  const faltan = faltaConfig(env);
  if(faltan) return error(`Faltan variables de entorno: ${faltan.join(', ')}`, 500);

  let cuerpo;
  try{ cuerpo = await request.json(); }
  catch{ return error('El cuerpo tiene que ser JSON.'); }

  const admin = await credenciales();
  if(!admin) return error('Falta config/admin.json o el hash que tiene adentro es inválido. '
    + 'Generalo con: node tools/hash-password.mjs "tu-contraseña"', 500);

  // ---------- Login ----------
  if(cuerpo.accion === 'login'){
    const ok = await verificarPassword(String(cuerpo.password || ''), admin.passwordHash);
    if(!ok) return error('Contraseña incorrecta.', 401);
    return responder({
      token: await firmarSesion(claveSesion(env, admin.passwordHash), HORAS_SESION),
      expiraEn: HORAS_SESION * 3600_000
    });
  }

  // ---------- De acá en adelante hace falta sesión válida ----------
  const autorizado = await verificarSesion(claveSesion(env, admin.passwordHash), cuerpo.token);
  if(!autorizado) return error('Sesión vencida. Volvé a ingresar.', 401);

  if(cuerpo.accion !== 'guardar') return error('Acción desconocida.');

  let normalizado;
  try{
    normalizado = normalizar(cuerpo.productos, Array.isArray(cuerpo.archivos) ? cuerpo.archivos : []);
  }catch(err){
    return error(err.message);
  }

  const { limpios, imagenesNuevas, usadas } = normalizado;
  const github = crearCliente(env);

  try{
    // Las imágenes que estaban en el catálogo y ya no se usan se borran del repo,
    // así no se acumulan archivos huérfanos. Solo tocamos assets/productos/.
    const anterior = (await github.leerJson(RUTA_JSON)) || [];
    const huerfanas = new Set();
    for(const producto of (Array.isArray(anterior) ? anterior : [])){
      for(const imagen of (producto?.imagenes || [])){
        if(typeof imagen === 'string' && imagen.startsWith(`${DIR_IMAGENES}/`) && !usadas.has(imagen)){
          huerfanas.add(imagen);
        }
      }
    }

    const resultado = await github.commitear({
      archivos: [
        { ruta: RUTA_JSON, contenido: JSON.stringify(limpios, null, 2) + '\n' },
        ...imagenesNuevas
      ],
      borrados: [...huerfanas],
      mensaje: `Catálogo: ${limpios.length} producto(s) desde el panel`
    });

    return responder({ ok: true, productos: limpios, commit: resultado.commit || null });
  }catch(err){
    const mensaje = String(err.message || err);
    if(mensaje.includes('422') || mensaje.includes('409')){
      return error('El repositorio cambió mientras guardabas. Recargá el panel y probá de nuevo.', 409);
    }
    return error(`No se pudo guardar: ${mensaje}`, 502);
  }
}
