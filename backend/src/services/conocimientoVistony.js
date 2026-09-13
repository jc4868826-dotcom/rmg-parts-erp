/**
 * Enriquecimiento de matching con el archivo de conocimientos Vistony
 * (RMG_Base_Conocimiento_Productos_Vistony.md, 106 productos extraídos del
 * sitio oficial vistonylubricantes.cl el 11-sep-2026).
 *
 * 2026-09-13 — pedido explícito del usuario: usar el archivo de conocimientos
 * como señal adicional de texto en el matching de Compra Ágil/Cotizador,
 * ADEMÁS de lista_precios (nunca en su reemplazo). Importante — límite real
 * de este archivo, documentado en su propia intro: NO cubre ~30 productos que
 * RMG vende con precio real pero que no existen en el sitio público de
 * Vistony (línea Urea Automotriz/AdBlue, BLINDAX S-CLASS/DUO, ATTOM S400/420,
 * FORZA TRUCK/ADVANCED, motos J6000/J8000, AQUAOIL 4T, entre otros). Para esos
 * productos este módulo no encuentra nada y el matching sigue dependiendo
 * exclusivamente de lista_precios, tal como antes — esto es esperado, no un
 * bug de este módulo.
 *
 * El archivo JSON (conocimiento_vistony.json) se generó una vez a partir del
 * .md por un script de extracción — no se parsea el markdown en caliente.
 */
const fs = require('fs')
const path = require('path')

const RUTA_JSON = path.join(__dirname, '../../data/conocimiento_vistony.json')

let ENTRADAS = []
try {
  ENTRADAS = JSON.parse(fs.readFileSync(RUTA_JSON, 'utf-8'))
} catch (e) {
  console.warn('⚠️  conocimiento_vistony.json no encontrado o inválido — el matching sigue funcionando solo con lista_precios.', e.message)
  ENTRADAS = []
}

// Índice simple: nombre_base en mayúsculas, sin espacios extra, listo para
// probar como substring de la descripción del candidato de lista_precios.
const INDICE = ENTRADAS
  .map(e => ({
    clave: (e.nombre_base || e.nombre || '').toUpperCase().replace(/\s+/g, ' ').trim(),
    texto: [e.descripcion, e.caracteristicas_adicionales].filter(Boolean).join(' '),
  }))
  .filter(e => e.clave.length >= 4 && e.texto)

/**
 * Dado un candidato de lista_precios (con su `descripcion`), busca si algún
 * producto del archivo de conocimientos aparece como substring de esa
 * descripción (heurística simple, deliberadamente permisiva — el peor caso es
 * no encontrar nada, nunca un falso "no hay conocimiento" que rompa algo).
 * Devuelve el texto verbatim del archivo de conocimientos para agregar como
 * señal extra de matching, o '' si no hay coincidencia.
 */
function textoConocimientoPara(candidato) {
  const desc = (candidato?.descripcion || '').toUpperCase()
  if (!desc) return ''
  for (const { clave, texto } of INDICE) {
    if (desc.includes(clave)) return texto
  }
  return ''
}

module.exports = { textoConocimientoPara }
