/**
 * RMG Auto Parts — Rutas públicas (sin autenticación)
 * Usadas por el landing para crear cotizaciones anónimas.
 */

const router = require('express').Router()
const axios  = require('axios')
const { createDesdeLanding: createCotizacionLanding } = require('../controllers/cotizacionesController')
const { createDesdeLanding: createPedidoLanding }     = require('../controllers/pedidosController')
const { db, uuidv4 } = require('../../config/database')

const ASISTENTE_URL = process.env.ASISTENTE_URL || 'https://asistente-7st0.onrender.com'

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

// GET /api/public/catalogo-ingenieria — proxy server-to-server al asistente ZARA
// Devuelve Artículo + Composición (Ingeniería) + Resistencia Técnica / Aplicación
// Nota: datos en revisión contra fichas técnicas del fabricante (ver badge en frontend)
router.get('/catalogo-ingenieria', async (req, res) => {
  try {
    const { data } = await axios.get(`${ASISTENTE_URL}/catalogo-ingenieria`, { timeout: 10000 })
    res.json(data)
  } catch (err) {
    // Si el asistente no responde, retornar lista vacía — el frontend omite enriquecimiento
    res.json([])
  }
})

module.exports = router
