import { useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'https://rmg-parts-erp.onrender.com'

const CHIPS = [
  { label: '🔧 Taller liviano',  q: 'Taller mecánico con autos a gasolina y camionetas' },
  { label: '🚛 Flota camiones',  q: 'Empresa de transporte con flota de camiones diésel' },
  { label: '⛏️ Minería',         q: 'Empresa minera con equipos pesados Caterpillar' },
  { label: '🏍️ Motos',           q: 'Taller de motocicletas 4T y 2T' },
  { label: '🌾 Agrícola',        q: 'Empresa agrícola con tractores y maquinaria hidráulica' },
  { label: '🏭 Industria',       q: 'Planta industrial con compresores y reductores' },
  { label: '✨ Car care',         q: 'Centro de lavado y detailing de vehículos' },
  { label: '🏗️ Construcción',    q: 'Empresa de construcción con excavadoras y grúas' },
  { label: '🏢 Montacargas',     q: 'Empresa con montacargas eléctricos y diésel en bodega' },
  { label: '🔼 Ascensores',      q: 'Empresa de mantenimiento de ascensores hidráulicos' },
  { label: '🐟 Pesquera',        q: 'Empresa pesquera con embarcaciones y motores fuera de borda' },
  { label: '🍞 Alimentos',       q: 'Industria alimentaria con reductores, cintas y compresores' },
]

const fmt = (v) => {
  const n = parseFloat(v)
  if (isNaN(n) || n <= 0) return null
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

const s = {
  wrap: { padding: '24px', maxWidth: '920px', fontFamily: 'inherit' },
  h1: { fontSize: '20px', fontWeight: '600', color: 'var(--rmg-text, #e2e8f0)', marginBottom: '4px' },
  sub: { fontSize: '13px', color: 'var(--rmg-muted, #94a3b8)', marginBottom: '20px' },
  row: { display: 'flex', gap: '8px', marginBottom: '12px' },
  input: {
    flex: 1, padding: '0 14px', height: '42px',
    border: '1px solid rgba(56,182,255,0.2)',
    borderRadius: '8px', fontSize: '14px', outline: 'none',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--rmg-text, #e2e8f0)',
  },
  btnPrimary: {
    background: '#0071BD', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '0 20px', height: '42px',
    fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  btnDisabled: {
    background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.5)', border: '1px solid rgba(56,182,255,0.1)',
    borderRadius: '8px', padding: '0 20px', height: '42px',
    fontSize: '14px', cursor: 'not-allowed', whiteSpace: 'nowrap', flexShrink: 0,
  },
  chipsWrap: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' },
  chip: {
    border: '1px solid rgba(56,182,255,0.2)', borderRadius: '16px',
    padding: '4px 12px', fontSize: '12px',
    color: 'var(--rmg-muted, #94a3b8)', cursor: 'pointer',
    background: 'rgba(255,255,255,0.04)',
  },
  loading: { textAlign: 'center', padding: '48px 20px', color: 'var(--rmg-muted, #94a3b8)', fontSize: '14px' },
  empty:   { textAlign: 'center', padding: '48px 20px', color: 'rgba(148,163,184,0.4)', fontSize: '14px' },
  errBox: {
    background: 'rgba(226,75,74,0.08)', borderLeft: '3px solid #e24b4a',
    borderRadius: '0 8px 8px 0', padding: '12px 16px',
    fontSize: '13px', color: '#fca5a5', lineHeight: '1.65', marginBottom: '16px',
  },
  narrative: {
    background: 'rgba(0,113,189,0.12)', borderLeft: '3px solid #0071BD',
    borderRadius: '0 8px 8px 0', padding: '12px 16px',
    fontSize: '13px', color: 'var(--rmg-text, #e2e8f0)',
    lineHeight: '1.65', marginBottom: '16px',
  },
  badge: {
    display: 'inline-block', fontSize: '11px', padding: '3px 10px',
    borderRadius: '4px', background: 'rgba(0,113,189,0.2)',
    color: '#60a5fa', marginBottom: '14px', fontWeight: '500',
  },
  hdr: {
    fontSize: '12px', color: 'var(--rmg-muted, #94a3b8)',
    marginBottom: '10px', paddingBottom: '6px',
    borderBottom: '1px solid rgba(56,182,255,0.1)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  card: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(56,182,255,0.12)',
    borderRadius: '10px', padding: '14px 16px', marginBottom: '8px',
  },
  cardTop:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '5px' },
  cardName: { fontSize: '14px', fontWeight: '600', color: 'var(--rmg-text, #e2e8f0)' },
  cardType: {
    fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
    background: 'rgba(0,113,189,0.2)', color: '#60a5fa', whiteSpace: 'nowrap', flexShrink: 0,
  },
  cardApp:  { fontSize: '13px', color: 'var(--rmg-muted, #94a3b8)', lineHeight: '1.5', marginBottom: '8px' },
  cardFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' },
  cardSpec: { fontSize: '11px', color: 'rgba(148,163,184,0.6)', fontFamily: 'monospace' },
  cardPres: {
    fontSize: '11px', padding: '2px 8px',
    border: '1px solid rgba(56,182,255,0.15)',
    borderRadius: '4px', color: 'var(--rmg-muted, #94a3b8)',
  },
  priceBadge: {
    fontSize: '13px', fontWeight: '600', color: '#34d399',
    background: 'rgba(52,211,153,0.12)',
    padding: '3px 10px', borderRadius: '4px',
  },
  priceNA: {
    fontSize: '11px', color: 'rgba(148,163,184,0.5)',
    padding: '3px 8px', borderRadius: '4px',
    border: '1px solid rgba(56,182,255,0.1)',
  },
  btnPrecios: {
    background: 'transparent', border: '1px solid #38b6ff',
    color: '#38b6ff', borderRadius: '6px',
    padding: '4px 14px', fontSize: '12px', cursor: 'pointer',
  },
  btnPreciosLoading: {
    background: 'transparent', border: '1px solid rgba(56,182,255,0.2)',
    color: 'rgba(148,163,184,0.5)', borderRadius: '6px',
    padding: '4px 14px', fontSize: '12px', cursor: 'not-allowed',
  },
}

export default function AsesorProductos() {
  const [query,          setQuery]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [result,         setResult]         = useState(null)
  const [error,          setError]          = useState(null)
  const [searched,       setSearched]       = useState(false)
  const [precios,        setPrecios]        = useState(null)
  const [loadingPrecios, setLoadingPrecios] = useState(false)
  const [preciosVisible, setPreciosVisible] = useState(false)

  const buscar = async (q) => {
    const text = (q || query).trim()
    if (!text || text.length < 2) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSearched(true)
    setPrecios(null)
    setPreciosVisible(false)
    try {
      const res  = await fetch(`${API}/api/asesor/recomendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error del servidor')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const preset = (text) => {
    setQuery(text)
    buscar(text)
  }

  const togglePrecios = async () => {
    if (!result?.productos?.length) return
    if (preciosVisible) { setPreciosVisible(false); return }
    setPreciosVisible(true)
    if (precios) return
    setLoadingPrecios(true)
    try {
      const nombres = result.productos.map(p => p.catalog.n)
      const res  = await fetch(`${API}/api/asesor/precios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombres }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setPrecios(data.precios || {})
    } catch {
      setPrecios({})
    } finally {
      setLoadingPrecios(false)
    }
  }

  return (
    <div style={s.wrap}>
      <h1 style={s.h1}>Asesor de Productos Vistony 2025</h1>
      <p style={s.sub}>Describe cualquier tipo de negocio o cliente — el asesor identifica qué productos necesita</p>

      <div style={s.row}>
        <input
          style={s.input}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="Ej: empresa de montacargas, panadería industrial, taller de ascensores..."
        />
        <button
          style={loading ? s.btnDisabled : s.btnPrimary}
          onClick={() => buscar()}
          disabled={loading}
        >
          {loading ? 'Analizando...' : 'Consultar'}
        </button>
      </div>

      <div style={s.chipsWrap}>
        {CHIPS.map(c => (
          <button key={c.label} style={s.chip} onClick={() => preset(c.q)}>
            {c.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={s.loading}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚙️</div>
          Analizando el giro de negocio y seleccionando productos...
        </div>
      )}

      {!loading && error && <div style={s.errBox}>⚠️ {error}</div>}

      {!loading && !error && result && (
        <>
          <div style={s.badge}>📋 Giro detectado: {result.giro_detectado}</div>
          <div style={s.narrative}>{result.analisis}</div>

          <div style={s.hdr}>
            <span>{result.productos?.length || 0} productos recomendados</span>
            <button
              style={loadingPrecios ? s.btnPreciosLoading : s.btnPrecios}
              onClick={togglePrecios}
              disabled={loadingPrecios}
            >
              {loadingPrecios ? '⏳ Consultando...' : preciosVisible ? '🙈 Ocultar precios' : '💰 Mostrar precios'}
            </button>
          </div>

          {(result.productos || []).map((p, i) => {
            const precioData = preciosVisible && precios ? precios[p.catalog.n] : null
            const precioFmt  = precioData?.precio_venta ? fmt(precioData.precio_venta) : null
            return (
              <div key={i} style={s.card}>
                <div style={s.cardTop}>
                  <span style={s.cardName}>{p.catalog.n}</span>
                  <span style={s.cardType}>{p.catalog.t}</span>
                </div>
                <div style={s.cardApp}>{p.aplicacion}</div>
                <div style={s.cardFoot}>
                  <span style={s.cardSpec}>{p.catalog.s}</span>
                  <span style={s.cardPres}>{p.catalog.p}</span>
                  {preciosVisible && (
                    precioFmt
                      ? <span style={s.priceBadge}>{precioFmt} <span style={{ fontSize: '10px', fontWeight: '400', opacity: 0.7 }}>neto</span></span>
                      : <span style={s.priceNA}>Sin precio en lista</span>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}

      {!loading && !error && !searched && (
        <div style={s.empty}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
          Ingresa cualquier tipo de negocio o usa los accesos rápidos de arriba
        </div>
      )}
    </div>
  )
}
