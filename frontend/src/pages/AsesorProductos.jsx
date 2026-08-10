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

const s = {
  wrap:      { padding: '24px', maxWidth: '920px', fontFamily: 'inherit' },
  h1:        { fontSize: '20px', fontWeight: '600', color: 'var(--rmg-text, #e2e8f0)', marginBottom: '4px' },
  sub:       { fontSize: '13px', color: 'var(--rmg-muted, #94a3b8)', marginBottom: '20px' },
  row:       { display: 'flex', gap: '8px', marginBottom: '12px' },
  input: {
    flex: 1, padding: '0 14px', height: '42px',
    border: '1px solid rgba(56,182,255,0.2)',
    borderRadius: '8px', fontSize: '14px', outline: 'none',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--rmg-text, #e2e8f0)',
  },
  btn: {
    background: '#0071BD', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '0 20px', height: '42px',
    fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  btnDis: { opacity: 0.6, cursor: 'not-allowed' },
  chipsWrap: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' },
  chip: {
    border: '1px solid rgba(56,182,255,0.2)', borderRadius: '16px',
    padding: '4px 12px', fontSize: '12px',
    color: 'var(--rmg-muted, #94a3b8)', cursor: 'pointer',
    background: 'rgba(255,255,255,0.04)',
  },
  loading: { textAlign: 'center', padding: '48px 20px', color: 'var(--rmg-muted, #94a3b8)', fontSize: '14px' },
  empty:   { textAlign: 'center', padding: '48px 20px', color: 'rgba(148,163,184,0.5)', fontSize: '14px' },
  errBox: {
    background: 'rgba(226,75,74,0.08)', borderLeft: '3px solid #e24b4a',
    borderRadius: '0 8px 8px 0', padding: '12px 16px',
    fontSize: '13px', color: '#fca5a5', lineHeight: '1.65',
  },
  narrative: {
    background: 'rgba(0,113,189,0.12)', borderLeft: '3px solid #0071BD',
    borderRadius: '0 8px 8px 0', padding: '12px 16px',
    fontSize: '13px', color: 'var(--rmg-text, #e2e8f0)',
    lineHeight: '1.65', marginBottom: '12px',
  },
  badge: {
    display: 'inline-block', fontSize: '11px', padding: '3px 10px',
    borderRadius: '4px', background: 'rgba(0,113,189,0.2)',
    color: '#60a5fa', marginBottom: '12px', fontWeight: '500',
  },
  hdr: {
    fontSize: '12px', color: 'var(--rmg-muted, #94a3b8)',
    marginBottom: '10px', paddingBottom: '6px',
    borderBottom: '1px solid rgba(56,182,255,0.1)',
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
  cardApp:  { fontSize: '13px', color: 'var(--rmg-muted, #94a3b8)', lineHeight: '1.5', marginBottom: '7px' },
  cardFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' },
  cardSpec: { fontSize: '11px', color: 'rgba(148,163,184,0.7)', fontFamily: 'monospace' },
  cardPres: {
    fontSize: '11px', padding: '2px 8px',
    border: '1px solid rgba(56,182,255,0.15)',
    borderRadius: '4px', color: 'var(--rmg-muted, #94a3b8)',
  },
}

export default function AsesorProductos() {
  const [query,    setQuery]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)
  const [searched, setSearched] = useState(false)

  const buscar = async (q) => {
    const text = (q || query).trim()
    if (!text || text.length < 2) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSearched(true)
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
          style={{ ...s.btn, ...(loading ? s.btnDis : {}) }}
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

      {!loading && error && (
        <div style={s.errBox}>⚠️ {error}</div>
      )}

      {!loading && !error && result && (
        <>
          <div style={s.badge}>📋 Giro detectado: {result.giro_detectado}</div>
          <div style={s.narrative}>{result.analisis}</div>
          <div style={s.hdr}>{result.productos?.length || 0} productos recomendados</div>
          {(result.productos || []).map((p, i) => (
            <div key={i} style={s.card}>
              <div style={s.cardTop}>
                <span style={s.cardName}>{p.catalog.n}</span>
                <span style={s.cardType}>{p.catalog.t}</span>
              </div>
              <div style={s.cardApp}>{p.aplicacion}</div>
              <div style={s.cardFoot}>
                <span style={s.cardSpec}>{p.catalog.s}</span>
                <span style={s.cardPres}>{p.catalog.p}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && !error && searched && result && result.productos?.length === 0 && (
        <div style={s.empty}>No se encontraron productos para esta búsqueda.</div>
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
