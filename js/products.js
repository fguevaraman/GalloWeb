// ============================================================
//  Catálogo público — GALLO
//  Búsqueda, filtro por categoría y paginado, todo en el navegador
//  sobre el productos.json que ya se descargó entero.
// ============================================================

import { cargarCatalogo, cargarCategorias, nombreCategoria,
         formatPrecio, waProducto, esc, IMAGEN_POR_DEFECTO } from './config.js';

const grid    = document.getElementById('grid');
const search  = document.getElementById('search');
const empty   = document.getElementById('empty');
const filtro  = document.getElementById('cat-filter');
const pager   = document.getElementById('pager');
const pagerInfo  = document.getElementById('pager-info');
const pagerPages = document.getElementById('pager-pages');
const perPage    = document.getElementById('per-page');

const SIN_CATEGORIA = 'otros';   // valor del combo para los que no tienen

let productos  = [];
let categorias = [];
let pagina     = 1;

// 'todos' se guarda como Infinity: así el paginado es un caso solo.
const porPagina = () => (perPage.value === 'todos' ? Infinity : Number(perPage.value) || 30);

// ---------- Tarjeta ----------

function card(p){
  const imgs  = (Array.isArray(p.imagenes) ? p.imagenes : []).filter(Boolean);
  const cover = imgs[0] || IMAGEN_POR_DEFECTO;
  const dots  = imgs.length > 1
    ? `<div class="p-dots">${imgs.map((_, i) => `<span class="${i === 0 ? 'on' : ''}" data-i="${i}"></span>`).join('')}</div>`
    : '';
  const cat = nombreCategoria(categorias, p.categoria);

  const el = document.createElement('article');
  el.className = 'p-card reveal in';
  el.innerHTML = `
    <div class="p-media">
      <img src="${esc(cover)}" alt="${esc(p.nombre || 'Producto')}" loading="lazy">
      ${dots}
    </div>
    <div class="p-body">
      ${cat ? `<span class="p-cat">${esc(cat)}</span>` : ''}
      <h3>${esc(p.nombre || 'Producto')}</h3>
      <p class="p-desc">${esc(p.descripcion || '')}</p>
      <div class="p-foot">
        <span class="p-price">${formatPrecio(p.precio)}</span>
        <a class="btn btn-wa" href="${esc(waProducto(p.nombre || 'un producto'))}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.06L2 22l5.06-1.33A10 10 0 1012 2z"/></svg>
          Consultar
        </a>
      </div>
    </div>`;

  // mini galería con puntos
  if(imgs.length > 1){
    const img = el.querySelector('img');
    el.querySelectorAll('.p-dots span').forEach(dot => {
      dot.addEventListener('click', () => {
        img.src = imgs[+dot.dataset.i];
        el.querySelectorAll('.p-dots span').forEach(d => d.classList.remove('on'));
        dot.classList.add('on');
      });
    });
  }
  return el;
}

// ---------- Filtros ----------

// Un producto entra en "otros" si no tiene categoría o si apunta a una que
// ya no existe en categorias.json: así no queda escondido en ningún filtro.
const categoriaDe = p =>
  (p.categoria && categorias.some(c => c.id === p.categoria)) ? p.categoria : SIN_CATEGORIA;

function filtrados(){
  const q   = (search?.value || '').toLowerCase().trim();
  const cat = filtro?.value || '';
  return productos.filter(p => {
    if(cat && categoriaDe(p) !== cat) return false;
    if(!q) return true;
    return (p.nombre || '').toLowerCase().includes(q)
        || (p.descripcion || '').toLowerCase().includes(q);
  });
}

