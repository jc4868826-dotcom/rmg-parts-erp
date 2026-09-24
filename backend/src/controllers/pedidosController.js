/**
 * RMG Parts — Notas de Venta (flujo v2, 2026-09-24)
 *
 * La nota de venta es el paso obligatorio entre la cotización aprobada y todo
 * lo que viene después:
 *
 *   cotización → (OC del cliente adjunta) → NOTA DE VENTA → OC al proveedor
 *   → OC validada → autorización → venta "por facturar"
 *
 * Compuertas que impone este módulo:
 *  1. No hay nota de venta sin la OC del cliente adjunta (restrictivo).
 *  2. La OC al proveedor solo se emite desde la nota de venta (ver ocController).
 *  3. Si no hay respaldo de costos del proveedor adjunto, los costos se
 *     arrastran desde lista_precios y el pedido queda marcado origen_costos='lista'.
 *  4. Validar la OC (el proveedor confirmó) y autorizar (gerencia aprueba el
 *     margen) son pasos distintos.
 *  5. Recién al autorizar nace la venta, en estado_facturacion 'por_facturar'.
 */
const { db, uuidv4 } = require('../../config/database')
const { crearVentaDesdePedido } = require('./ventasController')

const IVA = 0.19
// La autorización de la nota de venta es del ADMINISTRADOR (2026-09-24, JC).
// El gerente valida pagos, no autoriza notas de venta.
const ROLES_AUTORIZAN = ['administrador']
const ESTADOS_OC_VIGENTES = ['borrador', 'enviada', 'confirmada', 'recibida']

// Costo de lista para un SKU — mismo criterio que ventasController.getLp.
const costoDeLista = (codigo) => {
  if (!codigo) return 0
  const r = db.prepare(
    `SELECT MAX(COALESCE(costo_unidad_neto,0)) AS costo_caja, MAX(unidades_por_pack) AS unidades_por_pack
       FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku`
  ).get(codigo)
  if (!r) return 0
  const pack = Number(r.unidades_por_pack) || 1
  return pack > 1 ? Math.round(Number(r.costo_caja || 0) / pack) : Number(r.costo_caja || 0)
}

const adjuntos = (entidad, entidadId, categoria = null) => {
  let sql = 'SELECT id, nombre_archivo, tipo, categoria, created_at FROM documentos_adjuntos WHERE entidad = ? AND entidad_id = ?'
  const params = [entidad, entidadId]
  if (categoria) { sql += ' AND categoria = ?'; params.push(categoria) }
  return db.prepare(sql + ' ORDER BY created_at DESC').all(...params)
}

const ocsDelPedido = (pedidoId) =>
  db.prepare('SELECT id, numero, estado, proveedor, neto, iva, total FROM ordenes_compra WHERE pedido_id = ? ORDER BY created_at ASC').all(pedidoId)

// Detalle completo: ítems, OCs, adjuntos, venta generada y margen estimado.
const withDetalle = (p) => {
  if (!p) return null
  if (!String(p.cliente || '').trim() && p.cliente_id) {
    const cl = db.prepare('SELECT razon_social, contacto_nombre FROM clientes WHERE id = ?').get(p.cliente_id)
    p = { ...p, cliente: cl?.razon_social || cl?.contacto_nombre || '' }
  }
  const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(p.id)
  const ocs = ocsDelPedido(p.id)
  const vigentes = ocs.filter(o => ESTADOS_OC_VIGENTES.includes(o.estado))
  const netoCompra = vigentes.reduce((a, o) => a + (Number(o.neto) || 0), 0)
  const netoVenta = Number(p.neto) || 0
  const costoItems = items.reduce((a, i) => a + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)
  const base = netoCompra || costoItems
  const margen = netoVenta - base
  return {
    ...p,
    items,
    ocs,
    documentos: adjuntos('pedido', p.id),
    oc_cliente: p.oc_cliente_doc_id
      ? db.prepare('SELECT id, nombre_archivo, tipo, created_at FROM documentos_adjuntos WHERE id = ?').get(p.oc_cliente_doc_id) || null
      : null,
    respaldo_costos: adjuntos('pedido', p.id, 'respaldo_costos'),
    venta: p.venta_id ? db.prepare('SELECT id, numero_documento, estado, estado_facturacion FROM ventas WHERE id = ?').get(p.venta_id) || null : null,
    margen: {
      neto_venta: netoVenta,
      neto_compra: base,
      desde_oc: netoCompra > 0,
      monto: margen,
      pct: netoVenta ? margen / netoVenta : null,
    },
  }
}

