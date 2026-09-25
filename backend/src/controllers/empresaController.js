/**
 * RMG Parts — Datos de la empresa (2026-09-25)
 *
 * Fila única en `empresa_config`. Es la fuente de verdad para todo lo que
 * lleva membrete: cotización, orden de compra, nota de venta, correos.
 * Antes estos datos estaban escritos a mano dentro de la plantilla del PDF y
 * el formulario de Configuración no guardaba nada — por eso los cambios nunca
 * se veían en los documentos.
 */
const { db } = require('../../config/database')

const ROLES_EDITAN = ['gerente', 'administrador']

const CAMPOS = [
  'nombre', 'razon_social', 'rut', 'giro',
  'direccion', 'comuna', 'ciudad', 'telefono', 'email', 'web',
  'banco_nombre', 'banco_tipo_cuenta', 'banco_numero', 'banco_titular', 'banco_rut', 'banco_email',
  'pie_pagina', 'logo_base64',
]

const DEFAULTS = {
  nombre: 'RMG Parts',
  razon_social: 'RMG Parts SpA',
  rut: '',
  giro: 'Distribución mayorista de insumos automotrices',
  direccion: '',
  comuna: '',
  ciudad: 'Santiago, Región Metropolitana',
  telefono: '',
  email: '',
  web: '',
  banco_nombre: '',
  banco_tipo_cuenta: 'Cuenta Corriente',
  banco_numero: '',
  banco_titular: '',
  banco_rut: '',
  banco_email: '',
  pie_pagina: 'Distribución mayorista B2B · Santiago RM',
  logo_base64: '',
}

function filaActual() {
  const row = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get()
  return { ...DEFAULTS, ...(row || {}), id: 1 }
}

const get = (_req, res) => {
  try {
    res.json(filaActual())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    if (!ROLES_EDITAN.includes(req.user?.rol)) {
      return res.status(403).json({ error: 'Solo gerencia o administración pueden cambiar los datos de la empresa' })
    }
    const cambios = CAMPOS.filter(c => req.body[c] !== undefined)
    if (!cambios.length) return res.json(filaActual())

    const existe = db.prepare('SELECT id FROM empresa_config WHERE id = 1').get()
    if (existe) {
      const set = cambios.map(c => `${c} = ?`).join(', ')
      db.prepare(`UPDATE empresa_config SET ${set}, updated_at = datetime('now') WHERE id = 1`)
        .run(...cambios.map(c => req.body[c]))
    } else {
      const valores = { ...DEFAULTS }
      for (const c of cambios) valores[c] = req.body[c]
      const cols = CAMPOS.join(', ')
      const marks = CAMPOS.map(() => '?').join(', ')
      db.prepare(`INSERT INTO empresa_config (id, ${cols}) VALUES (1, ${marks})`)
        .run(...CAMPOS.map(c => valores[c]))
    }
    res.json(filaActual())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { get, update, filaActual, CAMPOS, DEFAULTS }
