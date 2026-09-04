/**
 * RMG Parts — Exportación Excel del cruce ChileCompra vs catálogo RMG.
 *
 * Replica exactamente el formato acordado con el usuario a lo largo de varias
 * rondas de trabajo manual (ver RMG_Licitacion_LaFlorida_Cruce_2026.md y los
 * scripts build.py..build5.py del análisis original):
 *
 *  - Costo/Precio Unitario = Neto Pack ÷ Unidades por Pack (FÓRMULA, nunca un
 *    valor hardcodeado).
 *  - Costo/Precio c/IVA Unitario = Neto Unitario × 1.19 (FÓRMULA).
 *  - Total Compra/Venta c/IVA (línea) = c/IVA Unitario × Cantidad (FÓRMULA).
 *  - NUNCA se aplica un "factor de ajuste" que multiplique el precio — las
 *    diferencias de presentación quedan solo como texto informativo en la
 *    columna Observación.
 *  - Columnas de detalle de Costo (rojo) y Precio (verde) agrupadas y
 *    colapsadas por defecto (outline collapsible, botones +/- de Excel).
 *  - Fila de TOTALES + bloque de comparación con presupuesto referencial.
 *  - Bloque de notas y metodología al pie.
 *
 * Esta es ahora la salida ESTÁNDAR y programática del análisis de una
 * oportunidad ChileCompra — se genera automáticamente en
 * analizarOportunidadInterno() y se adjunta a la ficha de la postulación
 * (documentos_adjuntos, entidad='oportunidad_chilecompra').
 */
const ExcelJS = require('exceljs')
const { db } = require('../../config/database')

const FONT = 'Arial'

const STYLE = {
  title: { name: FONT, size: 14, bold: true, color: { argb: 'FFFFFFFF' } },
  subtitle: { name: FONT, size: 10, italic: true, color: { argb: 'FFFFFFFF' } },
  header: { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } },
  normal: { name: FONT, size: 9 },
  input: { name: FONT, size: 9, color: { argb: 'FF0000FF' } },
  calc: { name: FONT, size: 9 },
  boldCalc: { name: FONT, size: 9, bold: true },
  total: { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } },
  gap: { name: FONT, size: 9, bold: true, color: { argb: 'FF9C0006' } },
  note: { name: FONT, size: 8, italic: true },
}

const FILL = {
  navy: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } },
  header: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E5395' } },
  costHeader: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F2020' } },
  priceHeader: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5C3D' } },
  cat: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } },
  gapRow: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } },
  white: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
  alt: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FC' } },
  totalRow: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } },
}

const BORDER = {
  top: { style: 'thin', color: { argb: 'FFB7C3D6' } },
  bottom: { style: 'thin', color: { argb: 'FFB7C3D6' } },
  left: { style: 'thin', color: { argb: 'FFB7C3D6' } },
  right: { style: 'thin', color: { argb: 'FFB7C3D6' } },
}

const MONEY_FMT = '$#,##0'
const NCOLS = 19
const HEADER_ROW = 4

const HEADERS = {
  1: 'N°', 2: 'Categoría', 3: 'Ítem solicitado (Bases Técnicas)', 4: 'Cant.\nRef.',
  5: 'Producto RMG (Genérico)', 6: 'SKU RMG', 7: 'Detalle / Descripción original RMG',
  8: 'Presentación de\nCompra RMG', 9: 'Unid. por\nPack/Caja',
  10: 'Confianza\nMatch', 11: 'Observación / Brecha',
  12: 'Costo Neto\nPack', 13: 'Costo Neto\nUnit. RMG', 14: 'Costo c/IVA\nUnit. RMG',
  15: 'Total Compra\nc/IVA (línea)',
  16: 'Precio Neto\nPack', 17: 'Precio Neto\nUnit. RMG', 18: 'Precio c/IVA\nUnit. RMG',
  19: 'Total Venta\nc/IVA (línea)',
}

const WIDTHS = {
  1: 5, 2: 16, 3: 34, 4: 7, 5: 22, 6: 11, 7: 38, 8: 18, 9: 8,
  10: 9, 11: 42,
  12: 11, 13: 11, 14: 11, 15: 12,
  16: 11, 17: 11, 18: 11, 19: 12,
}

