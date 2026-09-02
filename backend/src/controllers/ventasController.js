'use strict'
/**
 * RMG Parts — Venta, destino único del flujo comercial.
 * Se llega a una Venta desde una Cotización, desde un Pedido, o directo —
 * las tres rutas conviven. Al crearse, la Venta genera salida de stock.
 * Los estados logísticos (en_proceso · despachada · recibida_cliente) son
 * editables libremente por un usuario autorizado, no un avance forzado.
 */
const { db, uuidv4 } = require('../../config/database')
const { tipoDeDocumento } = require('../middleware/documentos')

const ESTADOS_LOGISTICOS = ['en_proceso', 'despachada', 'recibida_cliente']

const hoy = () => new Date().toISOString().split('T')[0]

// venta.total se guarda NETO en todo el sistema (ver utils/format.js del
// frontend) — pero el dinero que realmente entra a la cuenta corriente al
// pagar una venta es el total CON IVA (19%), no el neto. El Flujo de Caja
// debe reflejar el movimiento de caja real, así que cualquier ingreso que se
// registre en caja_movimientos a partir de una venta usa este monto, nunca
// venta.total directo. Misma fórmula que calcularIVA()/totalConIVA() del
// frontend, para que el número calce en toda la app.
const totalConIva = (neto) => (Number(neto) || 0) + Math.round((Number(neto) || 0) * 0.19)

// El costo (costo_unidad_neto) guardado en lista_precios para un SKU en
// caja/pack es el precio de LA CAJA completa, no de la unidad — igual que se
// corrigió en inventarioController.getStock() y listaPrecios.js /buscar. Acá
// se dividía por unidades_por_pack solo en esos dos lugares; este getLp()
// (usado para fijar costo_unitario al crear una Venta desde Cotización o
// Pedido) seguía devolviendo el costo de caja tal cual, lo que inflaba el
// costo de mercadería hasta ×unidades_por_pack en cualquier SKU con pack.
const getLp = (codigo) => {
  const p = db.prepare(
    'SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(costo_unidad_neto,0)) AS costo_caja, MAX(unidades_por_pack) AS unidades_por_pack, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
  ).get(codigo)
  if (!p) return null
  const pack = p.unidades_por_pack > 1 ? p.unidades_por_pack : null
  return { ...p, costo: pack ? p.costo_caja / pack : p.costo_caja }
}

