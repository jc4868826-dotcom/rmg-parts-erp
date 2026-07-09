/**
 * RMG Auto Parts — Rutas públicas (sin autenticación)
 * Usadas por el landing para crear cotizaciones anónimas.
 */

const router = require('express').Router()
const { createDesdeLanding: createCotizacionLanding } = require('../controllers/cotizacionesController')
const { createDesdeLanding: createPedidoLanding }     = require('../controllers/pedidosController')
const { db, uuidv4 } = require('../../config/database')

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

module.exports = router
