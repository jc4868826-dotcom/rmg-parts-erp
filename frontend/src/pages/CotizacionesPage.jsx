import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, FileText, Send, Check, X, Clock, Printer, MessageCircle, Pencil, Trash2, ShoppingCart } from 'lucide-react'
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
  .logo-img { height: 86px; object-fit: contain; display: block; }
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
    <img src="data:image/jpeg;base64,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H0vTtH06HTtKsoLO0hXbHDCgVV/Afzq3RRWRoFFFFABUN41ylrI1pDFNOB8iSSFFY+7AHH5GpqKaE9TD+1+K/wDoB6R/4NH/APjFH2vxX/0A9I/8Gj//ABityitPaR/lX4/5mXs5fzv8P8jD+1+K/wDoB6R/4NH/APjFH2vxX/0A9I/8Gj//ABityij2kf5V+P8AmHs5fzv8P8jD+1+K/wDoB6R/4NH/APjFT6fceIJLtEvtK06C3Od0kV+0jDjjCmJc8+9atFJ1ItfCvx/zGqck/if4f5BXjfxCttIuvjOU1nwtfeI4R4ejKW9rAJWjb7RJ85BZcDHGc17JVUadYjVW1UWsX25oBbmfb85jDFgmfTJJxW2FxHsJOXlbsZYvD/WIqPnfucD4Yu9Q8DfCrUdS1y3nhW3mnmsLGebzZYonf9xbs2TlskDqcZx2rm/hJqf9heL7fTLl9Vb/AISG28+7kvrOWFRqa5aQIZAAQyEjA/55j1r2LUtOsdSjijv7SK5SGZJ41kXIWRTlWx6g8ijUdNsdR+z/AG60iuPs063EHmLny5F+66+hGTz71usbBxmpx1ne9vw+567nO8FNSg4S0ha1/wAfvWmx4949i0J/i7qkuveFb/xDbw6HbyKlrB5phw8mWI3LjI7jPSum+Gmg2+ufCuys/EUEWo2FxK1zaQTzef5UBctCjOD8xVSB146dq7tNOsU1STVEtIheyxLC84X52RSSFJ9ASfzpNK02w0q0+yabaQ2lvvZxFEu1QzHLEDtkkmirjualGEbpq3XsunYKWA5a0qkrNO/Tu+vf5nnHwF8NaFbaNNrUGl28eoJf3tutwAd4jE7KF69AAB+Fc+unWfhfUxrniDRNM8R20mrh49ftNQJu0d5sIGjJ52khdqNjA6da9o0vTrHS7Y22n2sVtC0jSlI1wCzHcx+pJJrIg8EeEINZGsQ+G9Ljvw/mCZbZQQ/94dg3v1rRZgnVnObdpff6XurfivJmcsuapU4QSvH7vW1nf8H5o6Gsq/uPEEd26WOladPbjG2SW/aNjxzlRE2OfetWivMjJJ6q56kouS0djD+1+K/+gHpH/g0f/wCMUfa/Ff8A0A9I/wDBo/8A8Yrcoq/aR/lX4/5mfs5fzv8AD/Iw/tfiv/oB6R/4NH/+MUfa/Ff/AEA9I/8ABo//AMYrcoo9pH+Vfj/mHs5fzv8AD/Iw/tfiv/oB6R/4NH/+MVr2bXL2sbXcMUM5HzpHIXVT7MQM/kKloqZST2SX3/5lxg47yb+7/IKKKKgsKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/Z" class="logo-img" alt="RMG Parts" />
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

  const convertirVentaMut = useMutation({
    mutationFn: (id) => api.post(`/ventas/desde-cotizacion/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      toast.success('Venta generada desde la cotización')
      navigate('/ventas')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al generar la venta'),
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
                          {c.estado !== 'rechazada' && (
                            <button
                              disabled={convertirVentaMut.isPending}
                              onClick={e => { e.stopPropagation(); convertirVentaMut.mutate(c.id) }}
                              className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-semibold disabled:opacity-50"
                              style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}
                              title="Convertir a venta">
                              <ShoppingCart size={11}/> Venta
                            </button>
                          )}
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