// El combo solo ofrece categorías que tengan algo adentro, con el número al
// lado. Una categoría creada y todavía vacía no ensucia el catálogo público.
function llenarFiltro(){
  const cuenta = new Map();
  productos.forEach(p => {
    const id = categoriaDe(p);
    cuenta.set(id, (cuenta.get(id) || 0) + 1);
  });

  const elegida = filtro.value;
  filtro.innerHTML = `<option value="">Todas las categorías (${productos.length})</option>`;

  const agregar = (id, nombre) => {
    if(!cuenta.get(id)) return;
    const opcion = document.createElement('option');
    opcion.value = id;
    opcion.textContent = `${nombre} (${cuenta.get(id)})`;
    filtro.appendChild(opcion);
  };

  categorias.forEach(c => agregar(c.id, c.nombre));
  agregar(SIN_CATEGORIA, 'Otros');

  // Si venía una categoría por URL y quedó sin productos, vuelve a "todas".
  filtro.value = elegida;
  if(filtro.value !== elegida) filtro.value = '';
}

// ---------- Paginado ----------

function botonesPagina(total){
  pagerPages.innerHTML = '';
  if(total <= 1) return;

  const boton = (texto, destino, { actual = false, inactivo = false } = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    if(actual) b.setAttribute('aria-current', 'page');
    b.disabled = inactivo || actual;
    if(!b.disabled) b.addEventListener('click', () => irA(destino));
    pagerPages.appendChild(b);
  };
  const puntos = () => {
    const s = document.createElement('span');
    s.className = 'gap';
    s.textContent = '…';
    pagerPages.appendChild(s);
  };

  boton('‹', pagina - 1, { inactivo: pagina === 1 });

  // Primera, última y una ventana alrededor de la actual: con 40 páginas
  // la barra no se desborda.
  const cerca = n => Math.abs(n - pagina) <= 1 || n === 1 || n === total;
  let saltado = false;
  for(let n = 1; n <= total; n++){
    if(cerca(n)){
      boton(String(n), n, { actual: n === pagina });
      saltado = false;
    }else if(!saltado){
      puntos();
      saltado = true;
    }
  }

  boton('›', pagina + 1, { inactivo: pagina === total });
}

function irA(n){
  pagina = n;
  render();
  // Al cambiar de página, arriba de la grilla y no donde quedó el scroll.
  document.querySelector('.toolbar')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

// ---------- Render ----------

function render(){
  const lista = filtrados();
  const tam   = porPagina();
  const total = Math.max(1, Math.ceil(lista.length / tam));
  if(pagina > total) pagina = total;

  const desde = (pagina - 1) * tam;
  const visibles = tam === Infinity ? lista : lista.slice(desde, desde + tam);

  grid.innerHTML = '';
  visibles.forEach(p => grid.appendChild(card(p)));

  empty.style.display = lista.length ? 'none' : 'block';

  // El paginador aparece solo cuando hay algo que paginar o algo que contar.
  pager.hidden = lista.length === 0;
  pagerInfo.textContent = visibles.length === lista.length
    ? `${lista.length} producto${lista.length === 1 ? '' : 's'}`
    : `Mostrando ${desde + 1}–${desde + visibles.length} de ${lista.length}`;
  botonesPagina(total);
}

// ---------- URL ----------

// La categoría queda en la URL para poder mandar el link ya filtrado.
function sincronizarUrl(){
  const url = new URL(location.href);
  if(filtro.value) url.searchParams.set('cat', filtro.value);
  else             url.searchParams.delete('cat');
  history.replaceState(null, '', url);
}

// ---------- Eventos ----------

search?.addEventListener('input', () => { pagina = 1; render(); });

filtro?.addEventListener('change', () => { pagina = 1; sincronizarUrl(); render(); });

perPage?.addEventListener('change', () => { pagina = 1; render(); });

// ---------- Arranque ----------

async function load(){
  try{
    [productos, categorias] = await Promise.all([cargarCatalogo(), cargarCategorias()]);
  }catch(err){
    console.error(err);
    empty.textContent = 'No pudimos cargar el catálogo. Consultanos por WhatsApp.';
    empty.style.display = 'block';
    return;
  }
  llenarFiltro();
  const cat = new URL(location.href).searchParams.get('cat');
  if(cat){
    filtro.value = cat;
    if(filtro.value !== cat) filtro.value = '';
  }
  render();
}

load();
