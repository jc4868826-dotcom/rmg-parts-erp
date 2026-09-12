/**
 * RMG Parts — Cliente API OFICIAL de Compra Ágil (Mercado Público) — v2
 *
 * REEMPLAZA POR COMPLETO (2026-09-08 noche) a la versión anterior de este
 * archivo, que llamaba a la API INTERNA no documentada del buscador público
 * (api.buscador.mercadopublico.cl) y estaba bloqueada por WAF en producción.
 * Ese enfoque llevó a construir un scraper con navegador headless
 * (compraAgilScraper.js) que a su vez tumbó el servidor por consumo de
 * memoria (Chromium + toda la DB sql.js en RAM > 512MB del plan de Render).
 * Ver RMG_CompraAgil_Implementacion.md para el detalle completo de esa
 * historia — compraAgilScraper.js se deja intacto como referencia pero deja
 * de usarse desde aquí en adelante.
 *
 * ChileCompra publicó en mayo 2026 una API OFICIAL y documentada
 * específica para Compra Ágil (separada de la de Licitaciones/Órdenes de
 * Compra: dominio distinto, autenticación distinta). Guía completa:
 * "API Compra Ágil v2 — Guía de uso para desarrolladores y ciudadanía"
 * (chilecompra.cl/api/, mayo 2026, v3.0).
 *
 * - Base URL:       https://api2.mercadopublico.cl
 * - Autenticación:  header HTTP "ticket" (NO query param — a diferencia de
 *                   la API de Licitaciones, que sí usa ?ticket=... en la URL).
 *                   Mismo ticket de desarrollador que ya se pidió una vez en
 *                   https://www.chilecompra.cl/api/ (Clave Única).
 * - Endpoints:
 *     GET /v2/compra-agil            listado + filtros + paginación
 *     GET /v2/compra-agil/{codigo}   detalle completo de una Compra Ágil
 * - Cuota: límite diario de solicitudes por ticket — la API responde 429
 *   cuando se agota, con Retry-After. Ver manejarError().
 *
 * El ticket NUNCA se hardcodea acá — vive solo en la variable de entorno
 * COMPRA_AGIL_API_TICKET (Render → Environment), igual que cualquier otra
 * credencial de este proyecto.
 */
const axios = require('axios')

const BASE_URL = process.env.COMPRA_AGIL_API_BASE || 'https://api2.mercadopublico.cl'
const TICKET = process.env.COMPRA_AGIL_API_TICKET || null

// Códigos de región según la guía oficial (sección 5.1, Grupo 4).
const REGIONES = {
  1: 'Tarapacá', 2: 'Antofagasta', 3: 'Atacama', 4: 'Coquimbo', 5: 'Valparaíso',
  6: "O'Higgins", 7: 'Maule', 8: 'Biobío', 9: 'Araucanía', 10: 'Los Lagos',
  11: 'Aysén', 12: 'Magallanes y Antártica', 13: 'Metropolitana', 14: 'Los Ríos',
  15: 'Arica y Parinacota', 16: 'Ñuble',
}

/**
 * ⚠️ 2026-09-08/09 (incidente #3): al sacar el parámetro `q` (fix del
 * incidente #2), el listado SIN palabra clave trae TODAS las Compra Ágil
 * "publicada" del país en la ventana pedida — una consulta bastante más
 * pesada del lado de ChileCompra que una búsqueda acotada por texto, y en
 * producción tardó más de 20s (timeout) al menos una vez. No es un error
 * de aplicación (no es 4xx/5xx con mensaje) — es un timeout de red, así que
 * SÍ vale la pena reintentar (a diferencia de un 500/429 con mensaje claro,
 * que es determinístico y reintentar solo gastaría cuota para nada). Se
 * sube el timeout base y se reintenta una vez con más margen antes de darse
 * por vencido.
 */
// 2026-09-09 (incidente #4, real: "HTTP 504 — Endpoint request timed out" con
// Metropolitana + ayer/hoy, es decir YA con el alcance chico) — el reintento
// de arriba (30s→60s) solo cubría errores de RED (catch: DNS, conexión
// rechazada, timeout del propio axios). Un 504 de gateway es una RESPUESTA
// real que sí llega (solo que tarde) — antes caía directo en
// `resp.status >= 400` de abajo y nunca pasaba por el reintento, así que un
// solo 504 tumbaba la búsqueda entera sin segunda oportunidad. 502/503/504
// son errores de infraestructura (gateway/proxy), típicamente transitorios —
// vale la pena reintentar igual que un fallo de red. 429 (cuota agotada) y el
// resto de los 4xx NO se reintentan: son errores del pedido mismo, reintentar
// no cambia el resultado.
const HTTP_REINTENTABLES = new Set([502, 503, 504])

