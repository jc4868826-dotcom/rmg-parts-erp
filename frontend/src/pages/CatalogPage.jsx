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

// ─── Fila de línea con un único Tipo ────────────────────────────────────────
function LineaRow({ row, i }) {
  const tipoRaw = row['Tipo']
  const tipoDisplay = (!tipoRaw || tipoRaw === '—') ? null : tipoRaw
  return (
    <tr
      style={{
        borderBottom: '1px solid rgba(15, 35, 60,0.04)',
        background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)',
      }}
      className="hover:bg-white/[0.02] transition-colors"
    >
      <td className="px-4 py-3" style={{ minWidth: 180 }}>
        <div className="font-semibold text-sm" style={{ color: 'var(--rmg-off)' }}>
          {row['Línea']}
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
        {tipoDisplay || <span style={{ opacity: 0.3 }}>—</span>}
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

// ─── Grupo de Línea con múltiples Tipos ─────────────────────────────────────
function LineaGroupRows({ linea, rows, isOpen, onToggle }) {
  const first = rows[0]
  return (
    <>
      {/* Fila cabecera de la línea (clickable) */}
      <tr
        style={{
          borderBottom: '1px solid rgba(15, 35, 60,0.04)',
          background: 'rgba(56,182,255,0.04)',
          cursor: 'pointer',
        }}
        className="hover:bg-white/[0.03] transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3" style={{ minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ChevronRight
              size={12}
              style={{
                color: 'var(--rmg-blt)',
                transform: isOpen ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.15s',
                flexShrink: 0,
              }}
            />
            <div>
              <div className="font-semibold text-sm" style={{ color: 'var(--rmg-off)' }}>
                {linea}
              </div>
              {first['Marca(s)'] && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-blt)' }}>
                  {first['Marca(s)']}
                </div>
              )}
              {first['Proveedor(es)'] && (
                <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
                  {first['Proveedor(es)']}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: 10, fontWeight: 700,
            padding: '1px 7px', borderRadius: 100,
            background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)',
            border: '1px solid rgba(56,182,255,0.2)',
          }}>
            {rows.length} tipos
          </span>
        </td>
        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)', opacity: 0.3 }}>—</td>
        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)', maxWidth: 220 }}>
          {first['Composición (Ingeniería)'] || <span style={{ opacity: 0.3 }}>—</span>}
        </td>
        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)', maxWidth: 260 }}>
          {first['Resistencia Técnica / Aplicación'] || <span style={{ opacity: 0.3 }}>—</span>}
        </td>
      </tr>

      {/* Filas de variantes (expandidas) */}
      {isOpen && rows.map(row => (
        <tr
          key={row['Tipo']}
          style={{
            borderBottom: '1px solid rgba(15, 35, 60,0.03)',
            background: 'rgba(56,182,255,0.025)',
          }}
        >
          <td className="px-4 py-2.5" style={{ paddingLeft: 44 }}>
            <div className="text-xs font-medium" style={{ color: 'var(--rmg-blt)' }}>
              ↳ {row['Tipo']}
            </div>
          </td>
          <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--rmg-muted)', opacity: 0.4 }}>—</td>
          <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--rmg-muted)' }}>
            {row['Presentaciones'] || <span style={{ opacity: 0.3 }}>—</span>}
          </td>
          <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--rmg-muted)', opacity: 0.3 }}>—</td>
          <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--rmg-muted)', opacity: 0.3 }}>—</td>
        </tr>
      ))}
    </>
  )
}

