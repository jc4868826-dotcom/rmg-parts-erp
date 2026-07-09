import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { Search, ChevronRight, FlaskConical } from 'lucide-react'

// ─── Badge único reutilizable ────────────────────────────────────────────────
function ValidationBadge() {
  return (
    <span
      title="Datos técnicos del proveedor en revisión contra fichas del fabricante"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        padding: '1px 6px', borderRadius: 100,
        background: 'rgba(244,162,60,0.14)', color: 'var(--rmg-gold)',
        border: '1px solid rgba(244,162,60,0.3)', whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      <FlaskConical size={9} />
      En validación
    </span>
  )
}

// ─── Fila de artículo (nivel 4 — hoja) ──────────────────────────────────────
function ArticuloRow({ row, i }) {
  return (
    <tr
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)',
      }}
      className="hover:bg-white/[0.02] transition-colors"
    >
      <td className="px-4 py-3" style={{ minWidth: 180 }}>
        <div className="font-semibold text-sm" style={{ color: 'var(--rmg-off)' }}>
          {row['Artículo']}
        </div>
        {row['Marca(s)'] && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-blt)' }}>
            {row['Marca(s)']}
          </div>
        )}
        {row['Proveedor(es)'] && (
          <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
            {row['Proveedor(es)']}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)', minWidth: 100 }}>
        {row['Tipo / Especificación'] || <span style={{ opacity: 0.3 }}>—</span>}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)', minWidth: 180 }}>
        {row['Presentaciones'] || <span style={{ opacity: 0.3 }}>—</span>}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)', maxWidth: 220 }}>
        {row['Composición (Ingeniería)'] || <span style={{ opacity: 0.3 }}>—</span>}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)', maxWidth: 260 }}>
        {row['Resistencia Técnica / Aplicación'] || <span style={{ opacity: 0.3 }}>—</span>}
      </td>
    </tr>
  )
}

// ─── Encabezado de tabla de artículos (reutilizado en cada bloque) ───────────
function ArticuloTableHeader() {
  return (
    <thead>
      <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
        {[
          'Artículo / Marca',
          'Tipo / Especificación',
          'Presentaciones',
        ].map(h => (
          <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wider font-semibold"
              style={{ color: 'var(--rmg-muted)' }}>
            {h}
          </th>
        ))}
        <th className="text-left px-4 py-2 text-xs uppercase tracking-wider font-semibold"
            style={{ color: 'var(--rmg-muted)' }}>
          Composición&nbsp;<ValidationBadge />
        </th>
        <th className="text-left px-4 py-2 text-xs uppercase tracking-wider font-semibold"
            style={{ color: 'var(--rmg-muted)' }}>
          Resistencia / Aplicación&nbsp;<ValidationBadge />
        </th>
      </tr>
    </thead>
  )
}

// ─── Colores por Familia ──────────────────────────────────────────────────────
const FAM_COLOR = {
  'LUBRICANTES':                   { bg: 'rgba(45,201,138,0.12)',  text: 'var(--rmg-teal)' },
  'BATERÍAS':                      { bg: 'rgba(56,182,255,0.12)',  text: 'var(--rmg-blt)'  },
  'NEUMÁTICOS':                    { bg: 'rgba(244,162,60,0.12)',  text: 'var(--rmg-gold)' },
  'GRASAS':                        { bg: 'rgba(123,97,196,0.12)', text: 'var(--rmg-purple)' },
  'QUÍMICOS Y CUIDADO VEHICULAR':  { bg: 'rgba(244,80,80,0.10)',  text: 'var(--rmg-red)'  },
  'REFRIGERANTES Y ADITIVOS DIESEL':{ bg: 'rgba(56,182,255,0.08)', text: 'var(--rmg-blt)' },
  'ADITIVOS':                      { bg: 'rgba(45,201,138,0.08)', text: 'var(--rmg-teal)' },
  'LÍQUIDO DE FRENOS':             { bg: 'rgba(244,162,60,0.08)', text: 'var(--rmg-gold)' },
}

