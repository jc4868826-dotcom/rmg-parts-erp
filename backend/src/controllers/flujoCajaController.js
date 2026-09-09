'use strict'
const { db, uuidv4 } = require('../../config/database')

const hoy = () => new Date().toISOString().split('T')[0]

// Construye movimientos consolidados para un rango de fechas (o un mes YYYY-MM)
function buildMovimientos(filtroDesde, filtroHasta) {
  const movs = []

  // 1. Ventas
  try {
    const vDate = `CASE forma_pago
      WHEN 'Crédito 30 días' THEN date(fecha,'+30 days')
      WHEN 'Crédito 60 días' THEN date(fecha,'+60 days')
      WHEN 'Crédito 90 días' THEN date(fecha,'+90 days')
      ELSE fecha END`
    // venta.total se guarda NETO en todo el sistema — el monto que realmente
    // entra a caja al pagarse es el total CON IVA (19%). Misma fórmula que
    // ventasController usa al registrar el ingreso real en caja_movimientos
    // (total + round(total*0.19)), para que el Flujo de Caja coincida con lo
    // que efectivamente se acredita en la cuenta corriente.
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'ventas' AS origen_tabla, 'Venta' AS origen_label,
        'ingreso' AS tipo, 'Venta' AS categoria,
        COALESCE(cliente_nombre,'Cliente') || ' · ' || COALESCE(numero_documento,'') AS descripcion,
        (total + ROUND(total * 0.19)) AS monto,
        (${vDate}) AS fecha_pago,
        CASE WHEN estado='Pagado' THEN 'confirmado' ELSE 'proyectado' END AS estado,
        NULL AS cuenta_bancaria
      FROM ventas WHERE (${vDate}) >= ? AND (${vDate}) <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 2. Gastos
  try {
    const gcols = db.prepare('PRAGMA table_info(gastos)').all().map(c => c.name)
    const gDate = gcols.includes('fecha_vencimiento') ? 'COALESCE(fecha_vencimiento,fecha)' : 'fecha'
    const gDesc = gcols.includes('descripcion') ? 'descripcion' : gcols.includes('concepto') ? 'concepto' : "'Gasto'"
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'gastos' AS origen_tabla, 'Gasto' AS origen_label,
        'egreso' AS tipo, COALESCE(categoria,'Gasto') AS categoria,
        ${gDesc} AS descripcion, monto,
        ${gDate} AS fecha_pago,
        CASE WHEN estado='pagado' THEN 'confirmado' ELSE 'proyectado' END AS estado,
        NULL AS cuenta_bancaria
      FROM gastos WHERE ${gDate} >= ? AND ${gDate} <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 3. Compras ERP
  try {
    const ccols = db.prepare('PRAGMA table_info(compras)').all().map(c => c.name)
    const cDate = ccols.includes('fecha_vencimiento') ? 'COALESCE(fecha_vencimiento,fecha)' : 'fecha'
    const cFac  = ccols.includes('numero_factura') ? "COALESCE(' · Fac.'||numero_factura,'')" : "''"
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'compras' AS origen_tabla, 'Compra' AS origen_label,
        'egreso' AS tipo, 'Compra' AS categoria,
        COALESCE(proveedor,'Proveedor') || ${cFac} AS descripcion,
        total AS monto,
        ${cDate} AS fecha_pago,
        CASE WHEN estado IN ('Pagada','Pagado') THEN 'confirmado' ELSE 'proyectado' END AS estado,
        NULL AS cuenta_bancaria
      FROM compras WHERE ${cDate} >= ? AND ${cDate} <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 4. OC pendientes de pago (pagada=0, estados activos)
  try {
    const occols = db.prepare('PRAGMA table_info(ordenes_compra)').all().map(c => c.name)
    const ocDate = occols.includes('fecha_vencimiento') ? 'COALESCE(fecha_vencimiento,fecha_emision)' : 'fecha_emision'
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'ordenes_compra' AS origen_tabla, 'OC' AS origen_label,
        'egreso' AS tipo, 'Compra proveedor' AS categoria,
        'OC '||numero||' · '||COALESCE(proveedor,'') AS descripcion,
        total AS monto,
        ${ocDate} AS fecha_pago,
        'proyectado' AS estado,
        NULL AS cuenta_bancaria
      FROM ordenes_compra
      WHERE pagada=0 AND estado NOT IN ('anulada','Rechazada','Pagada')
        AND ${ocDate} >= ? AND ${ocDate} <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 5. Movimientos manuales de caja
  try {
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'manual' AS origen_tabla, 'Manual' AS origen_label,
        tipo, categoria, descripcion, monto, fecha_pago, estado, cuenta_bancaria
      FROM caja_movimientos
      WHERE origen_tabla='manual' AND fecha_pago >= ? AND fecha_pago <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 6. Facturas de proveedor (OC → registrarFactura() en ocController.js).
  // Estas filas YA viven completas en caja_movimientos (no hay que
  // reconstruirlas desde otra tabla, igual que los movimientos manuales) —
  // antes esta sección no existía y por eso los pagos a proveedor vía
  // factura de OC (ej. Christian Hughes, Vistony) eran invisibles en esta
  // tabla aunque sí estaban restando del saldo real. Encontrado el
  // 09-sep-2026 al reconciliar el saldo contra el banco.
  try {
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'facturas_proveedor' AS origen_tabla, 'Factura proveedor' AS origen_label,
        tipo, categoria, descripcion, monto, fecha_pago, estado, cuenta_bancaria
      FROM caja_movimientos
      WHERE origen_tabla='facturas_proveedor' AND fecha_pago >= ? AND fecha_pago <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // Todas las filas de arriba salvo 'manual'/'facturas_proveedor' se
  // RECONSTRUYEN en vivo desde ventas/gastos/compras/ordenes_compra — su
  // `id` es el id de esa tabla origen, no el id real en caja_movimientos.
  // Para poder editar/eliminar cualquier línea desde el Flujo de Caja
  // (no solo las manuales) hace falta el id real; se resuelve aquí en un
  // solo query en vez de uno por fila.
  try {
    const cajaIds = db.prepare(`
      SELECT id, origen_tabla, origen_id FROM caja_movimientos WHERE origen_tabla NOT IN ('manual','facturas_proveedor')
    `).all()
    const mapa = new Map(cajaIds.map(c => [`${c.origen_tabla}::${String(c.origen_id)}`, c.id]))
    for (const m of movs) {
      if (m.origen_tabla === 'manual' || m.origen_tabla === 'facturas_proveedor') {
        m.caja_movimiento_id = m.id
      } else {
        m.caja_movimiento_id = mapa.get(`${m.origen_tabla}::${String(m.origen_id)}`) || null
      }
    }
  } catch (_) {}

  movs.sort((a, b) => (a.fecha_pago || '').localeCompare(b.fecha_pago || ''))
  return movs
}

// Calcula el saldo de caja acumulado DESDE EL INICIO del sistema hasta fecha_corte
// (todos los ingresos confirmados menos todos los gastos y egresos confirmados).
//
// Fuente única de verdad: caja_movimientos. Esa tabla ya recibe automáticamente
// cada movimiento real de caja apenas ocurre — ventas.registrarPago() inserta el
// ingreso al marcar una venta 'Pagado', gastos.create() inserta el egreso al
// crear un gasto 'pagado', y lo mismo para OC pagadas / CxP pagadas / CxC
// cobradas — además de los movimientos manuales.
//
// ANTES este cálculo TAMBIÉN sumaba de nuevo, directo desde la tabla `ventas`
// (estado='Pagado') y restaba de nuevo, directo desde la tabla `gastos`
// (estado='pagado') — pero esos mismos montos YA estaban contados a través de
// caja_movimientos, así que cada venta pagada y cada gasto pagado se contaban
// DOS VECES. Eso es lo que descuadraba el "Saldo Actual (HOY)" en el dashboard.
// La corrección es dejar caja_movimientos como única fuente.
function calcSaldoAlCorte(fechaCorte) {
  try {
    const r = db.prepare(`
      SELECT COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE -monto END),0) as s
      FROM caja_movimientos
      WHERE estado = 'confirmado' AND fecha_pago <= ?
    `).get(fechaCorte)
    return r.s
  } catch (_) {
    return 0
  }
}

const getMovimientos = (req, res) => {
  try {
    const today = hoy()

    // Soporte para ?mes=YYYY-MM (retrocompatibilidad) y ?fecha_inicio + ?fecha_fin
    let filtroDesde, filtroHasta
    if (req.query.mes) {
      filtroDesde = `${req.query.mes}-01`
      // último día del mes
      const [y, m] = req.query.mes.split('-').map(Number)
      const last = new Date(y, m, 0)
      filtroHasta = last.toISOString().split('T')[0]
    } else if (req.query.fecha_inicio || req.query.fecha_fin) {
      filtroDesde = req.query.fecha_inicio || '2000-01-01'
      filtroHasta = req.query.fecha_fin    || today
    } else {
      // Sin filtro de fecha: usar mes actual
      const mesActual = today.slice(0, 7)
      filtroDesde = `${mesActual}-01`
      const [y, m] = mesActual.split('-').map(Number)
      const last = new Date(y, m, 0)
      filtroHasta = last.toISOString().split('T')[0]
    }

    const movs = buildMovimientos(filtroDesde, filtroHasta)

    const sum = (fn) => movs.filter(fn).reduce((s, m) => s + (m.monto || 0), 0)
    const ic = sum(m => m.tipo === 'ingreso' && m.estado === 'confirmado')
    const ip = sum(m => m.tipo === 'ingreso' && m.estado === 'proyectado')
    const ec = sum(m => m.tipo === 'egreso'  && m.estado === 'confirmado')
    const ep = sum(m => m.tipo === 'egreso'  && m.estado === 'proyectado')

    const saldo_al_corte = calcSaldoAlCorte(filtroHasta)
    const saldo_actual   = calcSaldoAlCorte(today)

    return res.json({
      movimientos: movs,
      saldo_al_corte,
      saldo_actual,
      total_ingresos_periodo: ic + ip,
      total_egresos_periodo:  ec + ep,
      resumen: {
        ingresos_confirmados: ic, ingresos_proyectados: ip,
        egresos_confirmados:  ec, egresos_proyectados:  ep,
        saldo_real:       ic - ec,
        saldo_proyectado: (ic - ec) + ip - ep,
      },
      periodo: { desde: filtroDesde, hasta: filtroHasta },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getResumen = (_req, res) => {
  try {
    const today = hoy()
    const en30 = new Date(); en30.setDate(en30.getDate() + 30)
    const en30str = en30.toISOString().split('T')[0]

    const saldoActual = db.prepare(`
      SELECT COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_movimientos WHERE estado = 'confirmado' AND fecha_pago <= ?
    `).get(today).saldo

    const ingresosProx30 = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total FROM caja_movimientos
      WHERE tipo = 'ingreso' AND fecha_pago > ? AND fecha_pago <= ?
    `).get(today, en30str).total

    const egresosProx30 = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total FROM caja_movimientos
      WHERE tipo = 'egreso' AND fecha_pago > ? AND fecha_pago <= ?
    `).get(today, en30str).total

    res.json({ saldo_actual: saldoActual, ingresos_prox30: ingresosProx30, egresos_prox30: egresosProx30 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Diagnóstico temporal — lista las filas crudas de caja_movimientos (la
// tabla que alimenta saldo_actual/saldo_al_corte) para poder reconciliarla
// a mano contra la reconstrucción en vivo de buildMovimientos(). Solo
// lectura, sin efectos secundarios. Quitar una vez cerrado el diagnóstico
// del descuadre "Saldo actual" reportado el 09-sep-2026.
const getRaw = (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, tipo, categoria, descripcion, monto, fecha_registro, fecha_pago,
             estado, origen_tabla, origen_id, cuenta_bancaria
      FROM caja_movimientos
      ORDER BY fecha_pago, id
    `).all()
    const totalConfirmado = rows.filter(r => r.estado === 'confirmado')
      .reduce((s, r) => s + (r.tipo === 'ingreso' ? r.monto : -r.monto), 0)
    res.json({ count: rows.length, total_confirmado_recalculado: totalConfirmado, rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Corrección puntual, ejecutada una sola vez el 09-sep-2026 — reconciliación
// manual de caja_movimientos contra el banco real, confirmada línea por
// línea con el usuario (ver hilo "corrige el saldo actual del flujo de
// caja"). Borra las filas que el usuario confirmó como erróneas/duplicadas
// (2 notas de venta y 2 ventas que nunca se depositaron, el set completo
// duplicado de la venta MSTM, el ajuste manual "fantasma", y las OCs de
// Vistony y Christian Hughes que quedaron contadas dos veces — una vez por
// su factura y otra por la OC misma, bug ahora corregido en
// ocController.js) y agrega el único movimiento real que faltaba (el gasto
// "estampado chaquetas", pagado el 03-ago pero nunca sincronizado a caja).
// Idempotente: si ya se corrió, las filas a borrar ya no existen (no falla)
// y no vuelve a insertar el gasto si ya tiene su movimiento.
const IDS_A_BORRAR_RECONCILIACION_090926 = [19, 20, 21, 22, 23, 28, 32, 33, 34, 36, 38, 44]
const reconciliar090926 = (req, res) => {
  try {
    const borrados = []
    const delStmt = db.prepare('DELETE FROM caja_movimientos WHERE id = ?')
    for (const id of IDS_A_BORRAR_RECONCILIACION_090926) {
      const info = delStmt.run(id)
      if (info.changes) borrados.push(id)
    }

    // El usuario volvió a crear un "ajuste fantasma" manual (mismo parche
    // que ya no hace falta) entre la primera pasada y esta — se limpia
    // cualquier movimiento manual confirmado cuya descripción contenga
    // "fantasma", sin depender de un id fijo.
    const fantasmas = db.prepare(
      "SELECT id FROM caja_movimientos WHERE origen_tabla = 'manual' AND estado = 'confirmado' AND descripcion LIKE '%fantasma%'"
    ).all()
    for (const f of fantasmas) {
      delStmt.run(f.id)
      borrados.push(f.id)
    }

    const yaExisteEstampado = db.prepare(
      "SELECT id FROM caja_movimientos WHERE origen_tabla = 'gastos' AND origen_id = 'd28f7610-f203-477d-ace5-504ab8572182'"
    ).get()
    let agregado = false
    if (!yaExisteEstampado) {
      db.prepare(`
        INSERT INTO caja_movimientos
          (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id, cuenta_bancaria)
        VALUES ('egreso','otros','estampado chaquetas',16800,?,?,'confirmado','gastos','d28f7610-f203-477d-ace5-504ab8572182',NULL)
      `).run(hoy(), '2026-08-03')
      agregado = true
    }

    const total = db.prepare(`
      SELECT COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE -monto END),0) as s
      FROM caja_movimientos WHERE estado = 'confirmado'
    `).get().s

    res.json({ ok: true, filas_borradas: borrados, gasto_estampado_agregado: agregado, saldo_actual_recalculado: total })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const crearManual = (req, res) => {
  try {
    const { tipo, categoria, descripcion, monto, fecha_pago, estado, cuenta_bancaria } = req.body
    if (!tipo || !descripcion || !monto) {
      return res.status(400).json({ error: 'tipo, descripcion y monto son requeridos' })
    }
    if (!['ingreso', 'egreso'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo debe ser ingreso o egreso' })
    }
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, cuenta_bancaria)
      VALUES (?,?,?,?,?,?,?,'manual',?)
    `).run(tipo, categoria || null, descripcion, Number(monto),
        hoy(), fecha_pago || hoy(), estado || 'proyectado', cuenta_bancaria || null)
    const nuevo = db.prepare('SELECT * FROM caja_movimientos ORDER BY id DESC LIMIT 1').get()
    res.status(201).json(nuevo)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const actualizar = (req, res) => {
  try {
    const m = db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id)
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' })
    const allowed = ['tipo', 'categoria', 'descripcion', 'monto', 'fecha_pago', 'estado', 'cuenta_bancaria']
    const toUpdate = allowed.filter(f => req.body[f] !== undefined)
    if (!toUpdate.length) return res.json(m)
    const set = toUpdate.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE caja_movimientos SET ${set} WHERE id = ?`)
      .run(...toUpdate.map(f => req.body[f]), req.params.id)
    res.json(db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Antes solo se podían borrar movimientos manuales — pensado para que un
// registro real (venta, gasto, OC) nunca se pudiera borrar por error desde
// acá. Pero eso mismo obligó a corregir a mano por código un descuadre de
// caja (09-sep-2026: pagos duplicados de OC, un "ajuste fantasma" repetido)
// que el usuario debería poder arreglar él mismo. Ahora se puede borrar
// cualquier fila — la ruta ya exige rol gerente/administrador (ver
// routes/flujoCaja.js) — con una salvedad: borrar una fila que viene de una
// venta/gasto/OC/compra SOLO borra su movimiento de caja (deja de contar en
// el saldo); NO revierte el estado "Pagado"/"pagado" de esa venta/gasto/OC
// en su tabla de origen. Si el usuario borra por error el pago real de una
// venta, la venta queda marcada pagada pero sin su ingreso en caja —
// tendría que volver a registrar el pago desde Ventas para que se
// reinserte correctamente.
const eliminar = (req, res) => {
  try {
    const m = db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id)
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' })
    db.prepare('DELETE FROM caja_movimientos WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getMovimientos, getResumen, getRaw, reconciliar090926, crearManual, actualizar, eliminar }
