/**
 * /api/prospeccion-auto — Prospección automática (correo + WhatsApp).
 * Públicos (sin JWT): o/:token.png (apertura), c/:token (click), baja/:token.
 * Servidor a servidor (header x-prospeccion-key = PROSPECCION_CRON_KEY): tick, evento.
 * Panel: autenticado; configuración y ejecución manual solo gerente/administrador.
 */
const router = require('express').Router()
const s = require('../services/prospeccionAuto')
const { authenticate, requireRole } = require('../middleware/auth')

const gestion = [authenticate, requireRole(['gerente', 'administrador'])]
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

function claveServidor(req, res, next) {
  const k = process.env.PROSPECCION_CRON_KEY
  if (!k || req.headers['x-prospeccion-key'] !== k) return res.status(401).json({ error: 'clave inválida' })
  next()
}
const manejar = (fn) => async (req, res) => {
  try { res.json(await fn(req)) } catch (e) { res.status(400).json({ error: e.message }) }
}

// ── Públicos ────────────────────────────────────────────────────────────────
router.get('/o/:token.png', (req, res) => {
  try { s.registrarApertura(req.params.token) } catch (_) {}
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Cross-Origin-Resource-Policy': 'cross-origin' }).end(PIXEL)
})
router.get('/c/:token', (req, res) => {
  let destino = null
  try { destino = s.registrarClick(req.params.token, req.query.u) } catch (_) {}
  res.redirect(302, destino || 'https://rmg-parts-frontend.onrender.com')
})
router.get('/baja/:token', (req, res) => {
  let ok = false
  try { ok = s.darDeBaja(req.params.token) } catch (_) {}
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>RMG Parts</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;color:#1a2233;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="background:#fff;padding:32px 28px;border-radius:10px;max-width:420px;text-align:center">
<h2 style="margin:0 0 10px">${ok ? 'Listo' : 'Enlace no válido'}</h2>
<p style="margin:0;line-height:1.5">${ok ? 'No le volveremos a escribir. Gracias por avisarnos.' : 'Este enlace ya no es válido. Si quiere dejar de recibir correos, responda el último correo con la palabra BAJA.'}</p>
<p style="margin:18px 0 0;color:#5c6577;font-size:13px">RMG Parts</p></div></body></html>`)
})

// ── Servidor a servidor ─────────────────────────────────────────────────────
router.post('/tick', claveServidor, manejar(() => s.tick()))
router.post('/evento', claveServidor, manejar((req) => s.registrarRespuesta(req.body || {})))

// ── Panel ───────────────────────────────────────────────────────────────────
router.get('/stats', authenticate, manejar(() => s.stats()))
router.get('/para-llamar', authenticate, manejar(() => s.paraLlamar()))
router.get('/en-secuencia', authenticate, manejar(() => s.enSecuencia()))
router.put('/prospecto/:id/estado', authenticate, manejar((req) => s.cambiarComEstado(req.params.id, req.body || {}, req.user)))

router.get('/config', ...gestion, manejar(() => s.getConfig()))
router.put('/config', ...gestion, manejar((req) => s.setConfig(req.body || {})))
router.get('/preview', ...gestion, manejar(() => {
  const c = s.getConfig()
  const r = s.seleccionarLote(c.lote_diario || 20, c.tema_activo)
  return {
    ...r,
    lote: r.lote.map(p => ({
      id: p.id, empresa: p.empresa, nombre_contacto: p.nombre_contacto, email: p.email, rubro: p.rubro || p.rubro_especialidad,
      prioridad: p.prioridad, comuna: p.comuna, celular: s.normalizarCelular(p.celular, p.telefono_contacto, p.telefono_empresa),
      reintento: p.seq_estado === 'dormido',
    })),
  }
}))
router.get('/preview-correo', ...gestion, (req, res) => {
  try {
    const c = s.getConfig()
    const temas = require('../services/prospeccionTemas')
    const p = s.seleccionarLote(1, c.tema_activo).lote[0] || { empresa: 'EMPRESA DE PRUEBA SPA', nombre_contacto: 'Juan Prueba', rubro: 'PLASTICOS' }
    const { asunto, html } = s.armarCorreo(p, temas[c.tema_activo], c, 'prueba')
    res.json({ asunto, html, empresa: p.empresa })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
router.post('/enviar-prueba', ...gestion, manejar(() => s.enviarPrueba()))
router.post('/ejecutar/:paso', ...gestion, (req, res) => {
  const paso = req.params.paso
  if (!['correo', 'wsp1', 'wsp2', 'dormido'].includes(paso)) return res.status(400).json({ error: 'paso inválido' })
  // El correo tarda varios minutos (pausa entre envíos): se responde de inmediato y sigue en segundo plano.
  if (paso === 'correo') {
    s.ejecutarPaso('correo').then(r => console.log('[PROSP-AUTO] correo manual:', JSON.stringify(r)))
      .catch(e => console.error('[PROSP-AUTO] correo manual:', e.message))
    return res.json({ ok: true, en_segundo_plano: true })
  }
  s.ejecutarPaso(paso).then(r => res.json(r)).catch(e => res.status(400).json({ error: e.message }))
})

module.exports = router
