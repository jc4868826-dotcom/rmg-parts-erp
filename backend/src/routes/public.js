/**
 * RMG Auto Parts — Rutas públicas (sin autenticación)
 * Usadas por el landing para crear cotizaciones anónimas.
 */

const router = require('express').Router()
const fs     = require('fs')
const path   = require('path')
const { createDesdeLanding: createCotizacionLanding } = require('../controllers/cotizacionesController')
const { createDesdeLanding: createPedidoLanding }     = require('../controllers/pedidosController')
const { db, uuidv4 } = require('../../config/database')

// Ruta al JSON de ingeniería — comprometido en el repo, accesible en cualquier servicio Render
// (desde backend/src/routes/ → ../../../asistente/catalogo_ingenieria.json)
const _CATALOGO_ING_PATH = path.join(__dirname, '..', '..', '..', 'asistente', 'catalogo_ingenieria.json')
let _catalogoIngCache = null

function _getCatalogoIng() {
  if (_catalogoIngCache) return _catalogoIngCache
  const raw = fs.readFileSync(_CATALOGO_ING_PATH, 'utf8')
  _catalogoIngCache = JSON.parse(raw)
  console.log(`[catalogo-ingenieria] Cargados ${_catalogoIngCache.length} artículos desde JSON local`)
  return _catalogoIngCache
}

// ─── Autenticación simple servidor-a-servidor para el bot Cata ──────────
// Distinto de las rutas públicas de arriba: estas dos rutas exponen precio real
// y datos de pedidos, así que exigen una clave compartida en el header x-api-key
// (variable de entorno CATA_API_KEY). No es login de usuario — es solo para que
// el bot de WhatsApp (server.js de "negocio sistemas") pueda consultarlas.
function _requireCataApiKey(req, res, next) {
  const configured = process.env.CATA_API_KEY
  if (!configured) return res.status(503).json({ error: 'CATA_API_KEY no configurada en el servidor' })
  if (req.headers['x-api-key'] !== configured) return res.status(401).json({ error: 'No autorizado' })
  next()
}

// POST /api/public/cotizaciones
router.post('/cotizaciones', createCotizacionLanding)

// POST /api/public/pedidos
// Body: { cliente: {nombre, telefono, email?, rut?}, lineas: [{codigo_sku, descripcion, cantidad, precio_venta_neto}] }
router.post('/pedidos', createPedidoLanding)

