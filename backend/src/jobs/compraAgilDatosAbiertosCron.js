/**
 * RMG Parts — Sincronización mensual del cache local de Datos Abiertos
 * (Compra Ágil) — ver services/compraAgilDatosAbiertos.js para el porqué.
 *
 * ChileCompra publica un archivo nuevo por mes, con ~2 meses de rezago, así
 * que no tiene sentido revisar todos los días como el cron de licitaciones —
 * corre el día 5 de cada mes a las 10:00 (America/Santiago).
 *
 * ⚠️ 2026-09-08 (noche, INCIDENTE DE PRODUCCIÓN): esto ANTES también corría
 * una vez al levantar el servidor ("para no esperar hasta el día 5"). Eso
 * causó un crash-loop real: sincronizarMesesRecientes() descarga y procesa
 * hasta 5 ZIPs mensuales (~78MB cada uno, CSV de hasta ~700MB sin comprimir)
 * completos ANTES de marcar cada mes como sincronizado — si el proceso se
 * queda sin memoria a mitad de camino (pasó, confirmado en los eventos de
 * Render: "Ran out of memory" cada 3-8 min, ~30 seg después de cada
 * "activado" en los logs), NINGÚN mes queda marcado, así que el próximo
 * arranque intenta exactamente lo mismo desde cero — un loop infinito de
 * caída/reinicio que no tiene nada que ver con el resto de Compra Ágil.
 * Confirmado con los eventos de Render (crasheaba con y sin el scraper de
 * navegador, antes y después del deploy de esa noche) y con el estado real
 * del benchmark ("Todavía no se ha sincronizado ningún mes" — cero éxitos).
 *
 * Se saca esa corrida automática al arrancar. La sincronización ahora SOLO
 * ocurre: (a) el día 5 de cada mes por el cron de abajo, con tráfico bajo, o
 * (b) a mano con el botón "Sincronizar histórico" del módulo Compra Ágil —
 * mejor momento para probarla una vez, mirando el gráfico de memoria de
 * Render, antes de dejarla desatendida otra vez.
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
  // NO hay corrida automática al arrancar — ver aviso de incidente arriba.
  // Usar el botón "Sincronizar histórico" en la UI cuando se quiera probar.
}

module.exports = { iniciarCron, ejecutarSincronizacion }
