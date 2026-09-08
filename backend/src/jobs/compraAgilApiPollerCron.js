/**
 * RMG Parts — Cron del detector automático de Compra Ágil vía API oficial
 * (2026-09-08 noche)
 *
 * Reemplaza a compraAgilScraperCron.js (navegador headless, deshabilitado
 * desde la tarde del mismo día por saturar la memoria de Render — ver
 * compraAgilScraper.js y RMG_CompraAgil_Implementacion.md). Este cron llama
 * a compraAgilAnalisis.detectarYImportarAutomatico(), que consulta la API
 * OFICIAL de Compra Ágil (api2.mercadopublico.cl/v2/compra-agil) — sin
 * navegador, sin riesgo de memoria, en segundos.
 *
 * Corre cada 15 minutos (mucho más barato que el navegador headless, que
 * corría cada 2h): Compra Ágil suele cerrar el mismo día o al siguiente, así
 * que más frecuencia = menos oportunidades perdidas por llegar tarde.
 */
const cron = require('node-cron')
const { detectarYImportarAutomatico } = require('../services/compraAgilAnalisis')

// El candado contra corridas solapadas vive DENTRO de compraAgilAnalisis.js
// (compartido con el botón "Buscar ahora" de la UI).
async function ejecutar(disparadoPor = 'cron') {
  try {
    const resumen = await detectarYImportarAutomatico()
    if (resumen.yaEnCurso) {
      console.log('⏭️ Compra Ágil API — ya hay una corrida en curso, se salta esta.')
      return resumen
    }
    if (resumen.errores.length) {
      console.warn(`⚠️ Compra Ágil API (${disparadoPor}) terminó con errores:`, resumen.errores.slice(0, 5))
    }
    return resumen
  } catch (e) {
    console.error(`❌ Compra Ágil API (${disparadoPor}) falló:`, e.message)
    throw e
  }
}

function iniciarCron() {
  // Cada 15 minutos, 08:00–20:00, hora de Santiago.
  cron.schedule('*/15 8-20 * * *', () => {
    ejecutar('cron').catch(() => {}) // el error ya quedó logueado en ejecutar()
  }, { timezone: 'America/Santiago' })
  console.log('⏰ Cron Compra Ágil (API oficial) activado — cada 15 min, 08:00-20:00 America/Santiago')

  // Corrida inicial al levantar el servidor, sin bloquear el arranque.
  setTimeout(() => {
    ejecutar('arranque').catch(() => {})
  }, 15_000)
}

module.exports = { iniciarCron, ejecutar }
