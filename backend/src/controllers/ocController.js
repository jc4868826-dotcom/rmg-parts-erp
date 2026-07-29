const { db, uuidv4 } = require('../../config/database')
const nodemailer = require('nodemailer')

// ── Helpers ──────────────────────────────────────────────────────────────────

function withDetails(oc) {
  if (!oc) return null
  const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ? ORDER BY rowid').all(oc.id)
  const historial = db.prepare('SELECT * FROM oc_historial WHERE oc_id = ? ORDER BY fecha_evento ASC').all(oc.id)
  const recepciones = db.prepare('SELECT * FROM recepciones_oc WHERE oc_id = ? ORDER BY created_at DESC').all(oc.id)
  const recepcionesConLineas = recepciones.map(r => ({
    ...r,
    lineas: db.prepare(`
      SELECT rol.*, oi.codigo, oi.descripcion, oi.cantidad
      FROM recepciones_oc_lineas rol
      JOIN oc_items oi ON oi.id = rol.linea_oc_id
      WHERE rol.recepcion_id = ?
    `).all(r.id),
  }))
  return { ...oc, items, historial, recepciones: recepcionesConLineas }
}

function logEvento(oc_id, tipo_evento, opts = {}) {
  const { usuario_id, usuario_nombre, estado_anterior, estado_nuevo, detalle } = opts
  try {
    db.prepare(`INSERT INTO oc_historial
      (id, oc_id, tipo_evento, usuario_id, usuario_nombre, estado_anterior, estado_nuevo, detalle)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuidv4(), oc_id, tipo_evento, usuario_id || null, usuario_nombre || null,
        estado_anterior || null, estado_nuevo || null, detalle || null)
  } catch (_) {}
}

function generarNumeroOC() {
  const año = new Date().getFullYear()
  const last = db.prepare(
    "SELECT numero FROM ordenes_compra WHERE numero LIKE ? ORDER BY created_at DESC LIMIT 1"
  ).get(`OC-${año}-%`)
  if (!last) return `OC-${año}-0001`
  const seq = parseInt(last.numero.split('-').pop(), 10)
  return `OC-${año}-${String(seq + 1).padStart(4, '0')}`
}

// State machine
const TRANSICIONES = {
  CREADA:             ['POR_AUTORIZAR', 'ANULADA'],
  POR_AUTORIZAR:      ['AUTORIZADA', 'RECHAZADA'],
  RECHAZADA:          ['CREADA', 'ANULADA'],
  AUTORIZADA:         ['ENVIADA_PROVEEDOR'],
  ENVIADA_PROVEEDOR:  ['RECIBIDA_PARCIAL', 'RECIBIDA'],
  RECIBIDA_PARCIAL:   ['RECIBIDA'],
  RECIBIDA:           [],
  ANULADA:            [],
  // legacy
  borrador:           ['POR_AUTORIZAR', 'ENVIADA_PROVEEDOR', 'CREADA'],
  enviada:            ['RECIBIDA_PARCIAL', 'RECIBIDA'],
  confirmada:         ['RECIBIDA'],
  recibida:           [],
  anulada:            [],
  Pendiente_Autorizacion: ['AUTORIZADA', 'RECHAZADA'],
  Autorizada:         ['ENVIADA_PROVEEDOR'],
  Enviada_Proveedor:  ['RECIBIDA_PARCIAL', 'RECIBIDA'],
  Recibida_Parcial:   ['RECIBIDA'],
  Recibida_Bodega:    ['RECIBIDA'],
  Rechazada:          ['CREADA', 'ANULADA'],
}

const ROLES_REQUERIDOS = {
  AUTORIZADA: ['admin', 'finanzas'],
  RECHAZADA:  ['admin', 'finanzas'],
  ANULADA:    ['admin'],
}

const TIPO_EVENTO = {
  POR_AUTORIZAR:      'envio_autorizacion',
  AUTORIZADA:         'autorizacion',
  RECHAZADA:          'rechazo',
  ENVIADA_PROVEEDOR:  'envio_proveedor',
  RECIBIDA:           'recepcion_total',
  RECIBIDA_PARCIAL:   'recepcion_parcial',
  ANULADA:            'anulacion',
  CREADA:             'modificacion',
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

const getOCs = (req, res) => {
  try {
    const { estado, proveedor, fecha_desde, fecha_hasta, q } = req.query
    let sql = 'SELECT * FROM ordenes_compra WHERE 1=1'
    const params = []
    if (estado)      { sql += ' AND estado = ?';                                 params.push(estado) }
    if (proveedor)   { sql += ' AND LOWER(proveedor) LIKE LOWER(?)';             params.push(`%${proveedor}%`) }
    if (fecha_desde) { sql += ' AND fecha_emision >= ?';                         params.push(fecha_desde) }
    if (fecha_hasta) { sql += ' AND fecha_emision <= ?';                         params.push(fecha_hasta) }
    if (q) {
      sql += ' AND (numero LIKE ? OR LOWER(proveedor) LIKE LOWER(?))'
      params.push(`%${q}%`, `%${q}%`)
    }
    sql += ' ORDER BY created_at DESC'
    const ocs = db.prepare(sql).all(...params)
    res.json(ocs.map(oc => ({
      ...oc,
      items: db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(oc.id),
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOC = (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })
    res.json(withDetails(oc))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createOC = (req, res) => {
  try {
    const { proveedor_id, proveedor, fecha_requerida, medio_pago, observaciones, notas, items, usuario_id, usuario_nombre } = req.body
    if (!proveedor) return res.status(400).json({ error: 'Proveedor requerido' })
    if (!items || !items.length) return res.status(400).json({ error: 'Al menos un ítem es requerido' })

    const numero = generarNumeroOC()
    const id = uuidv4()
    const fecha = new Date().toISOString().split('T')[0]

    const neto  = items.reduce((s, i) => s + (Number(i.precio_unitario || i.precio_compra_neto || 0) * Number(i.cantidad || 0)), 0)
    const iva   = Math.round(neto * 0.19)
    const total = neto + iva

    db.prepare(`INSERT INTO ordenes_compra
      (id, numero, proveedor_id, proveedor, estado, fecha_emision, fecha_requerida, neto, iva, total, observaciones, notas, usuario_creador_id, medio_pago)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, numero, proveedor_id || null, proveedor, 'CREADA', fecha, fecha_requerida || null,
        neto, iva, total, observaciones || null, notas || null, usuario_id || null, medio_pago || 'Contado')

    for (const item of items) {
      const pu  = Number(item.precio_unitario || item.precio_compra_neto || 0)
      const qty = Number(item.cantidad || 0)
      db.prepare(`INSERT INTO oc_items (id, oc_id, codigo, descripcion, cantidad, precio_unitario, subtotal)
        VALUES (?,?,?,?,?,?,?)`)
        .run(uuidv4(), id, item.codigo || item.sku || '', item.descripcion || '', qty, pu, pu * qty)
    }

    logEvento(id, 'creacion', { usuario_id, usuario_nombre, estado_nuevo: 'CREADA', detalle: `OC ${numero} creada` })

    res.status(201).json(withDetails(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const updateOC = (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })
    const estadosEditables = ['CREADA', 'borrador']
    if (!estadosEditables.includes(oc.estado)) {
      return res.status(400).json({ error: `Solo se puede editar una OC en estado CREADA (estado actual: ${oc.estado})` })
    }

    const { proveedor_id, proveedor, fecha_requerida, medio_pago, notas, observaciones, items, usuario_id, usuario_nombre } = req.body

    let neto = oc.neto, iva = oc.iva, total = oc.total
    if (items) {
      neto  = items.reduce((s, i) => s + (Number(i.precio_unitario || 0) * Number(i.cantidad || 0)), 0)
      iva   = Math.round(neto * 0.19)
      total = neto + iva
    }

    db.prepare(`UPDATE ordenes_compra SET
      proveedor_id = COALESCE(?, proveedor_id),
      proveedor    = COALESCE(?, proveedor),
      fecha_requerida = COALESCE(?, fecha_requerida),
      medio_pago   = COALESCE(?, medio_pago),
      observaciones = ?,
      notas = COALESCE(?, notas),
      neto = ?, iva = ?, total = ?,
      updated_at = datetime('now')
      WHERE id = ?`)
      .run(proveedor_id || null, proveedor || null, fecha_requerida || null,
        medio_pago || null, observaciones !== undefined ? observaciones : oc.observaciones,
        notas || null, neto, iva, total, oc.id)

    if (items) {
      db.prepare('DELETE FROM oc_items WHERE oc_id = ?').run(oc.id)
      for (const item of items) {
        const pu  = Number(item.precio_unitario || 0)
        const qty = Number(item.cantidad || 0)
        db.prepare(`INSERT INTO oc_items (id, oc_id, codigo, descripcion, cantidad, precio_unitario, subtotal)
          VALUES (?,?,?,?,?,?,?)`)
          .run(uuidv4(), oc.id, item.codigo || '', item.descripcion || '', qty, pu, pu * qty)
      }
    }

    logEvento(oc.id, 'modificacion', { usuario_id, usuario_nombre, detalle: 'OC editada' })
    res.json(withDetails(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(oc.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const patchEstadoOC = (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })

    const { nuevo_estado, motivo_rechazo, usuario_id, usuario_nombre, rol_usuario } = req.body
    if (!nuevo_estado) return res.status(400).json({ error: 'nuevo_estado es requerido' })

    const estadoActual    = oc.estado
    const transValidas    = TRANSICIONES[estadoActual] || []
    if (!transValidas.includes(nuevo_estado)) {
      return res.status(400).json({
        error: `Transición inválida: ${estadoActual} → ${nuevo_estado}. Permitidas: [${transValidas.join(', ') || 'ninguna'}]`,
      })
    }

    const rolesNecesarios = ROLES_REQUERIDOS[nuevo_estado]
    if (rolesNecesarios && rol_usuario && !rolesNecesarios.includes(rol_usuario)) {
      return res.status(403).json({ error: `Solo ${rolesNecesarios.join('/')} puede cambiar a ${nuevo_estado}` })
    }

    if (nuevo_estado === 'RECHAZADA' && !motivo_rechazo) {
      return res.status(400).json({ error: 'motivo_rechazo es obligatorio al rechazar' })
    }

    const cols = ["estado = ?", "updated_at = datetime('now')"]
    const vals = [nuevo_estado]

    if (nuevo_estado === 'AUTORIZADA') {
      cols.push('fecha_autorizacion = ?', 'autorizado_por = ?')
      vals.push(new Date().toISOString(), usuario_nombre || usuario_id || null)
    }
    if (nuevo_estado === 'RECHAZADA') {
      cols.push('motivo_rechazo = ?')
      vals.push(motivo_rechazo)
    }
    if (nuevo_estado === 'CREADA') {
      cols.push('motivo_rechazo = NULL')
    }
    if (nuevo_estado === 'ENVIADA_PROVEEDOR') {
      cols.push('fecha_emision = COALESCE(fecha_emision, ?)')
      vals.push(new Date().toISOString().split('T')[0])
    }
    vals.push(oc.id)

    db.prepare(`UPDATE ordenes_compra SET ${cols.join(', ')} WHERE id = ?`).run(...vals)

    logEvento(oc.id, TIPO_EVENTO[nuevo_estado] || 'modificacion', {
      usuario_id, usuario_nombre,
      estado_anterior: estadoActual,
      estado_nuevo: nuevo_estado,
      detalle: nuevo_estado === 'RECHAZADA' ? `Rechazada: ${motivo_rechazo}` : null,
    })

    res.json(withDetails(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(oc.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const registrarRecepcionOC = (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })

    const estadosValidos = ['ENVIADA_PROVEEDOR', 'RECIBIDA_PARCIAL', 'enviada', 'Enviada_Proveedor', 'Recibida_Parcial']
    if (!estadosValidos.includes(oc.estado)) {
      return res.status(400).json({ error: `Recepción no permitida desde estado ${oc.estado}` })
    }

    const { usuario_receptor_id, usuario_nombre, observacion, lineas } = req.body
    if (!lineas || !lineas.length) return res.status(400).json({ error: 'Se requiere al menos una línea' })
    const lineasFiltradas = lineas.filter(l => Number(l.cantidad_recibida) > 0)
    if (!lineasFiltradas.length) return res.status(400).json({ error: 'Ninguna línea tiene cantidad > 0' })

    const advertencias = []

    const ejecutar = db.transaction(() => {
      const recepcionId = uuidv4()
      db.prepare('INSERT INTO recepciones_oc (id, oc_id, fecha_recepcion, usuario_receptor_id, observacion) VALUES (?,?,?,?,?)')
        .run(recepcionId, oc.id, new Date().toISOString().split('T')[0], usuario_receptor_id || null, observacion || null)

      for (const linea of lineasFiltradas) {
        const item = db.prepare('SELECT * FROM oc_items WHERE id = ?').get(linea.linea_oc_id)
        if (!item) { advertencias.push(`Línea ${linea.linea_oc_id} no encontrada`); continue }

        const cantRecibida  = Math.round(Number(linea.cantidad_recibida))
        const maxPendiente  = item.cantidad - (item.cantidad_recibida_total || 0)
        const cantReal      = Math.min(cantRecibida, maxPendiente)
        if (cantReal <= 0) { advertencias.push(`SKU ${item.codigo}: ya recibido al 100%`); continue }

        db.prepare('INSERT INTO recepciones_oc_lineas (id, recepcion_id, linea_oc_id, cantidad_recibida) VALUES (?,?,?,?)')
          .run(uuidv4(), recepcionId, item.id, cantReal)
        db.prepare('UPDATE oc_items SET cantidad_recibida_total = COALESCE(cantidad_recibida_total, 0) + ? WHERE id = ?')
          .run(cantReal, item.id)

        const prod = db.prepare(
          'SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
        ).get(item.codigo)
        if (!prod) { advertencias.push(`SKU ${item.codigo} no encontrado en lista_precios — stock no actualizado`); continue }
        const stockAnterior = prod.stock_actual ?? 0
        const stockNuevo    = stockAnterior + cantReal
        db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stockNuevo, item.codigo)
        try {
          db.prepare('INSERT INTO movimientos_stock (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(uuidv4(), prod.codigo_sku, prod.codigo_sku, prod.descripcion, 'entrada', cantReal, stockAnterior, stockNuevo, 'recepcion_oc', oc.numero)
        } catch (_) {}
      }

      const itemsActualizados = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(oc.id)
      const todasCompletas    = itemsActualizados.every(i => (i.cantidad_recibida_total || 0) >= i.cantidad)
      const nuevoEstado       = todasCompletas ? 'RECIBIDA' : 'RECIBIDA_PARCIAL'

      db.prepare("UPDATE ordenes_compra SET estado = ?, fecha_entrega = ?, updated_at = datetime('now') WHERE id = ?")
        .run(nuevoEstado, new Date().toISOString().split('T')[0], oc.id)

      logEvento(oc.id, todasCompletas ? 'recepcion_total' : 'recepcion_parcial', {
        usuario_id: usuario_receptor_id,
        usuario_nombre,
        estado_anterior: oc.estado,
        estado_nuevo: nuevoEstado,
        detalle: todasCompletas ? 'OC recibida al 100%' : 'Recepción parcial registrada',
      })
    })

    ejecutar()
    res.json({ ...withDetails(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(oc.id)), advertencias })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getRecepcionesOC = (req, res) => {
  try {
    const recepciones = db.prepare('SELECT * FROM recepciones_oc WHERE oc_id = ? ORDER BY created_at DESC').all(req.params.id)
    res.json(recepciones.map(r => ({
      ...r,
      lineas: db.prepare(`
        SELECT rol.*, oi.codigo, oi.descripcion, oi.cantidad
        FROM recepciones_oc_lineas rol
        JOIN oc_items oi ON oi.id = rol.linea_oc_id
        WHERE rol.recepcion_id = ?
      `).all(r.id),
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getPendientesFacturar = (req, res) => {
  try {
    const ocs = db.prepare(`
      SELECT * FROM ordenes_compra
      WHERE estado IN ('RECIBIDA', 'recibida', 'Recibida_Bodega')
        AND (compra_id IS NULL OR compra_id = '')
      ORDER BY created_at DESC
    `).all()
    res.json(ocs.map(oc => ({
      ...oc,
      items: db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(oc.id),
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const generarPdfOC = (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })
    const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ? ORDER BY rowid').all(oc.id)
    const neto  = oc.neto  || items.reduce((s, i) => s + (i.subtotal || 0), 0)
    const iva   = oc.iva   || Math.round(neto * 0.19)
    const total = oc.total || neto + iva

    const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0)

    const rowsHtml = items.map(i => `
      <tr>
        <td>${i.codigo || ''}</td>
        <td>${i.descripcion || ''}</td>
        <td style="text-align:center">${i.cantidad}</td>
        <td style="text-align:right">${fmt(i.precio_unitario)}</td>
        <td style="text-align:right">${fmt(i.subtotal)}</td>
      </tr>`).join('')

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><title>OC ${oc.numero}</title>
<style>
  body{font-family:Arial,sans-serif;margin:40px;color:#1a1a2e;font-size:13px}
  h1{font-size:22px;margin:0}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:2px solid #1a1a2e;padding-bottom:12px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 32px;margin-bottom:24px}
  .info-row{display:flex;gap:8px}.info-label{font-weight:bold;min-width:130px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:#1a1a2e;color:#fff;padding:8px 10px;text-align:left;font-size:12px}
  td{padding:7px 10px;border-bottom:1px solid #e5e5e5}
  .totals{margin-left:auto;width:260px}
  .totals td{padding:5px 10px}
  .totals .total-row td{font-weight:bold;font-size:15px;border-top:2px solid #1a1a2e}
  .estado{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold;background:#e0f2fe;color:#0369a1}
  .print-btn{position:fixed;bottom:24px;right:24px;background:#1a1a2e;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px}
  @media print{.print-btn{display:none}}
</style></head><body>
<div class="header">
  <div><h1>Orden de Compra</h1><div style="font-size:20px;font-weight:bold;color:#0369a1">${oc.numero}</div></div>
  <div style="text-align:right"><div style="font-size:11px;color:#666">Estado</div><span class="estado">${oc.estado}</span></div>
</div>
<div class="info-grid">
  <div class="info-row"><span class="info-label">Proveedor:</span><span>${oc.proveedor || '—'}</span></div>
  <div class="info-row"><span class="info-label">Fecha emisión:</span><span>${oc.fecha_emision || '—'}</span></div>
  <div class="info-row"><span class="info-label">Fecha requerida:</span><span>${oc.fecha_requerida || '—'}</span></div>
  <div class="info-row"><span class="info-label">Medio de pago:</span><span>${oc.medio_pago || '—'}</span></div>
  ${oc.observaciones ? `<div class="info-row" style="grid-column:1/-1"><span class="info-label">Observaciones:</span><span>${oc.observaciones}</span></div>` : ''}
</div>
<table>
  <thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit. Neto</th><th style="text-align:right">Subtotal</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<table class="totals">
  <tr><td>Neto</td><td style="text-align:right">${fmt(neto)}</td></tr>
  <tr><td>IVA (19%)</td><td style="text-align:right">${fmt(iva)}</td></tr>
  <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmt(total)}</td></tr>
</table>
<button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
</body></html>`)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const enviarEmailOC = async (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })

    const { email_destino, mensaje_adicional } = req.body
    if (!email_destino) return res.status(400).json({ error: 'email_destino es requerido' })

    const items    = db.prepare('SELECT * FROM oc_items WHERE oc_id = ? ORDER BY rowid').all(oc.id)
    const neto     = oc.neto  || items.reduce((s, i) => s + (i.subtotal || 0), 0)
    const iva      = oc.iva   || Math.round(neto * 0.19)
    const total    = oc.total || neto + iva
    const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0)

    const rowsHtml = items.map(i => `<tr><td>${i.codigo}</td><td>${i.descripcion}</td><td>${i.cantidad}</td><td>${fmt(i.precio_unitario)}</td><td>${fmt(i.subtotal)}</td></tr>`).join('')

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })

    await transporter.sendMail({
      from:    `"RMG Auto Parts" <${process.env.SMTP_USER || 'no-reply@rmgautoparts.cl'}>`,
      to:      email_destino,
      subject: `Orden de Compra ${oc.numero} — RMG Auto Parts`,
      html: `<div style="font-family:Arial,sans-serif;max-width:700px">
        <h2>Orden de Compra ${oc.numero}</h2>
        <p><strong>Proveedor:</strong> ${oc.proveedor}</p>
        <p><strong>Fecha requerida:</strong> ${oc.fecha_requerida || 'Por coordinar'}</p>
        ${mensaje_adicional ? `<p>${mensaje_adicional}</p>` : ''}
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
          <thead style="background:#1a1a2e;color:#fff"><tr><th>SKU</th><th>Descripción</th><th>Cant.</th><th>P.Unit Neto</th><th>Subtotal</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p><strong>Neto: ${fmt(neto)}</strong> | IVA: ${fmt(iva)} | <strong>Total: ${fmt(total)}</strong></p>
      </div>`,
    })

    res.json({ ok: true, enviado_a: email_destino })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getImpactoEliminacion = (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })

    const recepciones = db.prepare('SELECT id FROM recepciones_oc WHERE oc_id = ?').all(oc.id)

    const movimientosStock = db.prepare(
      "SELECT * FROM movimientos_stock WHERE referencia = ? AND motivo = 'recepcion_oc' AND tipo = 'entrada'"
    ).all(oc.numero)

    const compraVinculada = db.prepare(
      'SELECT id, numero_oc, numero_factura, estado FROM compras WHERE oc_id = ?'
    ).get(oc.id)

    const advertencias = []
    if (movimientosStock.length > 0) {
      advertencias.push(`Se revertirá el stock de ${movimientosStock.length} producto(s) que ingresaron con esta OC.`)
    }
    if (compraVinculada) {
      advertencias.push(`Existe una compra vinculada${compraVinculada.numero_factura ? ` (Factura: ${compraVinculada.numero_factura})` : ''}. La compra NO se eliminará, quedará desvinculada.`)
    }
    const estadosConStock = ['RECIBIDA', 'RECIBIDA_PARCIAL', 'recibida', 'Recibida_Bodega', 'Recibida_Parcial']
    if (estadosConStock.includes(oc.estado)) {
      advertencias.push(`La OC estaba en estado ${oc.estado}. Verifica que el stock físico en bodega también haya sido corregido.`)
    }

    res.json({
      oc: { id: oc.id, numero: oc.numero, estado: oc.estado, proveedor: oc.proveedor, total: oc.total },
      tiene_recepciones: recepciones.length > 0,
      movimientos_stock: movimientosStock.map(m => ({
        codigo: m.codigo, descripcion: m.descripcion, cantidad: m.cantidad, fecha: m.created_at,
      })),
      tiene_compra_vinculada: !!compraVinculada,
      compra_id: compraVinculada?.id || null,
      puede_eliminar: true,
      advertencias,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const deleteOC = (req, res) => {
  try {
    const { confirmado } = req.body || {}
    if (!confirmado) return res.status(400).json({ error: 'Requiere confirmación: envía { confirmado: true }' })

    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })

    const movimientosEntrada = db.prepare(
      "SELECT * FROM movimientos_stock WHERE referencia = ? AND motivo = 'recepcion_oc' AND tipo = 'entrada'"
    ).all(oc.numero)

    const compraVinculada = db.prepare('SELECT id FROM compras WHERE oc_id = ?').get(oc.id)

    const stockRevertido = []

    const ejecutar = db.transaction(() => {
      // 1. Revertir stock línea por línea
      for (const mov of movimientosEntrada) {
        const prod = db.prepare(
          'SELECT codigo_sku, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
        ).get(mov.codigo)
        if (!prod) continue

        const stockAnterior = prod.stock_actual
        const stockNuevo    = Math.max(0, stockAnterior - mov.cantidad)
        db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stockNuevo, mov.codigo)
        try {
          db.prepare(`INSERT INTO movimientos_stock
            (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia)
            VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(uuidv4(), mov.codigo, mov.codigo, mov.descripcion, 'ajuste', -mov.cantidad,
              stockAnterior, stockNuevo, `Reversión OC eliminada: ${oc.numero}`, oc.numero)
        } catch (_) {}
        stockRevertido.push({ codigo: mov.codigo, descripcion: mov.descripcion, cantidad_revertida: mov.cantidad })
      }

      // 2. Desvincular compra (no borrar)
      if (compraVinculada) {
        try { db.prepare('UPDATE compras SET oc_id = NULL WHERE oc_id = ?').run(oc.id) } catch (_) {}
      }

      // 3. Borrar OC — CASCADE elimina oc_items, recepciones_oc, recepciones_oc_lineas, oc_historial
      db.prepare('DELETE FROM ordenes_compra WHERE id = ?').run(oc.id)
    })

    ejecutar()

    res.json({
      success: true,
      mensaje: `OC ${oc.numero} eliminada. Stock revertido en ${stockRevertido.length} producto(s).`,
      stock_revertido: stockRevertido,
      compra_desvinculada: !!compraVinculada,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getOCs, getOC, createOC, updateOC, patchEstadoOC,
  registrarRecepcionOC, getRecepcionesOC, getPendientesFacturar,
  generarPdfOC, enviarEmailOC,
  getImpactoEliminacion, deleteOC,
}
