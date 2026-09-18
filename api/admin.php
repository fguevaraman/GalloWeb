<?php
// ============================================================
//  Panel de administración — GALLO
//
//  Backend para hosting compartido. Los datos viven en el disco, al lado
//  del sitio: al guardar, el cambio ya está publicado. No hay base de
//  datos, no hay deploy y no hay ningún servicio externo de por medio.
//
//  Solo necesita PHP 7.4+ y que estas carpetas se puedan escribir:
//    ./  (productos.json y categorias.json)  ·  ./assets/productos  ·  ./datos
// ============================================================

declare(strict_types=1);

const RAIZ           = __DIR__ . '/..';
const RUTA_JSON      = 'productos.json';
const RUTA_CATEGS    = 'categorias.json';
const DIR_IMAGENES   = 'assets/productos';
const DIR_DATOS      = 'datos';
const MAX_PRODUCTOS  = 300;
const MAX_CATEGORIAS = 60;
const MAX_IMAGENES   = 3;
const MAX_BYTES_IMG  = 1500000;   // ya llegan convertidas desde el panel
const HORAS_SESION   = 12;
const VERSIONES      = 20;        // copias del catálogo que se conservan

// ---------- Respuestas ----------

function responder(array $datos, int $estado = 200): void {
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function error(string $mensaje, int $estado = 400): void {
    responder(['error' => $mensaje], $estado);
}

// ---------- Archivos ----------

function ruta(string $relativa): string {
    return RAIZ . '/' . ltrim($relativa, '/');
}

function leerJson(string $relativa) {
    $archivo = ruta($relativa);
    if (!is_file($archivo)) return null;
    $datos = json_decode((string) file_get_contents($archivo), true);
    return is_array($datos) ? $datos : null;
}

// Se escribe en un temporal y recién ahí se renombra: si algo falla a mitad
// de camino, el archivo que estaba sigue entero.
function escribirAtomico(string $relativa, string $contenido): void {
    $destino = ruta($relativa);
    $carpeta = dirname($destino);
    if (!is_dir($carpeta) && !@mkdir($carpeta, 0775, true)) {
        throw new RuntimeException("No se pudo crear la carpeta $carpeta.");
    }
    $temporal = $destino . '.tmp' . bin2hex(random_bytes(4));
    if (@file_put_contents($temporal, $contenido) === false || !@rename($temporal, $destino)) {
        @unlink($temporal);
        throw new RuntimeException("No se pudo escribir $relativa. Revisá los permisos de escritura.");
    }
    @chmod($destino, 0644);
}

function comoJson($datos): string {
    return json_encode($datos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
}

// Deja listas las carpetas de trabajo y protege las que no son públicas.
function prepararCarpetas(): void {
    foreach ([DIR_IMAGENES, DIR_DATOS, DIR_DATOS . '/historial'] as $carpeta) {
        if (!is_dir(ruta($carpeta))) @mkdir(ruta($carpeta), 0775, true);
    }
    foreach ([DIR_DATOS, 'config'] as $carpeta) {
        $guardia = ruta($carpeta . '/.htaccess');
        if (is_dir(ruta($carpeta)) && !is_file($guardia)) {
            @file_put_contents($guardia, "# Esta carpeta no se sirve por web.\n"
                . "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
                . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
        }
    }
}

// ---------- Contraseña y sesión ----------

function credenciales(): ?array {
    $datos = leerJson('config/admin.json');
    if (!$datos || !isset($datos['passwordHash']) || !is_string($datos['passwordHash'])) return null;
    return str_starts_with($datos['passwordHash'], 'pbkdf2$') ? $datos : null;
}

function verificarPassword(string $password, string $almacenado): bool {
    $partes = explode('$', $almacenado);
    if (count($partes) !== 4 || $partes[0] !== 'pbkdf2') return false;
    $iteraciones = (int) $partes[1];
    if ($iteraciones < 1000) return false;
    $salt = base64_decode($partes[2], true);
    $hash = base64_decode($partes[3], true);
    if ($salt === false || $hash === false) return false;
    $calculado = hash_pbkdf2('sha256', $password, $salt, $iteraciones, strlen($hash), true);
    return hash_equals($hash, $calculado);
}

// La clave con la que se firman las sesiones se genera sola la primera vez y
// vive en datos/, que no se sirve por web ni se commitea. Al cambiar la
// contraseña, el hash cambia y las sesiones abiertas se caen.
//
// El archivo es .php y arranca con un exit: si un día el .htaccess no está o
// el hosting no lo respeta, pedir el archivo por web ejecuta PHP y no
// devuelve nada, en vez de mostrar la clave.
const TAPA_PHP = "<?php exit; ?>\n";

function claveSesion(string $passwordHash): string {
    $relativa = DIR_DATOS . '/clave-sesion.php';
    $archivo  = ruta($relativa);
    if (!is_file($archivo)) {
        escribirAtomico($relativa, TAPA_PHP . base64_encode(random_bytes(32)));
        @chmod($archivo, 0600);
    }
    $contenido = (string) file_get_contents($archivo);
    return trim(substr($contenido, strlen(TAPA_PHP))) . '|' . $passwordHash;
}

function base64Url(string $binario): string {
    return rtrim(strtr(base64_encode($binario), '+/', '-_'), '=');
}

function deBase64Url(string $texto) {
    return base64_decode(strtr($texto, '-_', '+/'), true);
}

function firmarSesion(string $clave): string {
    $cuerpo = base64Url((string) json_encode(['exp' => (time() + HORAS_SESION * 3600) * 1000]));
    return $cuerpo . '.' . base64Url(hash_hmac('sha256', $cuerpo, $clave, true));
}

function verificarSesion(string $clave, $token): bool {
    if (!is_string($token)) return false;
    $partes = explode('.', $token);
    if (count($partes) !== 2) return false;
    $firma = deBase64Url($partes[1]);
    if ($firma === false || !hash_equals(hash_hmac('sha256', $partes[0], $clave, true), $firma)) return false;
    $cuerpo = json_decode((string) deBase64Url($partes[0]), true);
    return is_array($cuerpo) && isset($cuerpo['exp']) && time() * 1000 < $cuerpo['exp'];
}

// ---------- Limpieza de datos ----------

function texto($valor, int $max, bool $multilinea = false): string {
    $s = is_scalar($valor) ? (string) $valor : '';
    // En las descripciones se conserva el salto de línea; el resto de los
    // caracteres de control se van siempre.
    $s = preg_replace($multilinea ? '/[\x00-\x09\x0B-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u', '', $s) ?? '';
    $s = $multilinea
        ? preg_replace(['/ {2,}/u', '/\n{3,}/u'], [' ', "\n\n"], $s)
        : preg_replace('/\s+/u', ' ', $s);
    return mb_substr(trim((string) $s), 0, $max, 'UTF-8');
}

function aSlug(string $valor, int $max = 40): string {
    $s = (string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $valor);
    $s = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $s) ?? '');
    return substr(trim($s, '-'), 0, $max);
}

// El panel manda webp, pero un navegador viejo puede mandar png o jpg sin
// avisar: el tipo se decide por el contenido, no por lo que diga el nombre.
function extensionDeImagen(string $binario): ?string {
    if (str_starts_with($binario, "\xFF\xD8\xFF")) return 'jpg';
    if (str_starts_with($binario, "\x89PNG\r\n\x1A\n")) return 'png';
    if (str_starts_with($binario, 'RIFF') && substr($binario, 8, 4) === 'WEBP') return 'webp';
    return null;
}

function normalizarCategorias($lista): array {
    if (!is_array($lista) || array_values($lista) !== $lista) {
        throw new RuntimeException('Las categorías tienen que ser una lista.');
    }
    if (count($lista) > MAX_CATEGORIAS) {
        throw new RuntimeException('Máximo ' . MAX_CATEGORIAS . ' categorías.');
    }
    $vistos = [];
    $limpias = [];
    foreach ($lista as $i => $categoria) {
        $nombre = texto($categoria['nombre'] ?? '', 60);
        if ($nombre === '') throw new RuntimeException('La categoría #' . ($i + 1) . ' no tiene nombre.');
        $id = aSlug((string) ($categoria['id'] ?? '') !== '' ? (string) $categoria['id'] : $nombre);
        if ($id === '') throw new RuntimeException("\"$nombre\" no sirve como nombre de categoría.");
        if (isset($vistos[$id])) throw new RuntimeException("Hay dos categorías que quedarían con el mismo id (\"$id\").");
        $vistos[$id] = true;
        $limpias[] = ['id' => $id, 'nombre' => $nombre];
    }
    return $limpias;
}

// Devuelve [productos limpios, imágenes nuevas a escribir, rutas en uso].
function normalizar($productos, $archivos, ?array $categoriasValidas): array {
    if (!is_array($productos) || array_values($productos) !== $productos) {
        throw new RuntimeException('El catálogo tiene que ser una lista.');
    }
    if (count($productos) > MAX_PRODUCTOS) {
        throw new RuntimeException('Máximo ' . MAX_PRODUCTOS . ' productos.');
    }

    $limpios = [];
    $nuevas  = [];
    $usadas  = [];

    foreach ($productos as $indice => $producto) {
        $nombre = texto($producto['nombre'] ?? '', 120);
        if ($nombre === '') throw new RuntimeException('El producto #' . ($indice + 1) . ' no tiene nombre.');

        $precio = null;
        $precioCrudo = $producto['precio'] ?? null;
        if ($precioCrudo !== null && $precioCrudo !== '') {
            if (!is_numeric($precioCrudo) || (float) $precioCrudo < 0) {
                throw new RuntimeException("Precio inválido en \"$nombre\".");
            }
            $precio = (int) round((float) $precioCrudo);
        }

        $categoria = aSlug(texto($producto['categoria'] ?? '', 64), 64);
        if ($categoria !== '' && $categoriasValidas !== null && !isset($categoriasValidas[$categoria])) {
            throw new RuntimeException("La categoría de \"$nombre\" no existe en " . RUTA_CATEGS . '.');
        }

        $entrantes = $producto['imagenes'] ?? [];
        if (!is_array($entrantes)) $entrantes = [];
        if (count($entrantes) > MAX_IMAGENES) {
            throw new RuntimeException("\"$nombre\" supera las " . MAX_IMAGENES . ' imágenes.');
        }

        $imagenes = [];
        foreach ($entrantes as $referencia) {
            $valor = is_string($referencia) ? $referencia : '';

            // Una imagen que ya estaba guardada, o un asset del sitio.
            if (preg_match('#^assets/[\w./-]+\.(webp|jpg|jpeg|png)$#i', $valor) && !str_contains($valor, '..')) {
                $usadas[$valor] = true;
                $imagenes[] = $valor;
                continue;
            }

            if (!preg_match('/^nueva:(\d+)$/', $valor, $m)) {
                throw new RuntimeException("Imagen inválida en \"$nombre\".");
            }
            $archivo = $archivos[(int) $m[1]] ?? null;
            if (!is_array($archivo) || !isset($archivo['contenido']) || !is_string($archivo['contenido'])) {
                throw new RuntimeException("Falta el archivo de una imagen de \"$nombre\".");
            }
            $binario = base64_decode($archivo['contenido'], true);
            if ($binario === false) throw new RuntimeException("Una imagen de \"$nombre\" llegó rota.");
            if (strlen($binario) > MAX_BYTES_IMG) throw new RuntimeException("Una imagen de \"$nombre\" pesa demasiado.");

            $extension = extensionDeImagen($binario);
            if ($extension === null) throw new RuntimeException("Una imagen de \"$nombre\" no es una imagen válida.");

            $destino = DIR_IMAGENES . '/' . (aSlug($nombre) ?: 'producto') . '-'
                . base_convert((string) time(), 10, 36) . '-' . bin2hex(random_bytes(3)) . '.' . $extension;
            $nuevas[] = ['ruta' => $destino, 'binario' => $binario];
            $usadas[$destino] = true;
            $imagenes[] = $destino;
        }

        $limpios[] = [
            'id'          => texto($producto['id'] ?? '', 64) ?: ('p-' . base_convert((string) time(), 10, 36) . "-$indice"),
            'nombre'      => $nombre,
            'descripcion' => texto($producto['descripcion'] ?? '', 600, true),
            'precio'      => $precio,
            'categoria'   => $categoria !== '' ? $categoria : null,
            'imagenes'    => $imagenes,
        ];
    }

    return [$limpios, $nuevas, $usadas];
}

// Guarda una copia del catálogo anterior y deja solo las últimas VERSIONES.
function archivarVersion(): void {
    $actual = ruta(RUTA_JSON);
    if (!is_file($actual)) return;
    // El sufijo al azar evita que dos guardados en el mismo segundo se pisen.
    @copy($actual, ruta(DIR_DATOS . '/historial/productos-' . date('Ymd-His')
        . '-' . bin2hex(random_bytes(2)) . '.json'));

    $copias = glob(ruta(DIR_DATOS . '/historial/productos-*.json')) ?: [];
    sort($copias);
    foreach (array_slice($copias, 0, max(0, count($copias) - VERSIONES)) as $vieja) {
        @unlink($vieja);
    }
}

// ---------- Pedido ----------

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST')     error('Method Not Allowed', 405);

$cuerpo = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($cuerpo)) error('El cuerpo tiene que ser JSON.');

