# RMG Auto Parts — Arquitectura Técnica

## Diagrama de sistemas

```
┌─────────────────────────────────────────────────────────────┐
│                    CANALES DE ENTRADA                        │
│  Meta Ads ──┐  Google Ads ──┐  WhatsApp ──┐  Web directa   │
└────────────┼──────────────┼──────────────┼────────────────┘
             │              │              │
             ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND — React 18 + Vite                      │
│  Render Static Site · HTTPS · CDN global                    │
│                                                             │
│  /dashboard    → KPIs en tiempo real                        │
│  /pipeline     → Kanban CRM (FunnelOS)                      │
│  /cotizaciones → Cotizador B2B con precios por segmento     │
│  /catalogo     → SKUs KUMHO · AUSTER · YOKO G&B             │
│  /whatsapp     → Consola Bot RMG                            │
│  /inventario   → Stock · alertas · movimientos              │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS REST + JSON
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND — Node.js + Express                     │
│  Render Web Service · Auto-scale · Health check             │
│                                                             │
│  /api/auth         → JWT · roles · Supabase Auth            │
│  /api/productos    → Catálogo · precios por segmento        │
│  /api/cotizaciones → CRUD · PDF · envío WA/email            │
│  /api/pipeline     → CRM · etapas · actividades             │
│  /api/pedidos      → ERP · stock · despacho                 │
│  /api/whatsapp     → Webhook Meta · Bot conversacional      │
│  /api/meta         → Webhook Meta Ads · pixel tracking      │
│  /api/dashboard    → Agregaciones · KPIs tiempo real        │
└─────────────────────────┬───────────────────────────────────┘
                          │ Supabase JS SDK
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              DATABASE — Supabase (PostgreSQL)                │
│                                                             │
│  Tablas principales:                                        │
│  ├─ usuarios          → Roles: admin/ventas/bodega          │
│  ├─ clientes          → 4 segmentos · pipeline · crédito    │
│  ├─ productos         → SKUs · precios diferenciados        │
│  ├─ cotizaciones      → + cotizacion_items                  │
│  ├─ pedidos           → ERP · estados · despacho            │
│  ├─ actividades_pipeline → historial CRM                   │
│  ├─ movimientos_stock → trazabilidad inventario             │
│  └─ mensajes_whatsapp → conversaciones Bot RMG              │
│                                                             │
│  Row Level Security (RLS) activado                         │
│  Realtime habilitado (dashboard live)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                        ▼
┌─────────────────┐     ┌─────────────────────────────────────┐
│  META CLOUD API  │     │          SERVICIOS EXTERNOS          │
│                  │     │                                      │
│  WhatsApp WABA   │     │  SendGrid → Emails cotizaciones      │
│  → Webhook POST  │     │  Google Ads API → Campañas          │
│  → Bot mensajes  │     │  Meta Ads API → Campañas + Pixel    │
│                  │     │  Supabase Storage → PDFs facturas   │
│  Meta Ads        │     │                                      │
│  → Pixel eventos │     └─────────────────────────────────────┘
│  → Conversiones  │
└─────────────────┘
```

---

## Decisiones de arquitectura

### ¿Por qué Render y no Vercel/AWS?

Render permite backend Node.js real con WebSockets y procesos background en el plan gratuito. Para el Bot WhatsApp (webhook persistente 24/7) es necesario un servidor real, no funciones serverless.

### ¿Por qué Supabase y no MongoDB?

Los datos de RMG son relacionales: cliente → cotizaciones → items → productos. Las relaciones con FK y el Row Level Security de Supabase simplifican la seguridad multi-usuario (vendedor solo ve sus clientes). Además, el dashboard en tiempo real usa Supabase Realtime sin código adicional.

### ¿Por qué Zustand y no Redux?

Para la escala actual (operación unipersonal → equipo pequeño), Zustand es suficiente y elimina 80% del boilerplate. React Query maneja el estado del servidor (caché, refetch, optimistic updates).

---

## Escalabilidad futura

| Hito | Acción requerida |
|------|-----------------|
| +5 vendedores | Agregar roles en Supabase · Sin cambio arquitectura |
| +2 bodegas | Columna `bodega_id` en movimientos_stock · Ya preparado |
| App móvil | Backend API ya es REST · Solo agregar React Native |
| Facturación electrónica | Integrar API SII con endpoint /api/dte |
| Multi-empresa | Agregar `empresa_id` como tenant ID |

---

## Seguridad

- JWT con expiración 7 días + refresh
- Rate limiting: 200 req/15min general · 10 req/15min para auth
- Helmet.js: headers de seguridad HTTP
- Supabase RLS: cada usuario solo accede a sus datos
- Variables sensibles solo en Render Environment (nunca en código)
- Webhook Meta verificado con `hub.verify_token`

---

*RMG Auto Parts · Arquitectura v1.0 · Junio 2026*
