/**
 * enrich_catalogo.js — Idempotent CSV enrichment: adds rubro + aplicacion columns
 * Run: node data/enrich_catalogo.js
 */

const fs   = require('fs')
const path = require('path')

const CSV_PATH = path.join(__dirname, 'lista_precios.csv')

// ── helpers ────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n')
  const headers = lines[0].split(',')
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // simple split — no quoted-field handling needed for this CSV
    const vals = line.split(',')
    const obj = {}
    headers.forEach((h, idx) => { obj[h.trim()] = (vals[idx] || '').trim() })
    rows.push(obj)
  }
  return { headers: headers.map(h => h.trim()), rows }
}

function rowToCSV(headers, row) {
  return headers.map(h => {
    const v = row[h] === undefined ? '' : String(row[h])
    // quote if contains comma or newline
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return '"' + v.replace(/"/g, '""') + '"'
    }
    return v
  }).join(',')
}

// ── rubro inference ────────────────────────────────────────────────────────────
function inferRubro(row) {
  const seg   = row['segmento_negocio'] || ''
  const marca = (row['marca'] || '').toUpperCase()

  if (seg === 'Talleres')            return 'Talleres'
  if (seg === 'Concesionarios')      return 'Concesionarios'
  if (seg === 'Flotas')              return 'Flotas'
  if (seg === 'Construccion (agro)') return 'Agricola'
  if (seg === 'Construccion')        return 'Construccion'
  if (seg === 'Industria')           return 'Industria'
  if (seg === 'Venta Libre (No Especifico)') {
    return marca === 'AUSTER' ? 'Flotas,Talleres' : 'Talleres,Concesionarios'
  }
  return 'Talleres,Concesionarios'
}

// ── aplicacion inference ───────────────────────────────────────────────────────
function inferAplicacion(row) {
  const cat  = (row['categoria'] || '').toLowerCase()
  const desc = (row['descripcion'] || '').toUpperCase()

  if (cat === 'neumatico' || cat === 'neumático') {
    if (/R22\.5|17\.5R|\b295\/80|\b315\/80|1200 R|11 R22|12 R22|13 R22/.test(desc))
      return 'camion_flota'
    if (/(30X|31X|27X)/.test(desc))
      return 'maquinaria_agricola'
    return 'liviano'
  }

  if (cat === 'lubricante') {
    if (/HYDRO|ISO 46|ISO 68|GREASE|LITHIUM/.test(desc))
      return 'industrial'
    if (/15W-?40.*CK|CK-?4|80W-?90|75W-?90|75W-?80/.test(desc))
      return 'camion_flota'
    return 'liviano'
  }

  if (cat === 'bateria' || cat === 'batería') {
    if (/N100|N120|N150|N200|180.*A/.test(desc))
      return 'camion_flota'
    // extract AMP value
    const ampMatch = desc.match(/(\d+)\s*AMP/)
    if (ampMatch && parseInt(ampMatch[1], 10) >= 70)
      return 'camion_flota'
    return 'liviano'
  }

  return 'liviano'
}

// ── main ───────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('ERROR: archivo no encontrado:', CSV_PATH)
    process.exit(1)
  }

  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  const { headers, rows } = parseCSV(raw)

  // Idempotency check
  const alreadyHasRubro   = headers.includes('rubro')
  const alreadyHasAplic   = headers.includes('aplicacion')

  if (alreadyHasRubro && alreadyHasAplic) {
    console.log('✅ Columnas rubro y aplicacion ya existen — nada que hacer.')
    return
  }

  // Build new headers
  const newHeaders = [...headers]
  if (!alreadyHasRubro)  newHeaders.push('rubro')
  if (!alreadyHasAplic)  newHeaders.push('aplicacion')

  // Enrich rows
  const enriched = rows.map(row => {
    const out = { ...row }
    if (!alreadyHasRubro)  out['rubro']     = inferRubro(row)
    if (!alreadyHasAplic)  out['aplicacion'] = inferAplicacion(row)
    return out
  })

  // Write back
  const lines = [
    newHeaders.join(','),
    ...enriched.map(r => rowToCSV(newHeaders, r)),
  ]
  fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n', 'utf8')

  console.log(`✅ CSV enriquecido: ${enriched.length} filas procesadas.`)
  console.log(`   Columnas añadidas: ${[!alreadyHasRubro && 'rubro', !alreadyHasAplic && 'aplicacion'].filter(Boolean).join(', ')}`)

  // Quick sanity stats
  const rubroSet = [...new Set(enriched.map(r => r['rubro']))]
  const aplicSet = [...new Set(enriched.map(r => r['aplicacion']))]
  console.log(`   Rubros únicos:     ${rubroSet.join(' | ')}`)
  console.log(`   Aplicaciones:      ${aplicSet.join(' | ')}`)
}

main()