async function llamar(path, params, origen, intento = 1) {
  if (!TICKET) {
    throw new Error(`${origen}: falta la variable de entorno COMPRA_AGIL_API_TICKET (ticket de la API oficial de Compra Ágil).`)
  }
  const timeoutMs = 30_000 * intento // 30s el primer intento, 60s el reintento
  let resp
  try {
    resp = await axios.get(`${BASE_URL}${path}`, {
      params,
      headers: { ticket: TICKET },
      timeout: timeoutMs,
      validateStatus: () => true,
    })
  } catch (err) {
    if (intento < 2) {
      return llamar(path, params, origen, intento + 1) // reintento único, timeout mayor
    }
    throw new Error(`${origen}: no se pudo contactar ${BASE_URL}${path} tras ${intento} intento(s) — ${err.message}`)
  }

  if (resp.status === 429) {
    const espera = resp.headers?.['retry-after']
    throw new Error(`${origen}: cuota diaria de la API Compra Ágil agotada (429)${espera ? ` — reintentar en ${espera}` : ' — reintentar mañana'}.`)
  }
  if (HTTP_REINTENTABLES.has(resp.status) && intento < 2) {
    return llamar(path, params, origen, intento + 1) // 502/503/504 — mismo reintento que un fallo de red
  }
  if (resp.status >= 400) {
    const msg = resp.data?.errors?.[0]?.mensaje || (typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data))?.slice(0, 300)
    throw new Error(`${origen}: HTTP ${resp.status} tras ${intento} intento(s) — ${msg}`)
  }
  if (resp.data?.success === 'NOK') {
    throw new Error(`${origen}: ${resp.data.errors?.[0]?.mensaje || 'la API respondió success:NOK sin mensaje.'}`)
  }
  return resp.data.payload
}

/**
 * Detalle completo de una Compra Ágil por su código externo
 * (ej. "1057539-228-COT26"). Mapea al mismo shape de `detalle` que ya
 * consume compraAgilAnalisis.guardarYProcesarOportunidad — cero cambios
 * necesarios ahí.
 */
async function buscarCompraAgil(codigo) {
  if (!codigo) throw new Error('buscarCompraAgil: falta el código de la compra ágil')
  const payload = await llamar(`/v2/compra-agil/${encodeURIComponent(codigo)}`, {}, 'buscarCompraAgil')
  return mapearDetalle(payload, codigo)
}

function mapearDetalle(p, codigoSolicitado) {
  const itemsRaw = p.productos_solicitados || []
  const items = itemsRaw.map(it => ({
    descripcion_solicitada: it.nombre || it.descripcion || null,
    cantidad: it.cantidad ?? null,
    unidad: it.unidad_medida || null,
    especificacion_tecnica: it.descripcion || it.nombre || null,
    // La API no entrega precio unitario en los productos solicitados — solo
    // aparece en proveedores_cotizando[].productos_cotizados[] una vez que
    // hay cotizaciones (incluida la propia, después de postular). Antes de
    // eso queda null, igual que en el flujo manual/scraper anteriores.
    precio_unitario_referencial: null,
  }))

  if (!items.length && (p.nombre || p.descripcion)) {
    items.push({
      descripcion_solicitada: p.nombre || p.descripcion,
      cantidad: null,
      unidad: null,
      especificacion_tecnica: p.descripcion || null,
      precio_unitario_referencial: null,
    })
  }

  return {
    codigo_externo: codigoSolicitado,
    nombre: p.nombre || `Compra Ágil ${codigoSolicitado}`,
    descripcion: p.descripcion || null,
    organismo_nombre: p.institucion?.organismo_comprador || null,
    organismo_rut: p.institucion?.rut || null,
    region: REGIONES[p.institucion?.region] || null,
    comuna: null, // la API no entrega comuna, solo región + dirección de entrega
    direccion_entrega: p.entrega?.direccion_entrega || null,
    fecha_publicacion: p.fechas?.fecha_publicacion || null,
    fecha_cierre: p.fechas?.fecha_cierre || null,
    presupuesto_estimado: p.presupuesto?.monto_disponible_clp ?? p.presupuesto?.presupuesto_estimado ?? null,
    url_portal: `https://www.mercadopublico.cl/CompraAgil/Modules/Detail/DetailCompraAgil.aspx?qs=${codigoSolicitado}`,
    items,
    numero_cotizaciones_recibidas: p.resumen?.total_ofertas_recibidas ?? null,
    estado_codigo: p.estado?.codigo || null,
    // 2026-09-09 — para sincronizarEstadosReales() (compraAgilAnalisis.js):
    // código real de la Orden de Compra una vez emitida. El nombre exacto del
    // campo dentro de `orden_compra` no está confirmado contra un caso real
    // todavía (ningún código detectado hasta ahora llegó a ese estado) — se
    // prueban las variantes más probables del PDF oficial; si ninguna calza,
    // sincronizarEstadosReales() lo deja en null y NO revienta, pero
    // conviene revisar `debugUltimaRespuesta.orden_compra` en detalle_raw_json
    // la primera vez que una oportunidad real llegue a "proveedor_seleccionado".
    orden_compra_codigo: p.orden_compra?.codigo_orden_compra || p.orden_compra?.id_oc || p.orden_compra?.id_orden_compra || null,
    // Documentos/anexos que la propia API entrega para esta publicación — ver
    // enriquecerConDocumentosAdjuntos() más abajo. Igual que orden_compra, el
    // shape exacto de cada entrada no está confirmado contra un caso real con
    // adjuntos (ver aviso ahí) — se deja el arreglo crudo disponible acá para
    // que compraAgilAnalisis pueda intentar leerlos sin tener que volver a
    // pedir el detalle.
    documentos: Array.isArray(p.documentos) ? p.documentos : [],
    advertencias: [],
    debugUltimaRespuesta: p,
  }
}

