/**
 * RMG Parts — Cron de sincronización de estado REAL de Compra Ágil (2026-09-09)
 *
 * Pieza 4 del esquema aprobado por el usuario ("si dale") tras el pedido:
 * "no veo como recibir información del estado desde la api...si se adjudicó
 * etc. no se a cuales postulo, cuales descarto, cuales estoy en proceso".
 *
 * DISTINTO de compraAgilApiPollerCron.js (que DESCUBRE oportunidades nuevas):
 * este cron revisa las oportunidades YA importadas y consulta de nuevo su
 * detalle en la API oficial para ver si ChileCompra le cambió el estado real
 * (publicada → cerrada/desierta/cancelada/proveedor_seleccionado) o si ya se
 * emitió una Orden de Compra — eje de estado que le pertenece a ChileCompra,
 * separado del pipeline de gestión interno de RMG (ver
 * compraAgilAnalisis.sincronizarEstadosReales para el detalle completo).
 *
 * Cadencia más espaciada que el poller de descubrimiento (cada 15 min): acá
 * no hay carrera contra el cierre de una publicación nueva, solo se quiere
 * enterarse del desenlace sin gastar cuota de la API de más — cada 2 horas,
 * 08:00-20:00 hora de Santiago, es suficiente margen.
 */
const cron = require('node-cron')
const { sincronizarEstadosReales } = require('../services/compraAgilAnalisis')

// El candado contra corridas solapadas vive DENTRO de compraAgilAnalisis.js
// (mismo patrón que compraAgilApiPollerCron.js).
async function ejecutar(disparadoPor = 'cron') {
  try {
    const resumen = await sincronizarEstadosReales()
    if (resumen.yaEnCurso) {
      console.log('⏭️ Compra Ágil (sync estado real) — ya hay una corrida en curso, se salta esta.')
      return resumen
    }
    if (resumen.errores.length) {
      console.warn(`⚠️ Compra Ágil (sync estado real, ${disparadoPor}) terminó con errores:`, resumen.errores.slice(0, 5))
    }
    return resumen
  } catch (e) {
    console.error(`❌ Compra Ágil (sync estado real, ${disparadoPor}) falló:`, e.message)
    throw e
  }
}

function iniciarCron() {
  // Cada 2 horas, 08:00–20:00, hora de Santiago (08,10,12,14,16,18,20).
  cron.schedule('0 8-20/2 * * *', () => {
    ejecutar('cron').catch(() => {}) // el error ya quedó logueado en ejecutar()
  }, { timezone: 'America/Santiago' })
  console.log('⏰ Cron Compra Ágil (sync estado real) activado — cada 2h, 08:00-20:00 America/Santiago')

  // Corrida inicial al levantar el servidor, sin bloquear el arranque — un
  // poco después que el poller de descubrimiento (15s) para no competir por
  // cuota de la API en el mismo instante de arranque.
  setTimeout(() => {
    ejecutar('arranque').catch(() => {})
  }, 30_000)
}

module.exports = { iniciarCron, ejecutar }
