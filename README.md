# GALLO · Servicio Mecánico — Sitio web

Sitio institucional + catálogo de productos con **panel de administración** para el taller mecánico **Gallo** (Ituzaingó 371, Rosario).

- **Frontend:** HTML/CSS/JS estático, sin build step.
- **Datos:** `productos.json`, `categorias.json` y las imágenes viven **en el disco del hosting**, al lado del sitio.
- **Escritura:** un archivo PHP (`api/admin.php`) que valida y guarda. Sin base de datos.
- **Ventas:** catálogo con botón *Consultar por WhatsApp* (sin carrito ni pago online).

Al guardar desde el panel, el cambio **ya está publicado**: no hay build, no hay deploy, no hay servicio externo que pueda quedarse sin créditos. No hay base de datos que mantener ni costo mensual más allá del hosting.

## Cómo está armado

```
index.html · servicios.html · productos.html · contacto.html   ← sitio público
admin.html                        ← panel (login + ABM + guía de uso)
productos.json                    ← el catálogo (datos)
categorias.json                   ← las categorías
assets/productos/                 ← imágenes subidas desde el panel
config/admin.json                 ← hash de la contraseña  (no se sirve por web)
datos/                            ← lo genera el panel     (no se sirve por web)
  clave-sesion.php                   clave para firmar sesiones, se crea sola
  historial/                         últimas 20 versiones del catálogo
api/admin.php                     ← backend: valida y escribe en el disco
.htaccess                         ← lo único atado al servidor web
tools/hash-password.mjs           ← genera/cambia la contraseña
```

**La lectura no toca ningún backend:** `productos.html` hace `fetch('productos.json')`, que es un archivo estático. El buscador, el filtro por categoría y el paginado corren en el navegador sobre ese archivo. Funciona igual en cualquier hosting, incluso en uno sin PHP.

**La escritura es lo único que necesita servidor**, y es un solo archivo: `api/admin.php`.

## Páginas

| Archivo | Descripción |
|---|---|
| `index.html` | Home institucional (hero, servicios, nosotros, medios de pago) |
| `servicios.html` | Detalle de todos los servicios del taller |
| `productos.html` | Catálogo: buscador, filtro por categoría y paginado (30 / 50 / todos) |
| `contacto.html` | Dirección, horarios, WhatsApp y mapa |
| `admin.html` | Panel: ABM de productos, ABM de categorías y guía de uso |

---

## Puesta en marcha

### 1. Generar la contraseña

```bash
node tools/hash-password.mjs "la-contraseña-del-dueño"
```

Escribe el hash PBKDF2 en `config/admin.json`. **La contraseña en sí no se guarda en ningún lado.** Para cambiarla, el mismo comando y volver a subir ese archivo.

> Mínimo 12 caracteres (el script no acepta menos). Como este repo es público, el hash se puede leer desde GitHub; lo único que separa a un curioso de la contraseña es el largo de la contraseña más las 210.000 iteraciones de PBKDF2.

### 2. Subir el sitio por FTP

La carpeta entera a la raíz del hosting (`public_html/` o similar). No hace falta compilar nada.

### 3. Permisos de escritura

El panel necesita poder escribir en tres lugares:

| Carpeta | Para qué |
|---|---|
| la raíz del sitio | `productos.json` y `categorias.json` |
| `assets/productos/` | las fotos que suben desde el panel |
| `datos/` | clave de sesión, historial y candado (se crea sola) |

En la mayoría de los hostings ya vienen así. Si no, en el administrador de archivos: carpetas **755**, archivos **644**.

### 4. Listo

Entrá a `/admin`, poné la contraseña y cargá productos. El cambio se ve en el sitio en el mismo momento.

---

## Cómo funciona el guardado

El panel trabaja sobre una copia en memoria del catálogo completo y al guardar manda **el estado final entero**. El servidor lo valida y lo escribe en este orden: primero las imágenes nuevas, después las categorías, y al final el catálogo. Cada archivo se escribe en un temporal y recién ahí se renombra, que es una operación atómica: **nunca queda un archivo a medio escribir**.

Dos guardados simultáneos (el celular y la computadora al mismo tiempo) no se pisan: el segundo espera al primero con un candado en `datos/guardado.lock`.

