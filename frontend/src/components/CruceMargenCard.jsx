import { useNavigate } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import { formatCLP } from '@utils/format'

// Cruce OC ↔ Cotización (ventas calzadas): venta vs compra y margen.
// `cruce` viene del backend (services/cruceOcCotizacion.js); `ocActualId` resalta la OC que se está viendo.
const pctTxt = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`)

export default function CruceMargenCard({ cruce, ocActualId = null }) {
  const navigate = useNavigate()
  if (!cruce) return null
  const { venta, compra, ocs = [], margen } = cruce
  const positivo = margen.monto >= 0
  const colorMargen = positivo ? 'var(--rmg-teal)' : 'var(--rmg-red)'
  const vigentes = ocs.filter(o => !o.excluida)

  const Link = ({ label, onClick, actual }) => (
    <button type="button" onClick={onClick} disabled={actual}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full hover:opacity-80"
      style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)', cursor: actual ? 'default' : 'pointer' }}>
      <Link2 size={10} /> {label}
    </button>
  )

  const Fila = ({ titulo, docs, t, bold }) => (
    <tr style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
      <td className="px-4 py-2.5">
        <div className={`text-xs ${bold ? 'font-bold' : 'font-semibold'}`} style={{ color: 'var(--rmg-off)' }}>{titulo}</div>
        <div className="flex flex-wrap gap-1 mt-1">{docs}</div>
      </td>
      <td className="px-4 py-2.5 text-right text-sm font-semibold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(t.neto)}</td>
      <td className="px-4 py-2.5 text-right text-sm" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(t.iva)}</td>
      <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(t.total)}</td>
    </tr>
  )

  return (
    <div className="rmg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider"
        style={{ borderColor: 'rgba(56,182,255,0.1)', color: 'var(--rmg-muted)' }}>
        Cruce con {ocActualId ? 'cotización' : 'orden de compra'} · margen de la venta calzada
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'rgba(15, 35, 60,0.02)', borderBottom: '1px solid rgba(56,182,255,0.08)' }}>
            {['', 'Neto', 'IVA 19%', 'Total'].map((h, i) => (
              <th key={i} className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${i ? 'text-right' : 'text-left'}`}
                style={{ color: 'var(--rmg-muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Fila titulo="Venta (cotización)" t={venta}
            docs={<Link label={venta.numero} actual={!ocActualId} onClick={() => navigate(`/cotizaciones/${venta.id}`)} />} />
          <Fila titulo={`Compra (${vigentes.length === 1 ? 'OC' : `${vigentes.length} OCs`})`} t={compra}
            docs={ocs.map(o => (
              <span key={o.id} className="inline-flex items-center gap-1">
                <Link label={o.numero} actual={o.id === ocActualId}
                  onClick={() => navigate(`/compras?id=${o.id}`)} />
                {o.excluida && <span className="text-[10px]" style={{ color: 'var(--rmg-muted)' }}>({o.estado}, no suma)</span>}
              </span>
            ))} />
        </tbody>
      </table>
      <div className="px-4 py-3 flex flex-wrap justify-end items-baseline gap-6 border-t"
        style={{ borderColor: 'rgba(56,182,255,0.08)', background: positivo ? 'rgba(45,201,138,0.06)' : 'rgba(224,90,78,0.06)' }}>
        <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
          Markup s/costo: <span className="font-bold" style={{ color: 'var(--rmg-off)' }}>{pctTxt(margen.markup)}</span>
        </div>
        <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
          Margen neto: <span className="font-bold" style={{ color: colorMargen }}>{formatCLP(margen.monto)}</span>
        </div>
        <div className="text-base font-black" style={{ color: colorMargen, fontFamily: 'Inter Tight, sans-serif' }}>
          Margen: {pctTxt(margen.pct)}
        </div>
      </div>
    </div>
  )
}