// Registra un movimiento de stock y actualiza lista_precios.stock_actual.
// cantidad SIEMPRE positiva; el signo lo decide `tipo` ('salida' resta, 'entrada'/'ajuste' suma tal cual el llamador indique).
function moverStock({ codigo, descripcion, tipo, cantidad, motivo, referencia }) {
  if (!codigo || !cantidad) return null
  const p = getLp(codigo)
  const stock_anterior = p ? p.stock_actual : 0
  const delta = tipo === 'salida' ? -Math.abs(cantidad) : cantidad
  const stock_nuevo = stock_anterior + delta

  if (p) db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stock_nuevo, codigo)

  const id = uuidv4()
  db.prepare(`INSERT INTO movimientos_stock
    (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia)
    VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(id, codigo, codigo, descripcion || (p && p.descripcion) || codigo, tipo, Math.abs(delta), stock_anterior, stock_nuevo, motivo, referencia || null)

  return db.prepare('SELECT * FROM movimientos_stock WHERE id = ?').get(id)
}

// Enriquece cada línea con la presentación/pack del SKU (lista_precios), solo
// para referencia visual — cantidad y stock siempre se manejan en unidades.
const enriquecerConPack = (items) => {
  const lp = db.prepare('SELECT MAX(unidades_por_pack) AS unidades_por_pack, MAX(presentacion) AS presentacion FROM lista_precios WHERE codigo_sku = ?')
  return items.map(i => {
    if (!i.sku) return i
    const info = lp.get(i.sku)
    return { ...i, unidades_por_pack: info?.unidades_por_pack || null, presentacion: info?.presentacion || null }
  })
}

const withItems = (v) => {
  if (!v) return null
  const items = enriquecerConPack(db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(v.id))
  return { ...v, items }
}

const siguienteNumero = () => {
  const n = db.prepare('SELECT COUNT(*) as n FROM ventas').get().n
  return `VTA-2026-${String(n + 1).padStart(3, '0')}`
}

const getAll = (req, res) => {
  try {
    const { mes, estado_logistico, cliente_id, cotizacion_id, pedido_id } = req.query
    let sql = `
      SELECT v.*, c.rut as cliente_rut, u.nombre as vendedor_nombre,
        (SELECT json_group_array(json_object(
          'id', i.id, 'sku', i.sku, 'descripcion', i.descripcion,
          'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario,
          'costo_unitario', i.costo_unitario, 'descuento_pct', COALESCE(i.descuento_pct,0), 'subtotal', i.subtotal
        )) FROM venta_items i WHERE i.venta_id = v.id) as items
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      LEFT JOIN usuarios u ON u.id = v.vendedor_id`
    const where = [], params = []
    if (mes)              { where.push('v.fecha LIKE ?');            params.push(`${mes}%`) }
    if (estado_logistico) { where.push('v.estado_logistico = ?');    params.push(estado_logistico) }
    if (cliente_id)       { where.push('v.cliente_id = ?');          params.push(cliente_id) }
    if (cotizacion_id)    { where.push('v.cotizacion_id = ?');       params.push(cotizacion_id) }
    if (pedido_id)         { where.push('v.pedido_id = ?');           params.push(pedido_id) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY v.fecha DESC, v.created_at DESC'
    const rows = db.prepare(sql).all(...params)
    res.json(rows.map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOne = (req, res) => {
  try {
    const venta = db.prepare(`
      SELECT v.*, c.rut as cliente_rut, u.nombre as vendedor_nombre
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      LEFT JOIN usuarios u ON u.id = v.vendedor_id
      WHERE v.id = ?
    `).get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    res.json(withItems(venta))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Subtotal de línea con descuento aplicado — mismo cálculo que cotizacion_items
// y pedido_items, ahora también en venta_items (antes no existía descuento acá).
const lineSubtotal = (item) =>
  Number(item.cantidad || 0) * Number(item.precio_unitario || 0) * (1 - (Number(item.descuento_pct) || 0) / 100)

// Inserta la venta + items + salida de stock. Usada por create / createFromCotizacion / createFromPedido.
function _insertVenta({ numero_documento, tipo_documento, cliente_id, cliente_nombre, cotizacion_id,
                         pedido_id, forma_pago, notas, direccion_entrega, vendedor_id, items = [] }) {
  const numero = numero_documento || siguienteNumero()
  const total = items.reduce((s, i) => s + lineSubtotal(i), 0)
  const costo_total = items.reduce((s, i) => s + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)

  const doCreate = db.transaction(() => {
    db.prepare(`
      INSERT INTO ventas
        (fecha, cliente_nombre, numero_documento, tipo_documento, total, costo_total, estado, forma_pago, notas,
         cliente_id, cotizacion_id, pedido_id, estado_logistico, direccion_entrega, vendedor_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(hoy(), cliente_nombre || '', numero, tipo_documento || 'Venta', total, costo_total,
           'Pendiente', forma_pago || 'Contado', notas || '',
           cliente_id || null, cotizacion_id || null, pedido_id || null,
           'en_proceso', direccion_entrega || null, vendedor_id || null)
    const ventaId = db.prepare('SELECT last_insert_rowid() as id').get().id

    for (const item of items) {
      const sub = lineSubtotal(item)
      db.prepare(`INSERT INTO venta_items (venta_id, sku, descripcion, cantidad, precio_unitario, costo_unitario, descuento_pct, subtotal) VALUES (?,?,?,?,?,?,?,?)`)
        .run(ventaId, item.sku || item.codigo || '', item.descripcion || '', Number(item.cantidad || 0),
             Number(item.precio_unitario || 0), Number(item.costo_unitario || 0), Number(item.descuento_pct) || 0, sub)

      // El stock sale apenas la venta se genera (no al despachar) — así lo pidió el negocio.
      if (item.sku || item.codigo) {
        moverStock({
          codigo: item.sku || item.codigo,
          descripcion: item.descripcion,
          tipo: 'salida',
          cantidad: Number(item.cantidad || 0),
          motivo: `Venta ${numero}`,
          referencia: String(ventaId),
        })
      }
    }
    return ventaId
  })

  const ventaId = doCreate()
  return withItems(db.prepare('SELECT * FROM ventas WHERE id = ?').get(ventaId))
}

