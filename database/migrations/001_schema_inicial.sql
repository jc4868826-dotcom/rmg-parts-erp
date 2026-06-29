-- ============================================================
-- RMG Auto Parts — Esquema de base de datos
-- PostgreSQL · Supabase · v1.0.0 · 2026
-- ============================================================

-- ─── EXTENSIONES ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsqueda de texto

-- ─── ENUMS ───────────────────────────────────────────────────
CREATE TYPE segmento_cliente AS ENUM ('taller', 'flota', 'concesionario', 'construccion');
CREATE TYPE etapa_pipeline AS ENUM ('prospecto', 'contactado', 'cotizado', 'negociando', 'cliente');
CREATE TYPE estado_cotizacion AS ENUM ('borrador', 'enviada', 'aprobada', 'rechazada', 'vencida');
CREATE TYPE estado_pedido AS ENUM ('pendiente', 'confirmado', 'en_preparacion', 'despachado', 'entregado', 'anulado');
CREATE TYPE categoria_producto AS ENUM ('bateria', 'lubricante', 'neumatico', 'grasa', 'filtro', 'refrigerante', 'otro');
CREATE TYPE tipo_usuario AS ENUM ('admin', 'ventas', 'bodega', 'cliente');

-- ─── TABLA: usuarios ─────────────────────────────────────────
CREATE TABLE usuarios (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  nombre        VARCHAR(255) NOT NULL,
  telefono      VARCHAR(20),
  rol           tipo_usuario DEFAULT 'ventas',
  activo        BOOLEAN DEFAULT true,
  ultimo_acceso TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: clientes ─────────────────────────────────────────
CREATE TABLE clientes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  razon_social      VARCHAR(255) NOT NULL,
  rut               VARCHAR(20) UNIQUE,
  segmento          segmento_cliente NOT NULL,
  etapa_pipeline    etapa_pipeline DEFAULT 'prospecto',
  contacto_nombre   VARCHAR(255),
  contacto_cargo    VARCHAR(100),   -- "Jefe de taller", "Jefe de mantención"
  telefono          VARCHAR(20),
  whatsapp          VARCHAR(20),
  email             VARCHAR(255),
  direccion         VARCHAR(255),
  comuna            VARCHAR(100),
  giro              VARCHAR(255),
  credito_activo    BOOLEAN DEFAULT false,
  dias_credito      INTEGER DEFAULT 0, -- 0 = contado, 30 = crédito
  limite_credito    DECIMAL(15, 0) DEFAULT 0,
  saldo_pendiente   DECIMAL(15, 0) DEFAULT 0,
  vendedor_id       UUID REFERENCES usuarios(id),
  notas             TEXT,
  activo            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: productos (catálogo RMG) ─────────────────────────
CREATE TABLE productos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo          VARCHAR(50) UNIQUE NOT NULL,    -- 244635, 7000001, etc.
  marca           VARCHAR(100) NOT NULL,          -- KUMHO, AUSTER, YOKO G&B
  descripcion     VARCHAR(500) NOT NULL,
  categoria       categoria_producto NOT NULL,
  unidad          VARCHAR(50) DEFAULT 'unidad',   -- unidad, caja 6u, bidón, tarro
  precio_costo    DECIMAL(12, 2) NOT NULL,        -- Precio de compra RMG
  precio_b2b_base DECIMAL(12, 2) NOT NULL,        -- Precio mayorista B2B base
  -- Precios diferenciados por segmento (NULL = usa precio_b2b_base)
  precio_taller   DECIMAL(12, 2),
  precio_flota    DECIMAL(12, 2),
  precio_concesionario DECIMAL(12, 2),
  precio_construccion  DECIMAL(12, 2),
  margen_objetivo DECIMAL(5, 2) DEFAULT 30.00,   -- % margen objetivo
  stock_actual    INTEGER DEFAULT 0,
  stock_minimo    INTEGER DEFAULT 5,
  activo          BOOLEAN DEFAULT true,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: cotizaciones ─────────────────────────────────────
CREATE TABLE cotizaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero          VARCHAR(20) UNIQUE NOT NULL,    -- COT-2026-001
  cliente_id      UUID REFERENCES clientes(id),
  estado          estado_cotizacion DEFAULT 'borrador',
  vendedor_id     UUID REFERENCES usuarios(id),
  -- Totales
  neto            DECIMAL(15, 0) DEFAULT 0,
  iva             DECIMAL(15, 0) DEFAULT 0,
  total           DECIMAL(15, 0) DEFAULT 0,
  -- Condiciones
  condicion_pago  VARCHAR(100) DEFAULT 'Contado',
  plazo_entrega   VARCHAR(100) DEFAULT '4–24 horas RM',
  validez_dias    INTEGER DEFAULT 7,
  -- Origen del lead
  canal_origen    VARCHAR(50),  -- 'whatsapp' | 'web' | 'presencial' | 'meta_ads' | 'google_ads'
  notas           TEXT,
  pdf_url         VARCHAR(500),
  enviada_at      TIMESTAMPTZ,
  aprobada_at     TIMESTAMPTZ,
  vence_at        TIMESTAMPTZ GENERATED ALWAYS AS (created_at + (validez_dias || ' days')::INTERVAL) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: cotizacion_items ──────────────────────────────────
CREATE TABLE cotizacion_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cotizacion_id   UUID REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES productos(id),
  cantidad        INTEGER NOT NULL,
  precio_unitario DECIMAL(12, 2) NOT NULL,
  descuento_pct   DECIMAL(5, 2) DEFAULT 0,
  subtotal        DECIMAL(15, 0) GENERATED ALWAYS AS (
    ROUND(cantidad * precio_unitario * (1 - descuento_pct / 100))
  ) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: pedidos ──────────────────────────────────────────
CREATE TABLE pedidos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero          VARCHAR(20) UNIQUE NOT NULL,    -- PED-2026-001
  cotizacion_id   UUID REFERENCES cotizaciones(id),
  cliente_id      UUID REFERENCES clientes(id),
  estado          estado_pedido DEFAULT 'pendiente',
  vendedor_id     UUID REFERENCES usuarios(id),
  neto            DECIMAL(15, 0) NOT NULL,
  iva             DECIMAL(15, 0) NOT NULL,
  total           DECIMAL(15, 0) NOT NULL,
  condicion_pago  VARCHAR(100),
  direccion_entrega VARCHAR(255),
  fecha_entrega_programada DATE,
  fecha_entrega_real DATE,
  guia_despacho   VARCHAR(50),
  factura_numero  VARCHAR(50),
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: actividades_pipeline ─────────────────────────────
CREATE TABLE actividades_pipeline (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id  UUID REFERENCES clientes(id) ON DELETE CASCADE,
  tipo        VARCHAR(50) NOT NULL,  -- 'visita' | 'llamada' | 'whatsapp' | 'email' | 'cotizacion'
  descripcion TEXT,
  resultado   VARCHAR(100),
  proxima_accion VARCHAR(255),
  fecha_proxima  DATE,
  usuario_id  UUID REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: movimientos_stock ────────────────────────────────
CREATE TABLE movimientos_stock (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id     UUID REFERENCES productos(id),
  tipo            VARCHAR(20) NOT NULL,  -- 'entrada' | 'salida' | 'ajuste'
  cantidad        INTEGER NOT NULL,
  stock_anterior  INTEGER NOT NULL,
  stock_nuevo     INTEGER NOT NULL,
  motivo          VARCHAR(255),
  referencia_id   UUID,  -- pedido_id o compra_id
  usuario_id      UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: mensajes_whatsapp ────────────────────────────────
CREATE TABLE mensajes_whatsapp (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wa_message_id   VARCHAR(255) UNIQUE,
  telefono        VARCHAR(20) NOT NULL,
  cliente_id      UUID REFERENCES clientes(id),
  direccion       VARCHAR(10) NOT NULL,  -- 'entrante' | 'saliente'
  tipo            VARCHAR(20),           -- 'text' | 'interactive' | 'template'
  contenido       TEXT,
  estado          VARCHAR(20) DEFAULT 'enviado',
  sesion_data     JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ÍNDICES ─────────────────────────────────────────────────
CREATE INDEX idx_clientes_segmento ON clientes(segmento);
CREATE INDEX idx_clientes_etapa ON clientes(etapa_pipeline);
CREATE INDEX idx_clientes_rut ON clientes(rut);
CREATE INDEX idx_productos_codigo ON productos(codigo);
CREATE INDEX idx_productos_categoria ON productos(categoria);
CREATE INDEX idx_productos_marca ON productos(marca);
CREATE INDEX idx_productos_descripcion ON productos USING gin(descripcion gin_trgm_ops);
CREATE INDEX idx_cotizaciones_cliente ON cotizaciones(cliente_id);
CREATE INDEX idx_cotizaciones_estado ON cotizaciones(estado);
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_mensajes_telefono ON mensajes_whatsapp(telefono);

-- ─── ROW LEVEL SECURITY (Supabase) ───────────────────────────
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

-- Admin ve todo
CREATE POLICY "admin_todo" ON clientes FOR ALL USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY "admin_todo_productos" ON productos FOR ALL USING (auth.jwt() ->> 'rol' = 'admin');

-- Ventas ve sus propios clientes
CREATE POLICY "ventas_propios" ON clientes FOR SELECT
  USING (vendedor_id::text = auth.uid()::text OR auth.jwt() ->> 'rol' = 'admin');

-- ─── FUNCIÓN: actualizar updated_at automáticamente ──────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas principales
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_productos_updated_at BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cotizaciones_updated_at BEFORE UPDATE ON cotizaciones FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pedidos_updated_at BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── FUNCIÓN: actualizar stock en pedido ─────────────────────
CREATE OR REPLACE FUNCTION actualizar_stock_pedido()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'confirmado' AND OLD.estado != 'confirmado' THEN
    -- Descontar stock de cada item del pedido
    UPDATE productos p
    SET stock_actual = stock_actual - ci.cantidad
    FROM cotizacion_items ci
    WHERE ci.cotizacion_id = NEW.cotizacion_id
      AND ci.producto_id = p.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_pedido AFTER UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION actualizar_stock_pedido();