/**
 * Lista códigos de Compra Ágil en estado "publicada" (abiertas, recibiendo
 * cotizaciones) que coincidan con `q` y hayan tenido cambios dentro de
 * `ventanaMs` — pagina automáticamente hasta traer todo.
 *
 * ⚠️ 2026-09-08 (noche, incidente #2): NO se usa desde detectarYImportarAutomatico
 * desde este mismo commit — ver listarPublicadasEnVentana() más abajo y el
 * aviso ahí. Se deja la función porque sigue siendo válida para una búsqueda
 * puntual (ej. una futura pantalla de "buscar por palabra" a pedido del
 * usuario), solo que el detector automático ya no la llama en un loop.
 */
async function listarCodigosPublicados({ q, ventanaMs = 6 * 3600_000 } = {}) {
  const codigos = new Set()
  let pagina = 1
  let totalPaginas = 1
  do {
    const payload = await llamar('/v2/compra-agil', {
      ttl_cambio_ms: ventanaMs,
      estado: 'publicada',
      q,
      tamano_pagina: 50,
      numero_pagina: pagina,
    }, 'listarCodigosPublicados')
    for (const it of payload?.items || []) {
      if (it.codigo) codigos.add(it.codigo)
    }
    totalPaginas = payload?.paginacion?.total_paginas || 1
    pagina++
  } while (pagina <= totalPaginas)
  return [...codigos]
}

/**
 * Lista TODAS las Compra Ágil "publicada" con cambios dentro de `ventanaMs`
 * — SIN filtro `q` — pidiendo una región a la vez (ver incidente #5 abajo) y
 * paginando cada una hasta traer todo. Cada ítem trae al menos {codigo,
 * nombre}. Devuelve `{ items, erroresPorRegion }` — no solo el arreglo — para
 * que una región puntual que falle no tumbe la corrida completa.
 *
 * ⚠️ 2026-09-08 (noche, incidente #2 — "sigue el error al buscar"): el
 * detector automático hacía 12 llamadas separadas (una por palabra clave del
 * rubro RMG) usando `q=<palabra>`. En producción, EXACTAMENTE 5 de esas 12
 * palabras — las más genéricas/comunes: "lubricante", "aceite", "grasa",
 * "refrigerante", "anticongelante" — devolvían HTTP 500 "Servicio no
 * disponible" en TODAS las corridas (confirmado en los logs de Render:
 * mismo resultado en 8+ corridas separadas, minutos aparte, nunca
 * transitorio). Palabras más específicas ("hidraulico", "bateria",
 * "adblue") sí funcionaban. La hipótesis más consistente con ese patrón es
 * que el buscador de texto libre (`q`) de esta API beta de mayo 2026 no
 * soporta bien palabras genéricas que matchean demasiados resultados a nivel
 * nacional (timeout/500 interno de ChileCompra), independiente de la ventana
 * de tiempo pedida.
 *
 * Fix: en vez de 12 búsquedas por palabra, se pide UNA sola vez (paginada)
 * el listado completo de "publicada" cambiadas en la ventana — sin `q` — y
 * el filtrado por palabra clave se hace acá mismo, en memoria, sobre
 * `nombre`. Esto además consume mucha menos cuota diaria del ticket (1-2
 * llamadas en vez de 12+ por corrida, cada 15 min).
 *
 * 2026-09-09 — parámetros configurables (pedido explícito del usuario:
 * "que estado de publicación? entre que fechas ayer/7/15/30 días? regiones?"
 * — quiere el mismo nivel de control que ya existe en Licitaciones). Antes
 * `estado` y `region` estaban fijos en el código (solo "publicada", sin
 * filtro de región) — ahora se pueden pasar desde el botón "Buscar ahora"
 * de la UI (ver CompraAgilPage.jsx) o desde el cron (que sigue usando los
 * valores por defecto). `region` es un filtro REPETIBLE en la API oficial
 * (?region=5&region=13, no una lista separada por comas como `estado`) —
 * por eso se arma a mano con URLSearchParams en vez de pasar un objeto
 * plano a axios (que serializaría un array como region[]=5, que la API no
 * entiende).
 */
