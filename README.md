# GALLO · Servicio Mecánico — Sitio web

Sitio institucional + catálogo de productos con **panel de administración** para el taller mecánico **Gallo** (Ituzaingó 371, Rosario).

- **Frontend:** HTML/CSS/JS estático, sin build step.
- **Datos:** `productos.json`, `categorias.json` y las imágenes viven **en este repo**. GitHub hace de base de datos.
- **Contraseña del panel:** hasheada en `config/admin.json`, otro archivo del repo. No es una variable de entorno de ningún hosting.
- **Escritura:** una función chica y portable (`api/`) que commitea los cambios del panel.
- **Ventas:** catálogo con botón *Consultar por WhatsApp* (sin carrito ni pago online).

No hay base de datos que mantener, no hay servicio que se pause por inactividad y no hay costo mensual.

## Cómo está armado

```
productos.json          ← el catálogo (datos)
categorias.json         ← las categorías con las que se agrupan los productos
config/admin.json       ← hash de la contraseña del panel
assets/productos/       ← imágenes subidas desde el panel
api/                    ← núcleo portable: (Request, env) -> Response
  admin.mjs               lógica del panel
  auth.mjs                PBKDF2 + sesión firmada (solo WebCrypto)
  credenciales.mjs        lee config/admin.json en cualquier runtime
  github.mjs              escribe en el repo con la Git Data API
netlify/functions/      ← adaptador del hosting (12 líneas)
tools/hash-password.mjs ← genera/cambia la contraseña
```

**La lectura no toca ningún servidor:** `productos.html` hace `fetch('productos.json')`, que es un archivo estático. Funciona igual en Netlify, Vercel, Cloudflare Pages, GitHub Pages o un Apache propio.

**La escritura es lo único atado a la plataforma**, y está aislada en un adaptador. Para mudarse hay que escribir el equivalente a `netlify/functions/admin.mjs`; `api/` no se toca. Los ejemplos para Vercel, Cloudflare y Deno están comentados en ese mismo archivo.

## Páginas

| Archivo | Descripción |
|---|---|
| `index.html` | Home institucional (hero, servicios, nosotros, medios de pago) |
| `servicios.html` | Detalle de todos los servicios del taller |
| `productos.html` | Catálogo: buscador, filtro por categoría y paginado (30 / 50 / todos) |
| `contacto.html` | Dirección, horarios, WhatsApp y mapa |
| `admin.html` | Panel de administración (login + ABM de productos y de categorías) |

---

## Puesta en marcha del panel

### 1. Generar la contraseña

```bash
node tools/hash-password.mjs "la-contraseña-del-dueño"
git add config/admin.json && git commit -m "Contraseña del panel" && git push
```

Escribe el hash PBKDF2 en `config/admin.json`. **La contraseña en sí no se guarda en ningún lado**, y el archivo no se sirve al navegador (ver `netlify.toml`). Para cambiarla, el mismo comando otra vez y un commit: en el próximo deploy ya rige la nueva, y las sesiones abiertas se caen solas.

> Elegí una contraseña larga (mínimo 12 caracteres, el script no acepta menos). Como este repo es público, el hash se puede leer desde GitHub; lo único que separa a un curioso de la contraseña es el largo de la contraseña más las 210.000 iteraciones de PBKDF2. Si el repo se pasa a privado, ni eso.

### 2. Crear el token de GitHub

GitHub → *Settings* → *Developer settings* → **Fine-grained personal access tokens** → *Generate new token*:

- **Repository access:** solo este repositorio.
- **Permissions:** *Contents* → **Read and write**. Nada más.
- **Expiration:** lo que prefieras (hay que renovarlo al vencer).

### 3. Cargar las variables de entorno en el hosting

Quedan solo las de GitHub, porque un token de escritura **no puede** ir en el repo (GitHub lo revoca apenas lo detecta en un commit). En Netlify: *Site configuration* → *Environment variables*.

| Variable | Valor |
|---|---|
| `GITHUB_TOKEN` | el token del paso 2 |
| `GITHUB_REPO` | `fguevaraman/GalloWeb` |
| `GITHUB_BRANCH` | `main` (opcional) |

La clave con la que se firman las sesiones no se configura: sale de `GITHUB_TOKEN` + el hash de la contraseña (`api/admin.mjs`). Un secreto menos para administrar y ninguno viajando en el repo.

### 4. Listo

Entrá a `/admin`, poné la contraseña y cargá productos. Al guardar, el panel commitea al repo y el hosting redeploya solo: el cambio se ve en el sitio público en menos de un minuto.

---

## Categorías

Viven en `categorias.json`, una lista de `id` + `nombre`:

