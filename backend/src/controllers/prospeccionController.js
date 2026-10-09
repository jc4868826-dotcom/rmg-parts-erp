const { db, uuidv4 } = require('../../config/database')
const correoUsuario = require('../services/correoUsuario')

// 2026-10-08 (pedido de JC): 'prospectado' = correo inicial ya enviado, a la
// espera de seguimiento por WhatsApp/llamada; 'contactado_sin_exito' = se
// hizo seguimiento pero todavía no hay interés/cierre.
//
// 2026-10-09 (pedido de JC): 'contactado' = ya se habló con la empresa. Es un
// estado de seguimiento, NO una conversión: a diferencia de 'contacto', no
// crea ficha en `clientes`. Su único propósito es sacar el registro de la base
// bruta ('prospecto') para que la lista de trabajo deje de mostrarlo.
const ETAPAS_VALIDAS  = ['prospecto', 'prospectado', 'contactado', 'contactado_sin_exito', 'contacto', 'visita', 'propuesta', 'cliente']
const ESTADOS_VALIDOS = ['activo', 'descartado']

// Mapea segmentos de pipeline_contactos al CHECK constraint de clientes
// clientes.segmento IN ('taller','flota','concesionario','construccion')
const SEGMENTO_MAP = {
  taller:        'taller',
  flota:         'flota',
  concesionario: 'concesionario',
  construccion:  'construccion',
  rentacar:      'flota',   // rentacar no existe en clientes → flota
}