// 2026-09-09 (incidente #5, real: nationwide sin `region` → 504 "Endpoint
// request timed out" en la propia API de ChileCompra, incluso con el
// reintento a 60s de `llamar()` — ver más abajo). Todos los códigos de región
// válidos según la guía oficial (mismo mapa que REGIONES) — se usa para
// partir la consulta nacional en una llamada por región cuando no se pide
// ninguna región específica.
const TODAS_LAS_REGIONES = Object.keys(REGIONES).map(Number)

/**
 * ⚠️ 2026-09-09 (incidente #5 — reportado en producción con evidencia real):
 * pedirle a la API el listado nacional SIN `region` (un solo llamado, sin
 * filtro) responde 504 "Endpoint request timed out" ya en la página 1 — y
 * eso NO se arregla subiendo el timeout del cliente (el reintento de
 * `llamar()` ya sube a 60s y igual da 504): es un timeout del LADO DE
 * CHILECOMPRA, probablemente porque sin `region` su consulta hace un barrido
 * mucho más pesado. La misma consulta acotada a una región (como
 * `region=13`, Metropolitana, que es como corría antes) responde normal.
 *
 * La solución NO es volver a restringir cobertura — eso es justo lo que el
 * usuario pidió sacar ("debes traer lo que encuentra Mercado Público... tú
 * solo extrae lo que sale, luego filtramos en el sistema nuestro"). La
 * solución es partir la MISMA consulta nacional (sin ningún filtro de
 * palabras ni exclusión de región) en 16 llamadas chicas — una por región —
 * en vez de una sola pesada. Cobertura sigue siendo 100% nacional; solo
 * cambia CÓMO se le pide a la API, no QUÉ se trae. Si una región puntual
 * falla (504, 500, etc.), se salta esa región y se sigue con las demás en
 * vez de perder la corrida completa — el error queda registrado en
 * `erroresPorRegion` para que quede visible en el resumen que ve el usuario.
 */
async function listarPublicadasEnVentana({ ventanaMs = 6 * 3600_000, estados = ['publicada'], regiones = [] } = {}) {
  const listaRegiones = (regiones && regiones.length) ? regiones : TODAS_LAS_REGIONES
  const items = []
  const codigosVistos = new Set()
  const erroresPorRegion = []

  for (const region of listaRegiones) {
    try {
      let pagina = 1
      let totalPaginas = 1
      do {
        const qp = new URLSearchParams()
        qp.set('ttl_cambio_ms', String(ventanaMs))
        qp.set('estado', (estados?.length ? estados : ['publicada']).join(','))
        qp.set('tamano_pagina', '50')
        qp.set('numero_pagina', String(pagina))
        qp.append('region', String(region))
        const payload = await llamar('/v2/compra-agil', qp, `listarPublicadasEnVentana(región=${region})`)
        for (const it of payload?.items || []) {
          if (it.codigo && !codigosVistos.has(it.codigo)) {
            codigosVistos.add(it.codigo)
            items.push({ codigo: it.codigo, nombre: it.nombre || '', estado: it.estado?.codigo || it.estado || null })
          }
        }
        totalPaginas = payload?.paginacion?.total_paginas || 1
        pagina++
      } while (pagina <= totalPaginas)
    } catch (e) {
      erroresPorRegion.push(`${REGIONES[region] || `región ${region}`}: ${e.message}`)
    }
  }
  return { items, erroresPorRegion }
}

