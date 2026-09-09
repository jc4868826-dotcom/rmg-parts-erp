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

async function llamar(path, params, origen) {
  if (!TICKET) {
    throw new Error(`${origen}: falta la variable de entorno COMPRA_AGIL_API_TICKET (ticket de la API oficial de Compra Ágil).`)
  }
  let resp
  try {
    resp = await axios.get(`${BASE_URL}${path}`, {
      params,
      headers: { ticket: TICKET },
      timeout: 20_000,
      validateStatus: () => true,
    })
  } catch (err) {
    throw new Error(`${origen}: no se pudo contactar ${BASE_URL}${path} — ${err.message}`)
  }

  if (resp.status === 429) {
    const espera = resp.headers?.['retry-after']
    throw new Error(`${origen}: cuota diaria de la API Compra Ágil agotada (429)${espera ? ` — reintentar en ${espera}` : ' — reintentar mañana'}.`)
  }
  if (resp.status >= 400) {
    const msg = resp.data?.errors?.[0]?.mensaje || (typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data))?.slice(0, 300)
    throw new Error(`${origen}: HTTP ${resp.status} — ${msg}`)
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
 * — SIN filtro `q` — y pagina hasta traer todo. Cada ítem trae al menos
 * {codigo, nombre}.
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
 */
async function listarPublicadasEnVentana({ ventanaMs = 6 * 3600_000 } = {}) {
  const items = []
  let pagina = 1
  let totalPaginas = 1
  do {
    const payload = await llamar('/v2/compra-agil', {
      ttl_cambio_ms: ventanaMs,
      estado: 'publicada',
      tamano_pagina: 50,
      numero_pagina: pagina,
    }, 'listarPublicadasEnVentana')
    for (const it of payload?.items || []) {
      if (it.codigo) items.push({ codigo: it.codigo, nombre: it.nombre || '' })
    }
    totalPaginas = payload?.paginacion?.total_paginas || 1
    pagina++
  } while (pagina <= totalPaginas)
  return items
}

module.exports = { buscarCompraAgil, listarCodigosPublicados, listarPublicadasEnVentana }
