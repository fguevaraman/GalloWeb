import { cargarCatalogo, formatPrecio, waProducto, esc, IMAGEN_POR_DEFECTO } from './config.js';

const grid   = document.getElementById('grid');
const search = document.getElementById('search');
const empty  = document.getElementById('empty');

let productos = [];

function card(p){
  const imgs  = (Array.isArray(p.imagenes) ? p.imagenes : []).filter(Boolean);
  const cover = imgs[0] || IMAGEN_POR_DEFECTO;
  const dots  = imgs.length > 1
    ? `<div class="p-dots">${imgs.map((_, i) => `<span class="${i === 0 ? 'on' : ''}" data-i="${i}"></span>`).join('')}</div>`
    : '';

  const el = document.createElement('article');
  el.className = 'p-card reveal in';
  el.innerHTML = `
    <div class="p-media">
      <img src="${esc(cover)}" alt="${esc(p.nombre || 'Producto')}" loading="lazy">
      ${dots}
    </div>
    <div class="p-body">
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

function render(list){
  grid.innerHTML = '';
  if(!list.length){ empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.forEach(p => grid.appendChild(card(p)));
}

function applyFilter(){
  const q = (search.value || '').toLowerCase().trim();
  if(!q){ render(productos); return; }
  render(productos.filter(p =>
    (p.nombre || '').toLowerCase().includes(q) ||
    (p.descripcion || '').toLowerCase().includes(q)));
}

async function load(){
  try{
    productos = await cargarCatalogo();
    render(productos);
  }catch(err){
    console.error(err);
    empty.textContent = 'No pudimos cargar el catálogo. Consultanos por WhatsApp.';
    empty.style.display = 'block';
  }
}

search?.addEventListener('input', applyFilter);
load();
