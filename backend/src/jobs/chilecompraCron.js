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

// Palabras sueltas, no frases — el filtro (chilecompraApiClient.filtrarPorRubro)
// hace substring + normaliza tildes, así que una palabra suelta como "hidraulico"
// calza tanto con "hidráulico" como con "HIDRAULICO" en cualquier posición del
// nombre. Usar frases largas tipo "aceite motor" es frágil: una licitación
// titulada "ACEITE PARA MOTORES DIESEL" no la contiene como substring exacto y
// se pierde. Lista ampliada según las 4 líneas reales de RMG (ver
// RMG_SKU_Segmentos_Estrategia y RMG_Catalogo_Tecnico_Vistony en el proyecto):
// lubricantes/aceites, baterías, neumáticos, grasas — más refrigerantes, líquido
// de frenos y AdBlue que también vende RMG. "aceite" sin más contexto también
// calza con licitaciones de aceite comestible (JUNAEB, casinos) — eso se filtra
// aparte en filtrarPorRubro, no acá. CHILECOMPRA_KEYWORDS en Render sobrescribe
// esto — actualizar ahí también si se agregan rubros nuevos.
const KEYWORDS = (process.env.CHILECOMPRA_KEYWORDS ||
  'lubricante,aceite,hidraulico,grasa,refrigerante,anticongelante,liquido de frenos,' +
  'bateria,acumulador,neumatico,llanta,adblue'
).split(',').map(s => s.trim()).filter(Boolean)

const DIAS_HACIA_ATRAS = Number(process.env.CHILECOMPRA_DIAS_HACIA_ATRAS || 1) // 1 = solo hoy

/**
 * "Hoy" calculado en la zona horaria de Santiago, NO con new Date() crudo.
 * Render corre el servidor en UTC; Chile va 3-4 horas detrás. Entre
 * aproximadamente las 20:00 y las 23:59 hora Chile, el servidor en UTC ya está
 * en el día siguiente — así que un simple `new Date()` calcula "hoy" como
 * mañana en Chile. La API de ChileCompra usa SU propia fecha real y rechaza
 * pedir un día futuro con el error "La fecha es mayor a la actual" (HTTP 400,
 * código 10300) — eso hacía fallar en silencio el barrido de "Hoy" (y el cron
 * de las 9am, aunque a esa hora es menos probable) en esa ventana horaria.
 */
function hoyEnSantiago() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const obj = Object.fromEntries(partes.map(p => [p.type, p.value]))
  return new Date(`${obj.year}-${obj.month}-${obj.day}T12:00:00`)
}

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
 *
 * La API también trae "Items.Listado" con la descripción, cantidad y unidad de cada
 * producto solicitado — eso se guarda de inmediato en oportunidad_chilecompra_items,
 * SIN esperar a que alguien suba un PDF y la IA lo lea. Así la tarjeta y el modal de
 * detalle muestran información real (qué piden, cuánto) desde el momento en que se
 * detecta, no recién después de un análisis manual.
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
    fuente === 'licitacion' ? api.urlFichaPublica(codigoExterno) : null,
    JSON.stringify(detalle),
    'cron'
  )

  const itemsApi = detalle.Items?.Listado
  if (Array.isArray(itemsApi) && itemsApi.length) {
    const insItem = db.prepare(`
      INSERT INTO oportunidad_chilecompra_items
        (id, oportunidad_id, descripcion_solicitada, cantidad, unidad, especificacion_tecnica)
      VALUES (?,?,?,?,?,?)
    `)
    for (const it of itemsApi) {
      const descripcion = it.Descripcion || it.NombreProducto || null
      if (!descripcion) continue
      insItem.run(uuidv4(), id, descripcion, it.Cantidad ?? null, it.UnidadMedida || null, it.NombreProducto || null)
    }
  }

  return id
}

/**
 * Arma la lista de fechas (Date, un elemento por día) a barrer en la ingesta.
 * Prioridad: rango explícito (fechaDesde/fechaHasta) > diasHaciaAtras > default del .env.
 * "diasHaciaAtras: 7" = hoy y los 6 días anteriores (8 días hoy inclusive sería 8).
 */
function construirFechas({ diasHaciaAtras, fechaDesde, fechaHasta } = {}) {
  if (fechaDesde && fechaHasta) {
    const fechas = []
    const cur = new Date(fechaDesde)
    const fin = new Date(fechaHasta)
    while (cur <= fin) {
      fechas.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return fechas
  }
  const dias = Number(diasHaciaAtras ?? DIAS_HACIA_ATRAS) || 1
  const fechas = []
  for (let i = 0; i < dias; i++) {
    const f = hoyEnSantiago()
    f.setDate(f.getDate() - i)
    fechas.push(f)
  }
  return fechas
}

/**
 * @param {{disparadoPor?: string, enviarEmail?: boolean, diasHaciaAtras?: number,
 *          fechaDesde?: string|Date, fechaHasta?: string|Date}} opts
 */
async function ejecutarIngesta({ disparadoPor = 'cron', enviarEmail = false, diasHaciaAtras, fechaDesde, fechaHasta } = {}) {
  const errores = []
  let revisadas = 0
  const nuevasIds = []
  const fechasABarrer = construirFechas({ diasHaciaAtras, fechaDesde, fechaHasta })

  // ── Licitaciones (API estable) — se barren TODAS las fechas del rango en esta
  // misma corrida, de una sola vez (no una por click). La API pública de ChileCompra
  // aplica rate-limit por ticket: sin una pausa entre solicitudes, un barrido de
  // varios días dispara cientos de llamadas seguidas y la API empieza a responder
  // 429 a partir de las primeras — eso hacía que solo entrara "una oportunidad a la
  // vez" pese a que el rango ya se barría completo. La pausa de 350ms entre cada
  // llamada (día y detalle) evita gatillar el límite en primer lugar; conReintento
  // en el cliente además reintenta con backoff si de todos modos llega un 429.
  const PAUSA_ENTRE_LLAMADAS_MS = 350
  let esPrimeraLlamada = true
  const pausar = async () => {
    if (!esPrimeraLlamada) await api.sleep(PAUSA_ENTRE_LLAMADAS_MS)
    esPrimeraLlamada = false
  }

  for (const fecha of fechasABarrer) {
    try {
      await pausar()
      const listado = await api.fetchLicitacionesPorFecha(fecha)
      const filtradas = api.filtrarPorRubro(listado, KEYWORDS)
      revisadas += listado.length

      for (const l of filtradas) {
        if (yaExiste('licitacion', l.CodigoExterno)) continue
        try {
          await pausar()
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

  console.log(`ℹ️ ChileCompra ingesta (${disparadoPor}) — ${fechasABarrer.length} día(s), ${revisadas} revisadas, ${nuevas.length} nuevas, ${errores.length} errores`)
  return {
    revisadas, nuevas: nuevas.length, oportunidades: nuevas, errores, email: resultadoEmail,
    dias_barridos: fechasABarrer.length,
    rango: { desde: api.ddmmyyyy(fechasABarrer[fechasABarrer.length - 1]), hasta: api.ddmmyyyy(fechasABarrer[0]) },
  }
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
