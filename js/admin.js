// ============================================================
//  Panel de administración — GALLO
//
//  El panel trabaja sobre una copia en memoria del catálogo completo
//  y en cada guardado manda el estado final entero. El servidor lo
//  escribe en un solo commit, así que nunca queda a medio camino.
// ============================================================

import { API_ADMIN, cargarCatalogo, cargarCategorias, nombreCategoria,
         formatPrecio, esc, IMAGEN_POR_DEFECTO } from './config.js';

const $ = s => document.querySelector(s);
const MAX_IMG    = 3;
const LADO_MAX   = 1200;   // px del lado más largo
const CALIDAD    = 0.82;
const CLAVE_TOKEN = 'gallo.sesion';

const loginView = $('#login-view');
const dashView  = $('#dash-view');

let token     = sessionStorage.getItem(CLAVE_TOKEN) || null;
let productos = [];        // catálogo completo, en memoria
let categorias = [];       // las de categorias.json
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
    [productos, categorias] = await Promise.all([
      cargarCatalogo({ sinCache: true }),
      cargarCategorias({ sinCache: true })
    ]);
  }catch(err){
    lista.innerHTML = `<p class="muted">No se pudo leer el catálogo: ${esc(err.message)}</p>`;
    return;
  }
  llenarCombo();
  render();
}

