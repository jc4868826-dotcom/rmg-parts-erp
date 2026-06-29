# RMG Auto Parts — Plataforma B2B

> Distribución mayorista automotriz · Santiago RM · 2026

## Visión del producto

Plataforma digital B2B para RMG Auto Parts que integra catálogo mayorista, gestión de clientes, cotizaciones en línea y automatización de ventas. Diseñada para operar con **4 segmentos**: Talleres · Flotas · Concesionarios · Construcción.

Meta: **$20.000.000 CLP/mes** · 29 clientes activos iniciales.

---

## Stack tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Frontend | React 18 + Vite | SPA rápida, fácil deploy en Render |
| Styling | Tailwind CSS + CSS Variables | Design system del V6 preservado |
| Backend | Node.js + Express | API REST liviana, deploy simple |
| Base de datos | PostgreSQL (Supabase) | Gratuita, escalable, tiempo real |
| Autenticación | Supabase Auth | JWT + roles por segmento |
| Deploy | Render.com | GitHub Actions → auto-deploy |
| Ads | Meta Ads API + Google Ads API | Integración campañas digitales |
| WhatsApp | Meta Cloud API (WABA) | Bot cotizaciones automáticas |

---

## Estructura del proyecto

```
RMG_Parts_Project/
├── frontend/               # React App (cliente B2B)
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── ui/         # Botones, cards, inputs, badges
│       │   ├── layout/     # Header, Sidebar, Footer
│       │   └── modules/    # CRM, ERP, Bot, Dashboard
│       ├── pages/          # Vistas principales
│       ├── hooks/          # Custom React hooks
│       ├── context/        # Auth, Cart, Notifications
│       └── utils/          # Formateo CLP, cálculos margen
│
├── backend/                # API REST Node.js
│   ├── src/
│   │   ├── routes/         # Endpoints por dominio
│   │   ├── controllers/    # Lógica de negocio
│   │   ├── models/         # Esquemas Supabase/Postgres
│   │   ├── middleware/     # Auth, Rate limit, Logging
│   │   └── services/       # WhatsApp, Meta Ads, Email
│   └── config/             # Variables entorno
│
├── database/
│   ├── migrations/         # Esquema incremental
│   └── seeds/              # Datos iniciales (SKUs, segmentos)
│
├── docs/
│   ├── arquitectura/       # Diagramas técnicos
│   ├── marca/              # Design system RMG
│   └── negocio/            # Modelo Q×P, segmentos
│
├── scripts/                # Setup, deploy, seed
├── .github/workflows/      # CI/CD GitHub Actions
└── docker-compose.yml      # Entorno local completo
```

---

## Módulos del sistema (RMG OS)

| # | Módulo | Descripción |
|---|--------|-------------|
| 01 | **FunnelOS** | Pipeline CRM · cartera · comisiones progresivas |
| 02 | **ERP Core** | Inventario · notas de venta · facturación · CxC |
| 03 | **Bot RMG** | WhatsApp · cotización automática · pedido→ERP |
| 04 | **Compras** | OC automática · recepción · proveedores · CxP |
| 05 | **Bodegas** | Stock real · traspasos · alertas de mínimo |
| 06 | **Gastos** | Caja diaria · categorías · rendición |
| 07 | **Dashboard** | KPIs tiempo real · tablero gerencial |

---

## Segmentos y metas

| Segmento | Clientes | Meta mensual | Ticket prom. | Ciclo |
|----------|----------|-------------|-------------|-------|
| Talleres | 22 | $8.000.000 | $363.000 | 3–7 días |
| Flotas | 4 | $6.000.000 | $1.500.000 | 30–60 días |
| Concesionarios | 2 | $4.000.000 | $2.000.000 | 45–90 días |
| Construcción | 1 | $2.000.000 | $2.000.000 | 30–60 días |
| **TOTAL** | **29** | **$20.000.000** | **$690.000** | — |

---

## Quick start (desarrollo local)

```bash
# 1. Clonar repo
git clone https://github.com/TU_USUARIO/rmg-autoparts.git
cd rmg-autoparts

# 2. Variables de entorno
cp .env.example .env
# Editar .env con tus credenciales Supabase, Meta, Google

# 3. Instalar dependencias
npm install
cd frontend && npm install && cd ..

# 4. Base de datos
npm run db:migrate
npm run db:seed

# 5. Levantar todo
npm run dev         # Backend en :3001
cd frontend && npm run dev  # Frontend en :5173
```

---

## Deploy en Render

Ver guía completa en `docs/arquitectura/deploy-render.md`

**Flujo:** Push a `main` → GitHub Actions → Build → Deploy automático Render

---

## Canales de adquisición integrados

- **Meta Ads** → Campañas talleres RM ($150K–$200K/mes)
- **Google Ads** → Keywords mayoristas ($120K–$150K/mes)  
- **WhatsApp Business API** → Bot cotización + seguimiento
- **LinkedIn** → Prospección flotas y concesionarios (orgánico)

---

*RMG Auto Parts · Gerencia General · Santiago RM · 2026*
