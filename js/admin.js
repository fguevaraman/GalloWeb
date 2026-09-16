// ============================================================
//  Panel de administración — GALLO
//
//  El panel trabaja sobre una copia en memoria del catálogo completo
//  y en cada guardado manda el estado final entero. El servidor lo
//  escribe en un solo commit, así que nunca queda a medio camino.
// ============================================================

import { API_ADMIN, cargarCatalogo, formatPrecio, esc, IMAGEN_POR_DEFECTO } from './config.js';

const $ = s => document.querySelector(s);
const MAX_IMG    = 3;
const LADO_MAX   = 1200;   // px del lado más largo
const CALIDAD    = 0.82;
const CLAVE_TOKEN = 'gallo.sesion';

const loginView = $('#login-view');
const dashView  = $('#dash-view');

let token     = sessionStorage.getItem(CLAVE_TOKEN) || null;
let productos = [];        // catálogo completo, en memoria
let editandoId = null;
let imagenes  = [];        // del producto abierto: { ruta } o { blob, preview }

// ---------- Llamadas a la API ----------

async function api(cuerpo){
  const respuesta = await fetch(API_ADMIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const datos = await respuesta.json().catch(() => ({}));
  if(!respuesta.ok){
    if(respuesta.status === 401 && cuerpo.accion !== 'login') cerrarSesion();
    throw new Error(datos.error || `Error ${respuesta.status}`);
  }
  return datos;
}

// ---------- Sesión ----------

function mostrarVista(){
  const dentro = Boolean(token);
  loginView.style.display = dentro ? 'none' : 'flex';
  dashView.style.display  = dentro ? 'block' : 'none';
  $('#logout-btn').style.display = dentro ? '' : 'none';
  $('#user-email').textContent   = dentro ? 'Sesión iniciada' : '';
}

function cerrarSesion(){
  token = null;
  sessionStorage.removeItem(CLAVE_TOKEN);
  mostrarVista();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn'), msg = $('#login-msg');
  msg.textContent = '';
  btn.disabled = true; btn.textContent = 'Ingresando...';
  try{
    const datos = await api({ accion:'login', password: $('#password').value });
    token = datos.token;
    sessionStorage.setItem(CLAVE_TOKEN, token);
    $('#password').value = '';
    mostrarVista();
    await cargarLista();
  }catch(err){
    msg.textContent = err.message;
  }finally{
    btn.disabled = false; btn.textContent = 'Ingresar';
  }
});

$('#logout-btn').addEventListener('click', cerrarSesion);

// ---------- Listado ----------

async function cargarLista(){
  const lista = $('#prod-list');
  lista.innerHTML = '<p class="muted">Cargando...</p>';
  try{
    productos = await cargarCatalogo({ sinCache: true });
  }catch(err){
    lista.innerHTML = `<p class="muted">No se pudo leer el catálogo: ${esc(err.message)}</p>`;
    return;
  }
  render();
}

function render(){
  const lista = $('#prod-list');
  if(!productos.length){
    lista.innerHTML = '<p class="muted">Todavía no hay productos. Creá el primero con “+ Nuevo producto”.</p>';
    return;
  }
  lista.innerHTML = '';
  productos.forEach(p => {
    const imgs = (p.imagenes || []).filter(Boolean);
    const fila = document.createElement('div');
    fila.className = 'prow';
    fila.innerHTML = `
      <img src="${esc(imgs[0] || IMAGEN_POR_DEFECTO)}" alt="">
      <div class="prow-info">
        <b>${esc(p.nombre || '(sin nombre)')}</b>
        <span>${formatPrecio(p.precio)} · ${imgs.length} imagen(es)</span>
        <p>${esc(p.descripcion || '')}</p>
      </div>
      <div class="prow-actions">
        <button class="btn btn-ghost sm" data-edit>Editar</button>
        <button class="btn btn-red sm" data-del>Eliminar</button>
      </div>`;
    fila.querySelector('[data-edit]').addEventListener('click', () => abrirForm(p));
    fila.querySelector('[data-del]').addEventListener('click', () => eliminar(p));
    lista.appendChild(fila);
  });
}

// ---------- Guardado ----------

function estado(mensaje, tono = 'info'){
  const barra = $('#estado');
  barra.textContent = mensaje;
  barra.dataset.tono = tono;
  barra.style.display = mensaje ? 'block' : 'none';
}

