'use strict';
const express = require('express');
const router  = express.Router();

const CATALOG = [
  {n:"ATTOM S310",t:"Motor gasolina",s:"SAE 5W-30/5W-40/10W-40",d:"Premium 100% sintético con Starpoly. Para vehículos modernos turbocargados con inyección electrónica. Protección desde el arranque, ahorro combustible.",p:"1L · 1Gal · 5Gal"},
  {n:"ATTOM S320",t:"Motor gasolina",s:"SAE 5W-30",d:"100% sintético para motores de última generación con convertidores catalíticos (TWC). Reduce emisiones, excelente arranque frío.",p:"1L · 5L"},
  {n:"ATTOM RACING",t:"Motor gasolina",s:"SAE 10W-60",d:"100% sintético base Ester para motores de competencia. Máxima presión en altas RPM.",p:"4L"},
  {n:"SINTEK S210",t:"Motor gasolina/diésel",s:"SAE 10W-30/10W-40",d:"Semi-sintético para motores gasolina con inyección y diésel livianos. Cumple ACEA europeo.",p:"1L · 4L"},
  {n:"BLINDAX SUPER",t:"Motor gasolina",s:"SAE 10W-30/20W-50",d:"Multigrado superior para autos, camionetas SUV, Pick Up. Bajo azufre, protege catalizadores.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"BLINDAX HD",t:"Motor gasolina",s:"SAE 40/50",d:"Monogrado API SL/CF. Protección contra corrosión y herrumbre.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"FORZA RAYGOLD",t:"Motor diésel",s:"SAE 15W-40",d:"Multigrado para diésel moderno con DOC, SCR, EGR, DPF. Ultra protección antidesgaste en anillos y camisas.",p:"1Gal · 2.5Gal · 5Gal · 55Gal"},
  {n:"FORZA PLUS",t:"Motor diésel",s:"SAE 15W-40",d:"Premium para diésel turbocargado con EGR. Previene bloqueo filtros, alto TBN, control hollín.",p:"1/4Gal · 1Gal · 2.5Gal · 5Gal · 55Gal"},
  {n:"FORZA TURBO",t:"Motor diésel",s:"SAE 25W-60",d:"Alta viscosidad mineral para condiciones severas. Estabilidad térmica, control consumo de aceite.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"FORZA VIS",t:"Motor diésel",s:"SAE 5W-40",d:"Mineral multigrado para motores con elevado consumo de aceite y/o baja presión.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"FORZA ULTRA D",t:"Motor diésel",s:"SAE 30/40/50",d:"Para diésel turbocargado con combustible de alto azufre >0.5%. Alta retención TBN.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"VOLTEK C300",t:"Motor diésel sintético",s:"SAE 10W-40/15W-40",d:"Totalmente sintético para servicio severo. EPA10 Tier 4B, Euro VI/V/IV, compatible DPF y SCR.",p:"5Gal · 55Gal"},
  {n:"BRIKSON ATF CVT-F",t:"Transmisión CVT",s:"100% Sintético",d:"Para transmisiones CVT cadenas/correas. Antivibración, modificadores de fricción, cambios suaves.",p:"1L · 5L"},
  {n:"BRIKSON ATF SYNTH",t:"Transmisión automática",s:"Multivehículo 100% Sintético",d:"Para transmisiones automáticas modernas. Superior a bajas temperaturas, periodos prolongados.",p:"1L · 1/4Gal · 1Gal"},
  {n:"BRIKSON ATF MD-III",t:"Transmisión automática",s:"DEXRON III",d:"Bases premium ATF D/M. Resistente al cizallamiento, protege embragues.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"BRIKSON HD SYNTH ATF A8",t:"Transmisión pesada",s:"Allison TES 668",d:"Para vehículos comerciales pesados, transmisiones Allison. Drenaje extendido.",p:"55Gal"},
  {n:"TRANSMEC DUAL",t:"Transmisión mecánica",s:"SAE 80W-90/90/140/250 GL-4",d:"Mineral para transmisiones GL-4. Cambios suaves, operación silenciosa.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"TRANSMEC SYNTHETIC",t:"Transmisión mecánica",s:"SAE 75W-90",d:"Sintético para transmisiones manuales y transeje. Extrema presión, cambios silenciosos.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"GEAR OIL GL-5",t:"Engranajes automotriz",s:"SAE 80W-90/85W-140",d:"Alto rendimiento para engranajes API GL-5. Aditivos EP, cajas de transferencia.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"GEAR OIL SYNTHETIC",t:"Engranajes sintético",s:"SAE 75W-90",d:"Sintético para cajas manuales y ejes de última generación. Eficiencia combustible.",p:"1L · 1Gal · 5Gal · 55Gal"},
  {n:"ATF BRIKSON (Dirección)",t:"Dirección hidráulica",s:"Tipo F",d:"Para dirección hidráulica y servodirección asistida.",p:"1/8Gal · 1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"ATTOM RAYVON 4T",t:"Moto 4T sintético",s:"SAE 15W-50",d:"Sintético Polyfriction Technology (PFM). Protege embrague y transmisión simultáneamente.",p:"1L · 1Gal"},
  {n:"SINTEK RAYVON 4T",t:"Moto 4T semi-sintético",s:"SAE 10W-40/15W-50/20W-50",d:"Semi-sintético para motos con catalizadores Euro II/III.",p:"1/4Gal · 1L · 4L · 5L"},
  {n:"RAYVON SUPER 4T",t:"Moto 4T mineral",s:"SAE 20W-50",d:"Mineral para motos, mototaxis, motocross, scooters, cuatrimotos.",p:"1L · 1Gal · 5Gal · 55Gal"},
  {n:"RAYVON SUPER 2T",t:"Moto 2T",s:"JASO FB / API TC",d:"Para motores 2 tiempos a gasolina. Mezcla fácil, limpieza bujías.",p:"80mL · 160mL · 200mL · 5Gal"},
  {n:"RAYVON FORKOIL 10W",t:"Suspensión moto",s:"100% Sintético",d:"Para horquillas convencionales e invertidas. Viscosidad estable en temperaturas extremas.",p:"1L"},
  {n:"AQUAOIL SUPER 2T",t:"Motor fuera de borda",s:"NMMA TC-W3",d:"Para motores 2T fuera de borda. Tecnología MARINELOWA baja ceniza, mínimo humo.",p:"1/8Gal · 1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"AGROX 2T",t:"Equipos forestales",s:"100% Sintético",d:"Para motores 2T en maquinaria forestal. Sin carbonilla, alta potencia.",p:"100mL · 1L · 1Gal · 5Gal · 55Gal"},
  {n:"DRAULA CAT",t:"Hidráulico Caterpillar",s:"SAE 10W/30/50 TO-4",d:"Especializado para hidráulicos Caterpillar. Convertidores de torque, mandos finales, frenos sumergidos.",p:"5Gal · 55Gal"},
  {n:"TRAKOIL",t:"Hidráulico agrícola UTTO",s:"SAE 10W-30 TO-2",d:"UTTO para transmisiones, hidráulicos, frenos húmedos y mandos agrícolas. PTO.",p:"5Gal · 55Gal"},
  {n:"DRAULA HT",t:"Hidráulico industrial",s:"ISO VG 32/46/68",d:"Antidesgaste Grupo II para bombas hidráulicas de alta presión y velocidad.",p:"5Gal · 55Gal"},
  {n:"DRAULA H",t:"Hidráulico industrial",s:"ISO VG 32/46/68/100",d:"Fluido hidráulico AW para sistemas móviles y estacionarios.",p:"5Gal · 55Gal"},
  {n:"VELTRON EP",t:"Reductores industriales",s:"ISO VG 100-680",d:"Para engranajes industriales. EP azufre-fósforo, protección micropitting, altas cargas.",p:"5Gal · 55Gal"},
  {n:"VELTRON SYNTH",t:"Reductores industriales",s:"ISO VG 150-680",d:"100% sintético para engranajes y cojinetes exigentes. Larga vida útil.",p:"5Gal · 55Gal"},
  {n:"COMPRESSOR OIL RSP SYNTH",t:"Compresor de tornillo",s:"ISO VG 32/46/68",d:"Sintético para compresores rotativos de tornillo y paletas. Libre de lodos y barnices.",p:"5Gal · 55Gal"},
  {n:"AIR COMPRESSOR OIL",t:"Compresor",s:"ISO VG 32/46/68/100",d:"Mineral para cárteres y cilindros de compresores.",p:"1/4Gal · 1Gal · 5Gal · 55Gal"},
  {n:"MUTURROL",t:"Máquinas herramienta",s:"Soluble en agua",d:"Emulsionable para torneado, taladrado, fresado. Lubricación y refrigeración, libre de nitritos.",p:"5Gal · 55Gal"},
  {n:"TEXVAC",t:"Guías y correderas",s:"ISO VG 46-220",d:"Adhesivo para guías y correderas de máquinas herramienta. Anti-stick-slip.",p:"5Gal · 55Gal"},
  {n:"ROKDUR",t:"Herramientas neumáticas",s:"ISO VG 100/150",d:"Para herramientas neumáticas de percusión en condiciones severas.",p:"5Gal · 55Gal"},
  {n:"TURBINIUM T",t:"Turbinas industriales",s:"ISO VG 46/68",d:"Premium R&O para turbinas de vapor y gas industriales. Larga vida.",p:"5Gal · 55Gal"},
  {n:"TRANSFER TERMICO",t:"Transferencia de calor",s:"ISO VG 22-68",d:"Fluido térmico mineral para sistemas de transferencia de calor.",p:"5Gal · 55Gal"},
  {n:"GRASA NANOLITHIUM WS2",t:"Grasa premium",s:"NLGI 2",d:"Nanopartículas fullereno WS2. Extrema presión, altas/bajas temperaturas, alto vacío.",p:"35Lb · 400Lb"},
  {n:"SULFONATO DE CALCIO",t:"Grasa premium EP",s:"NLGI 2",d:"Sulfonato de calcio. Extrema presión, resistencia agua, estabilidad mecánica.",p:"35Lb · 400Lb"},
  {n:"COMPLEJO DE LITIO",t:"Grasa multipropósito",s:"NLGI 2",d:"Alta performance, amplio rango temperatura, EP, resistente al agua.",p:"1Lb · 4Lb · 35Lb · 400Lb"},
  {n:"GRASA EP LITHIUM",t:"Grasa multipropósito",s:"NLGI 0/1/2/3",d:"Jabón de litio EP. Para rodamientos, articulaciones, pines, bujes. Versátil.",p:"120g · 397g · 4Lb · 35Lb · 400Lb"},
  {n:"MOLIBDENO LITHIUM EP-2",t:"Grasa MoS2",s:"NLGI 2",d:"Litio con bisulfuro de molibdeno y grafito EP. Palieres, chasis pesados, tractores, minería.",p:"35Lb · 400Lb"},
  {n:"GRASA GRAFITADA",t:"Grasa grafito",s:"NLGI 2",d:"Jabón de litio con grafito coloidal. Palieres, huesillos, cojinetes. Tractores, minería.",p:"120g · 210g · 35Lb · 400Lb"},
  {n:"GRASA CHASIS SUPER H",t:"Grasa chasis",s:"NLGI 0/1/2",d:"Jabón calcio, resistente lavado por agua. Chasis livianos y pesados, rótulas.",p:"35Lb · 400Lb"},
  {n:"DOT 4",t:"Líquido de frenos",s:"100% Sintético",d:"Para frenos disco y tambor y embragues hidráulicos. Punto ebullición >260°C.",p:"4onz · 1L · 1Gal · 5Gal · 55Gal"},
  {n:"DOT 3",t:"Líquido de frenos",s:"Sintético",d:"Para sistemas hidráulicos disco y tambor. SAE J1703/FMVS 16.",p:"4onz · 1L · 1Gal · 5Gal · 55Gal"},
  {n:"DOT 5.1",t:"Líquido de frenos",s:"Sintético alto rendimiento",d:"Punto ebullición >260°C. Para motos con ABS y EBD.",p:"4onz · 1L · 1Gal · 5Gal · 55Gal"},
  {n:"DOT 4 PARA MOTOS",t:"Líquido de frenos moto",s:"100% Sintético",d:"Para frenos moto. Ebullición >230°C, ABS compatible.",p:"4onz · 1L · 1Gal · 5Gal · 55Gal"},
  {n:"ICE FREEZE OAT 50/50",t:"Refrigerante",s:"50% Etilenglicol OAT",d:"Tecnología OAT orgánica. Protege aluminio y todos los metales.",p:"1L · 1Gal · 5Gal · 55Gal"},
  {n:"ICE HEAVY DUTY 50/50",t:"Refrigerante pesado",s:"NOAT 50% Etilenglicol",d:"NOAT para diésel pesado. Nitrito anti-cavitación.",p:"1Gal · 5Gal · 55Gal"},
  {n:"LIQUIDO PARA RADIADOR",t:"Refrigerante",s:"Inhibido anticorrosión",d:"Fluido anticorrosión para radiador. Rojo y verde disponibles.",p:"1L · 1Gal · 5Gal · 55Gal"},
  {n:"MOTOR FLUSH",t:"Auxiliar mantenimiento",s:"Limpiador motor",d:"Lavado motor en 3 min. Remueve lodo, resina, goma, barniz.",p:"443mL · 1Gal · 5Gal"},
  {n:"AFLOJATODO ZK 90",t:"Auxiliar mantenimiento",s:"Anticorrosivo",d:"Afloja piezas oxidadas, disuelve óxido.",p:"5.5onz · 10onz"},
  {n:"LIMPIA INYECTORES",t:"Auxiliar mantenimiento",s:"Sin desmontaje",d:"Limpia inyectores sin desmontar. Mejora combustión.",p:"10onz"},
  {n:"LIMPIA CARBURADOR",t:"Auxiliar mantenimiento",s:"Limpiador",d:"Limpieza carburador sin desmontaje.",p:"10onz"},
  {n:"ADITIVO DIESEL",t:"Aditivo combustible",s:"Para gasoil",d:"Mejora gasoil. Dispersa agua, limpia inyectores, previene corrosión.",p:"300mL"},
  {n:"ADITIVO GASOLINERO",t:"Aditivo combustible",s:"Para gasolina",d:"Mejora gasolina. Dispersa agua, limpia inyectores, reduce emisiones.",p:"300mL"},
  {n:"MEJORADOR DE OCTANAJE",t:"Aditivo combustible",s:"MMT",d:"Eleva el octanaje 1 a 3 puntos. Mejora rendimiento, cuida motor.",p:"325mL"},
  {n:"DIESEL OIL ADDITIVE",t:"Aditivo motor",s:"Concentrado",d:"Mantiene viscosidad motores diésel. Restaura compresión.",p:"300mL · 443mL"},
  {n:"GASOLINE OIL ADDITIVE",t:"Aditivo motor",s:"Polímeros sintéticos",d:"Incrementa potencia. Prolonga viscosidad en alta temperatura.",p:"300mL · 443mL"},
  {n:"NO SMOKE",t:"Aditivo anti-humo",s:"Para diésel/gasolina",d:"Reduce emisiones de humo. Protege cámara de combustión.",p:"410mL"},
  {n:"SHAMPOO CONCENTRADO 3EN1",t:"Car care",s:"Detergente concentrado",d:"Concentrado para carrocería, motos, botes. Gran detergencia.",p:"1L · 1Gal · 20L · 55Gal"},
  {n:"CERA LIQUIDA",t:"Car care",s:"Carnauba + siliconas",d:"Microemulsiones de carnauba para máximo brillo. Protege contra agua y UV.",p:"250mL · 1Gal"},
  {n:"CERA EN CREMA",t:"Car care",s:"Carnauba + UV",d:"Carnauba con siliconas y protección UV. Elimina rayones superficiales.",p:"200gr"},
  {n:"PROTECTOR DE INTERIORES",t:"Car care interior",s:"LOTOX INFINITE",d:"Limpia y protege plásticos interiores. Acabado mate, repele polvo.",p:"500mL"},
  {n:"BRILLANTA",t:"Car care llantas",s:"LOTOX",d:"Protector cauchos y llantas. Brillo negro intenso duradero.",p:"300mL · 1Gal · 20L"},
  {n:"SILICONA WHITE",t:"Car care",s:"LOTOX",d:"Silicona para vinilo, plástico, caucho, cuero. Anti-UV.",p:"120mL · 300mL · 1Gal · 20L"},
  {n:"PULVERIZADOR DE MOTOR",t:"Car care / taller",s:"Desengrasante",d:"Limpia motor. Biodegradable, no inflamable.",p:"650mL · 1Gal · 20L"},
  {n:"WHITE LITHIUM GREASE",t:"Auxiliar industrial",s:"Aerosol",d:"Grasa litio aerosol para zonas difícil acceso. Cintas, mecanismos.",p:"10onz"},
  {n:"LUBRICATODO",t:"Auxiliar multiusos",s:"Multiusos",d:"Lubricante multiusos. Bisagras, herramientas, cerraduras.",p:"10onz"},
  {n:"BRAKE CLEANER",t:"Auxiliar frenos",s:"Desengrasante frenos",d:"Limpiador de frenos. Remueve grasa, polvo. Seca sin residuos.",p:"10onz"}
];

const catalogText = CATALOG.map(p => `- ${p.n} (${p.t}, ${p.s}): ${p.d}`).join('\n');

router.post('/recomendar', async (req, res) => {
  const { query } = req.body;
  if (!query || query.trim().length < 3) {
    return res.status(400).json({ error: 'Query muy corta' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });
  }

  const systemPrompt = `Eres el asesor técnico de lubricantes de RMG Parts, distribuidor Vistony en Chile.
Tu tarea: analizar el giro o tipo de negocio descrito y recomendar productos lubricantes apropiados.

REGLAS:
- Infiere siempre qué tipos de motores, transmisiones, hidráulicos o maquinaria usa ese negocio
- Un montacargas usa motor diésel o GLP, transmisiones automáticas, hidráulico para el mástil → recomienda esos productos
- Un ascensor usa sistemas hidráulicos y reductores → recomienda hidráulicos y reductores
- Una panadería tiene motores eléctricos con reductores y bandas → recomienda reductores y grasas
- Una lavandería tiene compresores, reductores → recomienda compressor oil, veltron
- Una pesquera tiene motores fuera de borda, motores diésel marinos → recomienda aquaoil, forza
- Si el negocio no tiene maquinaria obvia, recomienda auxiliares de mantenimiento y car care
- SIEMPRE recomienda entre 5 y 8 productos
- Responde SOLO con JSON válido, sin texto antes ni después

CATÁLOGO DISPONIBLE:
${catalogText}

FORMATO DE RESPUESTA (JSON puro):
{
  "giro_detectado": "nombre del tipo de negocio inferido",
  "analisis": "2 oraciones explicando qué equipos usa este negocio y por qué necesitan lubricantes",
  "productos": [
    {
      "nombre": "nombre exacto del catálogo",
      "aplicacion": "para qué equipo específico de ESTE negocio sirve"
    }
  ]
}`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Tipo de negocio o giro: "${query}"` }
        ]
      })
    });

    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error('[asesor] OpenAI error:', data);
      return res.status(500).json({ error: 'Error OpenAI', detail: data.error?.message });
    }

    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const enriched = (parsed.productos || []).map(p => {
      const found = CATALOG.find(c =>
        c.n.toLowerCase() === p.nombre.toLowerCase() ||
        c.n.toLowerCase().includes(p.nombre.toLowerCase().split(' ')[0]) ||
        p.nombre.toLowerCase().includes(c.n.toLowerCase().split(' ')[0])
      );
      return { ...p, catalog: found || null };
    }).filter(p => p.catalog);

    return res.json({
      giro_detectado: parsed.giro_detectado,
      analisis: parsed.analisis,
      productos: enriched
    });

  } catch (err) {
    console.error('[asesor] error:', err);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
});

module.exports = router;
