# RMG Auto Parts — Guía de Deploy en Render

## Paso 1: Preparar GitHub

```bash
# En tu máquina local, desde la carpeta del proyecto
cd RMG_Parts_Project

git init
git add .
git commit -m "feat: estructura inicial RMG Auto Parts v1.0"

# Crear repo en github.com → New Repository → rmg-autoparts
git remote add origin https://github.com/TU_USUARIO/rmg-autoparts.git
git branch -M main
git push -u origin main
```

---

## Paso 2: Configurar Supabase

1. Ir a https://supabase.com → New Project → **rmg-autoparts**
2. Anotar: `Project URL` y `anon key` y `service_role key`
3. Ir a **SQL Editor** → pegar y ejecutar:
   - `database/migrations/001_schema_inicial.sql`
4. Ir a **Table Editor** → verificar que las tablas se crearon
5. Activar **Realtime** en las tablas: `pedidos`, `cotizaciones`, `mensajes_whatsapp`

---

## Paso 3: Deploy Backend en Render

1. Ir a https://render.com → New → **Web Service**
2. Conectar GitHub → seleccionar `rmg-autoparts`
3. Configurar:
   ```
   Name:        rmg-autoparts-backend
   Root Dir:    backend
   Build Cmd:   npm install
   Start Cmd:   node src/app.js
   Plan:        Free (o Starter $7/mes para no dormir)
   ```
4. **Environment Variables** → agregar todas las del `.env.example`:
   - `NODE_ENV=production`
   - `SUPABASE_URL=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
   - `JWT_SECRET=...` (generar uno largo y aleatorio)
   - `META_WHATSAPP_TOKEN=...` (después del Paso 5)
   - `META_WEBHOOK_VERIFY_TOKEN=rmg_webhook_verify_2026`
5. Deploy → copiar la URL: `https://rmg-autoparts-backend.onrender.com`

---

## Paso 4: Deploy Frontend en Render

1. Render → New → **Static Site**
2. Configurar:
   ```
   Name:        rmg-autoparts-frontend
   Root Dir:    frontend
   Build Cmd:   npm install && npm run build
   Publish Dir: dist
   ```
3. **Environment Variables**:
   ```
   VITE_API_URL=https://rmg-autoparts-backend.onrender.com
   VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
4. **Redirects/Rewrites** (para React Router):
   ```
   Source: /*
   Dest:   /index.html
   Action: Rewrite
   ```
5. Deploy → copiar URL: `https://rmg-autoparts-frontend.onrender.com`

---

## Paso 5: Conectar Meta (WhatsApp Business API)

> **IMPORTANTE: Hacer esto DESPUÉS de tener el backend en Render con URL pública.**

### 5.1 Crear Meta App

1. Ir a https://developers.facebook.com → **My Apps** → Create App
2. **Business** → Next
3. Nombre: `RMG Auto Parts`
4. Business Account → seleccionar o crear la de RMG

### 5.2 Agregar WhatsApp

1. En el dashboard de la app → **Add a Product** → **WhatsApp**
2. Seguir wizard:
   - Conectar Business Account
   - Agregar número de teléfono RMG
   - Verificar número con código SMS
3. Anotar:
   - `Phone Number ID`
   - `Access Token` (permanente, no el temporal)

### 5.3 Configurar Webhook

1. WhatsApp → Configuration → **Webhooks**
2. Callback URL: `https://rmg-autoparts-backend.onrender.com/api/whatsapp/webhook`
3. Verify token: `rmg_webhook_verify_2026`
4. Click **Verify and Save**
5. Suscribir a: `messages`, `message_deliveries`, `message_reads`

### 5.4 Agregar tokens a Render

```
META_WHATSAPP_PHONE_ID=   → el Phone Number ID
META_WHATSAPP_TOKEN=      → el Access Token permanente
META_WEBHOOK_VERIFY_TOKEN=rmg_webhook_verify_2026
```

Redeploy backend después de agregar las variables.

---

## Paso 6: Configurar GitHub Actions (CI/CD)

En el repo de GitHub → **Settings** → **Secrets and variables** → **Actions**:

```
VITE_API_URL=                   → URL del backend en Render
VITE_SUPABASE_URL=              → URL de Supabase
VITE_SUPABASE_ANON_KEY=         → Clave anónima de Supabase
RENDER_API_KEY=                 → Render → Account Settings → API Keys
RENDER_BACKEND_SERVICE_ID=      → Render → Backend service → Settings → Service ID
RENDER_FRONTEND_SERVICE_ID=     → Render → Frontend service → Settings → Service ID
RMG_WHATSAPP=                   → Número WhatsApp con código país (ej: 56912345678)
```

Desde ahora, cada `git push` a `main` despliega automáticamente.

---

## Paso 7: Seed inicial de datos

Desde tu máquina local, con las variables de entorno configuradas:

```bash
cd backend
node ../database/seeds/productos.js
```

Esto carga los ~35 productos del inventario real de RMG (YOKO G&B · AUSTER · KUMHO · DOUBLE STAR).

---

## URLs finales

| Servicio | URL |
|----------|-----|
| Frontend (sistema) | https://rmg-autoparts-frontend.onrender.com |
| Backend (API) | https://rmg-autoparts-backend.onrender.com |
| Supabase Dashboard | https://app.supabase.com |
| Meta Developers | https://developers.facebook.com |
| GitHub Repo | https://github.com/TU_USUARIO/rmg-autoparts |

---

## Dominio personalizado (opcional)

Si tienes `rmgautoparts.cl`:
1. Render → Frontend service → **Custom Domain** → Agregar `rmgautoparts.cl`
2. En tu registrador de dominio (NIC Chile), agregar CNAME:
   ```
   CNAME  rmgautoparts.cl  →  rmg-autoparts-frontend.onrender.com
   ```

---

*RMG Auto Parts · Guía de Deploy · Junio 2026*
