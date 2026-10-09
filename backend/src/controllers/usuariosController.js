/**
 * RMG Parts — Gestión de usuarios y perfiles
 * 3 perfiles: gerente (acceso total + autorizaciones) · administrador (acceso total, sin autorizaciones) · vendedor (resto)
 */
const bcrypt = require('bcryptjs')
const { db, uuidv4 } = require('../../config/database')

const ROLES = ['gerente', 'administrador', 'facturador', 'vendedor']

const publicRow = (u) => {
  if (!u) return u
  const { password_hash, ...rest } = u
  return rest
}

const getAll = (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM usuarios ORDER BY created_at DESC').all()
    res.json(rows.map(publicRow))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOne = (req, res) => {
  try {
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id)
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(publicRow(u))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const create = (req, res) => {
  try {
    const { nombre, email, password, rol, telefono } = req.body

    if (!nombre || !nombre.trim())   return res.status(400).json({ error: 'Nombre es obligatorio' })
    if (!email || !email.trim())     return res.status(400).json({ error: 'Email es obligatorio' })
    if (!password || password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    if (!ROLES.includes(rol))        return res.status(400).json({ error: `Rol inválido. Debe ser uno de: ${ROLES.join(', ')}` })

    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.trim().toLowerCase())
    if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese email' })

    const id = uuidv4()
    const hash = bcrypt.hashSync(password, 10)
    db.prepare(`INSERT INTO usuarios (id, email, password_hash, nombre, telefono, rol, activo) VALUES (?,?,?,?,?,?,1)`)
      .run(id, email.trim().toLowerCase(), hash, nombre.trim(), telefono || null, rol)

    const nuevo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
    res.status(201).json(publicRow(nuevo))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const { id } = req.params
    const existente = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
    if (!existente) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { nombre, email, rol, telefono, activo } = req.body
    if (rol !== undefined && !ROLES.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Debe ser uno de: ${ROLES.join(', ')}` })
    }

    // Evita quedarse sin ningún gerente activo
    if (existente.rol === 'gerente' && (rol && rol !== 'gerente' || activo === false || activo === 0)) {
      const otrosGerentes = db.prepare("SELECT COUNT(*) as n FROM usuarios WHERE rol = 'gerente' AND activo = 1 AND id != ?").get(id).n
      if (otrosGerentes === 0) {
        return res.status(400).json({ error: 'Debe existir al menos un gerente activo en el sistema' })
      }
    }

    db.prepare(`
      UPDATE usuarios SET
        nombre = COALESCE(?, nombre),
        email = COALESCE(?, email),
        rol = COALESCE(?, rol),
        telefono = ?,
        activo = COALESCE(?, activo),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nombre?.trim() ?? null,
      email?.trim()?.toLowerCase() ?? null,
      rol ?? null,
      telefono !== undefined ? telefono : existente.telefono,
      activo !== undefined ? (activo ? 1 : 0) : null,
      id
    )

    res.json(publicRow(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Un gerente/administrador fija o resetea la contraseña de OTRO usuario
const setPassword = (req, res) => {
  try {
    const { id } = req.params
    const { password } = req.body
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    }
    const existente = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id)
    if (!existente) return res.status(404).json({ error: 'Usuario no encontrado' })

    const hash = bcrypt.hashSync(password, 10)
    db.prepare("UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, id)
    res.json({ ok: true, message: 'Contraseña actualizada' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const remove = (req, res) => {
  try {
    const { id } = req.params
    const existente = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
    if (!existente) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (existente.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' })

    if (existente.rol === 'gerente') {
      const otrosGerentes = db.prepare("SELECT COUNT(*) as n FROM usuarios WHERE rol = 'gerente' AND activo = 1 AND id != ?").get(id).n
      if (otrosGerentes === 0) return res.status(400).json({ error: 'Debe existir al menos un gerente activo en el sistema' })
    }

    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


// ─── Casilla de correo propia del usuario conectado ──────────────────────────
// 2026-10-09 (pedido de JC). Estas rutas son del usuario sobre SÍ MISMO, por
// eso no exigen rol de gerente: un vendedor tiene que poder configurar su
// casilla. Nunca devuelven la clave, ni siquiera cifrada.
const correo = require('../services/correoUsuario')

const getMiCorreo = (req, res) => {
  try {
    const u = db.prepare(
      'SELECT email, smtp_email, smtp_host, smtp_port, smtp_pass_enc, smtp_verificado_at FROM usuarios WHERE id = ?'
    ).get(req.user.id)
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json({
      configurado:   !!u.smtp_pass_enc,
      smtp_email:    u.smtp_email || u.email,
      smtp_host:     u.smtp_host || correo.HOST_DEFECTO,
      smtp_port:     u.smtp_port || correo.PUERTO_DEFECTO,
      verificado_at: u.smtp_verificado_at || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const setMiCorreo = async (req, res) => {
  try {
    const { smtp_email, smtp_pass, smtp_host, smtp_port } = req.body || {}
    if (!smtp_email || !smtp_pass) {
      return res.status(400).json({ error: 'smtp_email y smtp_pass son requeridos' })
    }
    const host = smtp_host || correo.HOST_DEFECTO
    const port = Number(smtp_port || correo.PUERTO_DEFECTO)

    // Se verifica ANTES de guardar: una credencial que no conecta guardada en
    // silencio reaparece como un envío fallido días después, cuando ya nadie
    // recuerda qué se configuró.
    try {
      await correo.probar({ email: smtp_email, pass: smtp_pass, host, port })
    } catch (e) {
      return res.status(400).json({ error: `No se pudo conectar: ${e.message}` })
    }

    db.prepare(`UPDATE usuarios
       SET smtp_email = ?, smtp_pass_enc = ?, smtp_host = ?, smtp_port = ?,
           smtp_verificado_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(smtp_email.trim().toLowerCase(), correo.cifrar(smtp_pass), host, port, req.user.id)

    res.json({ ok: true, smtp_email: smtp_email.trim().toLowerCase(), smtp_host: host, smtp_port: port })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const borrarMiCorreo = (req, res) => {
  try {
    db.prepare(`UPDATE usuarios
       SET smtp_email = NULL, smtp_pass_enc = NULL, smtp_host = NULL,
           smtp_port = NULL, smtp_verificado_at = NULL, updated_at = datetime('now')
       WHERE id = ?`).run(req.user.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const probarMiCorreo = async (req, res) => {
  try {
    const cred = correo.credencialesDe(req.user.id)
    if (!cred) return res.status(400).json({ error: 'Todavía no configuraste tu casilla' })
    await correo.probar(cred)
    db.prepare("UPDATE usuarios SET smtp_verificado_at = datetime('now') WHERE id = ?").run(req.user.id)
    res.json({ ok: true, smtp_email: cred.email })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

module.exports = {
  getMiCorreo, setMiCorreo, borrarMiCorreo, probarMiCorreo, ROLES, getAll, getOne, create, update, setPassword, remove }
