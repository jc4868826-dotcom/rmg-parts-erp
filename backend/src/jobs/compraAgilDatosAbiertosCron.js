/**
 * RMG Parts — Sincronización mensual del cache local de Datos Abiertos
 * (Compra Ágil) — ver services/compraAgilDatosAbiertos.js para el porqué.
 *
 * ChileCompra publica un archivo nuevo por mes, con ~2 meses de rezago, así
 * que no tiene sentido revisar todos los días como el cron de licitaciones —
 * corre el día 5 de cada mes a las 10:00 (America/Santiago), y también una
 * vez al levantar el servidor (para no esperar hasta el día 5 si la tabla
 * está vacía, ej. justo después de este deploy).
 */
const cron = require('node-cron')
const { sincronizarMesesRecientes } = require('../services/compraAgilDatosAbiertos')

async function ejecutarSincronizacion(origen) {
  try {
    const resultados = await sincronizarMesesRecientes({ maxIntentos: 5 })
    const exitosos = resultados.filter(r => r.ok)
    console.log(`ℹ️ Datos Abiertos Compra Ágil (${origen}) — ${exitosos.length} mes(es) sincronizado(s) de ${resultados.length} intentado(s)`)
  } catch (e) {
    console.error('❌ Datos Abiertos Compra Ágil — sincronización falló:', e.message)
  }
}

function iniciarCron() {
  cron.schedule('0 10 5 * *', () => ejecutarSincronizacion('cron'), { timezone: 'America/Santiago' })
  console.log('⏰ Cron Datos Abiertos Compra Ágil activado — día 5 de cada mes, 10:00 America/Santiago')

  // Corrida inicial no bloqueante — si la tabla está vacía (primer deploy),
  // no esperar hasta el día 5 para tener benchmark disponible.
  ejecutarSincronizacion('arranque').catch(() => {})
}

module.exports = { iniciarCron, ejecutarSincronizacion }
