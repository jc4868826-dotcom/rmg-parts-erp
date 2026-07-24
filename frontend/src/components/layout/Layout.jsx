/**
 * RMG Auto Parts — Layout Principal
 * Sidebar · Header · Contenido · Notificaciones
 */

import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { useQuery } from '@tanstack/react-query'
import api from '@utils/api'
import {
  LayoutDashboard, Package, Users, GitBranch, FileText,
  ShoppingCart, Warehouse, MessageCircle, BarChart3,
  Settings, LogOut, Menu, X, Bell, ChevronRight,
  CalendarDays, Receipt, Truck, ShoppingBag, DollarSign,
  CreditCard, Building2, BookOpen, Tag, Crosshair, ClipboardList, LineChart,
  ExternalLink, Bot, LayoutTemplate, TrendingUp, PackagePlus, BarChart2
} from 'lucide-react'

const LANDING_URL = import.meta.env.VITE_LANDING_URL || 'https://landing-9iz8.onrender.com'

const NAV_SECTIONS = [
  {
    label: 'Ventas',
    items: [
      { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',       badge: null },
      { to: '/prospeccion',  icon: Crosshair,       label: 'Prospección',     badge: 'prospeccion' },
      { to: '/pipeline',     icon: GitBranch,       label: 'Pipeline CRM',    badge: '3' },
      { to: '/agenda',       icon: CalendarDays,    label: 'Agenda',          badge: null },
      { to: '/clientes',     icon: Users,           label: 'Clientes',        badge: null },
      { to: '/cotizaciones', icon: FileText,        label: 'Cotizaciones',    badge: '2' },
      { to: '/pricing',        icon: Tag,             label: 'Pricing',         badge: null },
      { to: '/lista-precios',  icon: ClipboardList,   label: 'Lista de Precios',badge: null },
    ],
  },
  {
    label: 'Financiero ERP',
    items: [
      { to: '/ventas',       icon: TrendingUp,      label: 'Ventas',          badge: null },
      { to: '/gastos',       icon: Receipt,         label: 'Gastos',          badge: null },
      { to: '/compras-erp',  icon: PackagePlus,     label: 'Compras',         badge: null },
      { to: '/flujo-caja',   icon: LineChart,       label: 'Flujo de Caja',   badge: null },
      { to: '/edr',          icon: BarChart2,       label: 'EDR',             badge: null },
    ],
  },
  {
    label: 'ERP Operacional',
    items: [
      { to: '/pedidos',      icon: ShoppingCart,    label: 'Pedidos',         badge: null },
      { to: '/cxc',          icon: DollarSign,      label: 'CxC · Cobrar',    badge: null },
      { to: '/cxp',          icon: CreditCard,      label: 'CxP · Pagar',     badge: null },
      { to: '/facturas',     icon: BookOpen,        label: 'Notas de Venta',  badge: null },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { to: '/catalogo',     icon: Package,         label: 'Catálogo',        badge: null },
      { to: '/proveedores',  icon: Building2,       label: 'Proveedores',     badge: null },
      { to: '/compras',      icon: Truck,           label: 'OC',              badge: 'oc' },
      { to: '/bodegas',      icon: Warehouse,       label: 'Bodegas',         badge: null },
    ],
  },
  {
    label: 'Canal & Análisis',
    items: [
      { to: '/whatsapp',     icon: MessageCircle,   label: 'Bot WhatsApp',    badge: '5' },
      { to: '/reportes',     icon: BarChart3,       label: 'Reportes',        badge: null },
      { to: '/config',             icon: Settings,        label: 'Configuración',    badge: null },
      { to: '/configurar-landing', icon: LayoutTemplate,  label: 'Configurar Landing', badge: null },
    ],
  },
]

const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items)

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const { data: prospecStats } = useQuery({
    queryKey: ['prospeccion-stats'],
    queryFn: () => api.get('/prospeccion/stats').then(r => r.data),
    staleTime: 60_000,
  })
  const prospeccionCount = prospecStats?.total_activos ?? null

  const { data: ocPendientes } = useQuery({
    queryKey: ['oc-pendientes-workflow'],
    queryFn: () => api.get('/compras/ordenes/pendientes-workflow').then(r => r.data),
    staleTime: 60_000,
    retry: false,
  })
  // admin ve: autorizadas + enviadas (tareas pendientes de gestión)
  // gerente (admin en este sistema) ve: pendAuth + recibidasBodega
  const ocBadgeAdmin   = (ocPendientes?.autorizadas ?? 0) + (ocPendientes?.enviadasProv ?? 0)
  const ocBadgeGerente = (ocPendientes?.pendAuth ?? 0) + (ocPendientes?.recibidasBodega ?? 0)
  const ocBadgeTotal   = ocBadgeAdmin + ocBadgeGerente

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--rmg-bg)' }}>

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside
        className="flex flex-col border-r transition-all duration-300"
        style={{
          width: sidebarOpen ? 240 : 68,
          backgroundImage: "linear-gradient(rgba(4,12,26,0.91), rgba(4,12,26,0.91)), url('/fondo_rmg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'left center',
          borderColor: 'rgba(56, 182, 255, 0.12)',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'rgba(56, 182, 255, 0.1)' }}>
          <div className="flex gap-1 flex-shrink-0">
            <div className="w-2 h-5 rounded-sm" style={{ background: 'var(--rmg-blue)' }} />
            <div className="w-2 h-5 rounded-sm" style={{ background: 'var(--rmg-teal)' }} />
            <div className="w-2 h-5 rounded-sm" style={{ background: 'var(--rmg-purple)' }} />
          </div>
          {sidebarOpen && (
            <div>
              <div className="font-black text-base tracking-wider text-white">RMG</div>
              <div className="text-xs font-medium" style={{ color: 'var(--rmg-muted)' }}>Auto Parts</div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--rmg-muted)' }}
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-3">
          {NAV_SECTIONS.map(section => (
            <div key={section.label}>
              {sidebarOpen && (
                <div className="px-3 mb-1 text-xs font-bold uppercase tracking-widest"
                  style={{ color: 'rgba(56,182,255,0.35)' }}>
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map(({ to, icon: Icon, label, badge }) => {
                  const badgeValue = badge === 'prospeccion'
                    ? (prospeccionCount !== null ? String(prospeccionCount) : null)
                    : badge === 'oc'
                    ? (ocBadgeTotal > 0 ? String(ocBadgeTotal) : null)
                    : badge
                  return (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative ${
                        isActive ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`
                    }
                    style={({ isActive }) => isActive ? {
                      background: 'rgba(27,143,212,0.15)',
                      borderLeft: '2px solid var(--rmg-blue)',
                    } : {}}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    {sidebarOpen && (
                      <>
                        <span className="text-sm font-medium flex-1">{label}</span>
                        {badgeValue && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--rmg-blue)', color: '#fff' }}>
                            {badgeValue}
                          </span>
                        )}
                      </>
                    )}
                    {!sidebarOpen && (
                      <div className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none"
                        style={{ background: 'rgba(7,21,40,0.95)', border: '1px solid rgba(56,182,255,0.2)', color: '#fff' }}>
                        {label}
                      </div>
                    )}
                  </NavLink>
                )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Visitar Ecommerce */}
        <div className="px-2 pb-2">
          <a
            href={LANDING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group"
            style={{ color: 'var(--rmg-teal)', background: 'rgba(45,201,138,0.08)', border: '1px solid rgba(45,201,138,0.2)' }}
          >
            <ExternalLink size={16} className="flex-shrink-0" />
            {sidebarOpen && (
              <span className="text-sm font-semibold">Visitar Ecommerce</span>
            )}
            {!sidebarOpen && (
              <div className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none"
                style={{ background: 'rgba(7,21,40,0.95)', border: '1px solid rgba(56,182,255,0.2)', color: '#fff' }}>
                Visitar Ecommerce
              </div>
            )}
          </a>
        </div>

        {/* Asistente IA */}
        <div className="px-2 pb-2">
          <NavLink
            to="/asistente"
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group"
            style={({ isActive }) => ({
              color: '#a78bfa',
              background: isActive ? 'rgba(167,139,250,0.18)' : 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.2)',
            })}
          >
            <Bot size={16} className="flex-shrink-0" />
            {sidebarOpen && (
              <span className="text-sm font-semibold">Asistente IA</span>
            )}
            {!sidebarOpen && (
              <div className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none"
                style={{ background: 'rgba(7,21,40,0.95)', border: '1px solid rgba(56,182,255,0.2)', color: '#fff' }}>
                Asistente IA
              </div>
            )}
          </NavLink>
        </div>

        {/* Usuario */}
        <div className="px-2 pb-4 border-t pt-3" style={{ borderColor: 'rgba(56, 182, 255, 0.1)' }}>
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${sidebarOpen ? '' : 'justify-center'}`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
              style={{ background: 'var(--rmg-blue)', color: '#fff' }}>
              {user?.nombre?.[0] || 'R'}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{user?.nombre || 'Gerente'}</div>
                <div className="text-xs truncate" style={{ color: 'var(--rmg-muted)' }}>{user?.rol || 'admin'}</div>
              </div>
            )}
            {sidebarOpen && (
              <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Área principal ────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'rgba(56, 182, 255, 0.1)', background: 'rgba(7, 21, 40, 0.6)' }}>
          <div className="text-sm font-medium" style={{ color: 'var(--rmg-muted)' }}>
            RMG Auto Parts · Santiago RM · {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div className="flex items-center gap-3">
            {/* Meta mensual */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(45, 201, 138, 0.1)', border: '1px solid rgba(45, 201, 138, 0.2)' }}>
              <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Meta mes</span>
              <span className="font-bold text-sm" style={{ color: 'var(--rmg-teal)' }}>$20M</span>
            </div>
            {/* Notificaciones */}
            <button className="relative p-2 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: 'var(--rmg-red)' }} />
            </button>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