// ─── Encabezado de tabla (reutilizado en cada bloque) ────────────────────────
function LineaTableHeader() {
  return (
    <thead>
      <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
        {[
          'Línea / Marca',
          'Tipo',
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

// ─── Tabla de líneas para un bloque de sub-subfamilia ────────────────────────
function LineaTable({ lineaMap, isSearching, openLinea, onToggleLinea }) {
  return (
    <table className="w-full text-sm">
      <LineaTableHeader />
      <tbody>
        {Object.entries(lineaMap).map(([linea, rows], i) => {
          if (rows.length === 1) {
            return <LineaRow key={linea} row={rows[0]} i={i} />
          }
          const isOpen = isSearching || openLinea === linea
          return (
            <LineaGroupRows
              key={linea}
              linea={linea}
              rows={rows}
              isOpen={isOpen}
              onToggle={() => onToggleLinea(linea)}
            />
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Colores por Familia ──────────────────────────────────────────────────────
const FAM_COLOR = {
  'LUBRICANTES':                    { bg: 'rgba(45,201,138,0.12)',  text: 'var(--rmg-teal)' },
  'BATERÍAS':                       { bg: 'rgba(56,182,255,0.12)',  text: 'var(--rmg-blt)'  },
  'NEUMÁTICOS':                     { bg: 'rgba(244,162,60,0.12)',  text: 'var(--rmg-gold)' },
  'GRASAS':                         { bg: 'rgba(123,97,196,0.12)', text: 'var(--rmg-purple)' },
  'QUÍMICOS Y CUIDADO VEHICULAR':   { bg: 'rgba(244,80,80,0.10)',  text: 'var(--rmg-red)'  },
  'REFRIGERANTES Y ADITIVOS DIESEL':{ bg: 'rgba(56,182,255,0.08)', text: 'var(--rmg-blt)' },
  'ADITIVOS':                       { bg: 'rgba(45,201,138,0.08)', text: 'var(--rmg-teal)' },
  'LÍQUIDO DE FRENOS':              { bg: 'rgba(244,162,60,0.08)', text: 'var(--rmg-gold)' },
}

function famColor(fam) {
  return FAM_COLOR[fam] || { bg: 'rgba(15, 35, 60,0.06)', text: 'var(--rmg-muted)' }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CatalogPage() {
  const [search, setSearch]         = useState('')
  const [openFam, setOpenFam]       = useState(null)
  const [openSub, setOpenSub]       = useState(null)     // "Fam::Sub"
  const [openSubSub, setOpenSubSub] = useState(null)     // "Fam::Sub::SubSub"
  const [openLinea, setOpenLinea]   = useState(null)     // linea name (for multi-tipo)

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
      (row['Línea']         || '').toLowerCase().includes(q) ||
      (row['Marca(s)']      || '').toLowerCase().includes(q) ||
      (row['Familia']       || '').toLowerCase().includes(q) ||
      (row['Subfamilia']    || '').toLowerCase().includes(q)
    )
  }, [catalog, search])

  // Árbol: Familia → Subfamilia → Sub-subfamilia → Línea → [tipo rows]
  const tree = useMemo(() => {
    const t = {}
    filtered.forEach(row => {
      const fam    = row['Familia']        || 'Sin clasificar'
      const sub    = row['Subfamilia']     || 'General'
      const subsub = row['Sub-subfamilia'] || '__direct__'
      const linea  = row['Línea']         || 'Sin nombre'
      if (!t[fam])                     t[fam] = {}
      if (!t[fam][sub])                t[fam][sub] = {}
      if (!t[fam][sub][subsub])        t[fam][sub][subsub] = {}
      if (!t[fam][sub][subsub][linea]) t[fam][sub][subsub][linea] = []
      t[fam][sub][subsub][linea].push(row)
    })
    return t
  }, [filtered])

  const isSearching = search.trim().length > 0
  const famKeys = Object.keys(tree)

  function toggleFam(fam) {
    setOpenFam(prev => prev === fam ? null : fam)
    setOpenSub(null)
    setOpenSubSub(null)
    setOpenLinea(null)
  }
  function toggleSub(fam, sub) {
    const key = `${fam}::${sub}`
    setOpenSub(prev => prev === key ? null : key)
    setOpenSubSub(null)
    setOpenLinea(null)
  }
  function toggleSubSub(fam, sub, subsub) {
    const key = `${fam}::${sub}::${subsub}`
    setOpenSubSub(prev => prev === key ? null : key)
  }
  function toggleLinea(linea) {
    setOpenLinea(prev => prev === linea ? null : linea)
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
            {' · '}Familia › Subfamilia › Sub-subfamilia › Línea
          </p>
        </div>
        {/* Buscador */}
        <div className="relative" style={{ minWidth: 280 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }} />
          <input
            className="rmg-input pl-9 w-full"
            placeholder="Línea, marca, familia o subfamilia…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Estado de carga */}
      {isLoading && (
        <div className="rmg-card p-8 text-center" style={{ color: 'var(--rmg-muted)' }}>
          <div className="h-4 w-48 rounded animate-pulse mx-auto" style={{ background: 'rgba(15, 35, 60,0.06)' }} />
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
            // Contar líneas únicas (no filas de Tipo)
            const subKeys  = Object.keys(tree[fam])
            const famTotal = subKeys.reduce((n, s) =>
              n + Object.values(tree[fam][s]).reduce((m, lineaMap) => m + Object.keys(lineaMap).length, 0), 0)
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
                    {famTotal} línea{famTotal !== 1 ? 's' : ''}
                  </span>
                </button>

                {isFamOpen && (
                  <div style={{ borderTop: `1px solid rgba(15, 35, 60,0.06)` }}>
                    {subKeys.map(sub => {
                      const subSubKeys = Object.keys(tree[fam][sub])
                      const subTotal   = subSubKeys.reduce((n, ss) => n + Object.keys(tree[fam][sub][ss]).length, 0)
                      const subKey     = `${fam}::${sub}`
                      const isSubOpen  = isSearching || openSub === subKey
                      const directOnly = subSubKeys.length === 1 && subSubKeys[0] === '__direct__'

                      return (
                        <div key={sub}>
                          {/* Nivel 2 — Subfamilia */}
                          <button
                            className="w-full flex items-center gap-3 px-8 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
                            style={{ borderTop: '1px solid rgba(15, 35, 60,0.04)' }}
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
                                <div style={{ borderTop: '1px solid rgba(15, 35, 60,0.04)' }}>
                                  <LineaTable
                                    lineaMap={tree[fam][sub]['__direct__']}
                                    isSearching={isSearching}
                                    openLinea={openLinea}
                                    onToggleLinea={toggleLinea}
                                  />
                                </div>
                              )
                              /* Con Sub-subfamilia */
                              : subSubKeys.map(subsub => {
                                  const ssKey    = `${fam}::${sub}::${subsub}`
                                  const isSsOpen = isSearching || openSubSub === ssKey
                                  const lineaMap = tree[fam][sub][subsub]
                                  const ssCount  = Object.keys(lineaMap).length
                                  const label    = subsub === '__direct__' ? 'General' : subsub

                                  return (
                                    <div key={subsub}>
                                      {/* Nivel 3 — Sub-subfamilia */}
                                      <button
                                        className="w-full flex items-center gap-3 px-12 py-2 text-left transition-colors hover:bg-white/[0.02]"
                                        style={{ borderTop: '1px solid rgba(15, 35, 60,0.04)' }}
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
                                          {ssCount}
                                        </span>
                                      </button>

                                      {/* Nivel 4 — Líneas */}
                                      {isSsOpen && (
                                        <div style={{ borderTop: '1px solid rgba(15, 35, 60,0.04)' }}>
                                          <LineaTable
                                            lineaMap={lineaMap}
                                            isSearching={isSearching}
                                            openLinea={openLinea}
                                            onToggleLinea={toggleLinea}
                                          />
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
