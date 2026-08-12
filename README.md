# GALLO · Servicio Mecánico — Sitio web

Sitio institucional + catálogo de productos con **panel de administración** para el taller mecánico **Gallo** (Ituzaingó 371, Rosario).

- **Frontend:** HTML/CSS/JS estático (sin build step). Deploy en Netlify, Vercel o GitHub Pages.
- **Backend:** [Supabase](https://supabase.com) (gratis) — login del administrador, base de datos de productos y almacenamiento de imágenes.
- **Ventas:** catálogo con botón *Consultar por WhatsApp* (sin carrito ni pago online).

## Páginas

| Archivo | Descripción |
|---|---|
| `index.html` | Home institucional (hero, servicios, nosotros, medios de pago) |
| `servicios.html` | Detalle de todos los servicios del taller |
| `productos.html` | Catálogo de productos (se carga desde Supabase) |
| `contacto.html` | Dirección, horarios, WhatsApp y mapa |
| `admin.html` | Panel de administración (login + alta/edición/baja de productos) |

Mientras Supabase no esté configurado, `productos.html` muestra **productos de ejemplo** y `admin.html` avisa que falta la configuración.

---

## Puesta en marcha del panel (Supabase)

1. **Crear proyecto:** entrá a [supabase.com](https://supabase.com), creá una cuenta y un proyecto nuevo (gratis).
2. **Crear la base:** en el panel de Supabase → **SQL Editor** → *New query* → pegá todo el contenido de [`supabase-setup.sql`](./supabase-setup.sql) y ejecutá (**Run**). Esto crea la tabla `productos`, las políticas de seguridad y el bucket de imágenes.
3. **Crear el usuario admin:** Supabase → **Authentication** → **Users** → *Add user* → poné el email y contraseña del dueño. (Con esas credenciales se entra a `admin.html`.)
4. **Copiar credenciales:** Supabase → **Project Settings** → **API** → copiá **Project URL** y la clave **anon public**.
5. **Pegarlas en el sitio:** abrí `js/supabase.js` y reemplazá:
   ```js
   export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
   export const SUPABASE_ANON_KEY = 'TU-ANON-KEY';
   ```
6. Listo. Entrá a `admin.html`, iniciá sesión y cargá productos (nombre, descripción, precio y hasta 3 imágenes). Aparecen automáticamente en `productos.html`.

> La clave *anon* es **pública** por diseño; la seguridad la dan las políticas RLS del SQL (leer todos, escribir solo autenticados).

---

## Probar en local

Como usa módulos ES, servilo con un servidor (no `file://`):

```bash
cd Gallo
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Deploy en Netlify

1. Arrastrá la carpeta `Gallo` a [netlify.com/drop](https://app.netlify.com/drop), **o** conectá el repo.
2. `netlify.toml` ya define `publish = "."`. No hay build.
3. (Opcional) Cambiá el número de WhatsApp en `js/supabase.js` (`WHATSAPP`) y en los `.html` si hiciera falta.

---

## Datos del negocio

- **Nombre:** Gallo — Servicio Mecánico · Repuestos y Servicios
- **Dirección:** Ituzaingó 371, Rosario, Santa Fe, Argentina
- **WhatsApp / Consultas:** 341-6684947
- **Horarios:** Lunes a Viernes, de 8 a 12 y de 14 a 18 hs
- **Medios de pago:** todas las tarjetas · Mercado Pago

## Identidad visual

| Token | Valor |
|---|---|
| Navy fondo | `#10151F` / `#0B0F17` |
| Crema texto | `#EDE3CC` |
| Rojo insignia | `#C1352B` |
| Dorado ala | `#C99A5B` |
| Tipografías | Staatliches (display) · Barlow / Barlow Condensed (texto) · Kaushan Script (firma) |

Estética *vintage garage*, basada en el logo alado y las piezas gráficas de la marca.
