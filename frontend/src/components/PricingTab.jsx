import { useState, useMemo, useEffect, useCallback } from "react";
import api from "@utils/api";

// ─── helpers ──────────────────────────────────────────────────────────────────
const clp = (n) => "$" + Math.round(n).toLocaleString("es-CL");

const LINEA_CONFIG = {
  NEUMATICOS: { label: "Neumáticos", color: "#2a78d6", bg: "#e6f1fb", text: "#185fa5" },
  BATERIAS:   { label: "Baterías",   color: "#1baf7a", bg: "#e1f5ee", text: "#0f6e56" },
  LUBRICANTES:{ label: "Lubricantes",color: "#eda100", bg: "#faeeda", text: "#854f0b" },
};

const BANDA_CONFIG = {
  muy_competitivo: { label: "Muy competitivo", bg: "#eaf3de", color: "#3b6d11" },
  competitivo:     { label: "Competitivo",      bg: "#faeeda", color: "#854f0b" },
  revisar:         { label: "Revisar",           bg: "#e6f1fb", color: "#185fa5" },
};

function calcIndice(precioB2b, min, max) {
  if (!min || !max) return null;
  return precioB2b / ((min + max) / 2);
}

function getBanda(indice) {
  if (indice === null) return null;
  if (indice <= 0.70) return "muy_competitivo";
  if (indice <= 0.90) return "competitivo";
  return "revisar";
}

const LINEAS = ["Todas", "NEUMATICOS", "BATERIAS", "LUBRICANTES"];

