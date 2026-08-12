import { supabase, CONFIGURED, TABLE, BUCKET, formatPrecio } from './supabase.js';

const $ = s => document.querySelector(s);
const MAX_IMG = 3;

// Vistas
const notConfigured = $('#not-configured');
const loginView = $('#login-view');
const dashView  = $('#dash-view');

// Estado del formulario
let editingId = null;
let images = []; // { url?, file?, preview } — hasta 3

// ---------- Arranque ----------
if(!CONFIGURED){
  notConfigured.style.display = 'block';
} else {
  init();
}

async function init(){
  const { data:{ session } } = await supabase.auth.getSession();
  showAuth(session);
  supabase.auth.onAuthStateChange((_e, s) => showAuth(s));
}

function showAuth(session){
  if(session){
    loginView.style.display = 'none';
    dashView.style.display = 'block';
    $('#user-email').textContent = session.user.email;
    loadProducts();
  } else {
    loginView.style.display = 'flex';
    dashView.style.display = 'none';
  }
}

// ---------- Login ----------
$('#login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = $('#login-btn');
  const msg = $('#login-msg');
  msg.textContent = '';
  btn.disabled = true; btn.textContent = 'Ingresando...';
  const { error } = await supabase.auth.signInWithPassword({
    email: $('#email').value.trim(),
    password: $('#password').value
  });
  btn.disabled = false; btn.textContent = 'Ingresar';
  if(error){ msg.textContent = 'Email o contraseña incorrectos.'; }
});

$('#logout-btn').addEventListener('click', () => supabase.auth.signOut());

// ---------- Listado ----------
async function loadProducts(){
  const list = $('#prod-list');
  list.innerHTML = '<p class="muted">Cargando...</p>';
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at',{ascending:false});
  if(error){ list.innerHTML = `<p class="muted">Error: ${error.message}</p>`; return; }
  if(!data.length){ list.innerHTML = '<p class="muted">Todavía no hay productos. Creá el primero con “+ Nuevo producto”.</p>'; return; }
  list.innerHTML = '';
  data.forEach(p=>{
    const imgs = Array.isArray(p.imagenes)? p.imagenes.filter(Boolean):[];
    const row = document.createElement('div');
    row.className = 'prow';
    row.innerHTML = `
      <img src="${imgs[0]||'assets/logo.jpg'}" alt="">
      <div class="prow-info">
        <b>${p.nombre||'(sin nombre)'}</b>
        <span>${formatPrecio(p.precio)} · ${imgs.length} imagen(es)</span>
        <p>${p.descripcion||''}</p>
      </div>
      <div class="prow-actions">
        <button class="btn btn-ghost sm" data-edit>Editar</button>
        <button class="btn btn-red sm" data-del>Eliminar</button>
      </div>`;
    row.querySelector('[data-edit]').addEventListener('click', ()=>openForm(p));
    row.querySelector('[data-del]').addEventListener('click', ()=>removeProduct(p));
    list.appendChild(row);
  });
}

// ---------- Formulario (modal) ----------
function openForm(p=null){
  editingId = p?.id || null;
  $('#form-title').textContent = editingId ? 'Editar producto' : 'Nuevo producto';
  $('#f-nombre').value = p?.nombre || '';
  $('#f-desc').value = p?.descripcion || '';
  $('#f-precio').value = (p?.precio ?? '') === null ? '' : (p?.precio ?? '');
  images = (Array.isArray(p?.imagenes)? p.imagenes.filter(Boolean):[]).map(url=>({url, preview:url}));
  renderThumbs();
  $('#form-msg').textContent = '';
  $('#modal').classList.add('open');
}
function closeForm(){ $('#modal').classList.remove('open'); }
$('#new-btn').addEventListener('click', ()=>openForm());
$('#modal-close').addEventListener('click', closeForm);
$('#modal').addEventListener('click', e=>{ if(e.target.id==='modal') closeForm(); });

// Miniaturas + dropzone
function renderThumbs(){
  const box = $('#thumbs');
  box.innerHTML = '';
  images.forEach((img,i)=>{
    const t = document.createElement('div');
    t.className = 'thumb';
    t.innerHTML = `<img src="${img.preview}" alt=""><button type="button" data-i="${i}">✕</button>`;
    t.querySelector('button').addEventListener('click', ()=>{ images.splice(i,1); renderThumbs(); });
    box.appendChild(t);
  });
  $('#dropzone').style.display = images.length >= MAX_IMG ? 'none' : 'flex';
  $('#img-count').textContent = `${images.length}/${MAX_IMG}`;
}

const fileInput = $('#f-files');
$('#dropzone').addEventListener('click', ()=>fileInput.click());
fileInput.addEventListener('change', ()=>{
  [...fileInput.files].forEach(file=>{
    if(images.length >= MAX_IMG) return;
    if(!file.type.startsWith('image/')) return;
    images.push({ file, preview: URL.createObjectURL(file) });
  });
  fileInput.value = '';
  renderThumbs();
});

// Guardar
$('#prod-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = $('#save-btn'), msg = $('#form-msg');
  const nombre = $('#f-nombre').value.trim();
  if(!nombre){ msg.textContent = 'Poné un nombre.'; return; }
  btn.disabled = true; btn.textContent = 'Guardando...';
  msg.textContent = '';
  try{
    // Subir imágenes nuevas
    const urls = [];
    for(const img of images){
      if(img.url){ urls.push(img.url); continue; }
      const clean = img.file.name.replace(/[^\w.\-]/g,'_');
      const path = `${Date.now()}-${Math.random().toString(36).slice(2,7)}-${clean}`;
      const { error:upErr } = await supabase.storage.from(BUCKET).upload(path, img.file, {cacheControl:'3600', upsert:false});
      if(upErr) throw upErr;
      const { data:{ publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      urls.push(publicUrl);
    }
    const precioRaw = $('#f-precio').value.trim();
    const payload = {
      nombre,
      descripcion: $('#f-desc').value.trim(),
      precio: precioRaw === '' ? null : Number(precioRaw),
      imagenes: urls
    };
    let res;
    if(editingId){ res = await supabase.from(TABLE).update(payload).eq('id', editingId); }
    else { res = await supabase.from(TABLE).insert(payload); }
    if(res.error) throw res.error;
    closeForm();
    loadProducts();
  }catch(err){
    console.error(err);
    msg.textContent = 'Error al guardar: ' + (err.message || err);
  }finally{
    btn.disabled = false; btn.textContent = 'Guardar producto';
  }
});

// Eliminar
async function removeProduct(p){
  if(!confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabase.from(TABLE).delete().eq('id', p.id);
  if(error){ alert('Error al eliminar: ' + error.message); return; }
  loadProducts();
}