```json
[
  { "id": "encendido", "nombre": "Encendido" },
  { "id": "frenos",    "nombre": "Frenos" }
]
```

- El `id` es lo que se guarda en cada producto (`"categoria": "frenos"`) y no debería cambiar: si lo cambiás, los productos que lo usaban quedan sueltos. El `nombre` sí se puede editar cuando quieras, es lo único que se muestra.
- **Se administran desde el panel**, con el botón *Categorías*: alta, renombre, orden (con las flechas) y baja. Al guardar, `categorias.json` se commitea igual que el catálogo. También se puede editar el archivo a mano, es lo mismo.
- Si borrás una categoría que tiene productos, el panel avisa cuántos son y esos productos quedan **sin categoría**; el cambio de las categorías y el de los productos viajan en el mismo commit, así nunca queda un producto apuntando a una categoría que no existe.
- El panel arma el desplegable del formulario con este archivo, y el servidor **rechaza** cualquier producto con una categoría que no exista acá.
- En el catálogo público el filtro muestra solo las categorías que tengan al menos un producto, con el total al lado. Los productos sin categoría (o con una categoría borrada del archivo) caen en **Otros**, así nunca quedan invisibles.
- La categoría elegida queda en la URL (`productos.html?cat=frenos`), o sea que se puede mandar el link ya filtrado por WhatsApp.

El paginado del catálogo es del lado del navegador: `productos.json` se baja entero una vez y la página lo corta de a 30, 50 o todos. Con cientos de productos sigue siendo un solo archivo chico.

## Cómo funciona el guardado

El panel trabaja sobre una copia en memoria del catálogo completo y al guardar manda **el estado final entero**. El servidor lo valida, resuelve las imágenes nuevas y escribe todo en **un solo commit**. Si algo falla, no queda nada a medias.

Las imágenes se redimensionan a 1200px y se convierten a **webp en el navegador** antes de subir: una foto de celular de 4MB queda en ~80KB. Cuando una imagen deja de usarse, se borra del repo en el mismo commit.

Como cada cambio es un commit, **todo el historial queda en git**: si el dueño borra algo por error, se recupera con un `git revert`.

## Seguridad

- La contraseña se verifica **en el servidor**. El hash nunca llega al navegador: `config/` no se sirve como estático.
- PBKDF2-SHA256 con 210.000 iteraciones (recomendación OWASP). El costo de ~150ms por intento es además un freno a la fuerza bruta.
- La sesión es un token firmado con HMAC-SHA256 que vence a las 12hs. No hay estado en el servidor.
- El `GITHUB_TOKEN` vive solo en las variables de entorno del hosting y está limitado a *Contents* de este repo. Es lo único que un atacante necesitaría para escribir en el repo, y es lo único que no está en el repo.
- Con el repo público, el hash de `config/admin.json` es visible en GitHub. Es aceptable para lo que es este panel, pero **la contraseña tiene que ser larga**; si el repo pasa a privado, el punto desaparece.

## Probar en local

Como usa módulos ES, servilo con un servidor (no `file://`):

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

El sitio público anda completo así. Para probar también el panel hace falta que corra la función:

```bash
netlify dev    # necesita las variables de entorno cargadas
```

## Deploy

`netlify.toml` ya define `publish = "."` y el directorio de funciones. No hay build step.

### Mudarse a otro hosting

La contraseña se muda sola: es un archivo del repo, no hay nada que volver a cargar en un panel de administración ajeno. Lo que hay que hacer en el hosting nuevo:

1. Publicar la raíz del repo como estático.
2. Montar `api/admin.mjs` en `/api/admin` con el adaptador de la plataforma (Vercel, Cloudflare y Deno están comentados en `netlify/functions/admin.mjs`).
3. Cargar `GITHUB_TOKEN` y `GITHUB_REPO`.
4. Bloquear `/config/*` para que no se sirva como estático (en Netlify es un redirect a 404; en Apache, un `Deny` en `.htaccess`).
5. Asegurarse de que `config/admin.json` viaje con la función. Si el hosting empaqueta con un bundler, el `import` de JSON de `api/credenciales.mjs` lo deja inline y no hay que hacer nada; si no, alcanza con que el archivo esté en el disco (Netlify lo fuerza con `included_files`). `credenciales.mjs` prueba las dos formas y una tercera desde la raíz del proyecto.

---

## Datos del negocio

- **Nombre:** Gallo — Servicio Mecánico · Repuestos y Servicios
- **Dirección:** Ituzaingó 371, Rosario, Santa Fe
- **WhatsApp:** 341-6684947 (se cambia en `js/config.js`)
- **Horarios:** Lunes a viernes de 8 a 12 y de 14 a 18 hs