// GET /api/public/catalogo  — catálogo sin precios para landing institucional
router.get('/catalogo', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT codigo_sku, descripcion, producto_generico, marca, proveedor,
             categoria, presentacion, tipo_envase, segmento_negocio, rubro, aplicacion,
             ranking_compra
      FROM lista_precios
      WHERE codigo_sku IS NOT NULL
      GROUP BY codigo_sku
      ORDER BY proveedor, categoria, ranking_compra ASC
    `).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/public/prospectos — captura leads desde catálogo institucional
router.post('/prospectos', (req, res) => {
  try {
    const { nombre, empresa, rubro, producto_interes, telefono, email } = req.body
    if (!empresa || !telefono) return res.status(400).json({ error: 'empresa y telefono son requeridos' })
    const RUBRO_SEGMENTO = {
      Talleres: 'taller', Concesionarios: 'concesionario', Flotas: 'flota',
      Agricola: 'flota', Mineria: 'construccion', Construccion: 'construccion',
      Industria: 'flota', RentACar: 'rentacar',
    }
    const segmento = RUBRO_SEGMENTO[rubro] || 'flota'
    const id = uuidv4()
    db.prepare(`
      INSERT INTO pipeline_contactos
        (id, empresa, segmento, rubro_especialidad, nombre_contacto, telefono_contacto,
         email, notas, etapa, estado, fuente, prioridad)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, empresa || 'Sin empresa', segmento,
      rubro || null, nombre || null, telefono || null,
      email || null,
      producto_interes ? `Producto de interés: ${producto_interes}` : null,
      'prospecto', 'activo', 'landing_catalogo', 'media'
    )
    res.json({ ok: true, prospecto_id: id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/public/catalogo-ingenieria — catálogo de ingeniería con jerarquía completa
// Lee directamente desde catalogo_ingenieria.json (sin depender del asistente ZARA,
// que puede estar en cold-start en Render free tier y causar timeout → dataset vacío)
router.get('/catalogo-ingenieria', (req, res) => {
  try {
    res.json(_getCatalogoIng())
  } catch (err) {
    console.error('[catalogo-ingenieria] Error leyendo JSON:', err.message)
    res.status(500).json({ error: 'No se pudo cargar el catálogo de ingeniería' })
  }
})

// GET /api/public/landing/foto/:tabla/:id — sirve imagen binaria desde DB
// :id para familias es el nombre (NEUMATICOS, etc.), para el resto es numérico
router.get('/landing/foto/:tabla/:id', (req, res) => {
  const { tabla, id } = req.params
  const TABLAS = {
    familias:   { table: 'landing_familias',    col: 'familia' },
    subfamilias: { table: 'landing_subfamilias', col: 'id' },
    productos:  { table: 'landing_productos',   col: 'id' },
    banners:    { table: 'landing_banners',      col: 'id' },
  }
  const def = TABLAS[tabla]
  if (!def) return res.status(400).json({ error: 'Tabla inválida' })
  try {
    const val = def.col === 'id' ? parseInt(id) : id
    const row = db.prepare(
      `SELECT foto_base64, foto_mimetype FROM ${def.table} WHERE ${def.col} = ?`
    ).get(val)
    if (!row || !row.foto_base64) return res.status(404).json({ error: 'Foto no encontrada' })
    const buf = Buffer.from(row.foto_base64, 'base64')
    res.set('Content-Type', row.foto_mimetype || 'image/jpeg')
    res.set('Cache-Control', 'no-cache')
    res.send(buf)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/public/landing/familias
router.get('/landing/familias', (_req, res) => {
  try {
    const rows = db.prepare(
      'SELECT familia, foto_path, descripcion, updated_at FROM landing_familias ORDER BY familia ASC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/public/landing/subfamilias — solo activas
router.get('/landing/subfamilias', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, familia, nombre, descripcion, orden, activo, created_at, updated_at
      FROM landing_subfamilias WHERE activo = 1
      ORDER BY familia ASC, orden ASC, id ASC
    `).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/public/landing/productos — solo activos
router.get('/landing/productos', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, familia, subfamilia, subfamilia_id, codigo, marca, nombre,
             descripcion, contenido, imagen_url, subtitulo, foto_mimetype,
             sae, tipo, aplicaciones, beneficios, presentaciones, ficha_tecnica_url, compatibilidad,
             um, presentacion, precio, detalles_tecnicos,
             activo, orden, created_at, updated_at
      FROM landing_productos WHERE activo = 1
      ORDER BY familia ASC, orden ASC, id ASC
    `).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/public/landing/productos/:id — ficha individual de producto
router.get('/landing/productos/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT id, familia, subfamilia, subfamilia_id, codigo, marca, nombre,
             descripcion, contenido, imagen_url, subtitulo, foto_mimetype,
             sae, tipo, aplicaciones, beneficios, presentaciones, ficha_tecnica_url, compatibilidad,
             um, presentacion, precio, detalles_tecnicos,
             activo, orden, created_at, updated_at
      FROM landing_productos WHERE id = ?
    `).get(parseInt(req.params.id))
    if (!row) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/public/landing/banners — solo activos
router.get('/landing/banners', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, orden, activo, created_at
      FROM landing_banners WHERE activo = 1
      ORDER BY orden ASC, id ASC
    `).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/public/catalogo-precios — como /catalogo pero CON precio neto real.
// Protegida con x-api-key porque a diferencia del catálogo institucional (sin precio,
// pensado para que cualquiera lo vea en la landing), este endpoint sí expone el precio
// mayorista real de RMG Parts — solo debe consumirlo el bot Cata, servidor a servidor.
// Dedupe por SKU quedándose con el precio más bajo (mismo criterio que ya usa
// "Artículos únicos" en ListaPreciosPage.jsx y el asistente ZARA).
router.get('/catalogo-precios', _requireCataApiKey, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT codigo_sku, descripcion, producto_generico, marca, proveedor,
             categoria, presentacion, tipo_envase, segmento_negocio, rubro, aplicacion,
             unidades_por_pack, precio_venta_neto
      FROM lista_precios
      WHERE codigo_sku IS NOT NULL AND precio_venta_neto IS NOT NULL
      ORDER BY proveedor, categoria
    `).all()
    const minPorSku = new Map()
    for (const r of rows) {
      const prev = minPorSku.get(r.codigo_sku)
      if (!prev || (r.precio_venta_neto || 0) < (prev.precio_venta_neto || 0)) minPorSku.set(r.codigo_sku, r)
    }
    res.json(Array.from(minPorSku.values()))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/public/pedido-estado?rut=...&numero=...   o   ?rut=...&nombre=...
// Para que Cata pueda responder "¿me despacharon mi pedido?" incluso si el cliente
// escribe desde un número de WhatsApp distinto al que tiene registrado. Exige el RUT
// MÁS (número de pedido O nombre) — nunca alcanza con uno solo, para que no cualquiera
// pueda consultar el pedido de otra persona adivinando un RUT. Devuelve solo estado y
// fechas de despacho — nunca montos ni el resto de los pedidos del cliente.
router.get('/pedido-estado', _requireCataApiKey, (req, res) => {
  try {
    const { rut, numero, nombre } = req.query
    if (!rut || (!numero && !nombre)) {
      return res.status(400).json({ error: 'Se requiere rut y (numero de pedido o nombre completo)' })
    }
    const norm = (s) => String(s || '').toUpperCase().replace(/[.\-]/g, '')
    const rutNorm = norm(rut)

    const clientes = db.prepare(`SELECT id, razon_social, contacto_nombre, rut FROM clientes WHERE activo = 1 AND rut IS NOT NULL`).all()
    const cliente = clientes.find(c => norm(c.rut) === rutNorm)
    if (!cliente) return res.json({ encontrado: false, mensaje: 'No encontramos un cliente con ese RUT' })

    let pedido = null
    if (numero) {
      pedido = db.prepare(`SELECT * FROM pedidos WHERE cliente_id = ? AND numero = ?`).get(cliente.id, String(numero).trim())
    }
    if (!pedido && nombre) {
      const nombreNorm = String(nombre).trim().toLowerCase()
      const nombreCliente = String(cliente.contacto_nombre || cliente.razon_social || '').trim().toLowerCase()
      const coincide = nombreNorm.length > 2 && nombreCliente && (nombreCliente.includes(nombreNorm) || nombreNorm.includes(nombreCliente))
      if (coincide) {
        pedido = db.prepare(`SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 1`).get(cliente.id)
      }
    }
    if (!pedido) return res.json({ encontrado: false, mensaje: 'No encontramos un pedido que coincida con esos datos' })

    res.json({
      encontrado: true,
      numero: pedido.numero,
      estado: pedido.estado,
      fecha_entrega_programada: pedido.fecha_entrega_programada || null,
      fecha_entrega_real: pedido.fecha_entrega_real || null,
      guia_despacho: pedido.guia_despacho || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
