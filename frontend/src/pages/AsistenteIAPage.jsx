import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Bot, Loader2, RotateCcw, ShoppingCart, X, Trash2 } from 'lucide-react'
import api from '../utils/api'

const ASISTENTE_URL = (import.meta.env.VITE_ASISTENTE_URL || 'http://localhost:5000').replace(/\/$/, '')

const MD_COMPONENTS = {
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '10px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ border: '1px solid rgba(56,182,255,0.2)', padding: '6px 10px', textAlign: 'left', background: 'rgba(56,182,255,0.1)', color: 'rgba(15, 35, 60,0.75)', fontWeight: 600 }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: '1px solid rgba(56,182,255,0.1)', padding: '6px 10px', color: 'rgba(15, 35, 60,0.85)', verticalAlign: 'top' }}>
      {children}
    </td>
  ),
  h3: ({ children }) => (
    <h3 style={{ color: '#a78bfa', fontWeight: 600, margin: '16px 0 6px', fontSize: '14px' }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ color: 'rgba(15, 35, 60,0.8)', fontWeight: 600, margin: '10px 0 4px', fontSize: '13px' }}>{children}</h4>
  ),
  strong: ({ children }) => (
    <strong style={{ color: '#fff', fontWeight: 700 }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: 'rgba(15, 35, 60,0.7)' }}>{children}</em>
  ),
  code: ({ children }) => (
    <code style={{ background: 'rgba(56,182,255,0.12)', padding: '1px 5px', borderRadius: '3px', fontSize: '11px', color: '#38b6ff', fontFamily: 'monospace' }}>
      {children}
    </code>
  ),
  p: ({ children }) => (
    <p style={{ color: 'rgba(15, 35, 60,0.8)', marginBottom: '8px', lineHeight: '1.65', fontSize: '13px' }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul style={{ paddingLeft: '18px', marginBottom: '8px' }}>{children}</ul>
  ),
  li: ({ children }) => (
    <li style={{ color: 'rgba(15, 35, 60,0.75)', marginBottom: '4px', fontSize: '13px' }}>{children}</li>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid rgba(56,182,255,0.15)', margin: '12px 0' }} />
  ),
}

