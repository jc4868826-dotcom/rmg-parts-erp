/**
 * Script de importación idempotente para lista_precios.
 * Lee data/lista_precios.csv, borra la tabla y reinserta todas las filas.
 * Uso: node backend/src/data/import_lista_precios.js
 */
'use strict'

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../../.env') })

const fs = require('fs')
const { db, initDB } = require('../../config/database')

const CSV_PATH = path.join(__dirname, '../../../data/lista_precios.csv')

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = line.split(',')
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim() })
    return obj
  })
}

const toInt = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n }
const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n }
const toStr = v => (v && v.trim()) ? v.trim() : null

async function run() {
  await initDB()

  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'))

  const doImport = db.transaction(() => {
    db.prepare('DELETE FROM lista_precios').run()

    const ins = db.prepare(`
      INSERT INTO lista_precios (
        segmento_negocio, prioridad_consumo, categoria, producto_generico,
        proveedor, marca, ranking_compra, codigo_sku, descripcion, presentacion,
        tipo_envase, unidades_por_pack, costo_pack_neto, costo_unidad_neto,
        precio_venta_neto, margen_clp, margen_pct,
        mercado_min, mercado_max, holgura_mercado, pct_min_mercado, pct_max_mercado
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `)

    for (const r of rows) {
      ins.run(
        toStr(r.segmento_negocio),
        toInt(r.prioridad_consumo),
        toStr(r.categoria),
        toStr(r.producto_generico),
        toStr(r.proveedor),
        toStr(r.marca),
        toInt(r.ranking_compra),
        toStr(r.codigo_sku),
        toStr(r.descripcion),
        toStr(r.presentacion),
        toStr(r.tipo_envase),
        toInt(r.unidades_por_pack),
        toInt(r.costo_pack_neto),
        toInt(r.costo_unidad_neto),
        toInt(r.precio_venta_neto),
        toInt(r.margen_clp),
        toFloat(r.margen_pct),
        toFloat(r.mercado_min),
        toFloat(r.mercado_max),
        toFloat(r.holgura_mercado),
        toFloat(r.pct_min_mercado),
        toFloat(r.pct_max_mercado)
      )
    }
    return rows.length
  })

  const n = doImport()
  console.log(`✅ lista_precios importada: ${n} filas insertadas`)
  process.exit(0)
}

run().catch(err => { console.error('❌', err); process.exit(1) })
