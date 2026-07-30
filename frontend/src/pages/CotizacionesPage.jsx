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
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a2035; background: #fff; font-size: 13px; line-height: 1.5; }
  .page { max-width: 800px; margin: 0 auto; padding: 36px 40px 32px; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; }
  .logo-block { display: flex; flex-direction: column; gap: 2px; }
  .logo-name { font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #0071BD; }
  .logo-tag  { font-size: 10px; font-weight: 600; color: #29AAE1; text-transform: uppercase; letter-spacing: 2px; }
  .header-info { text-align: right; font-size: 12px; color: #4a5568; line-height: 1.7; }
  .header-info a { color: #0071BD; text-decoration: none; }
  .divider { height: 3px; background: linear-gradient(90deg, #0071BD 0%, #29AAE1 60%, #a0d8f1 100%); border-radius: 2px; margin-bottom: 22px; }

  /* Bloques */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 18px; }
  .info-box { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
  .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #718096; margin-bottom: 8px; }
  .info-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .info-row .key { color: #718096; }
  .info-row .val { font-weight: 600; color: #1a2035; text-align: right; }
  .cot-num { font-size: 18px; font-weight: 900; color: #0071BD; margin-bottom: 6px; }

  /* Argumentación */
  .arg-box { background: #ebf5fb; border-left: 4px solid #29AAE1; border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 18px; font-size: 12px; color: #1a2035; line-height: 1.6; }
  .arg-box strong { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #0071BD; margin-bottom: 4px; }

  /* Tabla productos */
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #718096; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #0071BD; color: #fff; }
  thead th { padding: 9px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; text-align: left; }
  thead th.r { text-align: right; }
  tbody tr:nth-child(even) { background: #f7fafc; }
  tbody tr:nth-child(odd)  { background: #fff; }
  tbody td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; vertical-align: middle; }
  td.cod  { font-family: 'Courier New', monospace; font-size: 11px; color: #718096; white-space: nowrap; }
  td.desc { font-weight: 600; color: #1a2035; }
  td.r    { text-align: right; }
  td.disc { text-align: center; color: #e53e3e; font-size: 11px; }

  /* Totales */
  .totales-wrap { display: flex; justify-content: flex-end; margin-bottom: 22px; }
  .totales-box  { width: 300px; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .tot-row { display: flex; justify-content: space-between; padding: 7px 14px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
  .tot-row .tl { color: #718096; }
  .tot-row .tr { font-weight: 600; }
  .tot-row.desc .tr { color: #e53e3e; }
  .tot-divider { height: 2px; background: #e2e8f0; }
  .tot-neto { display: flex; justify-content: space-between; padding: 7px 14px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
  .tot-neto .tl { color: #718096; }
  .tot-neto .tr { font-weight: 700; color: #1a2035; }
  .tot-iva  { display: flex; justify-content: space-between; padding: 7px 14px; font-size: 12px; border-bottom: 2px solid #0071BD; }
  .tot-iva .tl  { color: #718096; }
  .tot-total { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: #0071BD; }
  .tot-total .tl { font-size: 13px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
  .tot-total .tr { font-size: 20px; font-weight: 900; color: #fff; }

  /* Condiciones */
  .cond-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
  .cond-box  { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
  .cond-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #0071BD; margin-bottom: 10px; }
  .cond-item { font-size: 11.5px; color: #2d3748; padding: 2.5px 0; display: flex; align-items: flex-start; gap: 6px; }
  .cond-item::before { content: "✓"; color: #29AAE1; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
  .bank-item { font-size: 11.5px; color: #2d3748; padding: 2.5px 0; }
  .bank-label { font-size: 10px; color: #718096; }

  /* Footer */
  .footer-div { height: 2px; background: linear-gradient(90deg, #0071BD, #29AAE1); border-radius: 2px; margin-bottom: 12px; }
  .footer { display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #718096; }
  .footer .left { font-style: italic; }
  .footer .right { text-align: right; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 20px 24px; }
  }
</style>
</head><body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="logo-block">
      <div class="logo-name">RMG Auto Parts</div>
      <div class="logo-tag">Distribución Mayorista B2B</div>
    </div>
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
      <div style="font-size:15px;font-weight:800;color:#1a2035;margin-bottom:8px">${c.cliente || '—'}</div>
      ${c.cliente_rut ? `<div class="info-row"><span class="key">RUT</span><span class="val">${c.cliente_rut}</span></div>` : ''}
      <div class="info-row"><span class="key">Condición de pago</span><span class="val">${c.condicion_pago || 'Contado'}</span></div>
    </div>
  </div>

  <!-- ARGUMENTACIÓN COMERCIAL -->
  <div class="arg-box">
    <strong>Por qué elegir RMG Auto Parts</strong>
    ${textoArg}
  </div>

  <!-- TABLA PRODUCTOS -->
  <div class="section-title">Detalle de productos</div>
  <table>
    <thead>
      <tr>
        <th style="width:28px">N°</th>
        <th style="width:90px">Código</th>
        <th>Descripción</th>
        <th class="r" style="width:50px">Cant.</th>
        <th class="r" style="width:100px">P. Neto Unit.</th>
        <th class="r" style="width:50px">Desc %</th>
        <th class="r" style="width:105px">Subtotal Neto</th>
      </tr>
    </thead>
    <tbody>
      ${(c.items || []).map((i, idx) => `
      <tr>
        <td style="color:#718096;font-size:11px">${idx + 1}</td>
        <td class="cod">${i.codigo || '—'}</td>
        <td class="desc">${i.descripcion || '—'}</td>
        <td class="r">${i.cantidad}</td>
        <td class="r">$${fmt(i.precio_unitario)}</td>
        <td class="disc">${(i.descuento_pct || 0) > 0 ? (i.descuento_pct) + '%' : '—'}</td>
        <td class="r" style="font-weight:700">$${fmt(i.subtotal)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- TOTALES -->
  <div class="totales-wrap">
    <div class="totales-box">
      <div class="tot-row">
        <span class="tl">Subtotal Neto</span>
        <span class="tr">$${fmt(c.neto)}</span>
      </div>
      ${tieneDescuento ? `<div class="tot-row desc"><span class="tl">Descuento</span><span class="tr">-$${fmt(descuentoTotal)}</span></div>` : ''}
      <div class="tot-divider"></div>
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
      <div class="cond-item">Precios en pesos chilenos, netos sin IVA</div>
      <div class="cond-item">IVA 19% incluido en el total</div>
      <div class="cond-item">Cotización válida por ${validezDias} días desde emisión</div>
      <div class="cond-item">Sujeto a disponibilidad de stock</div>
      <div class="cond-item">Despacho: ${plazo}</div>
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
        <div class="bank-item">RUT: 76.XXX.XXX-X · RMG Auto Parts SpA</div>
        <div class="bank-item" style="color:#718096;font-size:10.5px">Enviar comprobante a ventas@rmgautoparts.cl</div>
      </div>
    </div>
  </div>

  ${c.notas ? `<div class="arg-box" style="background:#fffbeb;border-left-color:#f6ad55;margin-bottom:18px"><strong style="color:#b7791f">Notas</strong>${c.notas}</div>` : ''}

  <!-- FOOTER -->
  <div class="footer-div"></div>
  <div class="footer">
    <div class="left">RMG Auto Parts · Distribución mayorista B2B · Santiago RM</div>
    <div class="right">Este documento es una cotización formal y no constituye factura</div>
  </div>

</div>
</body></html>`)
  win.document.close()
  win.print()
}

function waLink(c) {
  const msg = encodeURIComponent(
    `Hola! Adjunto cotización *${c.numero}* de RMG Auto Parts.\n` +
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
