const { db } = require('../../config/database')

const mesActual = () => new Date().toISOString().slice(0, 7)

const DEFAULTS = {
  meta_venta_total: 20000000,
  meta_talleres: 8000000,
  meta_flotas: 6000000,
  meta_concesionarios: 4000000,
  meta_construccion: 2000000,
  pct_crecimiento_m1: 15,
  pct_crecimiento_m2: 15,
  pct_crecimiento_m3: 15,
  margen_objetivo_pct: 26,
  dias_credito_promedio: 30,
  presupuesto_gastos_operacionales: 2500000,
  stock_minimo_bateria: 5,
  stock_minimo_lubricante: 10,
  stock_minimo_neumatico: 8,
  dias_inactivo_cliente: 30,
  dias_alerta_cxc: 30,
}

const FIELDS = Object.keys(DEFAULTS)

const withDefaults = (row, mes) => ({ ...DEFAULTS, mes, ...row })

const getByMes = (req, res) => {
  try {
    const mes = req.query.mes || mesActual()
    const row = db.prepare('SELECT * FROM configuracion_mensual WHERE mes = ?').get(mes)
    res.json(withDefaults(row || {}, mes))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getActual = (_req, res) => {
  try {
    const mes = mesActual()
    const row = db.prepare('SELECT * FROM configuracion_mensual WHERE mes = ?').get(mes)
    res.json(withDefaults(row || {}, mes))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const upsert = (req, res) => {
  try {
    const mes = req.body.mes || mesActual()
    const existing = db.prepare('SELECT id FROM configuracion_mensual WHERE mes = ?').get(mes)

    if (existing) {
      const toUpdate = FIELDS.filter(f => req.body[f] !== undefined)
      if (toUpdate.length) {
        const set = toUpdate.map(f => `${f} = ?`).join(', ')
        db.prepare(`UPDATE configuracion_mensual SET ${set}, updated_at = datetime('now') WHERE mes = ?`)
          .run(...toUpdate.map(f => req.body[f]), mes)
      }
    } else {
      db.prepare(`
        INSERT INTO configuracion_mensual
          (mes, meta_venta_total, meta_talleres, meta_flotas, meta_concesionarios, meta_construccion,
           pct_crecimiento_m1, pct_crecimiento_m2, pct_crecimiento_m3, margen_objetivo_pct,
           dias_credito_promedio, presupuesto_gastos_operacionales,
           stock_minimo_bateria, stock_minimo_lubricante, stock_minimo_neumatico,
           dias_inactivo_cliente, dias_alerta_cxc)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        mes,
        req.body.meta_venta_total            ?? DEFAULTS.meta_venta_total,
        req.body.meta_talleres               ?? DEFAULTS.meta_talleres,
        req.body.meta_flotas                 ?? DEFAULTS.meta_flotas,
        req.body.meta_concesionarios         ?? DEFAULTS.meta_concesionarios,
        req.body.meta_construccion           ?? DEFAULTS.meta_construccion,
        req.body.pct_crecimiento_m1          ?? DEFAULTS.pct_crecimiento_m1,
        req.body.pct_crecimiento_m2          ?? DEFAULTS.pct_crecimiento_m2,
        req.body.pct_crecimiento_m3          ?? DEFAULTS.pct_crecimiento_m3,
        req.body.margen_objetivo_pct         ?? DEFAULTS.margen_objetivo_pct,
        req.body.dias_credito_promedio       ?? DEFAULTS.dias_credito_promedio,
        req.body.presupuesto_gastos_operacionales ?? DEFAULTS.presupuesto_gastos_operacionales,
        req.body.stock_minimo_bateria        ?? DEFAULTS.stock_minimo_bateria,
        req.body.stock_minimo_lubricante     ?? DEFAULTS.stock_minimo_lubricante,
        req.body.stock_minimo_neumatico      ?? DEFAULTS.stock_minimo_neumatico,
        req.body.dias_inactivo_cliente       ?? DEFAULTS.dias_inactivo_cliente,
        req.body.dias_alerta_cxc             ?? DEFAULTS.dias_alerta_cxc,
      )
    }

    const row = db.prepare('SELECT * FROM configuracion_mensual WHERE mes = ?').get(mes)
    res.json(withDefaults(row || {}, mes))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getByMes, getActual, upsert }
