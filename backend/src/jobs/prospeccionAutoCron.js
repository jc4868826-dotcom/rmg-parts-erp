/**
 * Prospección automática: revisa cada 5 minutos, lun–vie 08:00–13:55 (Santiago),
 * qué paso del día toca (correo, WhatsApp 1, WhatsApp 2, dormido). Cada paso
 * corre una sola vez por día (prospeccion_auto_config.ult_*), así que el cron y
 * el POST /api/prospeccion-auto/tick externo pueden convivir sin duplicar.
 */
const cron = require('node-cron')
const { tick } = require('../services/prospeccionAuto')

let enCurso = false
function iniciarCron() {
  cron.schedule('*/5 8-13 * * 1-5', async () => {
    if (enCurso) return
    enCurso = true
    try {
      const r = await tick()
      if (r.ejecutados?.length) console.log('[PROSP-AUTO] tick:', JSON.stringify(r.ejecutados))
    } catch (e) {
      console.error('[PROSP-AUTO] tick falló:', e.message)
    } finally { enCurso = false }
  }, { timezone: 'America/Santiago' })
  console.log('⏱️  Prospección automática: cron cada 5 min, lun–vie 08–13 h (Santiago)')
}

module.exports = { iniciarCron }
