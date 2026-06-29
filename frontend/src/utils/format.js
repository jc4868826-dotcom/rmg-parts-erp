/**
 * RMG Auto Parts — Utilidades de Formato y Cálculo
 * CLP · Porcentajes · Márgenes B2B
 */

/**
 * Formatea número como precio CLP
 * @example formatCLP(1500000) → "$1.500.000"
 */
export const formatCLP = (valor, decimales = 0) => {
  if (valor === null || valor === undefined) return '$0'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor)
}

/**
 * Formatea porcentaje
 * @example formatPct(26.1) → "26,1%"
 */
export const formatPct = (valor, decimales = 1) => {
  return `${Number(valor).toFixed(decimales).replace('.', ',')}%`
}

/**
 * Calcula margen bruto
 * @param {number} costo - Precio de costo
 * @param {number} venta - Precio de venta
 * @returns {number} Margen en porcentaje
 */
export const calcularMargen = (costo, venta) => {
  if (!venta || venta === 0) return 0
  return ((venta - costo) / venta) * 100
}

/**
 * Calcula precio de venta dado costo y margen objetivo
 * @param {number} costo
 * @param {number} margenPct - Margen objetivo en %
 * @returns {number} Precio de venta (redondeado a $1.000)
 */
export const precioDesdeMargen = (costo, margenPct = 30) => {
  const precio = costo / (1 - margenPct / 100)
  return Math.round(precio / 1000) * 1000
}

/**
 * Calcula totales de una cotización
 */
export const calcularTotalesCotizacion = (items) => {
  const neto = items.reduce((sum, item) => {
    const subtotal = item.cantidad * item.precio_unitario * (1 - (item.descuento_pct || 0) / 100)
    return sum + subtotal
  }, 0)
  const iva = Math.round(neto * 0.19)
  const total = Math.round(neto) + iva
  return { neto: Math.round(neto), iva, total }
}

/**
 * Formatea fecha en español chileno
 * @example formatFecha('2026-06-15') → "15 jun 2026"
 */
export const formatFecha = (fecha, opciones = {}) => {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opciones,
  })
}

/**
 * Formatea fecha relativa
 * @example formatRelativo('2026-06-13') → "hace 2 días"
 */
export const formatRelativo = (fecha) => {
  if (!fecha) return ''
  const diff = Date.now() - new Date(fecha).getTime()
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  if (dias < 30) return `hace ${Math.floor(dias / 7)} semana${Math.floor(dias / 7) > 1 ? 's' : ''}`
  return `hace ${Math.floor(dias / 30)} mes${Math.floor(dias / 30) > 1 ? 'es' : ''}`
}

/**
 * Obtiene el color CSS según segmento
 */
export const colorSegmento = (segmento) => {
  const colores = {
    taller:        'var(--seg-taller)',
    flota:         'var(--seg-flota)',
    concesionario: 'var(--seg-concesionario)',
    construccion:  'var(--seg-construccion)',
  }
  return colores[segmento] || 'var(--rmg-muted)'
}

/**
 * Nombre descriptivo del segmento
 */
export const labelSegmento = (segmento) => {
  const labels = {
    taller:        '🔧 Taller',
    flota:         '🚛 Flota',
    concesionario: '🏢 Concesionario',
    construccion:  '🏗️ Construcción',
  }
  return labels[segmento] || segmento
}

/**
 * Genera número correlativo de cotización
 * @example generarNumCotizacion(42) → "COT-2026-042"
 */
export const generarNumCotizacion = (n) => {
  const año = new Date().getFullYear()
  return `COT-${año}-${String(n).padStart(3, '0')}`
}

/**
 * Valida RUT chileno (formato 12.345.678-9)
 */
export const validarRUT = (rut) => {
  if (!rut) return false
  const clean = rut.replace(/[.-]/g, '')
  if (clean.length < 8) return false
  const cuerpo = clean.slice(0, -1)
  const dv = clean.slice(-1).toUpperCase()
  let suma = 0, multiplo = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplo
    multiplo = multiplo < 7 ? multiplo + 1 : 2
  }
  const dvCalc = 11 - (suma % 11)
  const dvEsperado = dvCalc === 11 ? '0' : dvCalc === 10 ? 'K' : String(dvCalc)
  return dv === dvEsperado
}
