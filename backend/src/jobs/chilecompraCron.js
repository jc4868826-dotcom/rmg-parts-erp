/**
 * RMG Parts — Ingesta diaria de oportunidades ChileCompra (Fase 1)
 * Corre automático a las 9:00 (America/Santiago) vía node-cron, registrado desde
 * app.js. También lo llama chilecompraController.ejecutarAnalisisAhora para el
 * botón "hacer análisis ahora" del portal — misma función, sin depender del cron.
 */
const cron = require('node-cron')
const { db, uuidv4 } = require('../../config/database')
const api = require('../services/chilecompraApiClient')
const { enviarDigestDiario } = require('../services/chilecompraEmailDigest')

const KEYWORDS = (process.env.CHILECOMPRA_KEYWORDS ||
  'lubricante,aceite motor,aceite hidraulico,bateria,neumatico,grasa industrial,refrigerante,adblue'
).split(',').map(s => s.trim()).filter(Boolean)

const DIAS_HACIA_ATRAS = Number(process.env.CHILECOMPRA_DIAS_HACIA_ATRAS || 1) // 1 = solo hoy

function yaExiste(fuente, codigoExterno) {
  return !!db.prepare(
    'SELECT id FROM oportunidades_chilecompra WHERE fuente = ? AND codigo_externo = ?'
  ).get(fuente, codigoExterno)
}

/**
 * El endpoint licitaciones.json?fecha=X de ChileCompra NO devuelve solo lo publicado
 * ese día — devuelve cualquier licitación con actividad relevante ese día (publicación,
 * adjudicación, cambios de estado, etc.). Por eso, sin este filtro, "hacer análisis"
 * traía licitaciones ya cerradas/adjudicadas hace meses (solo tuvieron un evento hoy).
 * Solo nos interesan las que siguen realmente abiertas para ofertar.
 */
function siguAbierta(detalle) {
  const cierre = detalle.Fechas?.FechaCierre || detalle.FechaCierre
  if (!cierre) return false
  if (new Date(cierre).getTime() <= Date.now()) return false
  const estado = (detalle.Estado || '').toLowerCase()
  if (['adjudicada', 'desierta', 'revocada', 'suspendida', 'cerrada'].some(e => estado.includes(e))) return false
  return true
}

/**
 * Los campos reales de organismo/región/comuna vienen anidados bajo "Comprador" en la
 * respuesta de la API — no en la raíz del objeto (verificado contra la API real).
 */
function insertarDetectada({ fuente, codigoExterno, detalle }) {
  const comprador = detalle.Comprador || {}
  const id = uuidv4()
  db.prepare(`
    INSERT INTO oportunidades_chilecompra
      (id, fuente, codigo_externo, nombre, organismo_nombre, organismo_rut, region, comuna,
       direccion_entrega, fecha_publicacion, fecha_cierre, presupuesto_estimado, url_portal,
       estado, detalle_raw_json, detectada_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'detectada', ?, ?)
  `).run(
    id, fuente, codigoExterno,
    detalle.Nombre || null, comprador.NombreOrganismo || null, comprador.RutUnidad || null,
    comprador.RegionUnidad?.trim() || null, comprador.ComunaUnidad || null,
    comprador.DireccionUnidad || detalle.DireccionEntrega || null,
    detalle.Fechas?.FechaPublicacion || detalle.FechaPublicacion || null,
    detalle.Fechas?.FechaCierre || detalle.FechaCierre || null,
    detalle.MontoEstimado || null,
    fuente === 'licitacion'
      ? `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=${codigoExterno}`
      : null,
    JSON.stringify(detalle),
    'cron'
  )
  return id
}

/**
 * @param {{disparadoPor?: string, enviarEmail?: boolean}} opts
 */
async function ejecutarIngesta({ disparadoPor = 'cron', enviarEmail = false } = {}) {
  const errores = []
  let revisadas = 0
  const nuevasIds = []

  // ── Licitaciones (API estable) ──
  for (let i = 0; i < DIAS_HACIA_ATRAS; i++) {
    const fecha = new Date()
    fecha.setDate(fecha.getDate() - i)
    try {
      const listado = await api.fetchLicitacionesPorFecha(fecha)
      const filtradas = api.filtrarPorRubro(listado, KEYWORDS)
      revisadas += listado.length

      for (const l of filtradas) {
        if (yaExiste('licitacion', l.CodigoExterno)) continue
        try {
          const detalle = await api.fetchLicitacionDetalle(l.CodigoExterno)
          if (!detalle) continue
          if (!siguAbierta(detalle)) continue // descarta cerradas/adjudicadas/vencidas
          const id = insertarDetectada({ fuente: 'licitacion', codigoExterno: l.CodigoExterno, detalle })
          nuevasIds.push(id)
        } catch (e) {
          errores.push(`Licitación ${l.CodigoExterno}: ${e.message}`)
        }
      }
    } catch (e) {
      errores.push(`Consulta licitaciones ${api.ddmmyyyy(fecha)}: ${e.message}`)
    }
  }

  // ── Compra Ágil (beta — endpoint aún no confirmado, ver chilecompraApiClient) ──
  try {
    await api.fetchComprasAgiles()
  } catch (e) {
    errores.push(`Compra Ágil: ${e.message}`)
  }

  const nuevas = nuevasIds.map(id => db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id))

  let resultadoEmail = null
  if (enviarEmail) {
    const destinatarios = (process.env.CHILECOMPRA_ALERT_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)
    try {
      resultadoEmail = await enviarDigestDiario({ nuevas, destinatarios })
    } catch (e) {
      errores.push(`Envío de correo: ${e.message}`)
    }
  }

  console.log(`ℹ️ ChileCompra ingesta (${disparadoPor}) — ${revisadas} revisadas, ${nuevas.length} nuevas, ${errores.length} errores`)
  return { revisadas, nuevas: nuevas.length, oportunidades: nuevas, errores, email: resultadoEmail }
}

function iniciarCron() {
  // 9:00 todos los días, hora de Santiago
  cron.schedule('0 9 * * *', () => {
    ejecutarIngesta({ disparadoPor: 'cron', enviarEmail: true })
      .catch(e => console.error('❌ ChileCompra cron 9am falló:', e.message))
  }, { timezone: 'America/Santiago' })
  console.log('⏰ Cron ChileCompra activado — todos los días 09:00 America/Santiago')
}

module.exports = { ejecutarIngesta, iniciarCron }