// El combo del formulario sale siempre de categorias.json.
function llenarCombo(){
  const combo = $('#f-categoria');
  combo.innerHTML = '<option value="">Sin categoría</option>';
  categorias.forEach(c => {
    const opcion = document.createElement('option');
    opcion.value = c.id;
    opcion.textContent = c.nombre;
    combo.appendChild(opcion);
  });
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
        <span>${formatPrecio(p.precio)} · ${esc(etiquetaCategoria(p))} · ${imgs.length} imagen(es)</span>
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

// Un producto puede apuntar a una categoría que después se borró del archivo:
// se avisa en el listado en vez de hacer de cuenta que no tiene ninguna.
function etiquetaCategoria(p){
  if(!p.categoria) return 'Sin categoría';
  return nombreCategoria(categorias, p.categoria) || `${p.categoria} (no existe)`;
}

// ---------- Guardado ----------

function estado(mensaje, tono = 'info'){
  const barra = $('#estado');
  barra.textContent = mensaje;
  barra.dataset.tono = tono;
  barra.style.display = mensaje ? 'block' : 'none';
}

// Convierte las imágenes nuevas a base64 y manda el catálogo completo.
// Si se le pasan categorías, van en el mismo guardado (y en el mismo commit).
async function publicar(mensajeExito, cats = null){
  const archivos = [];
  const carga = productos.map(p => ({
    ...p,
    imagenes: (p.imagenes || []).map(img => {
      if(typeof img === 'string') return img;          // ya estaba en el repo
      archivos.push({ contenido: img.base64 });
      return `nueva:${archivos.length - 1}`;
    })
  }));

  const cuerpo = { accion:'guardar', token, productos: carga, archivos };
  if(cats) cuerpo.categorias = cats;

  estado('Guardando y publicando...');
  const datos = await api(cuerpo);
  productos = datos.productos;
  if(Array.isArray(datos.categorias)) categorias = datos.categorias;
  llenarCombo();
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

// ---------- Categorías ----------

// Se edita sobre un borrador: hasta que no se aprieta "Guardar categorías"
// no se toca ni el archivo ni el catálogo.
let borradorCats = [];

const enUso = id => productos.filter(p => p.categoria === id).length;

// Mismo slug que usa el servidor, para que el id sea el mismo de los dos lados.
function idDesde(nombre, usados){
  const base = nombre
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'categoria';
  let id = base, n = 2;
  while(usados.has(id)) id = `${base}-${n++}`;
  return id;
}

function abrirCats(){
  borradorCats = categorias.map(c => ({ ...c }));
  $('#cats-msg').textContent = '';
  $('#cat-nueva').value = '';
  renderCats();
  $('#modal-cats').classList.add('open');
}

const cerrarCats = () => $('#modal-cats').classList.remove('open');

function renderCats(){
  const lista = $('#cats-list');
  lista.innerHTML = '';
  if(!borradorCats.length){
    lista.innerHTML = '<p class="muted">Todavía no hay categorías.</p>';
    return;
  }

  borradorCats.forEach((c, i) => {
    const usos = enUso(c.id);
    const fila = document.createElement('div');
    fila.className = 'cat-row';
    fila.innerHTML = `
      <input type="text" maxlength="60" value="${esc(c.nombre)}">
      <span class="muted cat-uso">${usos} producto${usos === 1 ? '' : 's'}</span>
      <div class="cat-acciones">
        <button type="button" data-up title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-down title="Bajar" ${i === borradorCats.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-del title="Eliminar">✕</button>
      </div>`;

    fila.querySelector('input').addEventListener('input', e => { c.nombre = e.target.value; });
    fila.querySelector('[data-up]').addEventListener('click', () => mover(i, -1));
    fila.querySelector('[data-down]').addEventListener('click', () => mover(i, 1));
    fila.querySelector('[data-del]').addEventListener('click', () => {
      if(usos && !confirm(
        `${usos} producto(s) usan "${c.nombre}". Si la borrás quedan sin categoría. ¿Seguir?`)) return;
      borradorCats.splice(i, 1);
      renderCats();
    });
    lista.appendChild(fila);
  });
}

function mover(i, salto){
  const destino = i + salto;
  if(destino < 0 || destino >= borradorCats.length) return;
  [borradorCats[i], borradorCats[destino]] = [borradorCats[destino], borradorCats[i]];
  renderCats();
}

function agregarCat(){
  const entrada = $('#cat-nueva');
  const nombre = entrada.value.trim();
  const msg = $('#cats-msg');
  msg.textContent = '';
  if(!nombre){ msg.textContent = 'Poné un nombre.'; return; }

  const usados = new Set(borradorCats.map(c => c.id));
  const id = idDesde(nombre, usados);
  if(borradorCats.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())){
    msg.textContent = 'Ya existe una categoría con ese nombre.';
    return;
  }
  borradorCats.push({ id, nombre });
  entrada.value = '';
  entrada.focus();
  renderCats();
}

async function guardarCats(){
  const btn = $('#cats-save'), msg = $('#cats-msg');
  msg.textContent = '';

  const limpias = borradorCats.map(c => ({ ...c, nombre: c.nombre.trim() }));
  if(limpias.some(c => !c.nombre)){ msg.textContent = 'Hay una categoría sin nombre.'; return; }

  // Los productos de una categoría borrada quedan sin categoría, y eso viaja
  // en el mismo guardado: el servidor no acepta un producto apuntando a una
  // categoría que ya no existe.
  const vivas = new Set(limpias.map(c => c.id));
  const respaldoProductos  = productos;
  const respaldoCategorias = categorias;
  productos = productos.map(p =>
    (p.categoria && !vivas.has(p.categoria)) ? { ...p, categoria: null } : p);

  btn.disabled = true; btn.textContent = 'Guardando...';
  try{
    await publicar('Categorías actualizadas.', limpias);
    cerrarCats();
  }catch(err){
    productos  = respaldoProductos;
    categorias = respaldoCategorias;
    render();
    msg.textContent = err.message;
  }finally{
    btn.disabled = false; btn.textContent = 'Guardar categorías';
  }
}

$('#cats-btn').addEventListener('click', abrirCats);
$('#cats-close').addEventListener('click', cerrarCats);
$('#modal-cats').addEventListener('click', e => { if(e.target.id === 'modal-cats') cerrarCats(); });
$('#cat-add').addEventListener('click', agregarCat);
$('#cat-nueva').addEventListener('keydown', e => {
  if(e.key === 'Enter'){ e.preventDefault(); agregarCat(); }
});
$('#cats-save').addEventListener('click', guardarCats);

// ---------- Formulario ----------

function abrirForm(p = null){
  editandoId = p?.id || null;
  $('#form-title').textContent = editandoId ? 'Editar producto' : 'Nuevo producto';
  $('#f-nombre').value = p?.nombre || '';
  $('#f-desc').value   = p?.descripcion || '';
  $('#f-precio').value = p?.precio ?? '';
  // Si la categoría guardada ya no está en el archivo, el combo queda en
  // "Sin categoría" y al guardar el producto se corrige.
  const combo = $('#f-categoria');
  combo.value = p?.categoria || '';
  if(combo.value !== (p?.categoria || '')) combo.value = '';
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
    categoria: $('#f-categoria').value || null,
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