function famColor(fam) {
  return FAM_COLOR[fam] || { bg: 'rgba(255,255,255,0.06)', text: 'var(--rmg-muted)' }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CatalogPage() {
  const [search, setSearch]       = useState('')
  const [openFam, setOpenFam]     = useState(null)
  const [openSub, setOpenSub]     = useState(null)    // "Fam::Sub"
  const [openSubSub, setOpenSubSub] = useState(null)  // "Fam::Sub::SubSub"

  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ['catalogo-ing'],
    queryFn:  () => api.get('/public/catalogo-ingenieria').then(r => r.data),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  })

  // Filtrar por búsqueda
  const filtered = useMemo(() => {
    if (!search.trim()) return catalog
    const q = search.toLowerCase()
    return catalog.filter(row =>
      (row['Artículo']    || '').toLowerCase().includes(q) ||
      (row['Marca(s)']    || '').toLowerCase().includes(q) ||
      (row['Familia']     || '').toLowerCase().includes(q) ||
      (row['Subfamilia']  || '').toLowerCase().includes(q)
    )
  }, [catalog, search])

  // Construir árbol Familia → Subfamilia → Sub-subfamilia → [artículos]
  const tree = useMemo(() => {
    const t = {}
    filtered.forEach(row => {
      const fam    = row['Familia']         || 'Sin clasificar'
      const sub    = row['Subfamilia']      || 'General'
      const subsub = row['Sub-subfamilia']  || '__direct__'
      if (!t[fam])        t[fam] = {}
      if (!t[fam][sub])   t[fam][sub] = {}
      if (!t[fam][sub][subsub]) t[fam][sub][subsub] = []
      t[fam][sub][subsub].push(row)
    })
    return t
  }, [filtered])

  const isSearching = search.trim().length > 0
  const famKeys = Object.keys(tree)

  function toggleFam(fam) {
    setOpenFam(prev => prev === fam ? null : fam)
    setOpenSub(null)
    setOpenSubSub(null)
  }
  function toggleSub(fam, sub) {
    const key = `${fam}::${sub}`
    setOpenSub(prev => prev === key ? null : key)
    setOpenSubSub(null)
  }
  function toggleSubSub(fam, sub, subsub) {
    const key = `${fam}::${sub}::${subsub}`
    setOpenSubSub(prev => prev === key ? null : key)
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Encabezado */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            Catálogo de ingeniería
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
            {isLoading ? '…' : `${catalog.length} artículos`}
            {' · '}Familia › Subfamilia › Sub-subfamilia › Artículo
          </p>
        </div>
        {/* Buscador */}
        <div className="relative" style={{ minWidth: 280 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }} />
          <input
            className="rmg-input pl-9 w-full"
            placeholder="Artículo, marca, familia o subfamilia…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Estado de carga */}
      {isLoading && (
        <div className="rmg-card p-8 text-center" style={{ color: 'var(--rmg-muted)' }}>
          <div className="h-4 w-48 rounded animate-pulse mx-auto" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <p className="mt-3 text-sm">Cargando catálogo…</p>
        </div>
      )}

      {/* Vista árbol */}
      {!isLoading && (
        <div className="space-y-2">
          {famKeys.length === 0 && (
            <div className="rmg-card py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
              <Search size={28} className="mx-auto mb-3 opacity-30" />
              <p>Sin resultados para «{search}»</p>
            </div>
          )}

          {famKeys.map(fam => {
            const subKeys   = Object.keys(tree[fam])
            const famTotal  = subKeys.reduce((n, s) =>
              n + Object.values(tree[fam][s]).reduce((m, arr) => m + arr.length, 0), 0)
            const isFamOpen = isSearching || openFam === fam
            const col       = famColor(fam)

            return (
              <div key={fam} className="rmg-card overflow-hidden">
                {/* Nivel 1 — Familia */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors"
                  style={{ background: isFamOpen ? col.bg : 'transparent' }}
                  onClick={() => toggleFam(fam)}
                >
                  <ChevronRight
                    size={16}
                    style={{
                      color: col.text,
                      transform: isFamOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.18s',
                      flexShrink: 0,
                    }}
                  />
                  <span className="font-bold text-sm tracking-wide" style={{ color: col.text }}>
                    {fam}
                  </span>
                  <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: col.bg, color: col.text }}>
                    {famTotal} artículo{famTotal !== 1 ? 's' : ''}
                  </span>
                </button>

                {isFamOpen && (
                  <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}>
                    {subKeys.map(sub => {
                      const subSubKeys = Object.keys(tree[fam][sub])
                      const subTotal   = subSubKeys.reduce((n, ss) => n + tree[fam][sub][ss].length, 0)
                      const subKey     = `${fam}::${sub}`
                      const isSubOpen  = isSearching || openSub === subKey
                      // Si hay solo __direct__ (sin Sub-subfamilia), mostrar artículos directo
                      const directOnly = subSubKeys.length === 1 && subSubKeys[0] === '__direct__'

                      return (
                        <div key={sub}>
                          {/* Nivel 2 — Subfamilia */}
                          <button
                            className="w-full flex items-center gap-3 px-8 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                            onClick={() => toggleSub(fam, sub)}
                          >
                            <ChevronRight
                              size={13}
                              style={{
                                color: 'var(--rmg-muted)',
                                transform: isSubOpen ? 'rotate(90deg)' : 'none',
                                transition: 'transform 0.15s',
                                flexShrink: 0,
                              }}
                            />
                            <span className="text-sm font-semibold" style={{ color: 'var(--rmg-off)' }}>{sub}</span>
                            <span className="ml-auto text-xs" style={{ color: 'var(--rmg-muted)' }}>
                              {subTotal}
                            </span>
                          </button>

                          {isSubOpen && (
                            directOnly
                              /* Sin Sub-subfamilia → tabla directa */
                              ? (
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                  <table className="w-full text-sm">
                                    <ArticuloTableHeader />
                                    <tbody>
                                      {tree[fam][sub]['__direct__'].map((row, i) => (
                                        <ArticuloRow key={row['Artículo']} row={row} i={i} />
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )
                              /* Con Sub-subfamilia */
                              : subSubKeys.map(subsub => {
                                  const ssKey   = `${fam}::${sub}::${subsub}`
                                  const isSsOpen = isSearching || openSubSub === ssKey
                                  const items   = tree[fam][sub][subsub]
                                  const label   = subsub === '__direct__' ? 'General' : subsub

                                  return (
                                    <div key={subsub}>
                                      {/* Nivel 3 — Sub-subfamilia */}
                                      <button
                                        className="w-full flex items-center gap-3 px-12 py-2 text-left transition-colors hover:bg-white/[0.02]"
                                        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                                        onClick={() => toggleSubSub(fam, sub, subsub)}
                                      >
                                        <ChevronRight
                                          size={11}
                                          style={{
                                            color: 'var(--rmg-muted)',
                                            transform: isSsOpen ? 'rotate(90deg)' : 'none',
                                            transition: 'transform 0.15s',
                                            flexShrink: 0,
                                            opacity: 0.6,
                                          }}
                                        />
                                        <span className="text-xs font-medium" style={{ color: 'var(--rmg-muted)' }}>
                                          {label}
                                        </span>
                                        <span className="ml-auto text-xs" style={{ color: 'var(--rmg-muted)', opacity: 0.6 }}>
                                          {items.length}
                                        </span>
                                      </button>

                                      {/* Nivel 4 — Artículos */}
                                      {isSsOpen && (
                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                          <table className="w-full text-sm">
                                            <ArticuloTableHeader />
                                            <tbody>
                                              {items.map((row, i) => (
                                                <ArticuloRow key={row['Artículo']} row={row} i={i} />
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