// ─── Modal base ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 480, width: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#0b0b0b" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Modal proveedor ──────────────────────────────────────────────────────────
function ModalProveedor({ sku, onClose, onSaved }) {
  const [nombre, setNombre] = useState("");
  const [costo, setCosto] = useState("");
  const [condicion, setCondicion] = useState("credito");
  const [activar, setActivar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const inp = { padding: "7px 11px", fontSize: 13, borderRadius: 6, border: "0.5px solid #d3d1c7", outline: "none", background: "#fff", color: "#0b0b0b", width: "100%", fontFamily: "inherit" };
  const lbl = { fontSize: 12, color: "#888", display: "block", marginBottom: 4 };

  const handleSave = async () => {
    if (!nombre.trim() || !costo) { setErr("Completa nombre y costo"); return; }
    setSaving(true); setErr("");
    try {
      await api.post("/pricing/proveedores-sku", {
        sku_codigo: sku.codigo,
        proveedor_nombre: nombre.trim(),
        costo_neto: parseFloat(costo),
        condicion_pago: condicion,
        es_activo: activar,
      });
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Agregar proveedor — ${sku.codigo}`} onClose={onClose}>
      <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>{sku.descripcion}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={lbl}>Proveedor *</label>
          <input style={inp} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: KUMHO CHILE S.A." />
        </div>
        <div>
          <label style={lbl}>Costo neto (CLP) *</label>
          <input style={inp} type="number" value={costo} onChange={e => setCosto(e.target.value)} placeholder="Ej: 83500" />
        </div>
        <div>
          <label style={lbl}>Condición de pago</label>
          <select style={inp} value={condicion} onChange={e => setCondicion(e.target.value)}>
            <option value="credito">Crédito</option>
            <option value="contado">Contado</option>
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#0b0b0b" }}>
          <input type="checkbox" checked={activar} onChange={e => setActivar(e.target.checked)} />
          Usar como proveedor activo (actualiza costo base)
        </label>
      </div>
      {err && <p style={{ fontSize: 12, color: "#a32d2d", marginTop: 12 }}>{err}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 6, border: "0.5px solid #d3d1c7", background: "#fff", color: "#52514e", cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 6, border: "none", background: "#2a78d6", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Modal precio mercado ─────────────────────────────────────────────────────
function ModalCluster({ sku, onClose, onSaved }) {
  const [min, setMin] = useState(sku.mercado_min ?? "");
  const [max, setMax] = useState(sku.mercado_max ?? "");
  const [fuente, setFuente] = useState(sku.mercado_fuente ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const inp = { padding: "7px 11px", fontSize: 13, borderRadius: 6, border: "0.5px solid #d3d1c7", outline: "none", background: "#fff", color: "#0b0b0b", width: "100%", fontFamily: "inherit" };
  const lbl = { fontSize: 12, color: "#888", display: "block", marginBottom: 4 };
  const lineaLower = sku.linea?.toLowerCase() || "neumaticos";

  const handleSave = async () => {
    if (!min || !max) { setErr("Ingresa precio mínimo y máximo"); return; }
    setSaving(true); setErr("");
    try {
      await api.post("/pricing/clusters", {
        linea: lineaLower,
        cluster_key: sku.cluster_key,
        precio_mercado_min: parseFloat(min),
        precio_mercado_max: parseFloat(max),
        fuente: fuente.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Actualizar precio de mercado" onClose={onClose}>
      <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Cluster: <strong style={{ color: "#0b0b0b" }}>{sku.cluster_key || "Sin cluster"}</strong></p>
      <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Este precio aplica a todos los SKUs con el mismo cluster key.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Precio mín. (CLP) *</label>
            <input style={inp} type="number" value={min} onChange={e => setMin(e.target.value)} placeholder="Ej: 44990" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Precio máx. (CLP) *</label>
            <input style={inp} type="number" value={max} onChange={e => setMax(e.target.value)} placeholder="Ej: 62990" />
          </div>
        </div>
        <div>
          <label style={lbl}>Fuente / referencia</label>
          <input style={inp} value={fuente} onChange={e => setFuente(e.target.value)} placeholder="Ej: Autoplanet/Salfa jun-2026" />
        </div>
      </div>
      {err && <p style={{ fontSize: 12, color: "#a32d2d", marginTop: 12 }}>{err}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 6, border: "0.5px solid #d3d1c7", background: "#fff", color: "#52514e", cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 6, border: "none", background: "#1baf7a", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Panel de proveedores (sub-fila) ─────────────────────────────────────────
function ProveedoresPanel({ sku, colSpan, onAddProveedor, onActivar, onRefresh }) {
  const [activating, setActivating] = useState(null);

  const handleActivar = async (pvId) => {
    setActivating(pvId);
    try {
      await api.put(`/pricing/proveedores-sku/${pvId}/activar`);
      onRefresh();
    } catch (e) {
      alert("Error: " + (e.response?.data?.error || e.message));
    } finally {
      setActivating(null);
    }
  };

  const handleDelete = async (pvId) => {
    if (!confirm("¿Eliminar este proveedor?")) return;
    try {
      await api.delete(`/pricing/proveedores-sku/${pvId}`);
      onRefresh();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "0 0 8px 0", background: "#f8f7f3" }}>
        <div style={{ padding: "12px 16px", borderTop: "1px solid #e1e0d9" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#52514e", letterSpacing: "0.04em" }}>
              PROVEEDORES — {sku.descripcion}
            </span>
            <button
              onClick={() => onAddProveedor(sku)}
              style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "0.5px solid #2a78d6", background: "#e6f1fb", color: "#185fa5", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
            >
              + Agregar proveedor
            </button>
          </div>

          {sku.proveedores.length === 0 ? (
            <p style={{ fontSize: 12, color: "#888" }}>Sin proveedores registrados.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f0efe8" }}>
                  {["Proveedor", "Costo neto", "Condición", "Estado", ""].map(h => (
                    <th key={h} style={{ padding: "5px 10px", textAlign: h === "Costo neto" ? "right" : "left", color: "#888", fontWeight: 500, borderBottom: "0.5px solid #e1e0d9", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sku.proveedores.map(pv => (
                  <tr key={pv.id} style={{ background: pv.es_activo ? "rgba(27,175,122,0.06)" : "transparent" }}>
                    <td style={{ padding: "6px 10px", color: "#0b0b0b", fontWeight: pv.es_activo ? 600 : 400 }}>{pv.proveedor_nombre}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#52514e" }}>{clp(pv.costo_neto)}</td>
                    <td style={{ padding: "6px 10px", color: "#52514e", textTransform: "capitalize" }}>{pv.condicion_pago}</td>
                    <td style={{ padding: "6px 10px" }}>
                      {pv.es_activo
                        ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#e1f5ee", color: "#0f6e56", fontWeight: 600 }}>● Activo</span>
                        : <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "rgba(90,143,168,0.9)" }}>Inactivo</span>
                      }
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {!pv.es_activo && (
                        <>
                          <button
                            onClick={() => handleActivar(pv.id)}
                            disabled={activating === pv.id}
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: "0.5px solid #1baf7a", background: "#e1f5ee", color: "#0f6e56", cursor: "pointer", fontFamily: "inherit", marginRight: 6 }}
                          >
                            {activating === pv.id ? "…" : "Activar"}
                          </button>
                          <button
                            onClick={() => handleDelete(pv.id)}
                            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "0.5px solid #f7c1c1", background: "none", color: "#a32d2d", cursor: "pointer", fontFamily: "inherit" }}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Fila SKU ─────────────────────────────────────────────────────────────────
function SkuRow({ sku, margenOverride, expanded, onToggle, onAddProveedor, onEditCluster, onRefresh }) {
  const margen   = margenOverride ?? sku.margen_pct;
  const precio   = Math.round(sku.costo * (1 + margen / 100));
  const margenCLP = precio - sku.costo;
  const indice   = calcIndice(precio, sku.mercado_min, sku.mercado_max);
  const banda    = getBanda(indice);
  const bandaCfg = banda ? BANDA_CONFIG[banda] : null;

  const tdBase = { padding: "9px 10px" };

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ borderBottom: expanded ? "none" : "0.5px solid #f0efe8", cursor: "pointer", background: expanded ? "#f8f7f3" : "transparent" }}
      >
        <td style={{ ...tdBase, fontFamily: "monospace", fontSize: 12, color: "#888" }}>
          <span style={{ marginRight: 4, opacity: 0.5, fontSize: 10 }}>{expanded ? "▾" : "▸"}</span>
          {sku.codigo}
        </td>
        <td style={{ ...tdBase, fontSize: 13, color: "#0b0b0b", maxWidth: 260 }}>{sku.descripcion}</td>
        <td style={{ ...tdBase, textAlign: "right", fontSize: 13, color: "#52514e" }}>{clp(sku.costo)}</td>
        <td style={{ ...tdBase, textAlign: "right", fontSize: 13, fontWeight: 500, color: "#0b0b0b" }}>{clp(precio)}</td>
        <td style={{ ...tdBase, textAlign: "right" }}>
          <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: margen >= 30 ? "#eaf3de" : margen >= 25 ? "#faeeda" : "#e6f1fb", color: margen >= 30 ? "#3b6d11" : margen >= 25 ? "#854f0b" : "#185fa5" }}>
            {margen}%
          </span>
        </td>
        <td style={{ ...tdBase, textAlign: "right", fontSize: 12, color: "#1baf7a", fontWeight: 500 }}>{clp(margenCLP)}</td>
        <td style={{ ...tdBase, textAlign: "right", fontSize: 12 }}>
          {sku.mercado_min && sku.mercado_max ? (
            <span
              onClick={e => { e.stopPropagation(); onEditCluster(sku); }}
              style={{ color: "#52514e", cursor: "pointer", textDecoration: "underline dotted" }}
              title="Editar precio mercado"
            >
              {clp(sku.mercado_min)} – {clp(sku.mercado_max)}
            </span>
          ) : (
            <span
              onClick={e => { e.stopPropagation(); onEditCluster(sku); }}
              style={{ fontSize: 11, padding: "2px 7px", borderRadius: 12, background: "#f0efe8", color: "#888", cursor: "pointer" }}
              title="Agregar precio mercado"
            >
              Sin referencia
            </span>
          )}
        </td>
        <td style={{ ...tdBase, textAlign: "center" }}>
          {bandaCfg ? (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: bandaCfg.bg, color: bandaCfg.color, fontWeight: 500, whiteSpace: "nowrap" }}>
              {Math.round(indice * 100)}% — {bandaCfg.label}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "#ccc" }}>—</span>
          )}
        </td>
        <td style={{ ...tdBase, textAlign: "right" }}>
          <span style={{ display: "inline-block", minWidth: 32, textAlign: "center", padding: "2px 6px", borderRadius: 4, fontSize: 12, background: sku.stock > 50 ? "#eaf3de" : sku.stock > 10 ? "#faeeda" : "#fcebeb", color: sku.stock > 50 ? "#3b6d11" : sku.stock > 10 ? "#854f0b" : "#a32d2d", fontWeight: 500 }}>
            {sku.stock}
          </span>
        </td>
      </tr>
      {expanded && (
        <ProveedoresPanel
          sku={sku}
          colSpan={9}
          onAddProveedor={onAddProveedor}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

// ─── Acordeón por marca ───────────────────────────────────────────────────────
const TABLE_HEADERS = ["Código", "Descripción", "Costo neto", "Precio B2B", "Margen", "Margen $", "P. Mercado", "Índice competit.", "Stock"];

function MarcaAccordion({ marca, skus, margenOverride, expandedSku, onToggleSku, onAddProveedor, onEditCluster, onRefresh }) {
  const [open, setOpen] = useState(false);
  const cfg = LINEA_CONFIG[skus[0]?.linea];
  const totalStock = skus.reduce((a, s) => a + s.stock, 0);
  const avgMargen = margenOverride ?? Math.round(skus.reduce((a, s) => a + s.margen_pct, 0) / skus.length);

  return (
    <div style={{ borderRadius: 8, border: "0.5px solid #e1e0d9", marginBottom: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: open ? "#f8f7f3" : "#fff", border: "none", cursor: "pointer", gap: 12 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "3px 10px", borderRadius: 20, background: cfg?.bg || "#f1efe8", color: cfg?.text || "#444" }}>
            {marca}
          </span>
          <span style={{ fontSize: 13, color: "#52514e" }}>
            {skus.length} SKUs · {totalStock.toLocaleString("es-CL")} unidades · margen {avgMargen}%
          </span>
        </div>
        <span style={{ fontSize: 18, color: "#888", lineHeight: 1, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>›</span>
      </button>

      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#fafaf8" }}>
                {TABLE_HEADERS.map(h => (
                  <th key={h} style={{ padding: "7px 10px", fontSize: 11, fontWeight: 500, color: "#888", textAlign: ["Código", "Descripción"].includes(h) ? "left" : "right", borderBottom: "0.5px solid #e1e0d9", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skus.map(s => (
                <SkuRow
                  key={s.codigo}
                  sku={s}
                  margenOverride={margenOverride}
                  expanded={expandedSku === s.codigo}
                  onToggle={() => onToggleSku(s.codigo)}
                  onAddProveedor={onAddProveedor}
                  onEditCluster={onEditCluster}
                  onRefresh={onRefresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Acordeón por línea ───────────────────────────────────────────────────────
function LineaAccordion({ linea, skus, margenOverride, marcaFiltro, proveedorFiltro, expandedSku, onToggleSku, onAddProveedor, onEditCluster, onRefresh }) {
  const [open, setOpen] = useState(true);
  const cfg = LINEA_CONFIG[linea];

  const marcasEnLinea = Array.from(new Set(skus.map(s => s.marca)));
  let skusFiltrados = marcaFiltro && marcaFiltro !== "Todas" ? skus.filter(s => s.marca === marcaFiltro) : skus;
  if (proveedorFiltro && proveedorFiltro !== "Todos") {
    skusFiltrados = skusFiltrados.filter(s => s.proveedores?.some(pv => pv.proveedor_nombre === proveedorFiltro));
  }

  const skusPorMarca = marcasEnLinea
    .filter(m => marcaFiltro === "Todas" || !marcaFiltro || m === marcaFiltro)
    .map(m => ({ marca: m, skus: skusFiltrados.filter(s => s.marca === m) }))
    .filter(g => g.skus.length > 0);

  if (skusFiltrados.length === 0) return null;

  const totalUnidades = skusFiltrados.reduce((a, s) => a + s.stock, 0);
  const valorStock    = skusFiltrados.reduce((a, s) => a + s.costo * s.stock, 0);

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", marginBottom: 10, background: cfg.color + "12", border: `1px solid ${cfg.color}30`, borderLeft: `4px solid ${cfg.color}`, borderRadius: 8, cursor: "pointer" }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: cfg.text }}>{cfg.label}</span>
        <span style={{ fontSize: 13, color: "#52514e", flex: 1, textAlign: "left" }}>
          {skusFiltrados.length} SKUs · {totalUnidades.toLocaleString("es-CL")} unid · valor {clp(valorStock)}
        </span>
        <span style={{ fontSize: 18, color: cfg.text, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
      </button>

      {open && (
        <div style={{ paddingLeft: 4 }}>
          {skusPorMarca.map(({ marca, skus: mSkus }) => (
            <MarcaAccordion
              key={marca}
              marca={marca}
              skus={mSkus}
              margenOverride={margenOverride}
              expandedSku={expandedSku}
              onToggleSku={onToggleSku}
              onAddProveedor={onAddProveedor}
              onEditCluster={onEditCluster}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PricingTab() {
  const [skuData,       setSkuData]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [busqueda,      setBusqueda]      = useState("");
  const [lineaFiltro,   setLineaFiltro]   = useState("Todas");
  const [marcaFiltro,   setMarcaFiltro]   = useState("Todas");
  const [proveedorFiltro, setProveedorFiltro] = useState("Todos");
  const [ordenar,       setOrdenar]       = useState("linea");
  const [margenCustom,  setMargenCustom]  = useState(null);
  const [modoLista,     setModoLista]     = useState(false);
  const [expandedSku,   setExpandedSku]   = useState(null);
  const [modalProv,     setModalProv]     = useState(null); // sku object
  const [modalCluster,  setModalCluster]  = useState(null); // sku object

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get("/pricing/skus");
      setSkuData(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Listas derivadas para filtros
  const MARCAS = useMemo(() => {
    const m = Array.from(new Set(skuData.map(s => s.marca)));
    return ["Todas", ...m];
  }, [skuData]);

  const PROVEEDORES = useMemo(() => {
    const names = new Set();
    for (const s of skuData) for (const pv of (s.proveedores || [])) names.add(pv.proveedor_nombre);
    return ["Todos", ...Array.from(names).sort()];
  }, [skuData]);

  const marcasDisponibles = useMemo(() => {
    if (lineaFiltro === "Todas") return MARCAS;
    const m = Array.from(new Set(skuData.filter(s => s.linea === lineaFiltro).map(s => s.marca)));
    return ["Todas", ...m];
  }, [lineaFiltro, skuData, MARCAS]);

  const skusFiltrados = useMemo(() => {
    let data = [...skuData];
    if (lineaFiltro !== "Todas") data = data.filter(s => s.linea === lineaFiltro);
    if (marcaFiltro !== "Todas") data = data.filter(s => s.marca === marcaFiltro);
    if (proveedorFiltro !== "Todos") data = data.filter(s => s.proveedores?.some(pv => pv.proveedor_nombre === proveedorFiltro));
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      data = data.filter(s => s.descripcion.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q) || s.marca.toLowerCase().includes(q));
    }
    if (ordenar === "precio_asc")  data.sort((a, b) => a.precio_b2b - b.precio_b2b);
    if (ordenar === "precio_desc") data.sort((a, b) => b.precio_b2b - a.precio_b2b);
    if (ordenar === "stock_desc")  data.sort((a, b) => b.stock - a.stock);
    if (ordenar === "margen_desc") data.sort((a, b) => b.margen_pct - a.margen_pct);
    return data;
  }, [skuData, lineaFiltro, marcaFiltro, proveedorFiltro, busqueda, ordenar]);

  const lineasEnData    = Array.from(new Set(skusFiltrados.map(s => s.linea)));
  const totalUnidades   = skusFiltrados.reduce((a, s) => a + s.stock, 0);
  const valorTotal      = skusFiltrados.reduce((a, s) => a + s.costo * s.stock, 0);

  const inp = { padding: "7px 11px", fontSize: 13, borderRadius: 6, border: "0.5px solid #d3d1c7", outline: "none", background: "#fff", color: "#0b0b0b", fontFamily: "inherit" };
  const btn = (active) => ({ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "0.5px solid " + (active ? "#2a78d6" : "#d3d1c7"), background: active ? "#e6f1fb" : "#fff", color: active ? "#185fa5" : "#52514e", cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 500 : 400 });

  const handleToggleSku = (codigo) => setExpandedSku(prev => prev === codigo ? null : codigo);

  const handleModalSaved = () => {
    setModalProv(null);
    setModalCluster(null);
    fetchData();
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "24px", maxWidth: 1080, background: "#fff", borderRadius: 12, color: "#0b0b0b" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#0b0b0b", margin: 0 }}>Pricing</h2>
          <p style={{ fontSize: 13, color: "#888", margin: "3px 0 0" }}>
            {loading ? "Cargando…" : `${skusFiltrados.length} SKUs · ${totalUnidades.toLocaleString("es-CL")} unidades · valor stock ${clp(valorTotal)} CLP neto`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn(!modoLista)} onClick={() => setModoLista(false)}>Acordeón</button>
          <button style={btn(modoLista)}  onClick={() => setModoLista(true)}>Lista plana</button>
        </div>
      </div>

      {/* filtros */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          placeholder="Buscar código, descripción o marca…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ ...inp, width: 260 }}
        />
        <select value={lineaFiltro} onChange={e => { setLineaFiltro(e.target.value); setMarcaFiltro("Todas"); }} style={inp}>
          {LINEAS.map(l => <option key={l} value={l}>{l === "Todas" ? "Todas las líneas" : LINEA_CONFIG[l]?.label}</option>)}
        </select>
        <select value={marcaFiltro} onChange={e => setMarcaFiltro(e.target.value)} style={inp}>
          {marcasDisponibles.map(m => <option key={m} value={m}>{m === "Todas" ? "Todas las marcas" : m}</option>)}
        </select>
        <select value={proveedorFiltro} onChange={e => setProveedorFiltro(e.target.value)} style={inp}>
          {PROVEEDORES.map(p => <option key={p} value={p}>{p === "Todos" ? "Todos los proveedores" : p}</option>)}
        </select>
        <select value={ordenar} onChange={e => setOrdenar(e.target.value)} style={inp}>
          <option value="linea">Ordenar por línea</option>
          <option value="precio_asc">Precio ↑</option>
          <option value="precio_desc">Precio ↓</option>
          <option value="stock_desc">Mayor stock</option>
          <option value="margen_desc">Mayor margen</option>
        </select>

        {/* margen global */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: "#888" }}>Margen global</span>
          <input type="number" min={5} max={80} placeholder="auto" value={margenCustom ?? ""} onChange={e => setMargenCustom(e.target.value ? parseInt(e.target.value) : null)} style={{ ...inp, width: 72, textAlign: "center" }} />
          <span style={{ fontSize: 12, color: "#888" }}>%</span>
          {margenCustom !== null && (
            <button onClick={() => setMargenCustom(null)} style={{ ...inp, padding: "6px 10px", cursor: "pointer", fontSize: 11, color: "#a32d2d", borderColor: "#f7c1c1" }}>Reset</button>
          )}
        </div>
      </div>

      {/* chips de línea rápida */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {LINEAS.map(l => {
          const cfg = l !== "Todas" ? LINEA_CONFIG[l] : null;
          const active = lineaFiltro === l;
          return (
            <button key={l} onClick={() => { setLineaFiltro(l); setMarcaFiltro("Todas"); }}
              style={{ padding: "4px 14px", fontSize: 12, borderRadius: 20, border: `1px solid ${active && cfg ? cfg.color : "#d3d1c7"}`, background: active && cfg ? cfg.bg : active ? "#0b0b0b10" : "#fff", color: active && cfg ? cfg.text : active ? "#0b0b0b" : "#52514e", cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 500 : 400 }}>
              {l === "Todas" ? "Todas" : cfg.label}
            </button>
          );
        })}
      </div>

      {/* estados */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#888", fontSize: 14 }}>Cargando catálogo…</div>
      )}
      {error && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#a32d2d", fontSize: 14 }}>
          Error: {error}
          <br /><button onClick={fetchData} style={{ marginTop: 12, padding: "6px 16px", fontSize: 12, borderRadius: 6, border: "0.5px solid #a32d2d", background: "#fcebeb", color: "#a32d2d", cursor: "pointer" }}>Reintentar</button>
        </div>
      )}

      {/* contenido */}
      {!loading && !error && (
        skusFiltrados.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#888", fontSize: 14 }}>Sin resultados para esa búsqueda</div>
        ) : modoLista ? (
          /* lista plana */
          <div style={{ overflowX: "auto", borderRadius: 8, border: "0.5px solid #e1e0d9" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#fafaf8" }}>
                  {["Línea", "Código", "Descripción", "Marca", "Costo", "Precio B2B", "Margen", "Margen $", "P. Mercado", "Índice", "Stock"].map(h => (
                    <th key={h} style={{ padding: "9px 10px", fontSize: 11, fontWeight: 500, color: "#888", textAlign: ["Línea","Código","Descripción","Marca"].includes(h) ? "left" : "right", borderBottom: "0.5px solid #e1e0d9", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skusFiltrados.map(s => {
                  const margen = margenCustom ?? s.margen_pct;
                  const precio = Math.round(s.costo * (1 + margen / 100));
                  const cfg    = LINEA_CONFIG[s.linea];
                  const indice = calcIndice(precio, s.mercado_min, s.mercado_max);
                  const banda  = getBanda(indice);
                  const bCfg  = banda ? BANDA_CONFIG[banda] : null;
                  return (
                    <tr key={s.codigo} style={{ borderBottom: "0.5px solid #f0efe8" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: cfg?.bg, color: cfg?.text }}>{cfg?.label}</span>
                      </td>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 12, color: "#888" }}>{s.codigo}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#0b0b0b" }}>{s.descripcion}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12, color: "#52514e" }}>{s.marca}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, color: "#52514e" }}>{clp(s.costo)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontWeight: 500 }}>{clp(precio)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 6px", borderRadius: 10, background: margen >= 30 ? "#eaf3de" : margen >= 25 ? "#faeeda" : "#e6f1fb", color: margen >= 30 ? "#3b6d11" : margen >= 25 ? "#854f0b" : "#185fa5" }}>{margen}%</span>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: "#1baf7a", fontWeight: 500 }}>{clp(precio - s.costo)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12 }}>
                        {s.mercado_min && s.mercado_max
                          ? <span style={{ color: "#52514e" }}>{clp(s.mercado_min)} – {clp(s.mercado_max)}</span>
                          : <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 10, background: "#f0efe8", color: "#888" }}>Sin ref.</span>
                        }
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        {bCfg
                          ? <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: bCfg.bg, color: bCfg.color, fontWeight: 500 }}>{Math.round(indice * 100)}%</span>
                          : <span style={{ fontSize: 11, color: "#ccc" }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 6px", borderRadius: 4, background: s.stock > 50 ? "#eaf3de" : s.stock > 10 ? "#faeeda" : "#fcebeb", color: s.stock > 50 ? "#3b6d11" : s.stock > 10 ? "#854f0b" : "#a32d2d" }}>{s.stock}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* acordeón */
          <div>
            {lineasEnData.map(linea => (
              <LineaAccordion
                key={linea}
                linea={linea}
                skus={skusFiltrados.filter(s => s.linea === linea)}
                margenOverride={margenCustom}
                marcaFiltro={marcaFiltro}
                proveedorFiltro={proveedorFiltro}
                expandedSku={expandedSku}
                onToggleSku={handleToggleSku}
                onAddProveedor={sku => setModalProv(sku)}
                onEditCluster={sku => setModalCluster(sku)}
                onRefresh={fetchData}
              />
            ))}
          </div>
        )
      )}

      {/* modals */}
      {modalProv    && <ModalProveedor sku={modalProv}    onClose={() => setModalProv(null)}    onSaved={handleModalSaved} />}
      {modalCluster && <ModalCluster   sku={modalCluster} onClose={() => setModalCluster(null)} onSaved={handleModalSaved} />}
    </div>
  );
}
