import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, FileText, Send, Check, X, Clock, Printer, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const ESTADOS = [
  { key: '', label: 'Todos' },
  { key: 'borrador', label: 'Borrador' },
  { key: 'enviada', label: 'Enviadas' },
  { key: 'aprobada', label: 'Aprobadas' },
  { key: 'rechazada', label: 'Rechazadas' },
]

const ESTADO_STYLES = {
  borrador:  { label: 'Borrador',  icon: Clock,   bg: 'rgba(90,143,168,0.12)', color: 'rgba(90,143,168,0.9)' },
  enviada:   { label: 'Enviada',   icon: Send,    bg: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)' },
  aprobada:  { label: 'Aprobada', icon: Check,   bg: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' },
  rechazada: { label: 'Rechazada', icon: X,      bg: 'rgba(224,90,78,0.12)',  color: 'var(--rmg-red)' },
  vencida:   { label: 'Vencida',   icon: Clock,   bg: 'rgba(244,162,60,0.12)', color: 'var(--rmg-gold)' },
}

const ESTADOS_COTIZACION = ['borrador', 'enviada', 'aprobada', 'rechazada', 'vencida']

function detectarCategoria(items) {
  const descs = (items || []).map(i => (i.descripcion || '').toLowerCase()).join(' ')
  const hasQuimico   = /shampoo|cera|polish|silicone|desengras|brillo|lava auto|limpia|detailing|quitamanchas|ambientador/.test(descs)
  const hasLubricant = /aceite|lubric|5w|10w|15w|20w|80w|75w|grasa|gear oil|motor oil/.test(descs)
  const hasFreno     = /freno|brake|dof/.test(descs)
  const hasNeumatico = /neumatico|neumático|llanta|tire|tyre/.test(descs)
  const hasBateria   = /bateria|batería|battery|amperio|amp/.test(descs)

  if (hasQuimico && (hasLubricant || hasFreno)) {
    return 'Kit de mantención y presentación vehicular · Productos certificados línea Vistony · Ideales para talleres de posventa, preparación y entrega de vehículos. Entrega directa en su taller, factura con IVA, sin mínimo de compra.'
  }
  if (hasNeumatico) {
    return 'Neumáticos Kumho / Double Star · Homologados para uso en Chile · Precio distribuidor · Despacho coordinado a su taller o bodega.'
  }
  if (hasBateria) {
    return 'Baterías Yoko G&B / Platin · Garantía de fábrica · Precio distribuidor · Entrega inmediata stock disponible.'
  }
  if (hasLubricant) {
    return 'Lubricantes industriales y automotrices línea Vistony · API certificados · Entrega en 24 hrs · Precio distribuidor mayorista directo.'
  }
  return 'Insumos automotrices y de mantención · Distribución directa desde bodega Santiago RM · Factura con IVA · Entrega 24-48 hrs.'
}


const BENEFICIOS_SKU = {
  '1500007': 'Aromatizante de ambiente para habitáculo · Presentación final al cliente · Fragancia fresca y duradera',
  '1400025': 'Protege y acondiciona plásticos, gomas y tapizados · Deja superficies con brillo natural · Aroma a fresa',
  '1000748': 'Aceite sintético 5W30 API SN · Compatible con motores modernos · Protección contra desgaste y depósitos',
  '1400054': 'Limpieza profunda de parabrisas y vidrios · Sin rayas · Mejora visibilidad en manejo',
  '1200080': 'Refrigerante OAT orgánico al 33% · Protección contra corrosión · Compatible con todos los metales del motor',
  '1300013': 'Líquido de frenos DOT-3 · Punto de ebullición alto · Esencial en revisión pre-entrega',
  '1400165': 'Abrillantador y protector de carrocería · Efecto espejo de larga duración · Ideal para preparación vehicular',
}

const BENEFICIOS_CAT = {
  lubricante: 'Lubricante certificado API · Protección del motor y reducción de desgaste',
  quimico: 'Producto de cuidado y presentación vehicular · Línea Vistony certificada',
  refrigerante: 'Refrigerante certificado · Protección del sistema de enfriamiento',
  frenos: 'Líquido de frenos certificado · Seguridad activa del vehículo',
  neumatico: 'Neumático homologado para uso en Chile · Distribución directa RMG Parts',
  bateria: 'Batería de alto rendimiento · Garantía de fábrica incluida',
}

function getBeneficio(sku, descripcion) {
  if (BENEFICIOS_SKU[String(sku || '')]) return BENEFICIOS_SKU[String(sku)]
  const d = (descripcion || '').toLowerCase()
  if (/aceite|lubric|5w|10w|15w|20w|80w|75w|grasa|gear oil/.test(d)) return BENEFICIOS_CAT.lubricante
  if (/shampoo|cera|polish|silicone|desengras|brillo|lava auto|limpia|quitamanchas|ambientador|abrillantador/.test(d)) return BENEFICIOS_CAT.quimico
  if (/refrigerante|coolant|antifreeze/.test(d)) return BENEFICIOS_CAT.refrigerante
  if (/freno|brake|dof/.test(d)) return BENEFICIOS_CAT.frenos
  if (/neumatico|neumático|llanta|tire|tyre/.test(d)) return BENEFICIOS_CAT.neumatico
  if (/bateria|batería|battery|amperio/.test(d)) return BENEFICIOS_CAT.bateria
  return 'Producto distribuido directamente por RMG Parts'
}

function imprimirCotizacion(c) {
  const fmt = (n) => Math.round(n || 0).toLocaleString('es-CL')
  const hoy = new Date()
  const fechaEmision = hoy.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const validezDias = c.validez_dias || 15
  const fechaValidez = new Date(hoy.getTime() + validezDias * 86400000)
    .toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const plazo = c.plazo_entrega || '24-48 hrs · Santiago RM'
  const textoArg = detectarCategoria(c.items)
  const tieneDescuento = (c.items || []).some(i => (i.descuento_pct || 0) > 0)
  const descuentoTotal = (c.items || []).reduce((s, i) => {
    const bruto = Math.round(i.cantidad * i.precio_unitario)
    return s + (bruto - (i.subtotal || bruto))
  }, 0)
  const esCreditoCheque = (c.condicion_pago || '').toLowerCase().includes('crédito') || (c.condicion_pago || '').toLowerCase().includes('credito')

  const win = window.open('', '_blank', 'width=850,height=700')
  win.document.write(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<title>Cotización ${c.numero}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a2035; background: #fff; font-size: 12px; line-height: 1.4; }
  .page { max-width: 800px; margin: 0 auto; padding: 22px 28px 18px; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; }
  .logo-img { height: 48px; object-fit: contain; display: block; }
  .header-info { text-align: right; font-size: 11px; color: #4a5568; line-height: 1.6; }
  .header-info a { color: #0071BD; text-decoration: none; }
  .divider { height: 3px; background: linear-gradient(90deg, #0071BD 0%, #29AAE1 60%, #a0d8f1 100%); border-radius: 2px; margin-bottom: 12px; }

  /* Bloques */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
  .info-box { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 12px; }
  .info-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #718096; margin-bottom: 5px; }
  .info-row { display: flex; justify-content: space-between; font-size: 11px; padding: 1.5px 0; }
  .info-row .key { color: #718096; }
  .info-row .val { font-weight: 600; color: #1a2035; text-align: right; }
  .cot-num { font-size: 15px; font-weight: 900; color: #0071BD; margin-bottom: 4px; }
  .cliente-name { font-size: 13px; font-weight: 800; color: #1a2035; margin-bottom: 5px; }

  /* Argumentación */
  .arg-box { background: #ebf5fb; border-left: 3px solid #29AAE1; border-radius: 0 6px 6px 0; padding: 7px 12px; margin-bottom: 10px; font-size: 10.5px; color: #1a2035; line-height: 1.5; }
  .arg-box strong { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #0071BD; margin-bottom: 2px; }

  /* Tabla productos */
  .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #718096; margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  thead tr { background: #0071BD; color: #fff; }
  thead th { padding: 6px 8px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; text-align: left; }
  thead th.r { text-align: right; }
  tbody tr:nth-child(even) { background: #f7fafc; }
  tbody tr:nth-child(odd)  { background: #fff; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; vertical-align: middle; }
  td.cod  { font-family: 'Courier New', monospace; font-size: 10px; color: #718096; white-space: nowrap; }
  td.desc { font-weight: 600; color: #1a2035; }
  td.desc .desc-name { display: block; }
  td.desc .beneficio { display: block; font-size: 7.5px; color: #718096; font-style: italic; margin-top: 1px; font-weight: 400; line-height: 1.3; }
  td.r    { text-align: right; white-space: nowrap; }

  /* Totales */
  .totales-wrap { display: flex; justify-content: flex-end; margin-bottom: 10px; }
  .totales-box  { width: 280px; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
  .tot-row { display: flex; justify-content: space-between; padding: 5px 12px; font-size: 11px; border-bottom: 1px solid #e2e8f0; }
  .tot-row .tl { color: #718096; }
  .tot-row .tr { font-weight: 600; }
  .tot-row.desc .tr { color: #e53e3e; }
  .tot-divider { height: 1px; background: #e2e8f0; }
  .tot-neto { display: flex; justify-content: space-between; padding: 5px 12px; font-size: 11px; border-bottom: 1px solid #e2e8f0; }
  .tot-neto .tl { color: #718096; }
  .tot-neto .tr { font-weight: 700; color: #1a2035; }
  .tot-iva  { display: flex; justify-content: space-between; padding: 5px 12px; font-size: 11px; border-bottom: 2px solid #0071BD; }
  .tot-iva .tl  { color: #718096; }
  .tot-total { display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; background: #0071BD; }
  .tot-total .tl { font-size: 12px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
  .tot-total .tr { font-size: 17px; font-weight: 900; color: #fff; }

  /* Condiciones */
  .cond-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .cond-box  { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 12px; }
  .cond-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #0071BD; margin-bottom: 6px; }
  .cond-item { font-size: 10.5px; color: #2d3748; padding: 1.5px 0; display: flex; align-items: flex-start; gap: 5px; }
  .cond-item::before { content: "✓"; color: #29AAE1; font-weight: 700; flex-shrink: 0; }
  .bank-item { font-size: 10.5px; color: #2d3748; padding: 1.5px 0; }
  .bank-label { font-size: 9px; color: #718096; margin-top: 6px; margin-bottom: 2px; }

  /* Footer */
  .footer-div { height: 2px; background: linear-gradient(90deg, #0071BD, #29AAE1); border-radius: 2px; margin-bottom: 7px; }
  .footer { display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #718096; }
  .footer .left { font-style: italic; }
  .footer .right { text-align: right; }

  @media print {
    @page { margin: 8mm 10mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10.5px; }
    .page { padding: 0; max-width: 100%; }
    .two-col { gap: 8px; margin-bottom: 7px; }
    .info-box { padding: 7px 10px; }
    .arg-box { padding: 5px 10px; margin-bottom: 7px; font-size: 9.5px; }
    .section-title { margin-bottom: 3px; }
    table { margin-bottom: 7px; }
    thead th { padding: 5px 7px; font-size: 8.5px; }
    tbody td { padding: 3.5px 7px; font-size: 10px; }
    .totales-wrap { margin-bottom: 7px; }
    .cond-grid { gap: 7px; margin-bottom: 7px; }
    .cond-box { padding: 7px 10px; }
    .cond-item { font-size: 9.5px; }
    .bank-item { font-size: 9.5px; }
    .footer-div { margin-bottom: 5px; }
  }
</style>
</head><body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <img src="data:image/jpeg;base64,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" class="logo-img" alt="RMG Parts" />
    <div class="header-info">
      <div><a href="mailto:ventas@rmgautoparts.cl">ventas@rmgautoparts.cl</a></div>
      <div>+56 9 7448 8647</div>
      <div>Santiago, Región Metropolitana</div>
    </div>
  </div>
  <div class="divider"></div>

  <!-- BLOQUE CLIENTE / COTIZACIÓN -->
  <div class="two-col">
    <div class="info-box">
      <div class="info-label">Datos de la cotización</div>
      <div class="cot-num">${c.numero}</div>
      <div class="info-row"><span class="key">Fecha de emisión</span><span class="val">${fechaEmision}</span></div>
      <div class="info-row"><span class="key">Válida hasta</span><span class="val">${fechaValidez}</span></div>
      <div class="info-row"><span class="key">Tiempo de entrega</span><span class="val">${plazo}</span></div>
    </div>
    <div class="info-box">
      <div class="info-label">Cliente</div>
      <div class="cliente-name">${c.cliente || '—'}</div>
      ${c.cliente_rut ? `<div class="info-row"><span class="key">RUT</span><span class="val">${c.cliente_rut}</span></div>` : ''}
      ${c.cliente_email ? `<div class="info-row"><span class="key">Email</span><span class="val">${c.cliente_email}</span></div>` : ''}
      ${c.cliente_telefono ? `<div class="info-row"><span class="key">Teléfono</span><span class="val">${c.cliente_telefono}</span></div>` : ''}
      ${c.cliente_direccion ? `<div class="info-row"><span class="key">Dirección</span><span class="val" style="font-size:9.5px">${c.cliente_direccion}</span></div>` : ''}
      <div class="info-row"><span class="key">Condición de pago</span><span class="val">${c.condicion_pago || 'Contado'}</span></div>
    </div>
  </div>

  <!-- ARGUMENTACIÓN COMERCIAL -->
  <div class="arg-box">
    <strong>Por qué elegir RMG Parts</strong>
    ${textoArg}
  </div>

  <!-- TABLA PRODUCTOS -->
  <div class="section-title">Detalle de productos</div>
  <table>
    <thead>
      <tr>
        <th style="width:26px">N°</th>
        <th style="width:88px">Código</th>
        <th>Descripción</th>
        <th class="r" style="width:46px">Cant.</th>
        <th class="r" style="width:108px">P. Neto Unit.</th>
        <th class="r" style="width:108px">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${(c.items || []).map((i, idx) => `
      <tr>
        <td style="color:#718096;font-size:10px;vertical-align:top;padding-top:5px">${idx + 1}</td>
        <td class="cod" style="vertical-align:top;padding-top:5px">${i.codigo || '—'}</td>
        <td class="desc">
          <span class="desc-name">${i.descripcion || '—'}</span>
          <span class="beneficio">${getBeneficio(i.codigo, i.descripcion)}</span>
        </td>
        <td class="r" style="vertical-align:top;padding-top:5px">${i.cantidad}</td>
        <td class="r" style="vertical-align:top;padding-top:5px">$${fmt(i.precio_unitario)}</td>
        <td class="r" style="font-weight:700;vertical-align:top;padding-top:5px">$${fmt(i.subtotal)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- TOTALES -->
  <div class="totales-wrap">
    <div class="totales-box">
      ${tieneDescuento ? `<div class="tot-row desc"><span class="tl">Descuento aplicado</span><span class="tr">-$${fmt(descuentoTotal)}</span></div>` : ''}
      <div class="tot-neto">
        <span class="tl">Neto</span>
        <span class="tr">$${fmt(c.neto)}</span>
      </div>
      <div class="tot-iva">
        <span style="color:#718096">IVA (19%)</span>
        <span>$${fmt(c.iva)}</span>
      </div>
      <div class="tot-total">
        <span class="tl">TOTAL</span>
        <span class="tr">$${fmt(c.total)}</span>
      </div>
    </div>
  </div>

  <!-- CONDICIONES COMERCIALES -->
  <div class="cond-grid">
    <div class="cond-box">
      <div class="cond-title">Condiciones comerciales</div>
      <div class="cond-item">Precios netos sin IVA · IVA 19% incluido en total</div>
      <div class="cond-item">Válida ${validezDias} días · Sujeto a stock disponible</div>
      <div class="cond-item">Despacho ${plazo}</div>
    </div>
    <div class="cond-box">
      <div class="cond-title">Forma de pago</div>
      ${esCreditoCheque
        ? `<div class="cond-item">${c.condicion_pago} fecha factura</div>`
        : `<div class="cond-item">Contado: transferencia bancaria o efectivo</div>`
      }
      <div style="margin-top:10px">
        <div class="bank-label">Datos para transferencia</div>
        <div class="bank-item"><strong>Banco de Chile</strong></div>
        <div class="bank-item">Cta. Cte. N° 1781310106</div>
        <div class="bank-item">RUT: 76.XXX.XXX-X · RMG Parts SpA</div>
        <div class="bank-item" style="color:#718096;font-size:10.5px">Enviar comprobante a ventas@rmgautoparts.cl</div>
      </div>
    </div>
  </div>

  ${c.notas ? `<div class="arg-box" style="background:#fffbeb;border-left-color:#f6ad55;margin-bottom:18px"><strong style="color:#b7791f">Notas</strong>${c.notas}</div>` : ''}

  <!-- FOOTER -->
  <div class="footer-div"></div>
  <div class="footer">
    <div class="left">RMG Parts · Distribución mayorista B2B · Santiago RM</div>
    <div class="right">Este documento es una cotización formal y no constituye factura</div>
  </div>

</div>
</body></html>`)
  win.document.close()
  win.addEventListener('load', () => setTimeout(() => win.print(), 300))
  if (win.document.readyState === 'complete') setTimeout(() => win.print(), 300)
}

function waLink(c) {
  const msg = encodeURIComponent(
    `Hola! Adjunto cotización *${c.numero}* de RMG Parts.\n` +
    `Cliente: ${c.cliente || '—'}\n` +
    `Total: $${c.total?.toLocaleString('es-CL')} IVA incluido\n` +
    `Condición: ${c.condicion_pago || 'Contado'}\n\n` +
    `Para más información contactar a ventas@rmgautoparts.cl`
  )
  return `https://wa.me/?text=${msg}`
}

export default function CotizacionesPage() {
  const [estadoFiltro, setFiltro] = useState('')
  const [editando, setEditando] = useState(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones', estadoFiltro],
    queryFn: () => api.get('/cotizaciones', { params: { estado: estadoFiltro || undefined } }).then(r => r.data),
  })

  const aprobarMut = useMutation({
    mutationFn: (id) => api.post(`/cotizaciones/${id}/aprobar`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones'] }); toast.success('Cotización aprobada') },
    onError: () => toast.error('Error al aprobar'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/cotizaciones/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      toast.success('Cotización actualizada')
      setEditando(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar cotización'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/cotizaciones/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      toast.success('Cotización eliminada')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar cotización'),
  })

  const total = cotizaciones.reduce((s, c) => s + c.total, 0)
  const aprobadas = cotizaciones.filter(c => c.estado === 'aprobada')
  const totalAprobado = aprobadas.reduce((s, c) => s + c.total, 0)

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Cotizaciones</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Gestión de propuestas comerciales B2B</p>
        </div>
        <button onClick={() => navigate('/cotizaciones/nueva')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva cotización
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Total cotizaciones</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{cotizaciones.length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(total)} en pipeline</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Aprobadas</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-teal)' }}>{aprobadas.length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(totalAprobado)} confirmado</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Tasa de cierre</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-gold)' }}>
            {cotizaciones.length ? Math.round((aprobadas.length / cotizaciones.length) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Filtros estado */}
      <div className="flex gap-1 flex-wrap">
        {ESTADOS.map(e => (
          <button key={e.key} onClick={() => setFiltro(e.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={estadoFiltro === e.key
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
            }>
            {e.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              {['N° Cotización', 'Cliente', 'Estado', 'Neto', 'IVA', 'Total', 'Fecha', 'Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>
                    ))}
                  </tr>
                ))
              : cotizaciones.map((c, i) => {
                  const est = ESTADO_STYLES[c.estado] || ESTADO_STYLES.borrador
                  const EstIcon = est.icon
                  return (
                    <tr key={c.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => navigate(`/cotizaciones/${c.id}`)}>
                      <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{c.numero}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{c.cliente}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 w-fit text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: est.bg, color: est.color }}>
                          <EstIcon size={11} />
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 precio-clp text-sm" style={{ color: 'var(--rmg-off)' }}>{formatCLP(c.neto)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(c.iva)}</td>
                      <td className="px-4 py-3 font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>{formatCLP(c.total)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 items-center" onClick={e => e.stopPropagation()}>
                          <button className="btn-secondary text-xs px-2 py-1 flex items-center gap-1" onClick={async e => {
                            e.stopPropagation()
                            const full = await api.get(`/cotizaciones/${c.id}`).then(r => r.data)
                            imprimirCotizacion(full)
                          }}>
                            <Printer size={11}/> PDF
                          </button>
                          <a href={waLink(c)} target="_blank" rel="noreferrer"
                            className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 no-underline"
                            onClick={e => e.stopPropagation()}>
                            <MessageCircle size={11}/> WA
                          </a>
                          <button
                            onClick={e => { e.stopPropagation(); setEditando({ ...c }) }}
                            className="p-1.5 rounded hover:bg-white/5 transition-colors"
                            style={{ color: 'var(--rmg-muted)' }}
                            title="Editar cotización">
                            <Pencil size={13}/>
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); if (confirm('¿Eliminar cotización?')) eliminarMut.mutate(c.id) }}
                            className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                            style={{ color: 'var(--rmg-red)' }}
                            title="Eliminar cotización">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
        {!isLoading && cotizaciones.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <FileText size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin cotizaciones{estadoFiltro ? ` en estado ${estadoFiltro}` : ''}</p>
          </div>
        )}
      </div>

      {/* Modal: editar cotización */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Editar cotización</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{editando.numero} · {editando.cliente}</p>
              </div>
              <button onClick={() => setEditando(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              editarMut.mutate({ id: editando.id, data: {
                estado: editando.estado,
                condicion_pago: editando.condicion_pago,
                plazo_entrega: editando.plazo_entrega,
                notas: editando.notas,
              }})
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select className="rmg-input" value={editando.estado || 'borrador'} onChange={e => setEditando(p => ({ ...p, estado: e.target.value }))}>
                  {ESTADOS_COTIZACION.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Condición de pago</label>
                <input className="rmg-input" value={editando.condicion_pago || ''} onChange={e => setEditando(p => ({ ...p, condicion_pago: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Plazo de entrega</label>
                <input className="rmg-input" placeholder="4-24 horas RM" value={editando.plazo_entrega || ''} onChange={e => setEditando(p => ({ ...p, plazo_entrega: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
                <input className="rmg-input" value={editando.notas || ''} onChange={e => setEditando(p => ({ ...p, notas: e.target.value }))} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditando(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={editarMut.isPending} className="btn-primary disabled:opacity-50">
                  {editarMut.isPending ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