// ── Descarga de documentos adjuntos (2026-09-09, confirmado 2026-09-12) ─────
// Pedido real del usuario: "no veo que lea los adjuntos y encuentre lo que se
// pide" — el detalle de la API a veces solo trae una línea genérica en
// `productos_solicitados[]`, y el requerimiento real vive en un PDF/Word que
// la propia API referencia en `documentos[]` (ver mapearDetalle).
//
// 2026-09-12 — CONFIRMADO contra un caso real (3086-735-COT26, que sí tiene
// un adjunto ".docx" visible en el portal público): `documentos[]` viene como
// `[{ id: 1883455, nombre: "3086-735-COT26 }.docx" }]` — SOLO `id` y
// `nombre`, SIN ningún campo de URL directa. La guía de la API v2 no
// documenta (o no se encontró) el endpoint exacto para bajar un documento
// por su `id` — se prueban acá las rutas más probables del mismo estilo REST
// que el resto de la API (`/v2/compra-agil/.../documento/{id}`), UNA SOLA
// VEZ cada una, y si ninguna responde con el archivo real, se informa el
// motivo exacto de cada intento (no un genérico "no se pudo") para poder
// ajustar esto en cuanto se confirme el endpoint correcto (con la guía del
// desarrollador, o mirando el tráfico de red del portal público al abrir ese
// mismo adjunto).
const CAMPOS_URL_PROBABLES = ['url', 'urlDescarga', 'url_descarga', 'link', 'uri', 'urlDocumento', 'url_documento']
const CAMPOS_NOMBRE_PROBABLES = ['nombre', 'nombreArchivo', 'nombre_archivo', 'name', 'titulo']
const CAMPOS_ID_PROBABLES = ['id', 'idDocumento', 'id_documento', 'documentoId']
const RUTAS_DOCUMENTO_POR_ID = (id) => [
  `/v2/compra-agil/documento/${id}`,
  `/v2/compra-agil/documentos/${id}`,
  `/v2/documento/${id}`,
  `/v2/documentos/${id}`,
]

async function descargarPorUrl(url, nombre) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: TICKET ? { ticket: TICKET } : undefined,
    timeout: 30_000,
    validateStatus: () => true,
  })
  if (resp.status >= 400) {
    return { ok: false, motivo: `HTTP ${resp.status} en ${url}` }
  }
  const tipoRespuesta = String(resp.headers?.['content-type'] || '').split(';')[0].trim()
  // Un 200 con content-type text/html casi siempre es una página de error o
  // de login disfrazada de "éxito" (validateStatus:true no distingue esto) —
  // se trata igual que un fallo, para no guardar un HTML como si fuera el PDF/Word.
  if (tipoRespuesta.includes('text/html')) {
    return { ok: false, motivo: `${url} respondió HTML (200) en vez de un archivo — probablemente la ruta no existe o requiere otra autenticación` }
  }
  const mediaType = tipoRespuesta || (nombre.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
  return { ok: true, documento: { base64: Buffer.from(resp.data).toString('base64'), mediaType, nombre } }
}

async function descargarDocumentoAdjunto(doc) {
  const campoNombre = CAMPOS_NOMBRE_PROBABLES.find(c => typeof doc?.[c] === 'string')
  const nombre = campoNombre ? doc[campoNombre] : 'documento'

  const campoUrl = CAMPOS_URL_PROBABLES.find(c => typeof doc?.[c] === 'string' && doc[c].startsWith('http'))
  if (campoUrl) {
    try {
      return await descargarPorUrl(doc[campoUrl], nombre)
    } catch (err) {
      return { ok: false, motivo: `error de red descargando ${doc[campoUrl]} — ${err.message}` }
    }
  }

  const campoId = CAMPOS_ID_PROBABLES.find(c => doc?.[c] != null)
  if (campoId) {
    const id = doc[campoId]
    const intentos = []
    for (const ruta of RUTAS_DOCUMENTO_POR_ID(id)) {
      try {
        const r = await descargarPorUrl(`${BASE_URL}${ruta}`, nombre)
        if (r.ok) return r
        intentos.push(r.motivo)
      } catch (err) {
        intentos.push(`error de red en ${ruta} — ${err.message}`)
      }
    }
    return { ok: false, motivo: `documento con id=${id} pero sin endpoint de descarga confirmado — se probó: ${intentos.join(' | ')}` }
  }

  return { ok: false, motivo: `sin campo de URL ni de id reconocible (claves recibidas: ${Object.keys(doc || {}).join(', ') || 'ninguna'})` }
}

module.exports = {
  buscarCompraAgil, listarCodigosPublicados, listarPublicadasEnVentana, REGIONES,
  descargarDocumentoAdjunto,
}
