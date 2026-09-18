// ============================================================
//  Configuración del sitio — GALLO
//  Sin claves ni secretos: los datos son un archivo estático del repo,
//  la contraseña del panel está hasheada en config/admin.json (que el
//  navegador no puede leer) y el token de GitHub vive en el hosting.
// ============================================================

// De dónde sale el catálogo. Es un archivo del repo, así que se sirve
// igual en Netlify, Vercel, Cloudflare Pages, GitHub Pages o Apache.
export const RUTA_CATALOGO = 'productos.json';

// Las categorías con las que se agrupan los productos. Mismo criterio:
// archivo del repo, editable a mano o desde el panel.
export const RUTA_CATEGORIAS = 'categorias.json';

// Endpoints posibles del panel, en orden. El primero que conteste es el que
// queda: el mismo panel anda en un hosting con PHP (donde los datos se
// escriben en el disco) y en uno con Node, sin tocar una línea.
export const API_ADMIN = ['api/admin.php', '/api/admin'];

// Datos del negocio (se usan para armar links de WhatsApp)
export const WHATSAPP = '5493416684947';

export const IMAGEN_POR_DEFECTO = 'assets/logo.jpg';

// Trae el catálogo. cache:'no-store' en el panel para ver siempre lo último.
export async function cargarCatalogo({ sinCache = false } = {}){
  const url = sinCache ? `${RUTA_CATALOGO}?t=${Date.now()}` : RUTA_CATALOGO;
  const respuesta = await fetch(url, sinCache ? { cache:'no-store' } : {});
  if(!respuesta.ok) throw new Error(`No se pudo leer el catálogo (${respuesta.status})`);
  const datos = await respuesta.json();
  return Array.isArray(datos) ? datos : [];
}

// Trae las categorías. Si el archivo no está o está roto devuelve una lista
// vacía: el catálogo tiene que seguir funcionando igual, sin filtro.
export async function cargarCategorias({ sinCache = false } = {}){
  const url = sinCache ? `${RUTA_CATEGORIAS}?t=${Date.now()}` : RUTA_CATEGORIAS;
  try{
    const respuesta = await fetch(url, sinCache ? { cache:'no-store' } : {});
    if(!respuesta.ok) return [];
    const datos = await respuesta.json();
    if(!Array.isArray(datos)) return [];
    return datos
      .filter(c => c && typeof c.id === 'string' && typeof c.nombre === 'string')
      .map(c => ({ id: c.id, nombre: c.nombre }));
  }catch{
    return [];
  }
}

export const nombreCategoria = (categorias, id) =>
  categorias.find(c => c.id === id)?.nombre || '';

// Escapa texto antes de meterlo en innerHTML
export function esc(valor){
  return String(valor ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function formatPrecio(n){
  if(n === null || n === undefined || n === '') return 'Consultar';
  const num = Number(n);
  if(Number.isNaN(num)) return 'Consultar';
  return '$' + num.toLocaleString('es-AR');
}

export function waProducto(nombre){
  const txt = `Hola Gallo! Quiero consultar por: ${nombre}`;
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(txt)}`;
}
