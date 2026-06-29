#!/bin/bash
# ============================================================
# RMG Auto Parts — Setup inicial del proyecto
# Ejecutar una sola vez después de clonar el repo
# ============================================================

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  RMG Auto Parts — Setup inicial      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── 1. Verificar Node.js ─────────────────────────────────
NODE_VERSION=$(node -v 2>/dev/null || echo "no instalado")
echo "Node.js: $NODE_VERSION"
if ! command -v node &> /dev/null; then
  echo "❌ Node.js no instalado. Instalar desde https://nodejs.org (v18+)"
  exit 1
fi
echo "✅ Node.js OK"

# ─── 2. Copiar .env ───────────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "✅ Archivo .env creado desde .env.example"
  echo "⚠️  IMPORTANTE: Editar .env con tus credenciales antes de continuar"
else
  echo "ℹ️  .env ya existe, no se sobreescribió"
fi

# ─── 3. Instalar dependencias ────────────────────────────
echo ""
echo "📦 Instalando dependencias del backend..."
cd backend && npm install && cd ..

echo "📦 Instalando dependencias del frontend..."
cd frontend && npm install && cd ..

echo "✅ Dependencias instaladas"

# ─── 4. Verificar variables de entorno ──────────────────
echo ""
echo "🔍 Verificando variables de entorno críticas..."
source .env 2>/dev/null || true

MISSING=0
for VAR in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY JWT_SECRET; do
  if [ -z "${!VAR}" ]; then
    echo "   ❌ Falta: $VAR"
    MISSING=$((MISSING + 1))
  else
    echo "   ✅ $VAR configurada"
  fi
done

if [ $MISSING -gt 0 ]; then
  echo ""
  echo "⚠️  Hay $MISSING variables faltantes. Edita .env antes de continuar."
  echo "   Ver docs/arquitectura/deploy-render.md para instrucciones"
  exit 0
fi

# ─── 5. Preguntar si hacer seed ──────────────────────────
echo ""
read -p "¿Cargar datos iniciales (SKUs del inventario RMG)? [s/N]: " SEED
if [[ "$SEED" =~ ^[Ss]$ ]]; then
  echo "🌱 Ejecutando seed de productos..."
  node database/seeds/productos.js
  echo "✅ Seed completado"
fi

# ─── 6. Instrucciones finales ────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup completado — Comandos para empezar:            ║"
echo "║                                                          ║"
echo "║  Desarrollo (ambos servidores):                          ║"
echo "║    npm run dev                                           ║"
echo "║                                                          ║"
echo "║  Solo backend:                                           ║"
echo "║    npm run dev:backend   → http://localhost:3001         ║"
echo "║                                                          ║"
echo "║  Solo frontend:                                          ║"
echo "║    npm run dev:frontend  → http://localhost:5173         ║"
echo "║                                                          ║"
echo "║  Para deploy: ver docs/arquitectura/deploy-render.md     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