Las imágenes se redimensionan a 1200px y se convierten a **webp en el navegador** antes de subir: una foto de celular de 4MB queda en ~80KB. Cuando una imagen deja de usarse, se borra del disco en el mismo guardado.

Antes de cada cambio, el catálogo anterior se copia a `datos/historial/`. Se conservan las **últimas 20 versiones**, y el panel tiene además un botón **Descargar copia** que baja todo el catálogo como un archivo.

## Categorías

Viven en `categorias.json`, una lista de `id` + `nombre`:

```json
[
  { "id": "encendido", "nombre": "Encendido" },
  { "id": "frenos",    "nombre": "Frenos" }
]
```

- El `id` es lo que se guarda en cada producto (`"categoria": "frenos"`) y no cambia al renombrar. El `nombre` es lo único que se muestra.
- **Se administran desde el panel**, con el botón *Categorías*: alta, renombre, orden (con las flechas) y baja. También se puede editar el archivo a mano, es lo mismo.
- Si borrás una categoría que tiene productos, el panel avisa cuántos son y esos productos quedan **sin categoría**; los dos cambios viajan en el mismo guardado, así nunca queda un producto apuntando a una categoría que no existe.
- En el catálogo público el filtro muestra solo las categorías que tengan al menos un producto, con el total al lado. Los que no tienen caen en **Otros**.
- La categoría elegida queda en la URL (`productos.html?cat=frenos`), o sea que se puede mandar el link ya filtrado por WhatsApp.

## Seguridad

- La contraseña se verifica **en el servidor**, con PBKDF2-SHA256 y 210.000 iteraciones (recomendación OWASP). El costo de ~150ms por intento es además un freno a la fuerza bruta. El hash nunca llega al navegador.
- La sesión es un token firmado con HMAC-SHA256 que vence a las 12hs. No hay estado en el servidor.
- La clave de firma **se genera sola** la primera vez y vive en `datos/clave-sesion.php`. No está en el repo, es distinta en cada instalación, y cambiar la contraseña invalida las sesiones abiertas.
- `config/` y `datos/` no se sirven por web: cada una tiene su `.htaccess` con `Require all denied`. Como segunda línea de defensa, la clave de sesión es un `.php` que arranca con `exit`: si el `.htaccess` no estuviera, pedir ese archivo por web devuelve **vacío** en vez de la clave.
- Las imágenes se validan **por contenido** (bytes mágicos de webp/jpg/png), no por el nombre: no se puede subir un `.php` disfrazado.
- Todo lo que llega del panel se limpia: nombres y descripciones sin caracteres de control, precios numéricos, rutas de imagen sin `..`, y categorías que tienen que existir.

## Probar en local

Con Docker, sin instalar PHP:

```bash
docker run --rm -p 8080:80 -v "$PWD:/var/www/html" php:8.2-apache
# abrir http://localhost:8080
```

Ojo que eso escribe en los archivos de verdad. Para probar sin tocar nada, copiá el proyecto a otra carpeta y montá esa.

## Alternativa: hosting sin PHP (Netlify, Vercel, Cloudflare)

El repo conserva un backend equivalente en JavaScript (`api/*.mjs` + `netlify/functions/admin.mjs`) que, en vez de escribir en el disco, **commitea los cambios a este repositorio de GitHub** con la Git Data API. Sirve para hostings de solo estáticos, donde no hay disco donde escribir.

Tiene dos costos: cada cambio depende de que el hosting redeploye el sitio (con el plan gratuito de Netlify, si se acaban los créditos el sitio deja de actualizarse), y necesita `GITHUB_TOKEN` y `GITHUB_REPO` como variables de entorno.

El panel detecta solo cuál de los dos backends está disponible: prueba `api/admin.php` y, si no está, `/api/admin`. No hay nada que configurar al mudarse de uno al otro.

---

## Datos del negocio

- **Nombre:** Gallo — Servicio Mecánico · Repuestos y Servicios
- **Dirección:** Ituzaingó 371, Rosario, Santa Fe
- **WhatsApp:** 341-6684947 (se cambia en `js/config.js`)
- **Horarios:** Lunes a viernes de 8 a 12 y de 14 a 18 hs
