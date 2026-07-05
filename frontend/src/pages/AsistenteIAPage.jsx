import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Bot, Loader2, RotateCcw } from 'lucide-react'

const ASISTENTE_URL = (import.meta.env.VITE_ASISTENTE_URL || 'http://localhost:5000').replace(/\/$/, '')

const MD_COMPONENTS = {
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '10px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ border: '1px solid rgba(56,182,255,0.2)', padding: '6px 10px', textAlign: 'left', background: 'rgba(56,182,255,0.1)', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: '1px solid rgba(56,182,255,0.1)', padding: '6px 10px', color: 'rgba(255,255,255,0.85)', verticalAlign: 'top' }}>
      {children}
    </td>
  ),
  h3: ({ children }) => (
    <h3 style={{ color: '#a78bfa', fontWeight: 600, margin: '16px 0 6px', fontSize: '14px' }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, margin: '10px 0 4px', fontSize: '13px' }}>{children}</h4>
  ),
  strong: ({ children }) => (
    <strong style={{ color: '#fff', fontWeight: 700 }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: 'rgba(255,255,255,0.7)' }}>{children}</em>
  ),
  code: ({ children }) => (
    <code style={{ background: 'rgba(56,182,255,0.12)', padding: '1px 5px', borderRadius: '3px', fontSize: '11px', color: '#38b6ff', fontFamily: 'monospace' }}>
      {children}
    </code>
  ),
  p: ({ children }) => (
    <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '8px', lineHeight: '1.65', fontSize: '13px' }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul style={{ paddingLeft: '18px', marginBottom: '8px' }}>{children}</ul>
  ),
  li: ({ children }) => (
    <li style={{ color: 'rgba(255,255,255,0.75)', marginBottom: '4px', fontSize: '13px' }}>{children}</li>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid rgba(56,182,255,0.15)', margin: '12px 0' }} />
  ),
}

export default function AsistenteIAPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef(null)

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
        role:    'assistant',
        content: data.respuesta || `Error: ${data.error || 'respuesta inesperada'}`,
      }])
    } catch {
      setMessages([...next, { role: 'assistant', content: '⚠️ Sin conexión con el Asistente IA. Verifica que el servicio esté activo.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--rmg-bg, #050f1c)' }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(56,182,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(167,139,250,0.15)', flexShrink: 0 }}>
          <Bot size={20} style={{ color: '#a78bfa' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Zara — Asistente Comercial B2B</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Radiografía de clientes · Portafolio 360° RMG Parts · SKUs reales del ERP</div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            title="Nueva conversación"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
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
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, lineHeight: 1.6 }}>
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
                : <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{msg.content}</ReactMarkdown>
              }
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.18)', display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
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
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,182,255,0.2)',
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
              color: input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.3)',
              border: 'none', transition: 'background 0.15s',
              flexShrink: 0,
            }}
          >
            <Send size={15} />
          </button>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 6 }}>
          Enter para enviar · Shift+Enter para nueva línea
        </div>
      </div>
    </div>
  )
}
