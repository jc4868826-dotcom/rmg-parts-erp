import { useState, useEffect } from 'react'

/**
 * Input de cantidad "consciente de la presentación" del SKU.
 *
 * Muchos SKU de RMG vienen del proveedor en cajas/displays de N unidades
 * (4, 12, 24…), pero el sistema siempre compra, vende y descuenta stock en
 * UNIDADES — es lo único que permite vender una unidad suelta de una caja,
 * y que costo_unidad_neto / precio_venta_neto (que ya están por unidad en
 * lista_precios) cuadren con el stock real.
 *
 * Este componente resuelve la conversión para quien está tipeando: si el SKU
 * tiene unidades_por_pack > 1, muestra dos campos — "cajas" y "sueltas" — y
 * emite siempre el total en unidades vía onChange. Si no hay info de
 * presentación (SKU sin dato, o veniendo de un registro antiguo), cae a un
 * input simple de unidades.
 */
export default function CantidadPresentacion({ unidadesPorPack, presentacion, cantidad, onChange, disabled = false }) {
  const pack = Number(unidadesPorPack) > 1 ? Number(unidadesPorPack) : null

  const [cajas, setCajas]     = useState(pack ? Math.floor((Number(cantidad) || 0) / pack) : 0)
  const [sueltas, setSueltas] = useState(pack ? (Number(cantidad) || 0) % pack : (Number(cantidad) || 0))

  // Si cambia el SKU seleccionado (y por lo tanto su pack), resincroniza los
  // sub-campos a partir del total vigente.
  useEffect(() => {
    if (pack) {
      setCajas(Math.floor((Number(cantidad) || 0) / pack))
      setSueltas((Number(cantidad) || 0) % pack)
    } else {
      setSueltas(Number(cantidad) || 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack])

  if (!pack) {
    return (
      <input
        type="number" min="0" step="any" disabled={disabled}
        className="rmg-input text-xs text-center w-full"
        value={cantidad}
        onChange={e => onChange(Number(e.target.value) || 0)}
      />
    )
  }

  const commit = (c, s) => {
    const cc = Math.max(0, Number(c) || 0)
    const ss = Math.max(0, Number(s) || 0)
    setCajas(cc); setSueltas(ss)
    onChange(cc * pack + ss)
  }

  return (
    <div className="flex flex-col gap-1 py-0.5">
      <div className="flex items-center gap-1">
        <input type="number" min="0" disabled={disabled} className="rmg-input text-xs text-center" style={{ width: 44, padding: '3px 4px' }}
          value={cajas} onChange={e => commit(e.target.value, sueltas)} title={`Cajas / bultos de ${pack} unidades`} />
        <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>caja(s)&nbsp;×{pack}</span>
      </div>
      <div className="flex items-center gap-1">
        <input type="number" min="0" max={pack - 1} disabled={disabled} className="rmg-input text-xs text-center" style={{ width: 44, padding: '3px 4px' }}
          value={sueltas} onChange={e => commit(cajas, e.target.value)} title="Unidades sueltas" />
        <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>sueltas</span>
      </div>
      <div className="text-[10px] font-semibold whitespace-nowrap" style={{ color: 'var(--rmg-blt)' }}>
        = {cajas * pack + sueltas} und{presentacion ? ` · ${presentacion}` : ''}
      </div>
    </div>
  )
}
