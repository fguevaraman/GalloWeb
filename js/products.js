import { supabase, CONFIGURED, TABLE, formatPrecio, waProducto } from './supabase.js';

const grid   = document.getElementById('grid');
const search = document.getElementById('search');
const empty  = document.getElementById('empty');

// Productos de ejemplo (se muestran hasta que configures Supabase)
const DEMO = [
  { nombre:'Kit de distribución', descripcion:'Kit completo con correa, tensor y rodillos. Todas las marcas.', precio:85000, imagenes:['assets/repuestos-marcas.webp'] },
  { nombre:'Juego de pastillas de freno', descripcion:'Pastillas delanteras. Nacionales e importadas, consultá tu modelo.', precio:42000, imagenes:['assets/servicios-lista.webp'] },
  { nombre:'Batería 12V', descripcion:'Batería nueva con garantía. Control de carga sin cargo.', precio:120000, imagenes:['assets/horarios.webp'] },
  { nombre:'Filtro de aceite + aceite', descripcion:'Combo de service. Filtro y 4L de aceite. Consultá especificación.', precio:38000, imagenes:['assets/pagos.webp'] },
];

let productos = [];

function card(p){
  const imgs = Array.isArray(p.imagenes) ? p.imagenes.filter(Boolean) : [];
  const cover = imgs[0] || 'assets/logo.jpg';
  const dots = imgs.length > 1
    ? `<div class="p-dots">${imgs.map((_,i)=>`<span class="${i===0?'on':''}" data-i="${i}"></span>`).join('')}</div>` : '';
  const el = document.createElement('article');
  el.className = 'p-card reveal in';
  el.innerHTML = `
    <div class="p-media">
      <img src="${cover}" alt="${p.nombre}" data-imgs='${JSON.stringify(imgs)}'>
      ${dots}
    </div>
    <div class="p-body">
      <h3>${p.nombre || 'Producto'}</h3>
      <p class="p-desc">${p.descripcion || ''}</p>
      <div class="p-foot">
        <span class="p-price">${formatPrecio(p.precio)}</span>
        <a class="btn btn-wa" href="${waProducto(p.nombre||'un producto')}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.06L2 22l5.06-1.33A10 10 0 1012 2z"/></svg>
          Consultar
        </a>
      </div>
    </div>`;

  // mini galería con puntos
  if(imgs.length > 1){
    const img = el.querySelector('img');
    el.querySelectorAll('.p-dots span').forEach(dot=>{
      dot.addEventListener('click', ()=>{
        const i = +dot.dataset.i;
        img.src = imgs[i];
        el.querySelectorAll('.p-dots span').forEach(d=>d.classList.remove('on'));
        dot.classList.add('on');
      });
    });
  }
  return el;
}

function render(list){
  grid.innerHTML = '';
  if(!list.length){ empty.style.display='block'; return; }
  empty.style.display='none';
  list.forEach(p => grid.appendChild(card(p)));
}

function applyFilter(){
  const q = (search.value||'').toLowerCase().trim();
  if(!q){ render(productos); return; }
  render(productos.filter(p =>
    (p.nombre||'').toLowerCase().includes(q) ||
    (p.descripcion||'').toLowerCase().includes(q)));
}

async function load(){
  if(!CONFIGURED){
    productos = DEMO;
    render(productos);
    const banner = document.getElementById('demo-banner');
    if(banner) banner.style.display='block';
    return;
  }
  const { data, error } = await supabase
    .from(TABLE).select('*').order('created_at',{ascending:false});
  if(error){ console.error(error); productos = DEMO; render(productos); return; }
  productos = data || [];
  render(productos);
}

search?.addEventListener('input', applyFilter);
load();