const getAll = (req, res) => {
  try {
    const { estado, cotizacion_id, q } = req.query
    // El nombre del cliente puede venir vacío si el documento se creó solo con
    // cliente_id — se resuelve desde el maestro para que la lista nunca quede en blanco.
    let sql = `SELECT p.*,
                      COALESCE(NULLIF(TRIM(p.cliente), ''), cl.razon_social, cl.contacto_nombre, '—') AS cliente
                 FROM pedidos p
                 LEFT JOIN clientes cl ON cl.id = p.cliente_id
                WHERE 1=1`
    const params = []
    if (estado) { sql += ' AND p.estado = ?'; params.push(estado) }
    if (cotizacion_id) { sql += ' AND p.cotizacion_id = ?'; params.push(cotizacion_id) }
    if (q) { sql += ' AND (p.numero LIKE ? OR LOWER(COALESCE(p.cliente, cl.razon_social, \'\')) LIKE LOWER(?))'; params.push(`%${q}%`, `%${q}%`) }
    sql += ' ORDER BY p.created_at DESC'
    const pedidos = db.prepare(sql).all(...params).map(p => ({
      ...p,
      ocs: ocsDelPedido(p.id).map(o => ({ id: o.id, numero: o.numero, estado: o.estado })),
      cotizacion_numero: p.cotizacion_id
        ? (db.prepare('SELECT numero FROM cotizaciones WHERE id = ?').get(p.cotizacion_id)?.numero || null)
        : null,
    }))
    res.json(pedidos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOne = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ? OR numero = ?').get(req.params.id, req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    res.json(withDetalle(p))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Numeración de la NOTA DE VENTA: NV-2026-001. (Los documentos antiguos con
// prefijo PED- se conservan tal cual; solo cambia lo nuevo.)
const siguienteNumero = () => {
  const anio = new Date().getFullYear()
  const row = db.prepare("SELECT numero FROM pedidos WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1").get(`NV-${anio}-%`)
  const ultimo = row ? parseInt(String(row.numero).replace(/\D+/g, '').slice(-3), 10) : 0
  return `NV-${anio}-${String((Number.isFinite(ultimo) ? ultimo : 0) + 1).padStart(3, '0')}`
}

const create = (req, res) => {
  try {
    const { cotizacion_id, cliente_id, cliente, neto, iva, total, condicion_pago,
            direccion_entrega, fecha_entrega_programada, notas, items } = req.body
    const numero = req.body.numero || siguienteNumero()
    const id = uuidv4()
    db.prepare(`INSERT INTO pedidos
      (id,numero,cotizacion_id,cliente_id,cliente,estado,neto,iva,total,
       condicion_pago,direccion_entrega,fecha_entrega_programada,notas,vendedor_id,origen_costos)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, numero, cotizacion_id || null, cliente_id || null, cliente || null,
      'pendiente', neto || 0, iva || 0, total || 0,
      condicion_pago || null, direccion_entrega || null,
      fecha_entrega_programada || null, notas || null, req.user?.id || null, 'lista')

    if (Array.isArray(items) && items.length) {
      const ins = db.prepare(`
        INSERT INTO pedido_items
          (pedido_id, codigo_sku, descripcion, cantidad, precio_unitario, costo_unitario, descuento_pct, subtotal)
        VALUES (?,?,?,?,?,?,?,?)
      `)
      for (const item of items) {
        const sub = item.subtotal || Math.round(item.cantidad * item.precio_unitario * (1 - (item.descuento_pct || 0) / 100))
        const codigo = item.codigo_sku || item.codigo || null
        ins.run(id, codigo, item.descripcion || null, item.cantidad, item.precio_unitario,
          item.costo_unitario != null ? item.costo_unitario : costoDeLista(codigo),
          item.descuento_pct || 0, sub)
      }
    }
    res.status(201).json(withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


/**
 * Vista previa de la NOTA DE VENTA antes de crearla: cabecera tomada de la
 * cotización y líneas con el costo que corresponde (respaldo del proveedor si
 * existe, si no precio de lista). No guarda nada — solo alimenta el formulario.
 */
const previewDesdeCotizacion = (req, res) => {
  try {
    const cotId = req.params.cotizacionId
    const cot = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(cotId)
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' })

    const existente = db.prepare('SELECT id, numero FROM pedidos WHERE cotizacion_id = ?').get(cotId)
    const cotItems = db.prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?').all(cotId)

    const respaldo = db.prepare(
      "SELECT id FROM documentos_adjuntos WHERE entidad = 'cotizacion' AND entidad_id = ? AND categoria = 'respaldo_costos' ORDER BY created_at DESC"
    ).get(cotId)

    const items = cotItems.map(i => {
      let costo = null
      let origen = 'lista'
      if (i.oc_item_id) {
        const ocItem = db.prepare('SELECT precio_unitario FROM oc_items WHERE id = ?').get(i.oc_item_id)
        if (ocItem) { costo = Number(ocItem.precio_unitario) || 0; origen = 'oc' }
      }
      if (costo === null && Number(i.costo_unitario) > 0) { costo = Number(i.costo_unitario); origen = 'cotizacion' }
      if (costo === null) costo = costoDeLista(i.codigo)
      return {
        codigo_sku: i.codigo, descripcion: i.descripcion, cantidad: i.cantidad,
        precio_unitario: i.precio_unitario, descuento_pct: i.descuento_pct || 0,
        subtotal: i.subtotal, costo_unitario: costo, origen_costo: origen,
      }
    })

    const neto = items.reduce((a, i) => a + (Number(i.subtotal) || 0), 0) || Number(cot.neto) || 0
    const iva = Math.round(neto * IVA)
    const costoTotal = items.reduce((a, i) => a + (Number(i.costo_unitario) || 0) * (Number(i.cantidad) || 0), 0)

    res.json({
      cotizacion: { id: cot.id, numero: cot.numero, estado: cot.estado },
      numero_sugerido: siguienteNumero(),
      cliente: String(cot.cliente || '').trim()
        || (cot.cliente_id ? (db.prepare('SELECT razon_social, contacto_nombre FROM clientes WHERE id = ?').get(cot.cliente_id)?.razon_social || '') : ''),
      cliente_id: cot.cliente_id,
      condicion_pago: cot.condicion_pago || 'Contado',
      plazo_entrega: cot.plazo_entrega || null,
      direccion_entrega: cot.direccion_entrega || null,
      origen_costos: respaldo ? 'respaldo' : 'lista',
      items,
      totales: { neto, iva, total: neto + iva, costo: costoTotal,
                 margen: neto - costoTotal, margen_pct: neto ? (neto - costoTotal) / neto : null },
      ya_existe: existente ? { id: existente.id, numero: existente.numero } : null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * COMPUERTA 1 — nota de venta desde la cotización.
 * Exige la OC del cliente: o bien ya hay un adjunto con categoria='oc_cliente'
 * colgado de la cotización, o viene `oc_cliente_doc_id` en el body (el id que
 * devolvió la subida del archivo). Sin eso, 400 y no se crea nada.
 */
const createFromCotizacion = (req, res) => {
  try {
    const cotId = req.params.cotizacionId
    const cot = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(cotId)
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' })

    const existing = db.prepare('SELECT id, numero FROM pedidos WHERE cotizacion_id = ?').get(cotId)
    if (existing) return res.status(400).json({ error: `La cotización ya tiene la nota de venta ${existing.numero}` })

    // OC del cliente — restrictivo
    let ocDoc = null
    if (req.body?.oc_cliente_doc_id) {
      ocDoc = db.prepare('SELECT * FROM documentos_adjuntos WHERE id = ?').get(req.body.oc_cliente_doc_id)
    }
    if (!ocDoc) {
      ocDoc = db.prepare(
        "SELECT * FROM documentos_adjuntos WHERE entidad = 'cotizacion' AND entidad_id = ? AND categoria = 'oc_cliente' ORDER BY created_at DESC"
      ).get(cotId)
    }
    if (!ocDoc) {
      return res.status(400).json({
        error: 'Falta la OC del cliente. Adjunta la orden de compra del cliente para poder crear la nota de venta.',
        codigo: 'FALTA_OC_CLIENTE',
      })
    }

    const cotItems = db.prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?').all(cotId)
    if (!cotItems.length) return res.status(400).json({ error: 'La cotización no tiene ítems' })

    // COMPUERTA 3 — respaldo de costos: si hay adjunto de respaldo en la
    // cotización, se respetan los costos ya negociados; si no, precios de lista.
    const respaldo = db.prepare(
      "SELECT id FROM documentos_adjuntos WHERE entidad = 'cotizacion' AND entidad_id = ? AND categoria = 'respaldo_costos' ORDER BY created_at DESC"
    ).get(cotId)
    const origen_costos = respaldo ? 'respaldo' : 'lista'

    const numero = siguienteNumero()
    const id = uuidv4()
    const nombreCliente = String(cot.cliente || '').trim()
      || (cot.cliente_id
          ? (db.prepare('SELECT razon_social, contacto_nombre FROM clientes WHERE id = ?').get(cot.cliente_id)?.razon_social
             || db.prepare('SELECT razon_social, contacto_nombre FROM clientes WHERE id = ?').get(cot.cliente_id)?.contacto_nombre
             || null)
          : null)
    const neto = cotItems.reduce((a, i) => a + (Number(i.subtotal) || 0), 0) || Number(cot.neto) || 0
    const iva = Math.round(neto * IVA)

    const crear = db.transaction(() => {
      db.prepare(`INSERT INTO pedidos
        (id,numero,cotizacion_id,cliente_id,cliente,estado,neto,iva,total,condicion_pago,notas,
         vendedor_id,oc_cliente_doc_id,origen_costos,direccion_entrega)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(id, numero, cotId, cot.cliente_id || null, nombreCliente, 'pendiente',
        neto, iva, neto + iva,
        req.body?.condicion_pago || cot.condicion_pago || 'Contado', req.body?.notas || null,
        req.user?.id || null, ocDoc.id, origen_costos, req.body?.direccion_entrega || null)
      if (req.body?.fecha_entrega_programada) {
        db.prepare('UPDATE pedidos SET fecha_entrega_programada = ? WHERE id = ?')
          .run(req.body.fecha_entrega_programada, id)
      }

      const ins = db.prepare(`
        INSERT INTO pedido_items
          (pedido_id, codigo_sku, descripcion, cantidad, precio_unitario, costo_unitario,
           descuento_pct, subtotal, cotizacion_item_id, oc_item_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `)
      for (const i of cotItems) {
        // Costo real si la línea ya venía ligada a una línea de OC negociada;
        // si no, el costo de la cotización; en último término, precio de lista.
        let costo = null
        if (i.oc_item_id) {
          const ocItem = db.prepare('SELECT precio_unitario FROM oc_items WHERE id = ?').get(i.oc_item_id)
          if (ocItem) costo = Number(ocItem.precio_unitario) || 0
        }
        if (costo === null) costo = Number(i.costo_unitario) || costoDeLista(i.codigo)
        ins.run(id, i.codigo || null, i.descripcion, i.cantidad, i.precio_unitario, costo,
          i.descuento_pct || 0, i.subtotal, i.id != null ? String(i.id) : null, i.oc_item_id || null)
      }

      // La OC del cliente queda también colgada del pedido, para verla en su detalle.
      db.prepare("UPDATE documentos_adjuntos SET entidad = 'pedido', entidad_id = ?, categoria = 'oc_cliente' WHERE id = ?")
        .run(id, ocDoc.id)
      db.prepare("UPDATE cotizaciones SET estado = 'aprobada', updated_at = datetime('now') WHERE id = ?").run(cotId)
    })
    crear()

    res.status(201).json(withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    if (['autorizado', 'facturado'].includes(p.estado)) {
      return res.status(400).json({ error: 'La nota de venta ya está autorizada y no se puede editar' })
    }
    const BLOQUEADOS = ['id', 'numero', 'items', 'estado', 'venta_id', 'autorizado_por', 'autorizado_at', 'oc_cliente_doc_id']
    const fields = Object.keys(req.body).filter(k => !BLOQUEADOS.includes(k))
    if (!fields.length) return res.json(withDetalle(p))
    const set = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE pedidos SET ${set}, updated_at = datetime('now') WHERE id = ?`)
      .run(...fields.map(f => req.body[f]), req.params.id)
    res.json(withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const cambiarEstado = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    // Los saltos del flujo comercial tienen su propio endpoint (validar-oc,
    // enviar-autorizacion, autorizar). Acá solo se mueve el estado logístico.
    const LOGISTICOS = ['confirmado', 'en_preparacion', 'despachado', 'entregado', 'anulado']
    if (!LOGISTICOS.includes(req.body.estado)) {
      return res.status(400).json({ error: `Estado no permitido por esta vía: ${req.body.estado}` })
    }
    db.prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.body.estado, req.params.id)
    res.json(withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Genera la venta desde la nota de venta y deja el pedido ligado a ella.
// Se llama al validar la OC (o al cerrar una nota sin OC al proveedor).
function _generarVenta(p, user) {
  const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(p.id)
  if (!items.length) throw new Error('La nota de venta no tiene ítems')
  const venta = crearVentaDesdePedido(p, items, user)
  db.prepare('UPDATE pedidos SET venta_id = ? WHERE id = ?').run(String(venta.id), p.id)
  return venta
}

/**
 * Paso 5 — el proveedor confirmó precio y plazo: la OC queda validada y con eso
 * nace la venta en "por facturar". Es el último paso del abastecimiento.
 */
const validarOC = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    const ocs = ocsDelPedido(p.id).filter(o => ESTADOS_OC_VIGENTES.includes(o.estado))
    if (!ocs.length) {
      return res.status(400).json({ error: 'Emite primero la OC al proveedor desde esta nota de venta', codigo: 'SIN_OC' })
    }
    db.prepare(`UPDATE pedidos SET estado = 'oc_validada', validado_por = ?, validado_at = datetime('now'),
      updated_at = datetime('now') WHERE id = ?`).run(req.user?.id || null, p.id)

    let venta = null
    if (!p.venta_id) venta = _generarVenta(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(p.id), req.user)

    res.json({ ...withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(p.id)), venta })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * Paso 3 — la nota de venta va a autorización. Es el paso previo obligatorio:
 * sin autorización no se puede emitir la OC al proveedor.
 */
const enviarAutorizacion = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    if (!['pendiente', 'confirmado', 'rechazado'].includes(p.estado)) {
      return res.status(400).json({ error: `La nota de venta ya pasó la autorización (estado actual: ${p.estado})` })
    }
    if (!p.oc_cliente_doc_id) {
      return res.status(400).json({ error: 'Falta la OC del cliente adjunta', codigo: 'FALTA_OC_CLIENTE' })
    }
    db.prepare("UPDATE pedidos SET estado = 'en_autorizacion', motivo_rechazo = NULL, updated_at = datetime('now') WHERE id = ?").run(p.id)
    res.json(withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(p.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * Paso 4 — el ADMINISTRADOR autoriza la nota de venta. Recién autorizada se
 * habilita la OC al proveedor. La venta no nace acá: nace al validar la OC.
 */
const autorizar = (req, res) => {
  try {
    if (!ROLES_AUTORIZAN.includes(req.user?.rol)) {
      return res.status(403).json({ error: 'Solo el administrador puede autorizar una nota de venta' })
    }
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    if (!['pendiente', 'confirmado', 'en_autorizacion', 'rechazado'].includes(p.estado)) {
      return res.status(400).json({ error: `La nota de venta ya está autorizada (estado actual: ${p.estado})` })
    }
    const items = db.prepare('SELECT id FROM pedido_items WHERE pedido_id = ?').all(p.id)
    if (!items.length) return res.status(400).json({ error: 'La nota de venta no tiene ítems' })

    db.prepare(`UPDATE pedidos SET estado = 'autorizado', autorizado_por = ?, autorizado_at = datetime('now'),
      motivo_rechazo = NULL, updated_at = datetime('now') WHERE id = ?`)
      .run(req.user?.id || null, p.id)

    res.json(withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(p.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * Salida sin compra: la nota de venta autorizada se despacha con stock propio,
 * sin OC al proveedor. Genera la venta directamente en "por facturar".
 */
const cerrarSinOC = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    if (p.venta_id) return res.status(400).json({ error: 'La nota de venta ya generó su venta' })
    if (p.estado !== 'autorizado') {
      return res.status(400).json({ error: 'La nota de venta debe estar autorizada', codigo: 'NO_AUTORIZADA' })
    }
    const venta = _generarVenta(p, req.user)
    db.prepare("UPDATE pedidos SET estado = 'oc_validada', updated_at = datetime('now') WHERE id = ?").run(p.id)
    res.json({ ...withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(p.id)), venta })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const rechazar = (req, res) => {
  try {
    if (!ROLES_AUTORIZAN.includes(req.user?.rol)) {
      return res.status(403).json({ error: 'Solo el administrador puede rechazar una nota de venta' })
    }
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    if (p.venta_id) return res.status(400).json({ error: 'La nota de venta ya está autorizada y registrada' })
    db.prepare("UPDATE pedidos SET estado = 'rechazado', motivo_rechazo = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.body?.motivo || 'Sin motivo indicado', p.id)
    res.json(withDetalle(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(p.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createDesdeLanding = (req, res) => {
  try {
    const { cliente: clienteData, lineas } = req.body
    if (!clienteData || !clienteData.nombre) {
      return res.status(400).json({ error: 'Se requiere cliente.nombre' })
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una línea de producto' })
    }

    let clienteId = null
    let existente = null
    if (clienteData.rut) {
      existente = db.prepare('SELECT id FROM clientes WHERE rut = ?').get(clienteData.rut)
    }
    if (!existente && clienteData.email) {
      existente = db.prepare('SELECT id FROM clientes WHERE email = ? AND activo = 1').get(clienteData.email)
    }
    if (existente) {
      clienteId = existente.id
    } else {
      clienteId = uuidv4()
      db.prepare(`INSERT INTO clientes
        (id, razon_social, rut, segmento, etapa_pipeline, contacto_nombre, telefono, email)
        VALUES (?, ?, ?, 'taller', 'prospecto', ?, ?, ?)`)
        .run(clienteId, clienteData.nombre, clienteData.rut || null,
             clienteData.nombre, clienteData.telefono || null, clienteData.email || null)
    }

    const items = lineas.map(l => ({
      codigo_sku:      l.codigo_sku,
      descripcion:     l.descripcion || l.codigo_sku,
      cantidad:        Number(l.cantidad) || 1,
      precio_unitario: Number(l.precio_venta_neto) || 0,
      descuento_pct:   0,
      subtotal:        Math.round((Number(l.cantidad) || 1) * (Number(l.precio_venta_neto) || 0))
    }))
    const neto  = items.reduce((a, b) => a + b.subtotal, 0)
    const iva   = Math.round(neto * IVA)
    const total = neto + iva

    const numero = siguienteNumero().replace('NV-', 'NV-L')
    const id = uuidv4()

    db.prepare(`INSERT INTO pedidos
      (id,numero,cliente_id,cliente,estado,neto,iva,total,condicion_pago,notas,origen_costos)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, numero, clienteId, clienteData.nombre, 'pendiente',
           neto, iva, total, 'Contado',
           `Pedido landing — ${clienteData.telefono || clienteData.email || ''}`, 'lista')

    const ins = db.prepare(`
      INSERT INTO pedido_items
        (pedido_id, codigo_sku, descripcion, cantidad, precio_unitario, costo_unitario, descuento_pct, subtotal)
      VALUES (?,?,?,?,?,?,?,?)
    `)
    for (const item of items) {
      ins.run(id, item.codigo_sku || null, item.descripcion || null,
        item.cantidad, item.precio_unitario, costoDeLista(item.codigo_sku), item.descuento_pct, item.subtotal)
    }

    res.status(201).json({ pedido_id: id, numero, total })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const remove = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    if (p.venta_id) return res.status(400).json({ error: 'No se puede eliminar: la nota de venta ya está registrada' })
    const ocs = ocsDelPedido(p.id)
    if (ocs.length) {
      return res.status(400).json({ error: `No se puede eliminar: tiene ${ocs.length} OC al proveedor (${ocs.map(o => o.numero).join(', ')})` })
    }
    db.prepare('DELETE FROM pedido_items WHERE pedido_id = ?').run(req.params.id)
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getAll, getOne, create, previewDesdeCotizacion, createFromCotizacion, update, cambiarEstado,
  validarOC, enviarAutorizacion, autorizar, rechazar, cerrarSinOC,
  createDesdeLanding, remove,
}
