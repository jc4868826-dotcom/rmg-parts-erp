/**
 * RMG Parts — Motor de tagging técnico Vistony (Cotizador Manual, 2026-09-15)
 *
 * Lee la base de conocimiento generada a mano por Claude + verificada por JC
 * (productos_tagging.json, 30 fichas técnicas Vistony reales) y la usa como
 * SEGUNDA CAPA DE ALERTA sobre el cruce que YA hace el motor real
 * (chilecompraScoring.cruzarItemsConCatalogo, vía compraAgilAnalisis) — nunca
 * reemplaza ese cruce ni propone un SKU por su cuenta. Cuando un ítem del
 * cruce queda con sku_match = un producto que el tagging marcó con
 * alerta_tipo_base (la ficha Vistony no declara sintético/mineral) o
 * alerta_sku (cruce SKU↔ficha ya detectado como ambiguo a mano — ej.
 * Veltron EP vs Synth), esa alerta se agrega a la observación del ítem antes
 * de generar el Excel — para que quede visible en la MISMA columna
 * "Observación" que ya exporta chilecompraExcelExport.js, sin tocar ese
 * exportador.
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

let _productos = []
let _porSku = null // Map<codigo_sku, {producto, entradaSku}> — construido perezosamente

try {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8')
  _productos = JSON.parse(raw).productos || []
} catch (err) {
  // No bloquea el arranque del servidor si el archivo aún no fue copiado —
  // el Cotizador Manual simplemente funciona sin la señal de tagging (el
  // cruce real sigue funcionando igual), y queda log claro de por qué.
  console.warn(`⚠️  taggingTecnico: no se pudo cargar ${DATA_PATH} — el Cotizador Manual funcionará sin alertas de tagging. Detalle: ${err.message}`)
}

function indicePorSku() {
  if (_porSku) return _porSku
  _porSku = new Map()
  for (const p of _productos) {
    for (const s of p.sku_rmg || []) {
      if (s?.sku) _porSku.set(String(s.sku), p)
    }
  }
  return _porSku
}

/**
 * Dado un código SKU RMG (el que ya asignó el cruce real contra
 * lista_precios), devuelve la alerta técnica del tagging si existe, o null.
 * Nunca decide el SKU — solo aporta la alerta sobre uno ya elegido.
 */
function alertaParaSku(codigoSku) {
  if (!codigoSku) return null
  const producto = indicePorSku().get(String(codigoSku))
  if (!producto) return null
  if (!producto.alerta_tipo_base && !producto.alerta_sku) return null
  return {
    producto_tagging_id: producto.id,
    nombre_ficha: producto.nombre_ficha,
    tipo_base: producto.tipo_base,
    alerta_tipo_base: !!producto.alerta_tipo_base,
    alerta_sku: !!producto.alerta_sku,
    nota_sku: producto.nota_sku || null,
  }
}

function todosLosProductos() {
  return _productos
}

module.exports = { alertaParaSku, todosLosProductos }