const create = (req, res) => {
  try {
    const { fecha, cliente_nombre, cliente_id, numero_documento, tipo_documento, forma_pago, notas,
            direccion_entrega, items = [] } = req.body
    if (!items.length) return res.status(400).json({ error: 'La venta requiere al menos un ítem' })
    const venta = _insertVenta({
      numero_documento, tipo_documento, cliente_id, cliente_nombre, forma_pago, notas,
      direccion_entrega, vendedor_id: req.user?.id, items,
    })
    // Permite fijar una fecha específica si vino en el body (por defecto, hoy)
    if (fecha) db.prepare('UPDATE ventas SET fecha = ? WHERE id = ?').run(fecha, venta.id)
    res.status(201).json(fecha ? { ...venta, fecha } : venta)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createFromCotizacion = (req, res) => {
  try {
    const cotId = req.params.cotizacionId
    const cot = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(cotId)
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' })

    const existente = db.prepare('SELECT id FROM ventas WHERE cotizacion_id = ?').get(cotId)
    if (existente) return res.status(400).json({ error: 'La cotización ya tiene una venta asociada' })

    const items = db.prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?').all(cotId).map(i => {
      const lp = getLp(i.codigo)
      return {
        sku: i.codigo, descripcion: i.descripcion, cantidad: i.cantidad,
        precio_unitario: i.precio_unitario, costo_unitario: lp ? lp.costo : 0,
        descuento_pct: i.descuento_pct || 0,
      }
    })

    const venta = _insertVenta({
      cliente_id: cot.cliente_id, cliente_nombre: cot.cliente, cotizacion_id: cotId,
      forma_pago: cot.condicion_pago, notas: req.body?.notas, vendedor_id: req.user?.id, items,
    })

    db.prepare("UPDATE cotizaciones SET estado = 'aprobada', updated_at = datetime('now') WHERE id = ?").run(cotId)
    res.status(201).json(venta)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createFromPedido = (req, res) => {
  try {
    const pedId = req.params.pedidoId
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedId)
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })

    const existente = db.prepare('SELECT id FROM ventas WHERE pedido_id = ?').get(pedId)
    if (existente) return res.status(400).json({ error: 'El pedido ya tiene una venta asociada' })

    const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedId).map(i => {
      const codigo = i.codigo_sku
      const lp = getLp(codigo)
      return {
        sku: codigo, descripcion: i.descripcion, cantidad: i.cantidad,
        precio_unitario: i.precio_unitario, costo_unitario: lp ? lp.costo : 0,
        descuento_pct: i.descuento_pct || 0,
      }
    })

    const venta = _insertVenta({
      cliente_id: pedido.cliente_id, cliente_nombre: pedido.cliente,
      cotizacion_id: pedido.cotizacion_id, pedido_id: pedId,
      forma_pago: pedido.condicion_pago, direccion_entrega: pedido.direccion_entrega,
      notas: req.body?.notas, vendedor_id: req.user?.id, items,
    })

    res.status(201).json(venta)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })

    const { fecha, cliente_nombre, cliente_id, numero_documento, tipo_documento, estado, forma_pago,
            fecha_pago, notas, direccion_entrega, items } = req.body

    const doUpdate = db.transaction(() => {
      let total = venta.total
      let costo_total = venta.costo_total

      if (Array.isArray(items)) {
        // Revierte el stock de los ítems anteriores y aplica salida por los nuevos —
        // así una venta se puede corregir sin dejar el inventario desincronizado.
        const anteriores = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(req.params.id)
        for (const it of anteriores) {
          if (it.sku) moverStock({ codigo: it.sku, descripcion: it.descripcion, tipo: 'entrada', cantidad: it.cantidad, motivo: `Corrección venta ${venta.numero_documento} (reversa)`, referencia: String(venta.id) })
        }
        db.prepare('DELETE FROM venta_items WHERE venta_id = ?').run(req.params.id)

        total = items.reduce((s, i) => s + lineSubtotal(i), 0)
        costo_total = items.reduce((s, i) => s + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)
        for (const item of items) {
          const sub = lineSubtotal(item)
          db.prepare(`INSERT INTO venta_items (venta_id, sku, descripcion, cantidad, precio_unitario, costo_unitario, descuento_pct, subtotal) VALUES (?,?,?,?,?,?,?,?)`)
            .run(req.params.id, item.sku || item.codigo || '', item.descripcion || '', Number(item.cantidad || 0),
                 Number(item.precio_unitario || 0), Number(item.costo_unitario || 0), Number(item.descuento_pct) || 0, sub)
          const codigo = item.sku || item.codigo
          if (codigo) moverStock({ codigo, descripcion: item.descripcion, tipo: 'salida', cantidad: Number(item.cantidad || 0), motivo: `Corrección venta ${venta.numero_documento}`, referencia: String(venta.id) })
        }
      }

      db.prepare(`UPDATE ventas SET fecha=?, cliente_nombre=?, cliente_id=?, numero_documento=?, tipo_documento=?, total=?, costo_total=?, estado=?, forma_pago=?, fecha_pago=?, notas=?, direccion_entrega=? WHERE id=?`)
        .run(fecha ?? venta.fecha, cliente_nombre ?? venta.cliente_nombre, cliente_id ?? venta.cliente_id,
             numero_documento ?? venta.numero_documento, tipo_documento ?? venta.tipo_documento, total, costo_total,
             estado ?? venta.estado, forma_pago ?? venta.forma_pago, fecha_pago ?? venta.fecha_pago,
             notas ?? venta.notas, direccion_entrega ?? venta.direccion_entrega, req.params.id)
    })
    doUpdate()

    res.json(withItems(db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Estado logístico — editable libremente entre los 3 valores, sin exigir avance lineal.
const cambiarEstadoLogistico = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    const { estado_logistico } = req.body
    if (!ESTADOS_LOGISTICOS.includes(estado_logistico)) {
      return res.status(400).json({ error: `estado_logistico debe ser uno de: ${ESTADOS_LOGISTICOS.join(', ')}` })
    }
    db.prepare('UPDATE ventas SET estado_logistico = ? WHERE id = ?').run(estado_logistico, req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Marca la venta como pagada (equivalente a lo que antes hacía notas_venta.registrarPago)
const registrarPago = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    if (venta.estado === 'Pagado') return res.status(400).json({ error: 'La venta ya está pagada' })

    const { cuenta_bancaria, fecha_pago, metodo_pago, notas } = req.body
    const descripcion = [
      `Pago ${venta.numero_documento} — ${venta.cliente_nombre || ''}`,
      metodo_pago ? `(${metodo_pago})` : null,
      notas ? `· ${notas}` : null,
    ].filter(Boolean).join(' ')
    const doPago = db.transaction(() => {
      db.prepare("UPDATE ventas SET estado = 'Pagado', fecha_pago = ?, forma_pago = COALESCE(?, forma_pago) WHERE id = ?")
        .run(fecha_pago || hoy(), metodo_pago || null, venta.id)
      db.prepare(`
        INSERT INTO caja_movimientos
          (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id, cuenta_bancaria)
        VALUES ('ingreso','venta',?,?,?,?,'confirmado','ventas',?,?)
      `).run(descripcion, totalConIva(venta.total),
             hoy(), fecha_pago || hoy(), venta.id, cuenta_bancaria || null)
    })
    doPago()
    res.json(withItems(db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Sube el comprobante de depósito/transferencia y deja la venta "en_validacion_pago" —
// a diferencia de registrarPago() (arriba), ACÁ el pago todavía no se da por hecho:
// no se toca caja_movimientos hasta que un gerente confirme con validarPago() que
// el depósito realmente entró a la cuenta corriente. Pensado para Transferencia/
// Cheque, donde el vendedor recibe un comprobante pero no puede verificar el banco.
const subirComprobantePago = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    if (venta.estado !== 'Pendiente') {
      return res.status(400).json({ error: `Solo se puede adjuntar comprobante desde estado Pendiente (estado actual: ${venta.estado})` })
    }
    if (!req.file) return res.status(400).json({ error: 'Adjunta el comprobante (PDF o imagen)' })

    const tipo = tipoDeDocumento(req.file.mimetype)
    if (!tipo) return res.status(400).json({ error: 'Formato no permitido — usa PDF, Excel o imagen' })

    const doSubir = db.transaction(() => {
      db.prepare(`INSERT INTO documentos_adjuntos
        (id, entidad, entidad_id, tipo, categoria, nombre_archivo, mime_type, contenido_base64, subido_por)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(uuidv4(), 'venta', venta.id, tipo, 'comprobante_pago', req.file.originalname, req.file.mimetype,
          req.file.buffer.toString('base64'), req.user?.id || null)

      db.prepare("UPDATE ventas SET estado = 'en_validacion_pago', motivo_rechazo_pago = NULL WHERE id = ?").run(venta.id)
    })
    doSubir()

    res.json(withItems(db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Solo gerente: valida (o rechaza) el comprobante subido. Aprobar es el único
// momento en que la venta genera su ingreso en caja_movimientos — antes de esto
// no impacta el flujo de caja, aunque ya tenga comprobante adjunto. Rechazar
// devuelve la venta a "Pendiente" con el motivo, para que el vendedor corrija
// o vuelva a subir el comprobante correcto.
const validarPago = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    if (venta.estado !== 'en_validacion_pago') {
      return res.status(400).json({ error: `La venta no está en validación de pago (estado actual: ${venta.estado})` })
    }
    if (req.user?.rol !== 'gerente') {
      return res.status(403).json({ error: 'Solo gerente puede validar el pago' })
    }

    const { aprobado, motivo, cuenta_bancaria, fecha_pago } = req.body
    const fechaFinal = fecha_pago || hoy()

    if (aprobado) {
      const doAprobar = db.transaction(() => {
        db.prepare("UPDATE ventas SET estado = 'Pagado', fecha_pago = ?, motivo_rechazo_pago = NULL WHERE id = ?")
          .run(fechaFinal, venta.id)
        db.prepare(`
          INSERT INTO caja_movimientos
            (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id, cuenta_bancaria)
          VALUES ('ingreso','venta',?,?,?,?,'confirmado','ventas',?,?)
        `).run(`Pago validado ${venta.numero_documento} — ${venta.cliente_nombre || ''}`, totalConIva(venta.total),
               hoy(), fechaFinal, venta.id, cuenta_bancaria || null)
      })
      doAprobar()
    } else {
      if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'Indica el motivo del rechazo' })
      db.prepare("UPDATE ventas SET estado = 'Pendiente', motivo_rechazo_pago = ? WHERE id = ?")
        .run(motivo.trim(), venta.id)
    }

    res.json(withItems(db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const remove = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })

    const doRemove = db.transaction(() => {
      const items = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(req.params.id)
      for (const it of items) {
        if (it.sku) moverStock({ codigo: it.sku, descripcion: it.descripcion, tipo: 'entrada', cantidad: it.cantidad, motivo: `Eliminación venta ${venta.numero_documento} (reversa stock)`, referencia: String(venta.id) })
      }
      db.prepare('DELETE FROM venta_items WHERE venta_id = ?').run(req.params.id)
      db.prepare('DELETE FROM ventas WHERE id = ?').run(req.params.id)
    })
    doRemove()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  ESTADOS_LOGISTICOS,
  getAll, getOne, create, createFromCotizacion, createFromPedido,
  update, cambiarEstadoLogistico, registrarPago, subirComprobantePago, validarPago, remove,
}
