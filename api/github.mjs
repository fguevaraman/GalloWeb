// ============================================================
//  Cliente de GitHub — GALLO
//  GitHub hace de base de datos: productos.json y las imágenes viven
//  en el repo. Solo usa fetch(), así que corre en cualquier runtime.
//
//  Escribe todo en UN SOLO commit (Git Data API): si algo falla,
//  no queda un estado a medias.
// ============================================================

export function crearCliente(env){
  const repo   = env.GITHUB_REPO;                 // "usuario/repositorio"
  const rama   = env.GITHUB_BRANCH || 'main';
  const token  = env.GITHUB_TOKEN;
  const base   = `https://api.github.com/repos/${repo}`;

  async function api(ruta, opciones = {}){
    const respuesta = await fetch(base + ruta, {
      ...opciones,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'gallo-admin',
        ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
        ...opciones.headers
      }
    });
    if(!respuesta.ok){
      const detalle = (await respuesta.text()).slice(0, 300);
      throw new Error(`GitHub ${respuesta.status} en ${ruta}: ${detalle}`);
    }
    return respuesta.status === 204 ? null : respuesta.json();
  }

  const json = datos => JSON.stringify(datos);

  return {
    repo, rama,

    // Lee un archivo JSON del repo. Devuelve null si no existe.
    async leerJson(ruta){
      const respuesta = await fetch(
        `${base}/contents/${encodeURI(ruta)}?ref=${encodeURIComponent(rama)}`,
        { headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.raw',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'gallo-admin'
        }});
      if(respuesta.status === 404) return null;
      if(!respuesta.ok) throw new Error(`GitHub ${respuesta.status} al leer ${ruta}`);
      try{ return JSON.parse(await respuesta.text()); }
      catch{ throw new Error(`${ruta} no es JSON válido`); }
    },

    // archivos: [{ ruta, contenido, binario? }]  ·  borrados: [ruta]
    async commitear({ archivos = [], borrados = [], mensaje }){
      // 1. Dónde está parada la rama
      const ref = await api(`/git/ref/heads/${encodeURIComponent(rama)}`);
      const commitPadre = ref.object.sha;
      const { tree: { sha: arbolBase } } = await api(`/git/commits/${commitPadre}`);

      // 2. Un blob por archivo nuevo o modificado
      const entradas = [];
      for(const archivo of archivos){
        const blob = await api('/git/blobs', { method:'POST', body: json(
          archivo.binario
            ? { content: archivo.contenido, encoding: 'base64' }
            : { content: archivo.contenido, encoding: 'utf-8' }
        )});
        entradas.push({ path: archivo.ruta, mode:'100644', type:'blob', sha: blob.sha });
      }

      // sha en null = borrar el archivo respecto del árbol base
      for(const ruta of borrados){
        entradas.push({ path: ruta, mode:'100644', type:'blob', sha: null });
      }

      if(!entradas.length) return { sinCambios: true };

      // 3. Árbol, commit y mover la rama
      const arbol = await api('/git/trees', { method:'POST', body: json({
        base_tree: arbolBase, tree: entradas })});

      const commit = await api('/git/commits', { method:'POST', body: json({
        message: mensaje, tree: arbol.sha, parents: [commitPadre] })});

      // Sin force: si alguien más commiteó mientras tanto, GitHub rechaza
      // y el panel avisa en vez de pisar el cambio del otro.
      await api(`/git/refs/heads/${encodeURIComponent(rama)}`, {
        method:'PATCH', body: json({ sha: commit.sha, force: false })});

      return { commit: commit.sha };
    }
  };
}
