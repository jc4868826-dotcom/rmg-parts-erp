/**
 * RMG Auto Parts — App Principal
 * React Router · Autenticación · Módulos RMG OS
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@context/AuthContext'
import Layout from '@components/layout/Layout'

// ── Páginas ────────────────────────────────────────────────
import LoginPage        from '@pages/LoginPage'
import DashboardPage    from '@pages/DashboardPage'
import CatalogPage      from '@pages/CatalogPage'
import ClientesPage     from '@pages/ClientesPage'
import ClienteDetalle   from '@pages/ClienteDetalle'
import PipelinePage     from '@pages/PipelinePage'
import CotizacionesPage from '@pages/CotizacionesPage'
import CotizacionForm   from '@pages/CotizacionForm'
import PedidosPage      from '@pages/PedidosPage'
import InventarioPage   from '@pages/InventarioPage'
import WhatsAppPage     from '@pages/WhatsAppPage'
import ReportesPage     from '@pages/ReportesPage'
import ConfiguracionPage from '@pages/ConfiguracionPage'
import GastosPage       from '@pages/GastosPage'
import AgendaPage       from '@pages/AgendaPage'
import ProveedoresPage  from '@pages/ProveedoresPage'
import ComprasPage      from '@pages/ComprasPage'
import BodegasPage      from '@pages/BodegasPage'
import CxCPage          from '@pages/CxCPage'
import CxPPage          from '@pages/CxPPage'
import FacturaPage      from '@pages/FacturaPage'
import PricingTab        from '@components/PricingTab'
import ProspeccionPage  from '@pages/ProspeccionPage'
import ListaPreciosPage from '@pages/ListaPreciosPage'
import FlujoCajaPage   from '@pages/FlujoCajaPage'
import AsistenteIAPage from '@pages/AsistenteIAPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,  // 2 minutos
      retry: 1,
    },
  },
})

// ── Ruta protegida ─────────────────────────────────────────
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen bg-[#050f1c] text-white">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#0a1a2e',
                color: '#fff',
                border: '1px solid rgba(56,182,255,0.2)',
              },
            }}
          />
          <Routes>
            {/* Pública */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protegidas — dentro del Layout con sidebar */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"           element={<DashboardPage />} />
              <Route path="catalogo"            element={<CatalogPage />} />
              <Route path="clientes"            element={<ClientesPage />} />
              <Route path="clientes/:id"        element={<ClienteDetalle />} />
              <Route path="pipeline"            element={<PipelinePage />} />
              <Route path="cotizaciones"        element={<CotizacionesPage />} />
              <Route path="cotizaciones/nueva"  element={<CotizacionForm />} />
              <Route path="cotizaciones/:id"    element={<CotizacionForm />} />
              <Route path="pedidos"             element={<PedidosPage />} />
              <Route path="inventario"          element={<InventarioPage />} />
              <Route path="whatsapp"            element={<WhatsAppPage />} />
              <Route path="gastos"              element={<GastosPage />} />
              <Route path="agenda"              element={<AgendaPage />} />
              <Route path="reportes"            element={<ReportesPage />} />
              <Route path="config"              element={<ConfiguracionPage />} />
              <Route path="proveedores"        element={<ProveedoresPage />} />
              <Route path="compras"            element={<ComprasPage />} />
              <Route path="bodegas"            element={<BodegasPage />} />
              <Route path="cxc"                element={<CxCPage />} />
              <Route path="cxp"                element={<CxPPage />} />
              <Route path="facturas"           element={<FacturaPage />} />
              <Route path="pricing"            element={<PricingTab />} />
              <Route path="prospeccion"       element={<ProspeccionPage />} />
              <Route path="lista-precios"     element={<ListaPreciosPage />} />
              <Route path="flujo-caja"        element={<FlujoCajaPage />} />
              <Route path="asistente"         element={<AsistenteIAPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