// GET /api/prospeccion
// Query params: segmento, prioridad, region, etapa (default: 'prospecto'), estado (default: 'activo'), q
const list = (req, res) => {
  try {
    const {
      segmento,
      prioridad,
      region,
      etapa    = 'prospecto',
      estado   = 'activo',
      q,
    } = req.query

    const conditions = []
    const params     = []

    conditions.push('etapa = ?')
    params.push(etapa)

    conditions.push('estado = ?')
    params.push(estado)

    if (segmento) {
      conditions.push('segmento = ?')
      params.push(segmento)
    }

    if (prioridad) {
      conditions.push('prioridad = ?')
      params.push(prioridad)
    }

    if (region) {
      conditions.push('region = ?')
      params.push(region)
    }

    if (q) {
      const term = `%${q}%`
      conditions.push(
        '(empresa LIKE ? OR nombre_contacto LIKE ? OR notas LIKE ? OR rubro_especialidad LIKE ?)'
      )
      params.push(term, term, term, term)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = db.prepare(`
      SELECT *
      FROM pipeline_contactos
      ${where}
      ORDER BY
        CASE prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
        empresa ASC
    `).all(...params)

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/prospeccion/stats
// Returns { total_activos, por_segmento: [{segmento, count}] }
const getStats = (_req, res) => {
  try {
    const total_activos = db.prepare(
      "SELECT COUNT(*) as n FROM pipeline_contactos WHERE etapa = 'prospecto' AND estado = 'activo'"
    ).get().n

    const por_segmento = db.prepare(
      "SELECT segmento, COUNT(*) as count FROM pipeline_contactos WHERE etapa = 'prospecto' AND estado = 'activo' GROUP BY segmento ORDER BY segmento"
    ).all()

    res.json({ total_activos, por_segmento })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PATCH /api/prospeccion/:id/etapa
// Body: { etapa }
const cambiarEtapa = (req, res) => {
  try {
    const { etapa } = req.body
    if (!etapa || !ETAPAS_VALIDAS.includes(etapa)) {
      return res.status(400).json({
        error: `etapa inválida. Valores permitidos: ${ETAPAS_VALIDAS.join(', ')}`,
      })
    }

    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })

    db.prepare(`
      UPDATE pipeline_contactos
      SET etapa = ?, fecha_ultima_actualizacion = datetime('now')
      WHERE id = ?
    `).run(etapa, req.params.id)

    res.json(db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PATCH /api/prospeccion/:id/descartar
// Sets estado = 'descartado'
const descartar = (req, res) => {
  try {
    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })

    db.prepare(`
      UPDATE pipeline_contactos
      SET estado = 'descartado', fecha_ultima_actualizacion = datetime('now')
      WHERE id = ?
    `).run(req.params.id)

    res.json(db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PATCH /api/prospeccion/:id/contactado
// Marca el prospecto como contactado y deja constancia en la bitácora.
//
// 2026-10-09 (pedido de JC). Deliberadamente NO toca la tabla `clientes`: esto
// no es una conversión, es sacar el registro de la base bruta para trabajarlo
// en seguimiento. La diferencia con `moverAContacto` es justamente esa.
//
// La bitácora se escribe acá y no desde el frontend para que el registro
// exista aunque el botón se apriete desde otra pantalla o desde la API: si el
// seguimiento depende de que alguien además anote la acción, se pierde.
const marcarContactado = (req, res) => {
  try {
    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })

    const { via, nota } = req.body || {}
    const VIAS = ['llamada', 'whatsapp', 'email', 'visita', 'otro']
    const canal = VIAS.includes(via) ? via : 'otro'

    const ejecutar = db.transaction(() => {
      db.prepare(`
        UPDATE pipeline_contactos
        SET etapa = 'contactado', fecha_ultima_actualizacion = datetime('now')
        WHERE id = ?
      `).run(registro.id)

      db.prepare(`INSERT INTO prospecto_bitacora
        (id, prospecto_id, tipo, descripcion, resultado, usuario_id)
        VALUES (?,?,?,?,?,?)`
      ).run(
        uuidv4(), registro.id, canal === 'otro' ? 'nota' : canal,
        nota || `Marcado como contactado (${canal})`,
        'contactado', req.user?.id || null,
      )
    })
    ejecutar()

    res.json(db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/prospeccion/:id/mover-a-contacto
// 1. Actualiza pipeline_contactos.etapa = 'contacto'
// 2. Crea (o reutiliza) un registro en clientes con etapa_pipeline = 'contactado'
const moverAContacto = (req, res) => {
  try {
    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })

    // Mapear segmento al valor válido para clientes
    const segmentoCliente = SEGMENTO_MAP[registro.segmento] || 'flota'

    let cliente_id

    const ejecutar = db.transaction(() => {
      // Actualizar etapa en pipeline_contactos
      db.prepare(`
        UPDATE pipeline_contactos
        SET etapa = 'contacto', fecha_ultima_actualizacion = datetime('now')
        WHERE id = ?
      `).run(registro.id)

      // Intentar insertar en clientes (INSERT OR IGNORE evita duplicados si se llama dos veces)
      cliente_id = uuidv4()
      db.prepare(`
        INSERT OR IGNORE INTO clientes
          (id, razon_social, segmento, etapa_pipeline,
           contacto_nombre, contacto_cargo, telefono, whatsapp, email,
           direccion, comuna, notas, activo)
        VALUES (?, ?, ?, 'contactado', ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        cliente_id,
        registro.empresa,
        segmentoCliente,
        registro.nombre_contacto || null,
        registro.cargo            || null,
        registro.telefono_contacto || registro.telefono_empresa || null,
        registro.telefono_contacto || null,
        registro.email            || null,
        registro.direccion        || null,
        registro.comuna           || null,
        registro.notas            || null,
      )

      // Si el INSERT fue ignorado (empresa ya existía), recuperar el id real
      const existente = db.prepare(
        "SELECT id FROM clientes WHERE razon_social = ? AND activo = 1 ORDER BY created_at ASC LIMIT 1"
      ).get(registro.empresa)
      if (existente) cliente_id = existente.id
    })

    ejecutar()

    res.status(201).json({ ok: true, cliente_id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const ORIGENES_VALIDOS = ['Manual', 'Excel', 'WhatsApp', 'Web', 'Referido', 'Google Ads', 'Meta Ads', 'LinkedIn']

// POST /api/prospeccion — crear un prospecto
const create = (req, res) => {
  try {
    const {
      empresa, segmento = 'flota', rubro, rubro_especialidad, nombre_contacto, cargo,
      rut, dv, telefono_empresa, telefono_contacto, celular, email,
      direccion, comuna, ciudad, region = 'RM',
      prioridad = 'media', notas, fuente = 'Manual', origen = 'Manual',
    } = req.body
    if (!empresa) return res.status(400).json({ error: 'empresa es requerida' })
    const id = uuidv4()
    const rubroVal = rubro || rubro_especialidad || null
    db.prepare(`
      INSERT INTO pipeline_contactos
        (id, empresa, segmento, rubro, rubro_especialidad, nombre_contacto, cargo,
         rut, dv, telefono_empresa, telefono_contacto, celular, email,
         direccion, comuna, ciudad, region,
         prioridad, notas, fuente, origen, etapa, estado)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'prospecto','activo')
    `).run(id, empresa, segmento, rubroVal, rubroVal, nombre_contacto || null,
      cargo || null, rut || null, dv || null,
      telefono_empresa || null, telefono_contacto || null, celular || null,
      email || null, direccion || null, comuna || null, ciudad || null, region,
      prioridad, notas || null, fuente, ORIGENES_VALIDOS.includes(origen) ? origen : 'Manual')
    res.status(201).json(db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PUT /api/prospeccion/:id — actualizar prospecto
const update = (req, res) => {
  try {
    const reg = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!reg) return res.status(404).json({ error: 'Prospecto no encontrado' })
    const allowed = [
      'empresa', 'segmento', 'rubro', 'rubro_especialidad', 'nombre_contacto', 'cargo',
      'rut', 'dv', 'telefono_empresa', 'telefono_contacto', 'celular', 'email',
      'direccion', 'comuna', 'ciudad', 'region', 'prioridad', 'notas', 'origen',
    ]
    const toUpdate = allowed.filter(f => req.body[f] !== undefined)
    if (!toUpdate.length) return res.json(reg)
    const set = toUpdate.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE pipeline_contactos SET ${set}, fecha_ultima_actualizacion = datetime('now') WHERE id = ?`)
      .run(...toUpdate.map(f => req.body[f]), req.params.id)
    res.json(db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/prospeccion/bulk — importación masiva desde Excel
const bulkImport = (req, res) => {
  try {
    const registros = req.body
    if (!Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de prospectos' })
    }
    let importados = 0
    const errores = []
    const stmt = db.prepare(`
      INSERT INTO pipeline_contactos
        (id, empresa, segmento, rubro_especialidad, rubro, nombre_contacto, cargo,
         telefono_empresa, telefono_contacto, email, celular, direccion, comuna, ciudad, region,
         rut, dv, prioridad, notas, fuente, origen, etapa, estado)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'prospecto','activo')
    `)
    for (const r of registros) {
      try {
        if (!r.empresa) { errores.push({ empresa: r.empresa, error: 'empresa vacía' }); continue }
        const prioridad = ['alta', 'media', 'baja'].includes((r.prioridad || '').toLowerCase())
          ? r.prioridad.toLowerCase() : 'alta'
        const origen = ORIGENES_VALIDOS.includes(r.origen) ? r.origen : 'Excel'
        const rubro = r.rubro || r.rubro_especialidad || null
        stmt.run(
          uuidv4(), r.empresa, r.segmento || 'flota',
          rubro, rubro, r.nombre_contacto || null, r.cargo || null,
          r.telefono_empresa || r.telefono || null,
          r.telefono_contacto || r.telefono || null,
          r.email || null, r.celular || null,
          r.direccion || null, r.comuna || null, r.ciudad || null, r.region || 'RM',
          r.rut || null, r.dv || null,
          prioridad, r.notas || null, 'Importación Excel', origen
        )
        importados++
      } catch (e) {
        errores.push({ empresa: r.empresa, error: e.message })
      }
    }
    res.json({ importados, errores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/prospeccion/:id — ficha de un prospecto (2026-10-08, pedido de JC)
const getOne = (req, res) => {
  try {
    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })
    res.json(registro)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/prospeccion/:id/bitacora — historial de acciones de la ficha
const getBitacora = (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM prospecto_bitacora WHERE prospecto_id = ? ORDER BY created_at DESC'
    ).all(req.params.id)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/prospeccion/:id/bitacora — registrar una acción (llamada, visita,
// whatsapp, email, nota). El envío real de WhatsApp lo hace el frontend
// abriendo wa.me — acá solo se deja constancia.
const addBitacora = (req, res) => {
  try {
    const registro = db.prepare('SELECT id FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })
    const { tipo, descripcion, resultado, proxima_accion, fecha_proxima } = req.body
    if (!tipo) return res.status(400).json({ error: 'tipo es requerido' })
    const id = uuidv4()
    db.prepare(`INSERT INTO prospecto_bitacora
      (id, prospecto_id, tipo, descripcion, resultado, proxima_accion, fecha_proxima, usuario_id)
      VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, req.params.id, tipo, descripcion || null, resultado || null,
      proxima_accion || null, fecha_proxima || null, req.user?.id || null)
    res.status(201).json(db.prepare('SELECT * FROM prospecto_bitacora WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/prospeccion/:id/enviar-email — envía un correo real al prospecto
// (mismo patrón SMTP que ocController.enviarEmailOC / chilecompraEmailDigest)
// y deja la copia en la bitácora como tipo 'email'.
const enviarEmail = async (req, res) => {
  try {
    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })
    const { asunto, mensaje, destinatario, adjunto } = req.body
    const to = destinatario || registro.email
    if (!to) return res.status(400).json({ error: 'Este prospecto no tiene email registrado' })
    if (!mensaje) return res.status(400).json({ error: 'mensaje es requerido' })

    // 2026-10-09 (pedido de JC): el correo sale desde la casilla @rmgautos.cl
    // del usuario conectado cuando la tiene configurada en su perfil. Si no,
    // cae a la cuenta compartida con Reply-To, que es el comportamiento
    // anterior — se degrada, no se rompe.
    const remitente = correoUsuario.remitenteDe(req.user)
    if (!remitente) {
      return res.status(500).json({
        error: 'No hay forma de enviar correo: configura tu casilla en Configuración → Mi correo, '
             + 'o define SMTP_USER / SMTP_PASS en el servidor.',
      })
    }

    // 2026-10-08 (pedido de JC): adjunto opcional (ej. dossier PDF) — llega
    // como { nombre, mime, base64 } desde el frontend.
    const attachments = (adjunto && adjunto.base64 && adjunto.nombre)
      ? [{ filename: adjunto.nombre, content: Buffer.from(adjunto.base64, 'base64'), contentType: adjunto.mime || undefined }]
      : []

    try {
      await remitente.transporter.sendMail({
        from:    remitente.from,
        ...(remitente.replyTo ? { replyTo: remitente.replyTo } : {}),
        to,
        subject: asunto || `RMG Auto Parts — ${registro.empresa}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:700px;white-space:pre-wrap">${mensaje}</div>`,
        attachments,
      })
    } catch (e) {
      // El error de SMTP se devuelve tal cual: "535 authentication failed" le
      // dice al vendedor que su clave cambió, cosa que un mensaje genérico no.
      return res.status(502).json({
        error: remitente.propio
          ? `Tu casilla ${remitente.direccion} rechazó el envío: ${e.message}`
          : `El servidor de correo rechazó el envío: ${e.message}`,
      })
    }

    const id = uuidv4()
    const detalleAdjunto = attachments.length ? `\n[Adjunto: ${adjunto.nombre}]` : ''
    const detalleRemitente = `De: ${remitente.direccion}\n`
    db.prepare(`INSERT INTO prospecto_bitacora
      (id, prospecto_id, tipo, descripcion, usuario_id)
      VALUES (?,?,?,?,?)`
    ).run(id, req.params.id, 'email', `${detalleRemitente}Para: ${to}\nAsunto: ${asunto || ''}\n\n${mensaje}${detalleAdjunto}`, req.user?.id || null)

    // 2026-10-08 (pedido de JC): al mandar el correo, el prospecto pasa a
    // 'prospectado' para seguir luego con WhatsApp/llamada — solo si todavía
    // está en 'prospecto', para no pisar una etapa más avanzada.
    if (registro.etapa === 'prospecto') {
      db.prepare("UPDATE pipeline_contactos SET etapa = 'prospectado', fecha_ultima_actualizacion = datetime('now') WHERE id = ?").run(req.params.id)
    }

    res.json({
      ok: true,
      enviado_desde: remitente.direccion,
      casilla_propia: remitente.propio,
      bitacora: db.prepare('SELECT * FROM prospecto_bitacora WHERE id = ?').get(id),
      prospecto: db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// DELETE /api/prospeccion/:id — borrado real (pedido de JC, 2026-10-08).
// Solo gerente/administrador. La bitácora se borra en cascada (FK ON DELETE CASCADE).
const remove = (req, res) => {
  try {
    const registro = db.prepare('SELECT id FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })
    db.prepare('DELETE FROM pipeline_contactos WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  list, getStats, cambiarEtapa, descartar, marcarContactado, moverAContacto,
  create, update, bulkImport,
  getOne, getBitacora, addBitacora, enviarEmail, remove,
}
