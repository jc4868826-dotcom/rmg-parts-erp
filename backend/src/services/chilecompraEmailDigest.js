/**
 * RMG Parts — Digest diario por correo de oportunidades ChileCompra
 * Mismo patrón de nodemailer/SMTP ya usado en ocController.enviarEmailOC.
 */
const nodemailer = require('nodemailer')

const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function filaHtml(op) {
  return `<tr>
    <td>${op.nombre || '(sin nombre)'}</td>
    <td>${op.organismo_nombre || '—'}</td>
    <td>${op.region || '—'}</td>
    <td>${fmt(op.presupuesto_estimado)}</td>
    <td>${op.fecha_cierre || '—'}</td>
    <td style="text-align:center">${op.score_total ?? '—'}</td>
  </tr>`
}

async function enviarDigestDiario({ nuevas, destinatarios }) {
  if (!destinatarios?.length) {
    console.warn('⚠️ chilecompraEmailDigest: sin destinatarios configurados (CHILECOMPRA_ALERT_EMAILS) — no se envía correo')
    return { enviado: false, motivo: 'sin_destinatarios' }
  }
  if (!nuevas?.length) {
    console.log('ℹ️ chilecompraEmailDigest: sin oportunidades nuevas hoy, no se envía correo')
    return { enviado: false, motivo: 'sin_novedades' }
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  const filas = nuevas.map(filaHtml).join('')
  const portalUrl = process.env.APP_URL || 'http://localhost:5173'

  await transporter.sendMail({
    from:    `"RMG Auto Parts" <${process.env.SMTP_USER || 'no-reply@rmgautoparts.cl'}>`,
    to:      destinatarios.join(', '),
    subject: `ChileCompra — ${nuevas.length} oportunidad${nuevas.length === 1 ? '' : 'es'} nueva${nuevas.length === 1 ? '' : 's'} hoy`,
    html: `<div style="font-family:Arial,sans-serif;max-width:800px">
      <h2>Oportunidades ChileCompra detectadas hoy</h2>
      <p>Revisión automática de las 9:00 — quedaron en estado <strong>"detectada"</strong>, sin leer anexos todavía. Entra al módulo ChileCompra del ERP para seleccionar cuáles pasar a "Analizando".</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
        <thead style="background:#1a1a2e;color:#fff">
          <tr><th>Nombre</th><th>Organismo</th><th>Región</th><th>Presupuesto ref.</th><th>Cierre</th><th>Score</th></tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="margin-top:16px"><a href="${portalUrl}/chilecompra">Ver en el ERP →</a></p>
    </div>`,
  })

  return { enviado: true, cantidad: nuevas.length }
}

module.exports = { enviarDigestDiario }