export default function AsistenteIAPage() {
  const [messages, setMessages]               = useState([])
  const [input, setInput]                     = useState('')
  const [loading, setLoading]                 = useState(false)
  const bottomRef                             = useRef(null)
  const navigate                              = useNavigate()

  // Cotización modal state
  const [cotizModal, setCotizModal]           = useState(null)   // null | { lineas: [...] }
  const [cotizClientes, setCotizClientes]     = useState([])
  const [clienteQuery, setClienteQuery]       = useState('')
  const [clienteSeleccionado, setClienteSel]  = useState(null)
  const [showClienteList, setShowClienteList] = useState(false)
  const [cotizLoading, setCotizLoading]       = useState(false)
  const [cotizError, setCotizError]           = useState(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res  = await fetch(`${ASISTENTE_URL}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mensajes: next }),
      })
      const data = await res.json()
      setMessages([...next, {
        role:      'assistant',
        content:   data.respuesta || `Error: ${data.error || 'respuesta inesperada'}`,
        productos: data.productos_recomendados || [],
      }])
    } catch {
      setMessages([...next, { role: 'assistant', content: '⚠️ Sin conexión con el Asistente IA. Verifica que el servicio esté activo.', productos: [] }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Cotización modal helpers ──────────────────────────────────────────────

  async function abrirCotizModal(productos) {
    setCotizModal({ lineas: productos.map(p => ({ ...p, cantidad: p.cantidad || 1 })) })
    setCotizClientes([])
    setClienteQuery('')
    setClienteSel(null)
    setShowClienteList(false)
    setCotizError(null)
    try {
      const res = await api.get('/clientes')
      setCotizClientes(res.data)
    } catch { /* silently fail — user can still create */ }
  }

  function actualizarCantidad(idx, val) {
    const lineas = [...cotizModal.lineas]
    lineas[idx] = { ...lineas[idx], cantidad: Math.max(1, parseInt(val) || 1) }
    setCotizModal({ ...cotizModal, lineas })
  }

  function quitarLinea(idx) {
    setCotizModal({ ...cotizModal, lineas: cotizModal.lineas.filter((_, i) => i !== idx) })
  }

  async function confirmarCotizacion() {
    if (!clienteSeleccionado) return setCotizError('Selecciona un cliente')
    if (!cotizModal?.lineas.length) return setCotizError('Agrega al menos un producto')
    setCotizLoading(true)
    setCotizError(null)
    try {
      const items = cotizModal.lineas.map(l => ({
        codigo:          l.codigo_sku,
        descripcion:     l.descripcion,
        cantidad:        l.cantidad,
        precio_unitario: l.precio_venta_neto,
        descuento_pct:   0,
        subtotal:        Math.round(l.cantidad * l.precio_venta_neto),
      }))
      const neto  = items.reduce((a, b) => a + b.subtotal, 0)
      const iva   = Math.round(neto * 0.19)
      const total = neto + iva
      const res = await api.post('/cotizaciones', {
        cliente_id:   clienteSeleccionado.id,
        cliente:      clienteSeleccionado.razon_social,
        estado:       'borrador',
        canal_origen: 'web',
        neto, iva, total, items,
      })
      navigate(`/cotizaciones/${res.data.id}`)
    } catch (e) {
      setCotizError(e.response?.data?.error || 'Error al crear la cotización')
      setCotizLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const clientesFiltrados = cotizClientes.filter(c =>
    c.razon_social.toLowerCase().includes(clienteQuery.toLowerCase())
  ).slice(0, 12)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--rmg-bg, #f3f5f8)' }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(56,182,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(167,139,250,0.15)', flexShrink: 0 }}>
          <Bot size={20} style={{ color: '#a78bfa' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Zara — Asistente Comercial B2B</div>
          <div style={{ color: 'rgba(15, 35, 60,0.4)', fontSize: 12 }}>Radiografía de clientes · Portafolio 360° RMG Parts · SKUs reales del ERP</div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            title="Nueva conversación"
            style={{ background: 'rgba(15, 35, 60,0.05)', border: '1px solid rgba(15, 35, 60,0.1)', borderRadius: 6, padding: '6px 8px', color: 'rgba(15, 35, 60,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            <RotateCcw size={13} /> Nueva
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, textAlign: 'center' }}>
            <Bot size={52} style={{ color: 'rgba(167,139,250,0.25)' }} />
            <div style={{ color: 'rgba(15, 35, 60,0.35)', fontSize: 14, lineHeight: 1.6 }}>
              Describe el perfil del cliente o la flota.<br />
              Zara arma el portafolio 360° con SKUs reales del ERP.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              {[
                'Taller que atiende camiones Volvo, 8 unidades',
                'Empresa constructora con 3 excavadoras CAT',
                'Flota de furgones escolares, 12 vehículos',
              ].map(ex => (
                <button key={ex} onClick={() => setInput(ex)}
                  style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, padding: '6px 12px', color: 'rgba(167,139,250,0.8)', fontSize: 12, cursor: 'pointer' }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: msg.role === 'user' ? '65%' : '90%',
              padding: '10px 14px',
              borderRadius: 12,
              ...(msg.role === 'user'
                ? { background: 'rgba(56,182,255,0.12)', border: '1px solid rgba(56,182,255,0.25)', color: '#fff', fontSize: 13, lineHeight: 1.5 }
                : { background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.18)' }
              ),
            }}>
              {msg.role === 'user'
                ? msg.content
                : (
                  <>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{msg.content}</ReactMarkdown>
                    {msg.productos?.length > 0 && (
                      <button
                        onClick={() => abrirCotizModal(msg.productos)}
                        style={{
                          marginTop: 12, display: 'flex', alignItems: 'center', gap: 7,
                          background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)',
                          borderRadius: 8, padding: '8px 16px', color: '#a78bfa', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        <ShoppingCart size={14} />
                        Crear Cotización con estos productos ({msg.productos.length})
                      </button>
                    )}
                  </>
                )
              }
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.18)', display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(15, 35, 60,0.45)', fontSize: 13 }}>
              <Loader2 size={14} className="animate-spin" /> Zara está analizando...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(56,182,255,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            placeholder="Ej: taller que atiende camiones Volvo, 8 unidades..."
            style={{
              flex: 1, borderRadius: 10, padding: '10px 14px', fontSize: 13,
              background: 'rgba(15, 35, 60,0.05)', border: '1px solid rgba(56,182,255,0.2)',
              color: '#fff', resize: 'none', outline: 'none', minHeight: 44, maxHeight: 120,
              fontFamily: 'inherit', lineHeight: 1.5,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{
              borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              background: input.trim() && !loading ? '#a78bfa' : 'rgba(167,139,250,0.15)',
              color: input.trim() && !loading ? '#fff' : 'rgba(15, 35, 60,0.3)',
              border: 'none', transition: 'background 0.15s',
              flexShrink: 0,
            }}
          >
            <Send size={15} />
          </button>
        </div>
        <div style={{ color: 'rgba(15, 35, 60,0.2)', fontSize: 11, marginTop: 6 }}>
          Enter para enviar · Shift+Enter para nueva línea
        </div>
      </div>

      {/* ── Modal Crear Cotización ── */}
      {cotizModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setCotizModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ background: '#ffffff', border: '1px solid rgba(15,35,60,0.12)', boxShadow: '0 24px 60px rgba(15,35,60,0.25)', borderRadius: 14, width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto', padding: 28 }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShoppingCart size={18} style={{ color: '#a78bfa' }} />
                <span style={{ color: 'var(--rmg-text)', fontSize: 16, fontWeight: 700 }}>Crear Cotización</span>
              </div>
              <button onClick={() => setCotizModal(null)} style={{ background: 'none', border: 'none', color: 'rgba(15, 35, 60,0.35)', cursor: 'pointer', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Cliente */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: 'rgba(15, 35, 60,0.55)', fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cliente</div>
              <div style={{ position: 'relative' }}>
                <input
                  value={clienteQuery}
                  onChange={e => { setClienteQuery(e.target.value); setClienteSel(null); setShowClienteList(true) }}
                  onFocus={() => setShowClienteList(true)}
                  onBlur={() => setTimeout(() => setShowClienteList(false), 150)}
                  placeholder="Buscar cliente por nombre..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', background: 'rgba(15, 35, 60,0.04)', border: '1px solid rgba(56,182,255,0.22)', borderRadius: 8, color: 'var(--rmg-text)', fontSize: 13, outline: 'none' }}
                />
                {showClienteList && clienteQuery.length > 0 && !clienteSeleccionado && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#ffffff', border: '1px solid rgba(15,35,60,0.12)', boxShadow: '0 8px 24px rgba(15,35,60,0.18)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
                    {clientesFiltrados.length === 0
                      ? <div style={{ padding: '9px 13px', color: 'rgba(15, 35, 60,0.3)', fontSize: 13 }}>Sin resultados</div>
                      : clientesFiltrados.map(c => (
                        <div
                          key={c.id}
                          onMouseDown={() => { setClienteSel(c); setClienteQuery(c.razon_social); setShowClienteList(false) }}
                          style={{ padding: '9px 13px', color: 'rgba(15, 35, 60,0.8)', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {c.razon_social}
                          {c.rut && <span style={{ color: 'rgba(15, 35, 60,0.3)', marginLeft: 8, fontSize: 11 }}>{c.rut}</span>}
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
              {clienteSeleccionado && (
                <div style={{ marginTop: 7, color: '#38b6ff', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  ✓ <strong>{clienteSeleccionado.razon_social}</strong>
                  {clienteSeleccionado.rut && <span style={{ color: 'rgba(15, 35, 60,0.35)' }}> · {clienteSeleccionado.rut}</span>}
                </div>
              )}
            </div>

            {/* Productos */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: 'rgba(15, 35, 60,0.55)', fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Productos ({cotizModal.lineas.length})
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(56,182,255,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(56,182,255,0.06)' }}>
                      {['Producto', 'SKU', 'Precio Unit.', 'Cantidad', 'Subtotal', ''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(15, 35, 60,0.45)', fontWeight: 600, borderBottom: '1px solid rgba(56,182,255,0.1)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cotizModal.lineas.map((l, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                        <td style={{ padding: '8px 12px', color: 'rgba(15, 35, 60,0.85)', maxWidth: 260 }}>{l.descripcion}</td>
                        <td style={{ padding: '8px 12px', color: 'rgba(15, 35, 60,0.4)', fontFamily: 'monospace', fontSize: 11 }}>{l.codigo_sku}</td>
                        <td style={{ padding: '8px 12px', color: '#38b6ff', whiteSpace: 'nowrap' }}>${Math.round(l.precio_venta_neto).toLocaleString('es-CL')}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <input
                            type="number" min={1} value={l.cantidad}
                            onChange={e => actualizarCantidad(idx, e.target.value)}
                            style={{ width: 60, padding: '4px 6px', background: 'rgba(15, 35, 60,0.05)', border: '1px solid rgba(56,182,255,0.2)', borderRadius: 5, color: '#fff', fontSize: 12, textAlign: 'center', outline: 'none' }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px', color: '#a78bfa', fontWeight: 600, whiteSpace: 'nowrap' }}>${Math.round(l.cantidad * l.precio_venta_neto).toLocaleString('es-CL')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <button onClick={() => quitarLinea(idx)} title="Quitar" style={{ background: 'none', border: 'none', color: 'rgba(15, 35, 60,0.2)', cursor: 'pointer', padding: 2, display: 'flex' }}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totales */}
            {(() => {
              const neto = cotizModal.lineas.reduce((a, l) => a + Math.round(l.cantidad * l.precio_venta_neto), 0)
              const iva  = Math.round(neto * 0.19)
              return (
                <div style={{ borderTop: '1px solid rgba(56,182,255,0.1)', paddingTop: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <div style={{ color: 'rgba(15, 35, 60,0.45)', fontSize: 13 }}>Neto: <span style={{ color: 'rgba(15, 35, 60,0.85)' }}>${neto.toLocaleString('es-CL')}</span></div>
                  <div style={{ color: 'rgba(15, 35, 60,0.45)', fontSize: 13 }}>IVA (19%): <span style={{ color: 'rgba(15, 35, 60,0.85)' }}>${iva.toLocaleString('es-CL')}</span></div>
                  <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Total: ${(neto + iva).toLocaleString('es-CL')}</div>
                </div>
              )
            })()}

            {/* Error */}
            {cotizError && (
              <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, color: '#f87171', fontSize: 12 }}>
                ⚠ {cotizError}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setCotizModal(null)}
                style={{ padding: '9px 18px', background: 'rgba(15, 35, 60,0.04)', border: '1px solid rgba(15, 35, 60,0.1)', borderRadius: 8, color: 'rgba(15, 35, 60,0.4)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCotizacion}
                disabled={cotizLoading || !clienteSeleccionado || !cotizModal.lineas.length}
                style={{
                  padding: '9px 20px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: clienteSeleccionado && !cotizLoading && cotizModal.lineas.length ? '#a78bfa' : 'rgba(167,139,250,0.2)',
                  color: clienteSeleccionado && !cotizLoading && cotizModal.lineas.length ? '#fff' : 'rgba(15, 35, 60,0.3)',
                  cursor: clienteSeleccionado && !cotizLoading && cotizModal.lineas.length ? 'pointer' : 'not-allowed',
                }}
              >
                {cotizLoading ? 'Creando...' : 'Crear Cotización'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
