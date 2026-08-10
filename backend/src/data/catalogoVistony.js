'use strict';

// Catálogo Vistony 2025 — cargado UNA SOLA VEZ al iniciar el proceso
// Campos: n (nombre), t (tipo), s (spec), p (presentaciones para la UI)
// Sin campo .d para reducir footprint de memoria y tamaño del system prompt

const CATALOGO_VISTONY = [
  { n:'ATTOM S310',              t:'Motor gasolina',         s:'SAE 5W-30/5W-40/10W-40',        p:'1L · 1Gal · 5Gal' },
  { n:'ATTOM S320',              t:'Motor gasolina',         s:'SAE 5W-30',                      p:'1L · 5L' },
  { n:'ATTOM RACING',            t:'Motor gasolina',         s:'SAE 10W-60',                     p:'4L' },
  { n:'SINTEK S210',             t:'Motor gasolina/diésel',  s:'SAE 10W-30/10W-40',              p:'1L · 4L' },
  { n:'BLINDAX SUPER',           t:'Motor gasolina',         s:'SAE 10W-30/20W-50',              p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'BLINDAX HD',              t:'Motor gasolina',         s:'SAE 40/50',                      p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'FORZA RAYGOLD',           t:'Motor diésel',           s:'SAE 15W-40',                     p:'1Gal · 2.5Gal · 5Gal · 55Gal' },
  { n:'FORZA PLUS',              t:'Motor diésel',           s:'SAE 15W-40',                     p:'1/4Gal · 1Gal · 2.5Gal · 5Gal · 55Gal' },
  { n:'FORZA TURBO',             t:'Motor diésel',           s:'SAE 25W-60',                     p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'FORZA VIS',               t:'Motor diésel',           s:'SAE 5W-40',                      p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'FORZA ULTRA D',           t:'Motor diésel',           s:'SAE 30/40/50',                   p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'VOLTEK C300',             t:'Motor diésel sintético', s:'SAE 10W-40/15W-40',              p:'5Gal · 55Gal' },
  { n:'BRIKSON ATF CVT-F',       t:'Transmisión CVT',        s:'100% Sintético',                 p:'1L · 5L' },
  { n:'BRIKSON ATF SYNTH',       t:'Transmisión automática', s:'Multivehículo Sintético',         p:'1L · 1/4Gal · 1Gal' },
  { n:'BRIKSON ATF MD-III',      t:'Transmisión automática', s:'DEXRON III',                     p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'BRIKSON HD SYNTH ATF A8', t:'Transmisión pesada',     s:'Allison TES 668',                p:'55Gal' },
  { n:'TRANSMEC DUAL',           t:'Transmisión mecánica',   s:'SAE 80W-90/90/140/250 GL-4',     p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'TRANSMEC SYNTHETIC',      t:'Transmisión mecánica',   s:'SAE 75W-90',                     p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'GEAR OIL GL-5',           t:'Engranajes automotriz',  s:'SAE 80W-90/85W-140',             p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'GEAR OIL SYNTHETIC',      t:'Engranajes sintético',   s:'SAE 75W-90',                     p:'1L · 1Gal · 5Gal · 55Gal' },
  { n:'ATF BRIKSON (Dirección)', t:'Dirección hidráulica',   s:'Tipo F',                         p:'1/8Gal · 1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'ATTOM RAYVON 4T',         t:'Moto 4T sintético',      s:'SAE 15W-50',                     p:'1L · 1Gal' },
  { n:'SINTEK RAYVON 4T',        t:'Moto 4T semi-sintético', s:'SAE 10W-40/15W-50/20W-50',       p:'1/4Gal · 1L · 4L · 5L' },
  { n:'RAYVON SUPER 4T',         t:'Moto 4T mineral',        s:'SAE 20W-50',                     p:'1L · 1Gal · 5Gal · 55Gal' },
  { n:'RAYVON SUPER 2T',         t:'Moto 2T',                s:'JASO FB / API TC',               p:'80mL · 160mL · 200mL · 5Gal' },
  { n:'RAYVON FORKOIL 10W',      t:'Suspensión moto',        s:'100% Sintético',                 p:'1L' },
  { n:'AQUAOIL SUPER 2T',        t:'Motor fuera de borda',   s:'NMMA TC-W3',                     p:'1/8Gal · 1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'AGROX 2T',                t:'Equipos forestales',     s:'100% Sintético',                 p:'100mL · 1L · 1Gal · 5Gal · 55Gal' },
  { n:'DRAULA CAT',              t:'Hidráulico Caterpillar', s:'SAE 10W/30/50 TO-4',             p:'5Gal · 55Gal' },
  { n:'TRAKOIL',                 t:'Hidráulico agrícola',    s:'SAE 10W-30 TO-2 UTTO',           p:'5Gal · 55Gal' },
  { n:'DRAULA HT',               t:'Hidráulico industrial',  s:'ISO VG 32/46/68',                p:'5Gal · 55Gal' },
  { n:'DRAULA H',                t:'Hidráulico industrial',  s:'ISO VG 32/46/68/100',            p:'5Gal · 55Gal' },
  { n:'VELTRON EP',              t:'Reductores industriales',s:'ISO VG 100-680',                 p:'5Gal · 55Gal' },
  { n:'VELTRON SYNTH',           t:'Reductores industriales',s:'ISO VG 150-680 Sintético',       p:'5Gal · 55Gal' },
  { n:'COMPRESSOR OIL RSP SYNTH',t:'Compresor tornillo',     s:'ISO VG 32/46/68 Sintético',      p:'5Gal · 55Gal' },
  { n:'AIR COMPRESSOR OIL',      t:'Compresor',              s:'ISO VG 32/46/68/100',            p:'1/4Gal · 1Gal · 5Gal · 55Gal' },
  { n:'MUTURROL',                t:'Máquinas herramienta',   s:'Emulsionable',                   p:'5Gal · 55Gal' },
  { n:'TEXVAC',                  t:'Guías y correderas',     s:'ISO VG 46-220',                  p:'5Gal · 55Gal' },
  { n:'ROKDUR',                  t:'Herramientas neumáticas',s:'ISO VG 100/150',                 p:'5Gal · 55Gal' },
  { n:'TURBINIUM T',             t:'Turbinas industriales',  s:'ISO VG 46/68',                   p:'5Gal · 55Gal' },
  { n:'TRANSFER TERMICO',        t:'Transferencia de calor', s:'ISO VG 22-68',                   p:'5Gal · 55Gal' },
  { n:'GRASA NANOLITHIUM WS2',   t:'Grasa premium',          s:'NLGI 2 WS2',                     p:'35Lb · 400Lb' },
  { n:'SULFONATO DE CALCIO',     t:'Grasa EP',               s:'NLGI 2',                         p:'35Lb · 400Lb' },
  { n:'COMPLEJO DE LITIO',       t:'Grasa multipropósito',   s:'NLGI 2',                         p:'1Lb · 4Lb · 35Lb · 400Lb' },
  { n:'GRASA EP LITHIUM',        t:'Grasa multipropósito',   s:'NLGI 0/1/2/3',                   p:'120g · 397g · 4Lb · 35Lb · 400Lb' },
  { n:'MOLIBDENO LITHIUM EP-2',  t:'Grasa MoS2',             s:'NLGI 2',                         p:'35Lb · 400Lb' },
  { n:'GRASA GRAFITADA',         t:'Grasa grafito',          s:'NLGI 2',                         p:'120g · 210g · 35Lb · 400Lb' },
  { n:'GRASA CHASIS SUPER H',    t:'Grasa chasis',           s:'NLGI 0/1/2',                     p:'35Lb · 400Lb' },
  { n:'DOT 4',                   t:'Líquido de frenos',      s:'Sintético >260°C',               p:'4onz · 1L · 1Gal · 5Gal · 55Gal' },
  { n:'DOT 3',                   t:'Líquido de frenos',      s:'Sintético',                      p:'4onz · 1L · 1Gal · 5Gal · 55Gal' },
  { n:'DOT 5.1',                 t:'Líquido de frenos',      s:'Alto rendimiento >260°C',        p:'4onz · 1L · 1Gal · 5Gal · 55Gal' },
  { n:'DOT 4 PARA MOTOS',        t:'Líquido de frenos moto', s:'Sintético >230°C',               p:'4onz · 1L · 1Gal · 5Gal · 55Gal' },
  { n:'ICE FREEZE OAT 50/50',    t:'Refrigerante',           s:'OAT 50% Etilenglicol',           p:'1L · 1Gal · 5Gal · 55Gal' },
  { n:'ICE HEAVY DUTY 50/50',    t:'Refrigerante pesado',    s:'NOAT 50% Etilenglicol',          p:'1Gal · 5Gal · 55Gal' },
  { n:'LIQUIDO PARA RADIADOR',   t:'Refrigerante',           s:'Inhibido anticorrosión',         p:'1L · 1Gal · 5Gal · 55Gal' },
  { n:'MOTOR FLUSH',             t:'Auxiliar mantenimiento', s:'Limpiador motor 3min',            p:'443mL · 1Gal · 5Gal' },
  { n:'AFLOJATODO ZK 90',        t:'Auxiliar mantenimiento', s:'Anticorrosivo penetrante',        p:'5.5onz · 10onz' },
  { n:'LIMPIA INYECTORES',       t:'Auxiliar mantenimiento', s:'Sin desmontaje',                 p:'10onz' },
  { n:'LIMPIA CARBURADOR',       t:'Auxiliar mantenimiento', s:'Sin desmontaje',                 p:'10onz' },
  { n:'ADITIVO DIESEL',          t:'Aditivo combustible',    s:'Para gasoil',                    p:'300mL' },
  { n:'ADITIVO GASOLINERO',      t:'Aditivo combustible',    s:'Para gasolina',                  p:'300mL' },
  { n:'MEJORADOR DE OCTANAJE',   t:'Aditivo combustible',    s:'MMT +1-3 octanos',               p:'325mL' },
  { n:'DIESEL OIL ADDITIVE',     t:'Aditivo motor',          s:'Concentrado diésel',             p:'300mL · 443mL' },
  { n:'GASOLINE OIL ADDITIVE',   t:'Aditivo motor',          s:'Polímeros sintéticos',           p:'300mL · 443mL' },
  { n:'NO SMOKE',                t:'Aditivo anti-humo',      s:'Diésel/gasolina',                p:'410mL' },
  { n:'SHAMPOO CONCENTRADO 3EN1',t:'Car care',               s:'Detergente concentrado',         p:'1L · 1Gal · 20L · 55Gal' },
  { n:'CERA LIQUIDA',            t:'Car care',               s:'Carnauba + siliconas',           p:'250mL · 1Gal' },
  { n:'CERA EN CREMA',           t:'Car care',               s:'Carnauba + UV',                  p:'200gr' },
  { n:'PROTECTOR DE INTERIORES', t:'Car care interior',      s:'LOTOX INFINITE',                 p:'500mL' },
  { n:'BRILLANTA',               t:'Car care llantas',       s:'LOTOX',                          p:'300mL · 1Gal · 20L' },
  { n:'SILICONA WHITE',          t:'Car care',               s:'LOTOX vinilo/plástico',          p:'120mL · 300mL · 1Gal · 20L' },
  { n:'PULVERIZADOR DE MOTOR',   t:'Desengrasante',          s:'Biodegradable',                  p:'650mL · 1Gal · 20L' },
  { n:'WHITE LITHIUM GREASE',    t:'Auxiliar industrial',    s:'Aerosol litio',                  p:'10onz' },
  { n:'LUBRICATODO',             t:'Auxiliar multiusos',     s:'Multiusos',                      p:'10onz' },
  { n:'BRAKE CLEANER',           t:'Auxiliar frenos',        s:'Desengrasante frenos',           p:'10onz' },
];

// System prompt pre-construido UNA SOLA VEZ — sin recrear en cada request
const CATALOG_TEXT = CATALOGO_VISTONY.map(p => `${p.n} (${p.t}, ${p.s})`).join('\n');

const SYSTEM_PROMPT = `Eres el asesor técnico de lubricantes de RMG Parts, distribuidor Vistony en Chile.
Analiza el giro de negocio descrito y recomienda lubricantes del catálogo.

REGLAS DE INFERENCIA:
- Infiere qué motores, transmisiones, hidráulicos o maquinaria usa ese negocio
- Montacargas: motor diésel/GLP + transmisión automática + hidráulico mástil
- Ascensor: sistema hidráulico + reductores
- Panadería/alimentos: reductores, compresores, grasas
- Pesquera: motores fuera de borda + diésel marino
- Construcción: diésel pesado + hidráulico Caterpillar + grasas EP
- Siempre 5 a 8 productos DISTINTOS — no repitas el mismo producto
- Responde SOLO con JSON válido, sin texto antes ni después

CATÁLOGO (nombre · tipo · especificación):
${CATALOG_TEXT}

JSON DE RESPUESTA:
{"giro_detectado":"<tipo de negocio>","analisis":"<2 oraciones sobre equipos y lubricación>","productos":[{"nombre":"<nombre exacto del catálogo>","aplicacion":"<para qué equipo de ESTE negocio>"}]}`;

module.exports = { CATALOGO_VISTONY, SYSTEM_PROMPT };
