# GALLO · Servicio Mecánico — Sitio web

Sitio institucional + catálogo de productos con **panel de administración** para el taller mecánico **Gallo** (Ituzaingó 371, Rosario).

- **Frontend:** HTML/CSS/JS estático, sin build step.
- **Datos:** `productos.json` y las imágenes viven **en este repo**. GitHub hace de base de datos.
- **Escritura:** una función chica y portable (`api/`) que commitea los cambios del panel.
- **Ventas:** catálogo con botón *Consultar por WhatsApp* (sin carrito ni pago online).

No hay base de datos que mantener, no hay servicio que se pause por inactividad y no hay costo mensual.

## Cómo está armado

```
productos.json          ← el catálogo (datos)
assets/productos/       ← imágenes subidas desde el panel
api/                    ← núcleo portable: (Request, env) -> Response
  admin.mjs               lógica del panel
  auth.mjs                PBKDF2 + sesión firmada (solo WebCrypto)
  github.mjs              escribe en el repo con la Git Data API
netlify/functions/      ← adaptador del hosting (12 líneas)
tools/hash-password.mjs ← genera las variables de entorno
```

**La lectura no toca ningún servidor:** `productos.html` hace `fetch('productos.json')`, que es un archivo estático. Funciona igual en Netlify, Vercel, Cloudflare Pages, GitHub Pages o un Apache propio.

**La escritura es lo único atado a la plataforma**, y está aislada en un adaptador. Para mudarse hay que escribir el equivalente a `netlify/functions/admin.mjs`; `api/` no se toca. Los ejemplos para Vercel, Cloudflare y Deno están comentados en ese mismo archivo.

## Páginas

| Archivo | Descripción |
|---|---|
| `index.html` | Home institucional (hero, servicios, nosotros, medios de pago) |
| `servicios.html` | Detalle de todos los servicios del taller |
| `productos.html` | Catálogo (se carga desde `productos.json`) |
| `contacto.html` | Dirección, horarios, WhatsApp y mapa |
| `admin.html` | Panel de administración (login + alta/edición/baja de productos) |

---

## Puesta en marcha del panel

### 1. Generar las credenciales

```bash
node tools/hash-password.mjs "la-contraseña-del-dueño"
```

Imprime `ADMIN_PASSWORD_HASH` y `SESSION_SECRET`. **La contraseña en sí no se guarda en ningún lado** — solo su hash PBKDF2, y el hash vive en el hosting, nunca en el repo ni en el navegador.

### 2. Crear el token de GitHub

GitHub → *Settings* → *Developer settings* → **Fine-grained personal access tokens** → *Generate new token*:

- **Repository access:** solo este repositorio.
- **Permissions:** *Contents* → **Read and write**. Nada más.
- **Expiration:** lo que prefieras (hay que renovarlo al vencer).

### 3. Cargar las variables de entorno en el hosting

En Netlify: *Site configuration* → *Environment variables*.

| Variable | Valor |
|---|---|
| `ADMIN_PASSWORD_HASH` | lo que imprimió el paso 1 |
| `SESSION_SECRET` | lo que imprimió el paso 1 |
| `GITHUB_TOKEN` | el token del paso 2 |
| `GITHUB_REPO` | `fguevaraman/GalloWeb` |
| `GITHUB_BRANCH` | `main` (opcional) |

### 4. Listo

Entrá a `/admin`, poné la contraseña y cargá productos. Al guardar, el panel commitea al repo y el hosting redeploya solo: el cambio se ve en el sitio público en menos de un minuto.

---

## Cómo funciona el guardado

El panel trabaja sobre una copia en memoria del catálogo completo y al guardar manda **el estado final entero**. El servidor lo valida, resuelve las imágenes nuevas y escribe todo en **un solo commit**. Si algo falla, no queda nada a medias.

Las imágenes se redimensionan a 1200px y se convierten a **webp en el navegador** antes de subir: una foto de celular de 4MB queda en ~80KB. Cuando una imagen deja de usarse, se borra del repo en el mismo commit.

Como cada cambio es un commit, **todo el historial queda en git**: si el dueño borra algo por error, se recupera con un `git revert`.

## Seguridad

- La contraseña se verifica **en el servidor**. El hash nunca llega al navegador.
- PBKDF2-SHA256 con 210.000 iteraciones (recomendación OWASP). El costo de ~150ms por intento es además un freno a la fuerza bruta.
- La sesión es un token firmado con HMAC-SHA256 que vence a las 12hs. No hay estado en el servidor.
- El `GITHUB_TOKEN` vive solo en las variables de entorno del hosting y está limitado a *Contents* de este repo.

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

Para otro hosting: publicar la raíz del repo como estático y montar `api/admin.mjs` en la ruta `/api/admin` con el adaptador que corresponda.

---

## Datos del negocio

- **Nombre:** Gallo — Servicio Mecánico · Repuestos y Servicios
- **Dirección:** Ituzaingó 371, Rosario, Santa Fe
- **WhatsApp:** 341-6684947 (se cambia en `js/config.js`)
- **Horarios:** Lunes a viernes de 8 a 12 y de 14 a 18 hs
