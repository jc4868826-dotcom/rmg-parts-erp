# RMG Auto Parts — Guía Meta: WhatsApp + Ads

## Lo que necesitas tener ANTES de crear cuenta Meta Business

Esta guía detalla el orden correcto para conectar Meta con el sistema RMG.
La secuencia importa: Meta verifica que tengas un backend real antes de aprobar el acceso a la API de producción.

---

## Checklist previo (todo debe estar ✅ antes de crear la cuenta)

### 1. Infraestructura técnica
- [ ] Backend desplegado en Render con URL pública HTTPS
- [ ] Endpoint `/api/whatsapp/webhook` respondiendo correctamente
- [ ] Endpoint GET devolviendo el `hub.challenge` en < 2 segundos
- [ ] Variables de entorno `META_WEBHOOK_VERIFY_TOKEN` configuradas

### 2. Información legal de RMG
- [ ] RUT de empresa (Rol Único Tributario)
- [ ] Razón social exacta
- [ ] Dirección comercial Santiago RM
- [ ] Email corporativo (no gmail personal)
- [ ] Número de teléfono del negocio (el que será el WABA)
- [ ] Cuenta bancaria para facturación de ads (tarjeta de crédito o débito)

### 3. Número WhatsApp Business
- [ ] Número exclusivo para el negocio (no puede estar en ninguna app WhatsApp activa)
- [ ] Preferiblemente número fijo o línea dedicada
- [ ] Si es celular: hacer portabilidad o comprar chip nuevo

---

## Flujo de creación — Paso a paso

### FASE A: Meta Business Suite

```
1. https://business.facebook.com/overview
   → Create Account
   → Nombre: "RMG Auto Parts"
   → Email corporativo
   → País: Chile

2. Business Settings → Business Info
   → Dirección física completa
   → Número de teléfono negocio
   → Sitio web (puede ser la URL de Render mientras tanto)

3. Business Verification (OBLIGATORIO para API producción)
   → Subir: RUT + Inicio de Actividades SII
   → Tiempo de aprobación: 3–5 días hábiles
```

### FASE B: Meta Developer App

```
1. https://developers.facebook.com
   → My Apps → Create App
   → Type: Business
   → App Name: "RMG Auto Parts"
   → Linked Business: seleccionar RMG Auto Parts

2. Dashboard → Add Products:
   ├─ WhatsApp → Setup
   └─ Meta Pixel → Create Pixel → "RMG Pixel"
```

### FASE C: WhatsApp Business API

```
1. En la App → WhatsApp → Getting Started
   → Add phone number
   → Ingresar número RMG
   → Verificar con SMS o llamada

2. Message Templates (necesario para mensajes salientes first-contact):
   → Crear plantilla: "cotizacion_rmg"
   
   Ejemplo de template aprobado:
   ---
   Hola {{1}}, te enviamos tu cotización RMG Auto Parts N° {{2}}.
   
   Detalle:
   {{3}}
   
   Total: {{4}}
   
   ¿Confirmas el pedido? Responde SÍ para proceder o MODIFICAR para ajustar.
   ---
   
   → Estado: pending review (24–72 hrs Meta)

3. Webhook Configuration:
   → URL: https://rmg-autoparts-backend.onrender.com/api/whatsapp/webhook
   → Verify Token: rmg_webhook_verify_2026
   → Subscribed Fields: messages, message_deliveries, message_reads

4. Pasar a Producción:
   → App Review → Request Advanced Access
   → "whatsapp_business_messaging" permission
   → Completar App Review form (describe caso de uso B2B)
```

### FASE D: Meta Ads (después de Business Verification)

```
1. Meta Business Suite → Ads Manager
   → Create Ad Account
   → Currency: CLP
   → Timezone: America/Santiago
   → Payment: agregar tarjeta

2. Pixel Setup:
   → Events Manager → Connect Data Sources
   → Web → Meta Pixel
   → Instalar en el frontend:
     Agregar a /frontend/src/utils/metaPixel.js (ver archivo en el proyecto)

3. Eventos a trackear:
   → ViewContent (usuario ve un producto)
   → Lead (completa formulario de contacto)
   → Contact (inicia conversación WhatsApp)
   → Purchase (pedido confirmado)

4. Custom Audiences:
   → Talleres que vieron lubricantes (retargeting)
   → Empresas que iniciaron cotización pero no confirmaron

5. Primera campaña:
   → Objetivo: Leads
   → Audiencia: Hombres 30–55 años · Santiago RM · Intereses: mecánica, flotas, repuestos
   → Formato: Lead Form con precarga de WhatsApp
   → Presupuesto inicial: $150.000 CLP/día
   → Copy: "Lubricantes y baterías mayoristas · Entrega mismo día · Precio distribuidor"
```

---

## Costos estimados Meta (mes 1)

| Servicio | Costo |
|----------|-------|
| WhatsApp WABA mensajes template | USD 0.06/conversación (≈ $55 CLP) |
| WhatsApp mensajes de sesión (24h) | USD 0.00 (gratis dentro de ventana) |
| Meta Ads presupuesto mensual | $150.000–$200.000 CLP |
| Meta Developer App | $0 (gratuito) |

**Costo total Meta mes 1:** ~$170.000–$220.000 CLP

---

## Señales de alerta durante el proceso

❌ **Meta pide pago inmediato para verificar** → Es phishing. Meta no cobra verificación.
❌ **El webhook no pasa la verificación** → Revisar que el endpoint GET responde en < 5 seg.
❌ **Template rechazada** → Reescribir sin incluir palabras como "gratis", "promoción", "urgente".
❌ **Limit de mensajes en sandbox** → Normal. En producción el límite sube a 1.000/día en Tier 1.

---

## Soporte oficial

- Meta Business Help: https://www.facebook.com/business/help
- WhatsApp Business Platform docs: https://developers.facebook.com/docs/whatsapp
- Estado de servicios Meta: https://metastatus.com

---

*RMG Auto Parts · Guía Meta · Junio 2026*
*Actualizar después de crear la cuenta con los IDs reales*
