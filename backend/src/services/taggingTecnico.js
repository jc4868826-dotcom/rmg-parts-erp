/**
 * RMG Parts — Motor de tagging técnico Vistony (Cotizador Manual, 2026-09-15)
 *
 * Lee la base de conocimiento generada a mano por Claude + verificada por JC
 * (productos_tagging.json, 30 fichas técnicas Vistony reales) y la usa como
 * SEÑAL TÉCNICA EXTRA sobre lo que el usuario escribe a mano en el Cotizador
 * Manual — antes de pedirle un SKU al motor de matching de lista_precios
 * (chilecompraScoring.buscarSkuCandidato), que es el que de verdad decide
 * precio/SKU. Este módulo nunca inventa un SKU: solo aporta tipo_base real
 * (regla de oro: sintético solo si la ficha lo declara) y las alertas ya
 * cargadas en el tagging (alerta_tipo_base, alerta_sku) para que el
 * cotizador las muestre ANTES de que el usuario oferte el producto
 * equivocado — mismo espíritu que el resto de RMG Parts: mejor mostrar
 * "revisar a mano" que forzar un match que no corresponde.
 *
 * Carga el JSON una sola vez al importar el módulo (dato estático pequeño,
 * ~30 productos) — nunca se reconstruye por request, siguiendo la misma
 * convención del resto del catálogo (ver technical-learnings.md: catálogos
 * estáticos se cargan al inicio, no por request, por el límite de memoria
 * de la instancia Render).
 */
const path = require('path')
const fs = require('fs')

const DATA_PATH = path.join(__dirname, '../data/productos_tagging.json')

let _productos = null
try {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8')
  _productos = JSON.parse(raw).productos || []
} catch (err) {
  // No bloquea el arranque del servidor si el archivo aún no fue copiado —
  // el Cotizador Manual simplemente funciona sin la señal de tagging (cae
  // directo al motor de lista_precios), y queda log claro de por qué.
  console.warn(`⚠️  taggingTecnico: no se pudo cargar ${DATA_PATH} — el Cotizador Manual funcionará sin tagging técnico. Detalle: ${err.message}`)
  _productos = []
}

function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Umbral conservador — igual criterio que buscarSkuCandidato: mejor no
// aportar la señal de tagging que aportarla mal (ver chilecompraScoring.js).
const UMBRAL_SCORE = 0.34

/**
 * Busca, dentro de la base de conocimiento tageada, el producto cuyo
 * nombre/categoría/grados SAE-ISO mejor solapa con el texto libre que el
 * usuario escribió en el Cotizador Manual (ej. "Forza Plus 15W40 balde 20L").
 * Devuelve null si no hay ningún candidato razonable — nunca fuerza un
 * producto tageado solo porque fue "el menos malo".
 */
function buscarProductoTagging(texto) {
  const palabras = normalizar(texto).split(' ').filter(w => w.length >= 3)
  if (!palabras.length || !_productos.length) return null

  let mejor = null
  let mejorScore = 0
  for (const p of _productos) {
    const campo = normalizar([
      p.nombre_ficha,
      p.categoria,
      ...(p.grados_sae_iso || []),
    ].join(' '))
    if (!campo) continue
    let hits = 0
    for (const w of palabras) if (campo.includes(w)) hits++
    const score = hits / palabras.length
    if (score > mejorScore) { mejorScore = score; mejor = p }
  }

  if (!mejor || mejorScore < UMBRAL_SCORE) return null
  return { producto: mejor, score: mejorScore }
}

function todosLosProductos() {
  return _productos
}

module.exports = { buscarProductoTagging, todosLosProductos }