try {
    prepararCarpetas();
} catch (Throwable $e) {
    error('No se pudieron preparar las carpetas: ' . $e->getMessage(), 500);
}

$admin = credenciales();
if ($admin === null) {
    error('Falta config/admin.json o el hash que tiene adentro es inválido. '
        . 'Generalo con: node tools/hash-password.mjs "tu-contraseña"', 500);
}

try {
    $clave = claveSesion($admin['passwordHash']);
} catch (Throwable $e) {
    error('No se pudo preparar la sesión: ' . $e->getMessage(), 500);
}

$accion = $cuerpo['accion'] ?? '';

// ---------- Login ----------
if ($accion === 'login') {
    if (!verificarPassword((string) ($cuerpo['password'] ?? ''), $admin['passwordHash'])) {
        error('Contraseña incorrecta.', 401);
    }
    responder(['token' => firmarSesion($clave), 'expiraEn' => HORAS_SESION * 3600 * 1000]);
}

// ---------- De acá en adelante hace falta sesión válida ----------
if (!verificarSesion($clave, $cuerpo['token'] ?? null)) error('Sesión vencida. Volvé a ingresar.', 401);
if ($accion !== 'guardar') error('Acción desconocida.');

// Un solo guardado a la vez: si el dueño tiene el panel abierto en el
// celular y en la compu, el segundo espera en vez de pisar al primero.
$candado = @fopen(ruta(DIR_DATOS . '/guardado.lock'), 'c');
if ($candado === false || !flock($candado, LOCK_EX)) {
    error('No se pudo tomar el candado de guardado. Probá de nuevo.', 503);
}

