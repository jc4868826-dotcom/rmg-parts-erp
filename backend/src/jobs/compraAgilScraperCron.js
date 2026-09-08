/**
 * RMG Parts — Cron del scraper automático de Compra Ágil (2026-09)
 *
 * Corre el detector (compraAgilScraper.detectarYImportarNuevas) cada 2 horas
 * en horario hábil (Compra Ágil casi siempre cierra el mismo día o al
 * siguiente — un cron una vez al día, como el de licitaciones, llegaría
 * tarde a la mayoría). También corre una vez al levantar el servidor, igual
 * que compraAgilDatosAbiertosCron.js, para no depender de esperar hasta la
 * próxima hora en punto tras un deploy.
 *
 * Se registra desde app.js junto a los otros crons de ChileCompra.
 */
const cron = require('node-cron')
const { detectarYImportarNuevas } = require('../services/compraAgilScraper')

// El candado contra corridas solapadas vive DENTRO de compraAgilScraper.js
// (compartido con el botón "Buscar ahora" de la UI) — acá no hace falta uno
// propio, detectarYImportarNuevas() ya se devuelve sola ({yaEnCurso:true}) si
// hay otra corrida en curso.
async function ejecutar(disparadoPor = 'cron') {
  try {
    const resumen = await detectarYImportarNuevas()
    if (resumen.yaEnCurso) {
      console.log('⏭️ Compra Ágil scraper — ya hay una corrida en curso, se salta esta.')
      return resumen
    }
    if (resumen.errores.length) {
      console.warn(`⚠️ Compra Ágil scraper (${disparadoPor}) terminó con errores:`, resumen.errores.slice(0, 5))
    }
    return resumen
  } catch (e) {
    console.error(`❌ Compra Ágil scraper (${disparadoPor}) falló:`, e.message)
    throw e
  }
}

function iniciarCron() {
  // Cada 2 horas, 08:00–20:00, hora de Santiago — cubre la ventana en que
  // los organismos públicos publican y cierran Compra Ágil.
  cron.schedule('0 8-20/2 * * *', () => {
    ejecutar('cron').catch(() => {}) // el error ya quedó logueado en ejecutar()
  }, { timezone: 'America/Santiago' })
  console.log('⏰ Cron Compra Ágil (scraper automático) activado — cada 2h, 08:00-20:00 America/Santiago')

  // Corrida inicial al levantar el servidor, sin bloquear el arranque.
  setTimeout(() => {
    ejecutar('arranque').catch(() => {})
  }, 15_000)
}

module.exports = { iniciarCron, ejecutar }
