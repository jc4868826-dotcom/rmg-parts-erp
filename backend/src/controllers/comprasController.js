/**
 * RMG Parts — Proveedores y Cuentas por Pagar.
 * La Orden de Compra (creación, autorización, envío, recepción, factura, pago)
 * vive únicamente en ocController.js — antes estaba duplicada acá con nombres
 * de estado distintos (Pendiente_Autorizacion/Autorizada/...) sobre la misma
 * tabla `ordenes_compra`, y en una tercera tabla simple `compras`/`compra_items`
 * que ya no se usa (la pantalla que la consumía, ComprasErpPage, se retiró).
 */
const { db, uuidv4 } = require('../../config/database')

const withItems = (oc) => {
  if (!oc) return null
  const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(oc.id)
  return { ...oc, items, pagada: oc.pagada === 1 }
}

// ── Proveedores ────────────────────────────────────────────────
const getProveedores = (req, res) => {
  try {
    const { activo } = req.query
    let sql = 'SELECT * FROM proveedores'
    const params = []
    if (activo !== undefined) { sql += ' WHERE activo = ?'; params.push(activo === 'true' ? 1 : 0) }
    sql += ' ORDER BY razon_social'
    const rows = db.prepare(sql).all(...params)
    res.json(rows.map(p => ({ ...p, categorias: JSON.parse(p.categorias || '[]') })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getProveedor = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' })
    const ocs = db.prepare('SELECT * FROM ordenes_compra WHERE proveedor_id = ? ORDER BY created_at DESC').all(p.id)
    res.json({ ...p, categorias: JSON.parse(p.categorias || '[]'), ordenes_compra: ocs.map(withItems) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createProveedor = (req, res) => {
  try {
    const id = uuidv4()
    const { razon_social, rut, contacto, cargo, telefono, email, categorias,
            plazo_pago, condicion, banco, cuenta } = req.body
    db.prepare(`INSERT INTO proveedores
      (id,razon_social,rut,contacto,cargo,telefono,email,categorias,plazo_pago,condicion,banco,cuenta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, razon_social, rut || null, contacto || null, cargo || null,
      telefono || null, email || null,
      JSON.stringify(categorias || []),
      plazo_pago || 30, condicion || null, banco || null, cuenta || null)
    const p = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(id)
    res.status(201).json({ ...p, categorias: JSON.parse(p.categorias || '[]') })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const updateProveedor = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' })
    const body = { ...req.body }
    if (body.categorias) body.categorias = JSON.stringify(body.categorias)
    const fields = Object.keys(body).filter(k => k !== 'id')
    if (!fields.length) return res.json(p)
    const set = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE proveedores SET ${set}, updated_at = datetime('now') WHERE id = ?`)
      .run(...fields.map(f => body[f]), req.params.id)
    const updated = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id)
    res.json({ ...updated, categorias: JSON.parse(updated.categorias || '[]') })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── CxP (Cuentas por Pagar) — se completan cuando ocController registra la factura ──
const getCxP = (req, res) => {
  try {
    const { estado, proveedor_id } = req.query
    let sql = 'SELECT * FROM facturas_cxp'
    const params = []
    const where = []
    if (estado) { where.push('estado = ?'); params.push(estado) }
    if (proveedor_id) { where.push('proveedor_id = ?'); params.push(proveedor_id) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY fecha_vencimiento ASC'
    const hoy = new Date()
    const rows = db.prepare(sql).all(...params).map(f => {
      const vence = new Date(f.fecha_vencimiento)
      const dias_vencida = Math.round((hoy - vence) / (1000 * 60 * 60 * 24))
      return { ...f, dias_vencida }
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const pagarFactura = (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM facturas_cxp WHERE id = ?').get(req.params.id)
    if (!f) return res.status(404).json({ error: 'Factura no encontrada' })
    const fecha_pago = new Date().toISOString().split('T')[0]
    db.prepare("UPDATE facturas_cxp SET estado = 'pagada', fecha_pago = ? WHERE id = ?")
      .run(fecha_pago, req.params.id)
    db.prepare(`
      UPDATE caja_movimientos SET estado = 'confirmado', fecha_pago = ?
      WHERE origen_tabla = 'facturas_cxp' AND origen_id = ?
    `).run(fecha_pago, req.params.id)
    res.json(db.prepare('SELECT * FROM facturas_cxp WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const deleteCxP = (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM facturas_cxp WHERE id = ?').get(req.params.id)
    if (!f) return res.status(404).json({ error: 'Factura CxP no encontrada' })
    // Una factura pendiente la puede borrar cualquiera (es solo corregir un
    // dato antes de pagar). Una ya "pagada" ya generó un egreso real en
    // caja_movimientos, así que borrarla (lo que también revierte ese egreso,
    // abajo) queda reservado a gerente/administrador — para limpiar registros
    // erróneos, no para que cualquiera borre historial de pagos reales.
    if (f.estado === 'pagada' && !['gerente', 'administrador'].includes(req.user?.rol)) {
      return res.status(403).json({ error: 'Solo gerente o administrador pueden eliminar una factura ya pagada' })
    }
    db.prepare('DELETE FROM caja_movimientos WHERE origen_tabla = ? AND origen_id = ?')
      .run('facturas_cxp', req.params.id)
    db.prepare('DELETE FROM facturas_cxp WHERE id = ?').run(req.params.id)
    res.json({ ok: true, eliminada: f })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getProveedores, getProveedor, createProveedor, updateProveedor,
  getCxP, pagarFactura, deleteCxP,
}
