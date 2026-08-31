import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { Search, X } from 'lucide-react'

/**
 * Buscador de SKU contra el maestro de precios (lista_precios), reutilizado
 * en cualquier punto donde se arma una línea de documento (cotización,
 * venta directa, orden de compra…). Al seleccionar un producto entrega el
 * registro completo — incluye presentacion / unidades_por_pack, que es lo
 * que permite mostrar el conversor de cajas ↔ unidades en el campo cantidad.
 *
 * La lista de resultados se pinta en un portal a document.body (posición
 * fixed calculada desde el input), no como absolute dentro de este mismo
 * div. Esto es necesario porque este buscador siempre vive dentro de una
 * tabla con scroll horizontal (overflow-x-auto) — y por especificación CSS,
 * en cuanto overflow-x no es "visible", el navegador fuerza overflow-y a
 * "auto" también, recortando cualquier absolute posicionado adentro. Sin el
 * portal, el dropdown de resultados queda invisible (aunque exista en el
 * DOM) y el precio unitario nunca se autocompleta al elegir un producto.
 */
export default function ProductoSearch({ initialQuery = '', onSelect, placeholder = 'Buscar SKU, producto…' }) {
  const [query, setQuery]   = useState(initialQuery)
  const [open, setOpen]     = useState(false)
  const [debouncedQ, setDQ] = useState('')
  const [rect, setRect]     = useState(null)
  const wrapRef             = useRef(null)
  const inputRef            = useRef(null)

  useEffect(() => { setQuery(initialQuery) }, [initialQuery])

  useEffect(() => {
    const t = setTimeout(() => setDQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['lp-buscar', debouncedQ],
    queryFn: () => api.get('/lista-precios/buscar', { params: { q: debouncedQ } }).then(r => r.data),
    enabled: debouncedQ.length >= 2,
    staleTime: 60_000,
  })

  // El dropdown no puede simplemente heredar el ancho del input: este buscador
  // vive casi siempre dentro de una celda de tabla angosta (p.ej. 176px), y a
  // ese ancho la descripción del producto queda truncada e ilegible. Se fuerza
  // un ancho mínimo y se recorta contra el borde derecho de la ventana — así
  // el resultado siempre se puede leer completo, sin salirse de la pantalla.
  const DROPDOWN_MIN_WIDTH = 340
  const updateRect = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      const width = Math.max(r.width, DROPDOWN_MIN_WIDTH)
      const left = Math.min(r.left, window.innerWidth - width - 8)
      setRect({ top: r.bottom, left: Math.max(left, 8), width })
    }
  }

  useLayoutEffect(() => {
    if (!open) return
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) && !e.target.closest('[data-producto-search-dropdown]')) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (p) => {
    onSelect(p)
    setQuery(p.codigo_sku || '')
    setOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    setOpen(false)
    onSelect({ codigo_sku: '', descripcion: '', precio_neto: 0, precio_venta_neto: 0, costo_unidad_neto: 0, presentacion: '', unidades_por_pack: null })
  }

  const showDropdown = open && debouncedQ.length >= 2 && rect

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rmg-muted)' }} />
        <input
          ref={inputRef}
          className="rmg-input text-xs pl-6 pr-6"
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={handleClear} className="absolute right-1.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }}>
            <X size={11}/>
          </button>
        )}
      </div>
      {showDropdown && createPortal(
        <div data-producto-search-dropdown
          className="fixed z-50 rounded-lg border overflow-hidden shadow-xl"
          style={{ top: rect.top + 4, left: rect.left, width: rect.width, background: 'var(--rmg-surface)', borderColor: 'rgba(56,182,255,0.25)', maxHeight: 260, overflowY: 'auto' }}>
          {isFetching && (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Buscando…</div>
          )}
          {!isFetching && resultados.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Sin resultados</div>
          )}
          {resultados.map(p => (
            <button key={p.codigo_sku} type="button" onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-3 py-2.5 hover:bg-black/5 transition-colors border-b"
              style={{ borderColor: 'rgba(15, 35, 60,0.04)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{p.codigo_sku}</span>
                <span className="font-bold text-xs" style={{ color: 'var(--rmg-teal)' }}>{formatCLP(p.precio_neto || p.precio_venta_neto)}</span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-off)' }}>{p.descripcion}</div>
              <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
                {p.marca} · {p.presentacion}{p.unidades_por_pack > 1 ? ` (${p.unidades_por_pack} und/caja)` : ''}
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
