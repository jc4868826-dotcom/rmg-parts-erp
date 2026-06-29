const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { validationResult } = require('express-validator')
const { db } = require('../../config/database')

const login = (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Email o contraseña inválidos' })
  }
  const { email, password } = req.body

  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email)
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' })
  }

  db.prepare("UPDATE usuarios SET ultimo_acceso = datetime('now') WHERE id = ?").run(user.id)

  const token = jwt.sign(
    { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  const { password_hash, ...publicUser } = user
  return res.json({ token, user: publicUser })
}

const logout = (_req, res) => res.json({ ok: true })

const getMe = (req, res) => res.json({ user: req.user })

const changePassword = (req, res) => {
  try {
    const { current_password, new_password } = req.body
    const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id)
    if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' })
    }
    const hash = bcrypt.hashSync(new_password, 10)
    db.prepare("UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hash, req.user.id)
    res.json({ ok: true, message: 'Contraseña actualizada' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { login, logout, getMe, changePassword }
