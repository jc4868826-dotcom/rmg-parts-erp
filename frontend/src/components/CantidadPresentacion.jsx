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
 *
 * 2026-10-08 (pedido de JC): dos bugs reales de estos campos.
 * 1. El "0" inicial costaba borrar — al estar el input controlado por un
 *    número, apenas el usuario dejaba el campo vacío un instante, Number('')
 *    volvía a 0 y React lo repintaba antes de que pudiera escribir el valor
 *    real. Ahora cada campo mantiene su propio string en edición (cajasTxt/
 *    sueltasTxt) y solo se repone a "0" al perder el foco si quedó vacío —
 *    mientras se escribe, puede estar genuinamente vacío. Además, al enfocar
 *    se selecciona todo el contenido (onFocus → select()) para que tipear
 *    reemplace el 0 en vez de tener que borrarlo a mano.
 * 2. No se permitían decimales en cantidad (no tiene sentido vender "2,5"
 *    unidades sueltas) — type="number" por sí solo no lo bloquea bien en
 *    todos los navegadores (permite pegar "2.5"). Se cambió a type="text"
 *    inputMode="numeric" con un filtro que elimina cualquier carácter que no
 *    sea dígito en cada tecla, así nunca se puede escribir un decimal.
 */
function soloEnteros(v) {
  return v.replace(/[^\d]/g, '')
}

export default function CantidadPresentacion({ unidadesPorPack, presentacion, cantidad, onChange, disabled = false }) {
  const pack = Number(unidadesPorPack) > 1 ? Number(unidadesPorPack) : null

  const [cajasTxt, setCajasTxt]     = useState(String(pack ? Math.floor((Number(cantidad) || 0) / pack) : 0))
  const [sueltasTxt, setSueltasTxt] = useState(String(pack ? (Number(cantidad) || 0) % pack : (Number(cantidad) || 0)))

  // Si cambia el SKU seleccionado (y por lo tanto su pack), resincroniza los
  // sub-campos a partir del total vigente.
  useEffect(() => {
    if (pack) {
      setCajasTxt(String(Math.floor((Number(cantidad) || 0) / pack)))
      setSueltasTxt(String((Number(cantidad) || 0) % pack))
    } else {
      setSueltasTxt(String(Number(cantidad) || 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack])

  if (!pack) {
    return (
      <input
        type="text" inputMode="numeric" disabled={disabled}
        className="rmg-input text-xs text-center w-full"
        value={sueltasTxt}
        onFocus={e => e.target.select()}
        onChange={e => {
          const v = soloEnteros(e.target.value)
          setSueltasTxt(v)
          onChange(v === '' ? 0 : Number(v))
        }}
        onBlur={() => { if (sueltasTxt === '') setSueltasTxt('0') }}
      />
    )
  }

  const commit = (cTxt, sTxt) => {
    const cc = cTxt === '' ? 0 : Math.max(0, Number(cTxt) || 0)
    const ss = sTxt === '' ? 0 : Math.max(0, Number(sTxt) || 0)
    onChange(cc * pack + ss)
  }

  return (
    <div className="flex flex-col gap-1 py-0.5">
      <div className="flex items-center gap-1">
        <input type="text" inputMode="numeric" disabled={disabled} className="rmg-input text-xs text-center" style={{ width: 44, padding: '3px 4px' }}
          value={cajasTxt}
          onFocus={e => e.target.select()}
          onChange={e => { const v = soloEnteros(e.target.value); setCajasTxt(v); commit(v, sueltasTxt) }}
          onBlur={() => { if (cajasTxt === '') setCajasTxt('0') }}
          title={`Cajas / bultos de ${pack} unidades`} />
        <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>caja(s)&nbsp;×{pack}</span>
      </div>
      <div className="flex items-center gap-1">
        <input type="text" inputMode="numeric" disabled={disabled} className="rmg-input text-xs text-center" style={{ width: 44, padding: '3px 4px' }}
          value={sueltasTxt}
          onFocus={e => e.target.select()}
          onChange={e => {
            let v = soloEnteros(e.target.value)
            if (v !== '' && Number(v) > pack - 1) v = String(pack - 1)
            setSueltasTxt(v); commit(cajasTxt, v)
          }}
          onBlur={() => { if (sueltasTxt === '') setSueltasTxt('0') }}
          title="Unidades sueltas" />
        <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>sueltas</span>
      </div>
      <div className="text-[10px] font-semibold whitespace-nowrap" style={{ color: 'var(--rmg-blt)' }}>
        = {(Number(cajasTxt) || 0) * pack + (Number(sueltasTxt) || 0)} und{presentacion ? ` · ${presentacion}` : ''}
      </div>
    </div>
  )
}