function colLetter(idx) {
  let s = ''
  while (idx > 0) {
    const m = (idx - 1) % 26
    s = String.fromCharCode(65 + m) + s
    idx = Math.floor((idx - 1) / 26)
  }
  return s
}

function applyBorderFill(cell, fill) {
  cell.border = BORDER
  if (fill) cell.fill = fill
}

/**
 * Genera el workbook del cruce para una oportunidad ChileCompra ya analizada
 * (cruzarItemsConCatalogo debe haberse ejecutado antes). Devuelve un Buffer
 * XLSX listo para adjuntar como documento.
 */
async function generarExcelCruce(oportunidadId) {
  const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(oportunidadId)
  if (!op) throw new Error(`Oportunidad ${oportunidadId} no encontrada`)

  const items = db.prepare(`
    SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ? ORDER BY rowid
  `).all(oportunidadId)

  // Enriquecer cada ítem con los datos de catálogo del SKU emparejado.
  const catalogoBySku = {}
  for (const it of items) {
    if (it.sku_match && !catalogoBySku[it.sku_match]) {
      catalogoBySku[it.sku_match] = db.prepare(
        'SELECT * FROM lista_precios WHERE codigo_sku = ? LIMIT 1'
      ).get(it.sku_match)
    }
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'RMG Auto Parts — Asistente ChileCompra'
  wb.created = new Date()
  const ws = wb.addWorksheet('Cruce Bases vs Catalogo RMG', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }],
  })
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: true }

  // ---- Título ----
  ws.mergeCells(1, 1, 1, NCOLS)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = `RMG AUTO PARTS — Cruce Bases de Licitación vs Catálogo RMG`
  titleCell.font = STYLE.title
  titleCell.fill = FILL.navy
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(1).height = 24

  ws.mergeCells(2, 1, 2, NCOLS)
  const subtitleCell = ws.getCell(2, 1)
  const presupuesto = op.presupuesto_estimado
    ? `Presupuesto referencial $${Number(op.presupuesto_estimado).toLocaleString('es-CL')}`
    : 'Presupuesto referencial no informado'
  subtitleCell.value = `${op.organismo_nombre || 'Organismo'} — ${op.nombre || op.codigo_externo} | ${presupuesto} | ` +
    `Use los botones [+/-] sobre las columnas para ocultar/mostrar el detalle de Costo y de Precio`
  subtitleCell.font = STYLE.subtitle
  subtitleCell.fill = FILL.navy
  subtitleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(2).height = 16
  ws.getRow(3).height = 6

  // ---- Encabezados ----
  for (let i = 1; i <= NCOLS; i++) {
    const c = ws.getCell(HEADER_ROW, i)
    c.value = HEADERS[i]
    c.font = STYLE.header
    if (i >= 12 && i <= 15) c.fill = FILL.costHeader
    else if (i >= 16 && i <= 19) c.fill = FILL.priceHeader
    else c.fill = FILL.header
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = BORDER
  }
  ws.getRow(HEADER_ROW).height = 40

  for (let i = 1; i <= NCOLS; i++) {
    ws.getColumn(i).width = WIDTHS[i]
  }
  // Grupos colapsables (columnas de detalle de costo/precio)
  for (const idx of [12, 13, 14, 16, 17, 18]) {
    ws.getColumn(idx).outlineLevel = 1
  }

  // ---- Filas de datos ----
  let r = HEADER_ROW + 1
  const firstDataRow = r
  let n = 0
  for (const item of items) {
    n++
    const sku = item.sku_match ? catalogoBySku[item.sku_match] : null
    const isGap = !item.cubierto || !sku
    const fill = isGap ? FILL.gapRow : (n % 2 === 0 ? FILL.alt : FILL.white)

    const vals = {
      1: n,
      2: sku ? sku.categoria : 'SIN COBERTURA',
      3: item.descripcion_solicitada,
      4: item.cantidad,
      5: sku ? sku.producto_generico : 'SIN COBERTURA',
      6: sku ? sku.codigo_sku : '—',
      7: sku ? sku.descripcion : 'No existe producto en catálogo RMG para este ítem',
      8: sku ? sku.presentacion : '—',
      9: sku ? sku.unidades_por_pack : null,
      10: item.match_confianza != null ? item.match_confianza : null,
      11: item.observacion || (isGap ? 'Sin coincidencia en catálogo RMG — revisión manual pendiente.' : ''),
    }
    for (const [col, v] of Object.entries(vals)) {
      const c = ws.getCell(r, Number(col))
      c.value = v
      applyBorderFill(c, fill)
      if (Number(col) === 9 && v == null) c.font = STYLE.gap
      else c.font = STYLE.normal
      if (Number(col) === 10 && typeof v === 'number') c.numFmt = '0%'
      if ([1, 4, 9, 10].includes(Number(col))) c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      else c.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    }

    if (isGap || !sku) {
      for (let col = 12; col <= 19; col++) {
        const c = ws.getCell(r, col)
        c.value = (col === 12 || col === 16) ? 'S/C' : null
        c.font = STYLE.gap
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.fill = fill
        c.border = BORDER
      }
    } else {
      // lista_precios guarda el precio a nivel de PACK en precio_venta_neto
      // (no existe una columna precio_pack_neto separada — ver migración
      // lista_precios_v1 / mapeo del CSV original "PRECIO VTA").
      const costoPack = sku.costo_pack_neto != null ? sku.costo_pack_neto : sku.costo_unidad_neto
      const precioPack = sku.precio_venta_neto
      const unidPackCell = colLetter(9)
      const cantCell = colLetter(4)

      const set = (col, value, font, numFmt) => {
        const c = ws.getCell(r, col)
        c.value = value
        c.font = font
        if (numFmt) c.numFmt = numFmt
        c.alignment = { horizontal: 'right', vertical: 'middle' }
        c.fill = fill
        c.border = BORDER
      }

      set(12, costoPack, STYLE.input, MONEY_FMT)
      set(13, { formula: `L${r}/${unidPackCell}${r}` }, STYLE.calc, MONEY_FMT)
      set(14, { formula: `M${r}*1.19` }, STYLE.calc, MONEY_FMT)
      set(15, { formula: `N${r}*${cantCell}${r}` }, STYLE.boldCalc, MONEY_FMT)
      set(16, precioPack, STYLE.input, MONEY_FMT)
      set(17, { formula: `P${r}/${unidPackCell}${r}` }, STYLE.calc, MONEY_FMT)
      set(18, { formula: `Q${r}*1.19` }, STYLE.calc, MONEY_FMT)
      set(19, { formula: `R${r}*${cantCell}${r}` }, STYLE.boldCalc, MONEY_FMT)
    }

    ws.getRow(r).height = 50
    r++
  }
  const lastDataRow = r - 1

  // ---- Fila de totales ----
  const totRow = r
  for (let col = 1; col <= NCOLS; col++) {
    const c = ws.getCell(totRow, col)
    c.fill = FILL.totalRow
    c.border = BORDER
  }
  ws.mergeCells(totRow, 1, totRow, 11)
  const totLabel = ws.getCell(totRow, 1)
  totLabel.value = 'TOTALES OFERTA (líneas con cobertura RMG)'
  totLabel.font = STYLE.total
  totLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }

  const sumCompra = ws.getCell(totRow, 15)
  sumCompra.value = { formula: `SUM(O${firstDataRow}:O${lastDataRow})` }
  sumCompra.font = STYLE.total
  sumCompra.numFmt = MONEY_FMT
  sumCompra.alignment = { horizontal: 'right', vertical: 'middle' }

  const sumVenta = ws.getCell(totRow, 19)
  sumVenta.value = { formula: `SUM(S${firstDataRow}:S${lastDataRow})` }
  sumVenta.font = STYLE.total
  sumVenta.numFmt = MONEY_FMT
  sumVenta.alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getRow(totRow).height = 22

  // ---- Bloque comparación con presupuesto ----
  r = totRow + 2
  const addLabelValue = (label, value, numFmt, boldValue) => {
    ws.mergeCells(r, 1, r, 4)
    const lbl = ws.getCell(r, 1)
    lbl.value = label
    lbl.font = { name: FONT, size: 10, bold: true }
    const cell = ws.getCell(r, 5)
    cell.value = value
    cell.font = boldValue ? STYLE.boldCalc : STYLE.input
    cell.numFmt = numFmt
    cell.alignment = { horizontal: 'right' }
    const ref = `E${r}`
    r++
    return ref
  }

  const budgetRef = addLabelValue(
    'Presupuesto referencial de las bases (IVA incluido)',
    op.presupuesto_estimado || 0,
    MONEY_FMT,
    false
  )
  const ventaRef = addLabelValue(
    'Total Venta RMG c/IVA (líneas con cobertura)',
    { formula: `S${totRow}` },
    MONEY_FMT,
    true
  )
  addLabelValue(
    'Diferencia (Presupuesto − Total Venta RMG)',
    { formula: `${budgetRef}-${ventaRef}` },
    '$#,##0;[RED]-$#,##0',
    true
  )
  addLabelValue(
    '% del presupuesto utilizado',
    { formula: `${ventaRef}/${budgetRef}` },
    '0.0%',
    true
  )
  addLabelValue(
    'Margen estimado (Total Venta − Total Compra, c/IVA)',
    { formula: `S${totRow}-O${totRow}` },
    MONEY_FMT,
    true
  )
  r += 1

  // ---- Notas y metodología ----
  ws.mergeCells(r, 1, r, NCOLS)
  const notesHeader = ws.getCell(r, 1)
  notesHeader.value = 'Notas y metodología'
  notesHeader.font = { name: FONT, size: 10, bold: true }
  for (let col = 1; col <= NCOLS; col++) {
    ws.getCell(r, col).fill = FILL.cat
    ws.getCell(r, col).border = BORDER
  }
  r++

  const notas = [
    '0) Las columnas de detalle de Costo (rojo) y Precio (verde) están agrupadas y colapsadas por defecto — use los botones [+/-] sobre las columnas para mostrar/ocultar ese detalle sin perderlo.',
    '1) Presentación de Compra RMG (columna H) es el formato en que RMG efectivamente vende cada producto, leído directo de la lista de precios vigente. Cuando ese formato no coincide exactamente con la unidad pedida, queda indicado en la Observación — es un dato a resolver con el proveedor, NUNCA una corrección al precio.',
    '2) Costo/Precio Neto Unitario = Neto Pack ÷ Unidades por Pack (fórmula) — costo real de UN envase individual.',
    '3) Costo/Precio c/IVA Unitario = Neto Unitario × 1,19 (fórmula, IVA 19%).',
    '4) Total Compra/Venta c/IVA (línea) = c/IVA Unitario × Cantidad Referencial (fórmula) — el P×Q por línea que se totaliza contra el presupuesto.',
    '5) La fila de TOTALES y el bloque de comparación con presupuesto sólo consideran las líneas con cobertura RMG (fondo rojo = sin cobertura, excluidas).',
    '6) Confianza Match es el puntaje (0-100%) que el emparejador automático asignó al SKU propuesto — no reemplaza revisión de ficha técnica formal antes de ofertar.',
    '7) PATRÓN DE ANÁLISIS aplicado automáticamente: cuando la presentación exacta pedida (tineta/balde) no existe en la línea de producto requerida, el sistema prefiere la presentación de MENOR formato disponible en catálogo (balde, caja, bidón) como unidad de compra proxy — NUNCA un tambor/cilindro grande multiplicado directamente por la cantidad pedida, porque eso infla el volumen total comprado muy por sobre lo necesario. Ver columna Observación para el detalle de cada sustitución.',
    '8) Este Excel se generó automáticamente al analizar la oportunidad — queda adjunto a la ficha de la postulación junto con las fichas técnicas de los productos ofertados.',
  ]
  for (const nota of notas) {
    ws.mergeCells(r, 1, r, NCOLS)
    const c = ws.getCell(r, 1)
    c.value = nota
    c.font = STYLE.note
    c.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    ws.getRow(r).height = 26
    r++
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

module.exports = { generarExcelCruce }