try {
    $categoriasRepo = leerJson(RUTA_CATEGS);

    // El panel puede mandar las categorías junto con el catálogo: así crear
    // una categoría y asignarla a un producto entra en el mismo guardado.
    $categoriasFinales = null;
    if (array_key_exists('categorias', $cuerpo)) {
        $categoriasFinales = normalizarCategorias($cuerpo['categorias']);
    }

    $validas = null;
    if ($categoriasFinales !== null) {
        $validas = array_fill_keys(array_column($categoriasFinales, 'id'), true);
    } elseif (is_array($categoriasRepo) && $categoriasRepo) {
        $validas = array_fill_keys(array_filter(array_column($categoriasRepo, 'id')), true);
    }

    [$limpios, $nuevas, $usadas] = normalizar(
        $cuerpo['productos'] ?? null,
        is_array($cuerpo['archivos'] ?? null) ? $cuerpo['archivos'] : [],
        $validas
    );

    // 1. Las imágenes nuevas primero: si falla alguna, el catálogo no se tocó.
    $escritas = [];
    try {
        foreach ($nuevas as $imagen) {
            escribirAtomico($imagen['ruta'], $imagen['binario']);
            $escritas[] = $imagen['ruta'];
        }
    } catch (Throwable $e) {
        foreach ($escritas as $ruta) @unlink(ruta($ruta));
        throw $e;
    }

    // 2. Categorías, si cambiaron.
    if ($categoriasFinales !== null && comoJson($categoriasFinales) !== comoJson($categoriasRepo ?? [])) {
        escribirAtomico(RUTA_CATEGS, comoJson($categoriasFinales));
    }

    // 3. El catálogo, guardando antes una copia de la versión anterior.
    $anterior = leerJson(RUTA_JSON) ?? [];
    archivarVersion();
    escribirAtomico(RUTA_JSON, comoJson($limpios));

    // 4. Las imágenes que ya no usa nadie se borran, así no se acumulan.
    $borradas = 0;
    foreach ($anterior as $producto) {
        foreach ((array) ($producto['imagenes'] ?? []) as $imagen) {
            if (is_string($imagen) && str_starts_with($imagen, DIR_IMAGENES . '/') && !isset($usadas[$imagen])) {
                if (@unlink(ruta($imagen))) $borradas++;
            }
        }
    }

    responder([
        'ok'         => true,
        'productos'  => $limpios,
        'categorias' => $categoriasFinales ?? ($categoriasRepo ?: []),
        'guardado'   => date('c'),
        'borradas'   => $borradas,
    ]);
} catch (RuntimeException $e) {
    error($e->getMessage());
} catch (Throwable $e) {
    error('No se pudo guardar: ' . $e->getMessage(), 500);
} finally {
    flock($candado, LOCK_UN);
    fclose($candado);
}