// Convierte las imágenes nuevas a base64 y manda el catálogo completo.
async function publicar(mensajeExito){
  const archivos = [];
  const carga = productos.map(p => ({
    ...p,
    imagenes: (p.imagenes || []).map(img => {
      if(typeof img === 'string') return img;          // ya estaba en el repo
      archivos.push({ contenido: img.base64 });
      return `nueva:${archivos.length - 1}`;
    })
  }));

  estado('Guardando y publicando...');
  const datos = await api({ accion:'guardar', token, productos: carga, archivos });
  productos = datos.productos;
  render();
  estado(`${mensajeExito} El sitio público se actualiza en menos de un minuto.`, 'ok');
}

async function eliminar(p){
  if(!confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
  const respaldo = productos;
  productos = productos.filter(x => x.id !== p.id);
  try{
    await publicar('Producto eliminado.');
  }catch(err){
    productos = respaldo;
    render();
    estado(err.message, 'error');
  }
}

// ---------- Formulario ----------

function abrirForm(p = null){
  editandoId = p?.id || null;
  $('#form-title').textContent = editandoId ? 'Editar producto' : 'Nuevo producto';
  $('#f-nombre').value = p?.nombre || '';
  $('#f-desc').value   = p?.descripcion || '';
  $('#f-precio').value = p?.precio ?? '';
  imagenes = (p?.imagenes || []).filter(Boolean)
    .map(ruta => ({ ruta, preview: ruta }));
  renderThumbs();
  $('#form-msg').textContent = '';
  $('#modal').classList.add('open');
}

function cerrarForm(){
  $('#modal').classList.remove('open');
  imagenes.forEach(i => { if(i.preview?.startsWith('blob:')) URL.revokeObjectURL(i.preview); });
  imagenes = [];
}

$('#new-btn').addEventListener('click', () => abrirForm());
$('#modal-close').addEventListener('click', cerrarForm);
$('#modal').addEventListener('click', e => { if(e.target.id === 'modal') cerrarForm(); });

function renderThumbs(){
  const caja = $('#thumbs');
  caja.innerHTML = '';
  imagenes.forEach((img, i) => {
    const t = document.createElement('div');
    t.className = 'thumb';
    t.innerHTML = `<img src="${esc(img.preview)}" alt=""><button type="button">✕</button>`;
    t.querySelector('button').addEventListener('click', () => {
      if(img.preview?.startsWith('blob:')) URL.revokeObjectURL(img.preview);
      imagenes.splice(i, 1);
      renderThumbs();
    });
    caja.appendChild(t);
  });
  $('#dropzone').style.display = imagenes.length >= MAX_IMG ? 'none' : 'flex';
  $('#img-count').textContent = `${imagenes.length}/${MAX_IMG}`;
}

// Redimensiona y convierte a webp en el navegador: las fotos del celular
// pasan de varios MB a ~80KB antes de subir nada.
async function aWebp(file){
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(bitmap.width  * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', CALIDAD));
  if(!blob) throw new Error('No se pudo procesar la imagen.');
  return blob;
}

function aBase64(blob){
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    lector.onload  = () => resolve(String(lector.result).split(',')[1]);
    lector.readAsDataURL(blob);
  });
}

const fileInput = $('#f-files');
$('#dropzone').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const msg = $('#form-msg');
  for(const file of [...fileInput.files]){
    if(imagenes.length >= MAX_IMG) break;
    if(!file.type.startsWith('image/')) continue;
    try{
      const blob = await aWebp(file);
      imagenes.push({ base64: await aBase64(blob), preview: URL.createObjectURL(blob) });
      renderThumbs();
    }catch(err){
      msg.textContent = `${file.name}: ${err.message}`;
    }
  }
  fileInput.value = '';
});

$('#prod-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#save-btn'), msg = $('#form-msg');
  const nombre = $('#f-nombre').value.trim();
  if(!nombre){ msg.textContent = 'Poné un nombre.'; return; }

  const precioCrudo = $('#f-precio').value.trim();
  const producto = {
    id: editandoId || (crypto.randomUUID?.() ?? `p-${Date.now()}`),
    nombre,
    descripcion: $('#f-desc').value.trim(),
    precio: precioCrudo === '' ? null : Number(precioCrudo),
    imagenes: imagenes.map(img => img.ruta ?? img)
  };

  const respaldo = productos;
  productos = editandoId
    ? productos.map(p => (p.id === editandoId ? producto : p))
    : [producto, ...productos];

  btn.disabled = true; btn.textContent = 'Guardando...';
  msg.textContent = '';
  try{
    await publicar(editandoId ? 'Producto actualizado.' : 'Producto creado.');
    cerrarForm();
  }catch(err){
    productos = respaldo;
    render();
    msg.textContent = err.message;
  }finally{
    btn.disabled = false; btn.textContent = 'Guardar producto';
  }
});

// ---------- Arranque ----------
mostrarVista();
if(token) cargarLista();
