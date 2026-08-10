import { useState } from 'react'

// ─── Catálogo Vistony 2025 ───────────────────────────────────────────────────
const CATALOG = [
  {n:"ATTOM S310",t:"Motor gasolina",s:"SAE 5W-30/5W-40/10W-40",d:"Premium 100% sintético con Starpoly. Para vehículos modernos turbocargados con inyección electrónica. Protección desde el arranque, ahorro combustible.",p:"1L · 1Gal · 5Gal",k:["gasolina","taller","auto","camioneta","suv","moderno","turbo","inyeccion","flotas","liviano","sintetico"],score:90},
  {n:"ATTOM S320",t:"Motor gasolina",s:"SAE 5W-30",d:"100% sintético para motores de última generación con convertidores catalíticos (TWC). Reduce emisiones, excelente arranque frío.",p:"1L · 5L",k:["gasolina","taller","auto","catalizador","emisiones","moderno","sintetico","euro"],score:85},
  {n:"ATTOM RACING",t:"Motor gasolina",s:"SAE 10W-60",d:"100% sintético base Ester para motores de competencia. Máxima presión en altas RPM, tecnología ESTER TECH LF.",p:"4L",k:["racing","competencia","alto rendimiento","gasolina","deportivo"],score:80},
  {n:"SINTEK S210",t:"Motor gasolina/diésel",s:"SAE 10W-30/10W-40",d:"Semi-sintético para motores gasolina con inyección y diésel livianos. Cumple ACEA europeo.",p:"1L · 4L",k:["gasolina","diesel","taller","camioneta","liviano","semi-sintetico","acea"],score:80},
  {n:"BLINDAX SUPER",t:"Motor gasolina",s:"SAE 10W-30/20W-50",d:"Multigrado superior para autos, camionetas SUV, Pick Up. Bajo azufre y fósforo, protege catalizadores.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["gasolina","taller","auto","suv","pickup","flotas","liviano","camioneta"],score:75},
  {n:"BLINDAX HD",t:"Motor gasolina",s:"SAE 40/50",d:"Monogrado API SL/CF. Protección contra corrosión y herrumbre.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["gasolina","taller","monogrado","convencional","viejo"],score:60},
  {n:"FORZA RAYGOLD",t:"Motor diésel",s:"SAE 15W-40",d:"Multigrado alto desempeño para diésel moderno con sistemas DOC, SCR, EGR, DPF. Ultra protección antidesgaste.",p:"1Gal · 2.5Gal · 5Gal · 55Gal",k:["diesel","taller","camion","flotas","transporte","pesado","dpf","scr","egr"],score:90},
  {n:"FORZA PLUS",t:"Motor diésel",s:"SAE 15W-40",d:"Premium para diésel moderno turbocargado con EGR. Previene bloqueo filtros, alto TBN, control hollín.",p:"1/4Gal · 1Gal · 2.5Gal · 5Gal · 55Gal",k:["diesel","camion","flotas","transporte","pesado","tbn","turbo"],score:88},
  {n:"FORZA TURBO",t:"Motor diésel",s:"SAE 25W-60",d:"Alta viscosidad mineral para condiciones severas. Estabilidad térmica, control consumo de aceite.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["diesel","pesado","severo","calor","construccion","mineria"],score:75},
  {n:"FORZA VIS",t:"Motor diésel",s:"SAE 5W-40",d:"Mineral multigrado bases altamente refinadas. Para motores con elevado consumo de aceite y/o baja presión.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["diesel","pesado","consumo","presion"],score:70},
  {n:"FORZA ULTRA D",t:"Motor diésel",s:"SAE 30/40/50",d:"Para diésel turbocargado y aspiración natural, combustible con alto azufre >0.5%. Alta retención TBN.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["diesel","pesado","azufre","mineria","construccion","tradicional"],score:72},
  {n:"VOLTEK C300",t:"Motor diésel sintético",s:"SAE 10W-40/15W-40",d:"Totalmente sintético para servicio severo. Cumple EPA10 Tier 4B, Euro VI/V/IV, DPF y SCR. Periodo extendido.",p:"5Gal · 55Gal",k:["mineria","flotas","transporte","diesel","sintetico","severo","camion","tier4","euro"],score:92},
  {n:"BRIKSON ATF CVT-F",t:"Transmisión CVT",s:"100% Sintético",d:"Para transmisiones CVT cadenas/correas. Antivibración, modificadores de fricción, cambios suaves.",p:"1L · 5L",k:["taller","transmision","cvt","auto","camioneta","automatica"],score:88},
  {n:"BRIKSON ATF SYNTH",t:"Transmisión automática",s:"Multivehículo 100% Sintético",d:"Para transmisiones automáticas modernas. Superior a bajas temperaturas, periodos prolongados.",p:"1L · 1/4Gal · 1Gal",k:["taller","transmision","automatica","auto","camioneta","sintetico"],score:87},
  {n:"BRIKSON ATF MD-III",t:"Transmisión automática",s:"DEXRON III",d:"Bases premium para transmisiones automáticas ATF D/M. Resistente al cizallamiento, protege embragues.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["taller","transmision","automatica","camion","clasico","dexron"],score:75},
  {n:"BRIKSON HD SYNTH ATF A8",t:"Transmisión pesada",s:"Allison TES 668",d:"Para vehículos comerciales pesados, transmisiones Allison. Drenaje extendido, anti-oxidación.",p:"55Gal",k:["transporte","camion","mineria","allison","pesado","sintetico"],score:85},
  {n:"TRANSMEC DUAL",t:"Transmisión mecánica",s:"SAE 80W-90/90/140/250 GL-4",d:"Mineral para transmisiones mecánicas GL-4. Cambios suaves, operación silenciosa.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["taller","transmision","manual","camioneta","sincronizada","gl4"],score:80},
  {n:"TRANSMEC SYNTHETIC",t:"Transmisión mecánica",s:"SAE 75W-90",d:"Sintético para transmisiones manuales y transeje. EP, cambios silenciosos.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["taller","transmision","manual","diferencial","camion","sintetico"],score:82},
  {n:"GEAR OIL GL-5",t:"Engranajes automotriz",s:"SAE 80W-90/85W-140",d:"Alto rendimiento para engranajes API GL-5. Aditivos azufre-fósforo EP, cajas de transferencia.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["taller","diferencial","caja","transmision","4x4","pickup","gl5","camion"],score:82},
  {n:"GEAR OIL SYNTHETIC",t:"Engranajes sintético",s:"SAE 75W-90",d:"Sintético para cajas manuales y ejes última generación. Eficiencia combustible.",p:"1L · 1Gal · 5Gal · 55Gal",k:["taller","diferencial","sintetico","camion","eje","engranaje"],score:80},
  {n:"ATTOM RAYVON 4T",t:"Moto 4T sintético",s:"SAE 15W-50",d:"Sintético con Polyfriction Technology (PFM). Protege embrague y transmisión simultáneamente.",p:"1L · 1Gal",k:["moto","motocicleta","4 tiempos","taller motos","sintetico","embrague"],score:92},
  {n:"SINTEK RAYVON 4T",t:"Moto 4T semi-sintético",s:"SAE 10W-40/15W-50/20W-50",d:"Semi-sintético para motos con catalizadores Euro II/III. Limpieza del motor, protección antidesgaste.",p:"1/4Gal · 1L · 4L · 5L",k:["moto","motocicleta","4 tiempos","taller motos","enduro","semi-sintetico"],score:88},
  {n:"RAYVON SUPER 4T",t:"Moto 4T mineral",s:"SAE 20W-50",d:"Mineral para motos, mototaxis, motocross, scooters, cuatrimotos. Todas las marcas.",p:"1L · 1Gal · 5Gal · 55Gal",k:["moto","motocicleta","4 tiempos","mototaxi","scooter","cuatrimoto","motocross"],score:85},
  {n:"RAYVON SUPER 2T",t:"Moto 2T",s:"JASO FB / API TC",d:"Para motores 2 tiempos a gasolina. Mezcla fácil con combustible, limpieza bujías.",p:"80mL · 160mL · 200mL · 5Gal",k:["moto","2 tiempos","pequeño"],score:88},
  {n:"RAYVON FORKOIL 10W",t:"Suspensión moto",s:"100% Sintético",d:"Para horquillas convencionales e invertidas. Viscosidad estable en temperaturas extremas.",p:"1L",k:["moto","suspension","horquilla","taller motos","amortiguador"],score:85},
  {n:"AQUAOIL SUPER 2T",t:"Motor fuera de borda",s:"NMMA TC-W3",d:"Para motores 2T fuera de borda con agua. Tecnología MARINELOWA baja ceniza.",p:"1/8Gal · 1/4Gal · 1Gal · 5Gal · 55Gal",k:["marino","bote","fuera de borda","pesca","nautico"],score:92},
  {n:"AGROX 2T",t:"Equipos forestales",s:"100% Sintético",d:"Para motores 2T en maquinaria forestal. Sin carbonilla, alta potencia, motosierra.",p:"100mL · 1L · 1Gal · 5Gal · 55Gal",k:["forestal","agricola","motosierra","2 tiempos"],score:90},
  {n:"DRAULA CAT",t:"Hidráulico Caterpillar",s:"SAE 10W/30/50 TO-4",d:"Especializado para hidráulicos Caterpillar. Convertidores de torque, mandos finales, frenos sumergidos.",p:"5Gal · 55Gal",k:["mineria","construccion","caterpillar","excavadora","hidraulico","pesado","off-road","to4"],score:94},
  {n:"TRAKOIL",t:"Hidráulico agrícola UTTO",s:"SAE 10W-30 TO-2",d:"UTTO para transmisiones, hidráulicos, frenos húmedos y mandos agrícolas. PTO.",p:"5Gal · 55Gal",k:["agricola","tractor","hidraulico","construccion","utto","pto"],score:92},
  {n:"DRAULA HT",t:"Hidráulico industrial",s:"ISO VG 32/46/68",d:"Antidesgaste Grupo II para bombas de alta presión y velocidad. Estabilidad térmica superior.",p:"5Gal · 55Gal",k:["industria","hidraulico","bomba","construccion","mineria","prensa","manufactura"],score:88},
  {n:"DRAULA H",t:"Hidráulico industrial",s:"ISO VG 32/46/68/100",d:"Fluido hidráulico AW para sistemas móviles y estacionarios. Aditivos zinc antidesgaste.",p:"5Gal · 55Gal",k:["industria","hidraulico","manufactura","maquinaria"],score:85},
  {n:"VELTRON EP",t:"Reductores industriales",s:"ISO VG 100-680",d:"Para engranajes industriales. EP azufre-fósforo, protección micropitting, altas cargas.",p:"5Gal · 55Gal",k:["industria","reductor","engranaje","manufactura","planta"],score:90},
  {n:"VELTRON SYNTH",t:"Reductores industriales",s:"ISO VG 150-680",d:"100% sintético para engranajes y cojinetes exigentes. Larga vida útil.",p:"5Gal · 55Gal",k:["industria","reductor","engranaje","sintetico","planta"],score:88},
  {n:"COMPRESSOR OIL RSP SYNTH",t:"Compresor de tornillo",s:"ISO VG 32/46/68",d:"Sintético para compresores rotativos de tornillo y paletas. Larga vida, libre de lodos.",p:"5Gal · 55Gal",k:["industria","compresor","tornillo","aire","manufactura","taller","rotativo"],score:92},
  {n:"AIR COMPRESSOR OIL",t:"Compresor",s:"ISO VG 32/46/68/100",d:"Mineral para cárteres y cilindros de compresores. Inhibe corrosión.",p:"1/4Gal · 1Gal · 5Gal · 55Gal",k:["taller","compresor","aire","industria","mineral"],score:85},
  {n:"MUTURROL",t:"Máquinas herramienta",s:"Soluble en agua",d:"Emulsionable para torneado, taladrado, fresado. Lubricación y refrigeración.",p:"5Gal · 55Gal",k:["manufactura","metalmecanica","torno","fresadora","herramienta","cnc","corte"],score:90},
  {n:"TEXVAC",t:"Guías y correderas",s:"ISO VG 46-220",d:"Adhesivo para guías y correderas de máquinas herramienta. Anti-stick-slip.",p:"5Gal · 55Gal",k:["manufactura","torno","cnc","maquina herramienta","guia"],score:85},
  {n:"ROKDUR",t:"Herramientas neumáticas",s:"ISO VG 100/150",d:"Para herramientas neumáticas de percusión en condiciones severas.",p:"5Gal · 55Gal",k:["taller","industria","neumatico","percusion","taladro","impacto"],score:82},
  {n:"TURBINIUM T",t:"Turbinas industriales",s:"ISO VG 46/68",d:"Premium R&O para turbinas de vapor y gas industriales.",p:"5Gal · 55Gal",k:["industria","turbina","planta","energia","vapor"],score:88},
  {n:"TRANSFER TERMICO",t:"Transferencia de calor",s:"ISO VG 22-68",d:"Fluido térmico mineral para sistemas de calor abiertos o cerrados.",p:"5Gal · 55Gal",k:["industria","calor","proceso","planta","termico"],score:85},
  {n:"GRASA NANOLITHIUM WS2",t:"Grasa premium",s:"NLGI 2",d:"Nanopartículas fullereno WS2. Extrema presión, altas/bajas temperaturas, alto vacío.",p:"35Lb · 400Lb",k:["mineria","industria","construccion","pesado","extremo","marina","alta presion"],score:95},
  {n:"SULFONATO DE CALCIO",t:"Grasa premium EP",s:"NLGI 2",d:"Base sulfonato de calcio. Extrema presión, resistencia agua, estabilidad mecánica.",p:"35Lb · 400Lb",k:["mineria","industria","agua","pesado","construccion","extrema presion"],score:90},
  {n:"COMPLEJO DE LITIO",t:"Grasa multipropósito",s:"NLGI 2",d:"Alta performance, amplio rango temperatura, EP, resistente al agua.",p:"1Lb · 4Lb · 35Lb · 400Lb",k:["industria","taller","agricola","pesado","rodamiento","automotriz"],score:85},
  {n:"GRASA EP LITHIUM",t:"Grasa multipropósito",s:"NLGI 0/1/2/3",d:"Jabón de litio EP. Para rodamientos, articulaciones, pines, bujes. Versátil.",p:"120g · 397g · 4Lb · 35Lb · 400Lb",k:["taller","industria","agricola","automotriz","rueda","suspension","rodamiento"],score:82},
  {n:"MOLIBDENO LITHIUM EP-2",t:"Grasa MoS2",s:"NLGI 2",d:"Litio con bisulfuro de molibdeno y grafito EP. Palieres, chasis pesados, tractores, minería.",p:"35Lb · 400Lb",k:["mineria","agricola","tractor","construccion","polvo","pesado","cemento"],score:88},
  {n:"GRASA GRAFITADA",t:"Grasa grafito",s:"NLGI 2",d:"Jabón de litio con grafito coloidal. Palieres, huesillos, cojinetes. Tractores, minería.",p:"120g · 210g · 35Lb · 400Lb",k:["mineria","construccion","tractor","agricola","pesado"],score:85},
  {n:"GRASA CHASIS SUPER H",t:"Grasa chasis",s:"NLGI 0/1/2",d:"Jabón calcio, resistente lavado por agua. Chasis livianos y pesados, rótulas.",p:"35Lb · 400Lb",k:["taller","chasis","camion","rotula","agua","pesado"],score:80},
  {n:"DOT 4",t:"Líquido de frenos",s:"100% Sintético",d:"Para frenos disco y tambor y embragues hidráulicos. Punto ebullición >260°C.",p:"4onz · 1L · 1Gal · 5Gal · 55Gal",k:["taller","frenos","auto","camioneta","moto","hidraulico","embrague"],score:88},
  {n:"DOT 3",t:"Líquido de frenos",s:"Sintético",d:"Para sistemas hidráulicos disco y tambor. SAE J1703/FMVS 16. Anticorrosión.",p:"4onz · 1L · 1Gal · 5Gal · 55Gal",k:["taller","frenos","auto","camioneta","economico"],score:80},
  {n:"DOT 5.1",t:"Líquido de frenos",s:"Sintético alto rendimiento",d:"Punto ebullición >260°C. Para motos con ABS y EBD.",p:"4onz · 1L · 1Gal · 5Gal · 55Gal",k:["moto","frenos","abs","ebd","alto rendimiento"],score:88},
  {n:"DOT 4 PARA MOTOS",t:"Líquido de frenos moto",s:"100% Sintético",d:"100% sintético para frenos moto. Ebullición >230°C, ABS compatible.",p:"4onz · 1L · 1Gal · 5Gal · 55Gal",k:["moto","frenos","taller motos","abs"],score:88},
  {n:"ICE FREEZE OAT 50/50",t:"Refrigerante",s:"50% Etilenglicol OAT",d:"Tecnología OAT orgánica. Protege aluminio y todos los metales. Libre de fosfatos/nitritos.",p:"1L · 1Gal · 5Gal · 55Gal",k:["taller","refrigerante","radiador","auto","camioneta","flotas","aluminio"],score:88},
  {n:"ICE HEAVY DUTY 50/50",t:"Refrigerante pesado",s:"NOAT 50% Etilenglicol",d:"NOAT para diésel pesado. Nitrito anti-cavitación. No requiere SCA adicionales.",p:"1Gal · 5Gal · 55Gal",k:["camion","transporte","diesel","flotas","refrigerante","pesado"],score:90},
  {n:"LIQUIDO PARA RADIADOR",t:"Refrigerante",s:"Inhibido anticorrosión",d:"Fluido anticorrosión para radiador. Rojo y verde disponibles.",p:"1L · 1Gal · 5Gal · 55Gal",k:["taller","radiador","auto","camioneta","refrigerante"],score:75},
  {n:"MOTOR FLUSH",t:"Auxiliar mantenimiento",s:"Limpiador motor",d:"Lavado motor en 3 min. Remueve lodo, resina, goma, barniz.",p:"443mL · 1Gal · 5Gal",k:["taller","mantenimiento","preventivo","motor","limpieza","flush"],score:85},
  {n:"AFLOJATODO ZK 90",t:"Auxiliar mantenimiento",s:"Anticorrosivo",d:"Afloja piezas oxidadas, disuelve óxido. Penetración total.",p:"5.5onz · 10onz",k:["taller","mantenimiento","oxido","herramienta"],score:80},
  {n:"LIMPIA INYECTORES",t:"Auxiliar mantenimiento",s:"Sin desmontaje",d:"Limpia inyectores sin desmontar. Remueve sedimentos. Mejora combustión.",p:"10onz",k:["taller","inyectores","gasolina","diesel","mantenimiento"],score:82},
  {n:"ADITIVO DIESEL",t:"Aditivo combustible",s:"Para gasoil",d:"Mejora gasoil. Dispersa agua, previene corrosión, limpia inyectores.",p:"300mL",k:["diesel","camion","flotas","mantenimiento","combustible"],score:85},
  {n:"ADITIVO GASOLINERO",t:"Aditivo combustible",s:"Para gasolina",d:"Mejora gasolina. Dispersa agua, limpia inyectores, reduce emisiones.",p:"300mL",k:["gasolina","taller","auto","mantenimiento","combustible"],score:82},
  {n:"MEJORADOR DE OCTANAJE",t:"Aditivo combustible",s:"MMT",d:"Eleva el octanaje 1 a 3 puntos. Mejora rendimiento, cuida motor.",p:"325mL",k:["gasolina","racing","rendimiento","auto","combustible"],score:80},
  {n:"DIESEL OIL ADDITIVE",t:"Aditivo motor",s:"Concentrado",d:"Mantiene viscosidad motores diésel. Restaura compresión, reduce consumo aceite.",p:"300mL · 443mL",k:["diesel","mantenimiento","motor","flotas"],score:82},
  {n:"GASOLINE OIL ADDITIVE",t:"Aditivo motor",s:"Polímeros sintéticos",d:"Incrementa potencia. Prolonga viscosidad en alta temperatura.",p:"300mL · 443mL",k:["gasolina","taller","motor","auto"],score:80},
  {n:"NO SMOKE",t:"Aditivo anti-humo",s:"Para diésel/gasolina",d:"Reduce emisiones de humo. Protege cámara de combustión.",p:"410mL",k:["diesel","gasolina","humo","revision tecnica","emision"],score:82},
  {n:"SHAMPOO CONCENTRADO 3EN1",t:"Car care",s:"Detergente concentrado",d:"Concentrado para carrocería, motos, botes. Gran detergencia, biodegradable.",p:"1L · 1Gal · 20L · 55Gal",k:["car care","lavado","detailing","carroceria","limpieza"],score:88},
  {n:"CERA LIQUIDA",t:"Car care",s:"Carnauba + siliconas",d:"Microemulsiones de carnauba para máximo brillo. Protege contra agua y UV.",p:"250mL · 1Gal",k:["car care","detailing","brillo","cera","pintura"],score:85},
  {n:"CERA EN CREMA",t:"Car care",s:"Carnauba + UV",d:"Carnauba con siliconas y protección UV. Elimina rayones superficiales.",p:"200gr",k:["car care","detailing","brillo","cera"],score:83},
  {n:"PROTECTOR DE INTERIORES",t:"Car care interior",s:"LOTOX INFINITE",d:"Limpia y protege plásticos interiores. Acabado mate, repele polvo.",p:"500mL",k:["car care","interior","detailing","plastico"],score:85},
  {n:"BRILLANTA",t:"Car care llantas",s:"LOTOX",d:"Protector cauchos y llantas. Brillo negro intenso duradero.",p:"300mL · 1Gal · 20L",k:["car care","llanta","caucho","detailing"],score:85},
  {n:"SILICONA WHITE",t:"Car care",s:"LOTOX",d:"Silicona para vinilo, plástico, caucho, cuero. Anti-UV.",p:"120mL · 300mL · 1Gal · 20L",k:["car care","interior","exterior","detailing","vinilo"],score:83},
  {n:"PULVERIZADOR DE MOTOR",t:"Car care / taller",s:"Desengrasante",d:"Limpia motor, elimina grasa y aceites. Biodegradable, no inflamable.",p:"650mL · 1Gal · 20L",k:["taller","car care","motor","desengrasante","limpieza"],score:82},
  {n:"WHITE LITHIUM GREASE",t:"Auxiliar / industrial",s:"Aerosol",d:"Grasa litio aerosol para zonas difícil acceso. Cintas, mecanismos.",p:"10onz",k:["taller","industria","mantenimiento","correa","mecanismo"],score:78},
  {n:"LUBRICATODO",t:"Auxiliar multiusos",s:"Multiusos",d:"Lubricante multiusos. Bisagras, herramientas, cerraduras.",p:"10onz",k:["taller","mantenimiento","herramienta","multiusos"],score:72},
  {n:"BRAKE CLEANER",t:"Auxiliar frenos",s:"Desengrasante frenos",d:"Limpiador de frenos. Remueve grasa, polvo, líquido frenos. Seca sin residuos.",p:"10onz",k:["taller","frenos","pastillas","disco","desengrasante"],score:82}
]

const NARRATIVES = {
  gasolina: "Para operaciones con vehículos a gasolina, la prioridad es proteger motores modernos con inyección electrónica y catalizadores. La línea ATTOM y SINTEK de RMG Parts cumple las especificaciones API/ACEA más exigentes.",
  diesel: "Las flotas y talleres diésel requieren lubricantes con alto TBN y compatibilidad con sistemas DPF, SCR y EGR. La línea FORZA y VOLTEK de RMG Parts reduce costos de mantenimiento y extiende los periodos de cambio.",
  mineria: "La minería exige lubricantes para condiciones extremas de carga, temperatura y polvo. RMG Parts ofrece VOLTEK C300 para motores, DRAULA CAT para hidráulicos Caterpillar, y grasas NANOLITHIUM WS2 para extrema presión.",
  agricola: "Los equipos agrícolas necesitan un lubricante multifuncional para transmisiones, hidráulicos y frenos húmedos. TRAKOIL UTTO de RMG Parts es la solución central compatible con tractores que requieran API GL-4 y TO-2.",
  industria: "Las plantas industriales tienen múltiples puntos de lubricación. RMG Parts cubre: VELTRON para reductores, DRAULA para hidráulicos, COMPRESSOR OIL SYNTH para compresores de tornillo, y MUTURROL para máquinas de corte.",
  moto: "Los talleres de motocicletas requieren lubricantes específicos para motores 4T y 2T que comparten aceite con la transmisión y el embrague. La línea RAYVON con Polyfriction Technology (PFM) de RMG Parts está diseñada para esto.",
  construccion: "Los equipos de construcción off-road combinan motores diésel con sistemas hidráulicos y transmisiones pesadas. RMG Parts recomienda FORZA para motores, DRAULA CAT para hidráulicos y grasas SULFONATO DE CALCIO para articulaciones.",
  "car care": "Para servicios de lavado y detailing profesional, RMG Parts dispone de la línea LOTOX completa: limpieza exterior e interior, ceras de carnauba, protectores UV y productos especializados.",
  default: "Basado en las características del negocio, RMG Parts identifica los productos Vistony 2025 que mejor se adaptan a los requerimientos técnicos y operacionales descritos."
}

const SEG_GROUPS = {
  "Motor gasolina": ["Motor gasolina","Motor gasolina/diésel"],
  "Motor diésel": ["Motor diésel","Motor diésel sintético"],
  "Transmisión": ["Transmisión CVT","Transmisión automática","Transmisión mecánica","Engranajes automotriz","Engranajes sintético","Dirección hidráulica","Transmisión pesada"],
  "Motos": ["Moto 4T sintético","Moto 4T semi-sintético","Moto 4T mineral","Moto 2T","Suspensión moto","Motor fuera de borda"],
  "Industrial": ["Hidráulico Caterpillar","Hidráulico agrícola UTTO","Hidráulico industrial","Reductores industriales","Compresor de tornillo","Compresor","Máquinas herramienta","Guías y correderas","Herramientas neumáticas","Turbinas industriales","Transferencia de calor"],
  "Grasas": ["Grasa premium","Grasa premium EP","Grasa multipropósito","Grasa MoS2","Grasa grafito","Grasa chasis"],
  "Frenos / Refrigerantes": ["Líquido de frenos","Líquido de frenos alto rendimiento","Líquido de frenos moto","Refrigerante","Refrigerante pesado"],
  "Car care": ["Car care","Car care interior","Car care llantas","Car care / taller"],
  "Auxiliares / Aditivos": ["Auxiliar mantenimiento","Aditivo combustible","Aditivo motor","Aditivo anti-humo","Auxiliar / industrial","Auxiliar frenos","Auxiliar multiusos"]
}

function tokenize(text) {
  const stop = new Set(['con','para','de','del','la','el','los','las','una','un','en','y','que','se','su','sus','por','es','son','como','o','a','al'])
  return text.toLowerCase().replace(/[^a-záéíóúüñ0-9\s]/gi,' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w))
}

function calcScore(prod, tokens) {
  let s = 0
  tokens.forEach(t => { if (prod.k.some(k => k.includes(t) || t.includes(k))) s += 10 })
  return s + (s > 0 ? prod.score * 0.3 : 0)
}

function detectNarrative(tokens) {
  const mapping = {
    gasolina: ["gasolina","bencina","auto","autos","camioneta","suv"],
    diesel: ["diesel","diésel","gasoil","camion","flotas","flota","transporte"],
    mineria: ["miner","mineria","caterpillar","excavadora"],
    agricola: ["agric","tractor","tractores","campo","cultivo"],
    industria: ["industria","industrial","manufactura","planta","fabrica","compresor","reductor","cnc"],
    moto: ["moto","motocicleta","motos","scooter","enduro","motocross"],
    construccion: ["construc","obra","excavadora","grua"],
    "car care": ["lavado","detailing","cera","lustre","brillo","pulido"]
  }
  for (const [seg, words] of Object.entries(mapping)) {
    if (tokens.some(t => words.some(w => t.includes(w) || w.includes(t)))) return seg
  }
  return 'default'
}

export default function AsesorProductos() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [narrative, setNarrative] = useState('')
  const [searched, setSearched] = useState(false)
  const [segFilter, setSegFilter] = useState(null)

  const buscar = (q) => {
    const text = q || query
    if (!text.trim()) return
    const tokens = tokenize(text)
    const scored = CATALOG
      .map(p => ({ ...p, _sc: calcScore(p, tokens) }))
      .filter(p => p._sc > 0)
      .sort((a, b) => b._sc - a._sc)
    const nar = detectNarrative(tokens)
    setResults(scored)
    setNarrative(NARRATIVES[nar] || NARRATIVES.default)
    setSearched(true)
    setSegFilter(null)
  }

  const preset = (text) => {
    setQuery(text)
    buscar(text)
  }

  const segCounts = {}
  results.forEach(p => {
    for (const [g, ts] of Object.entries(SEG_GROUPS)) {
      if (ts.includes(p.t)) { segCounts[g] = (segCounts[g] || 0) + 1; break }
    }
  })
  const availSegs = Object.entries(segCounts).filter(([, c]) => c > 0)

  const shown = segFilter
    ? results.filter(p => (SEG_GROUPS[segFilter] || []).includes(p.t))
    : results.slice(0, 8)

  const chips = [
    { label: '🔧 Taller liviano', q: 'Taller mecánico con autos a gasolina y camionetas' },
    { label: '🚛 Flota camiones', q: 'Empresa de transporte con flota de camiones diésel' },
    { label: '⛏️ Minería', q: 'Empresa minera con equipos pesados Caterpillar y reductores' },
    { label: '🏍️ Motos', q: 'Taller de motocicletas 4T y 2T, enduro y scooter' },
    { label: '🌾 Agrícola', q: 'Empresa agrícola con tractores y maquinaria hidráulica UTTO' },
    { label: '🏭 Industria', q: 'Industria con compresores de aire y reductores industriales' },
    { label: '✨ Car care', q: 'Lavado y detailing de vehículos, car care profesional' },
    { label: '🏗️ Construcción', q: 'Empresa de construcción con excavadoras y equipos off-road' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '900px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#435664', marginBottom: '4px' }}>
          Asesor de Productos Vistony 2025
        </h1>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Describe el tipo de negocio o cliente y encuentra los productos correctos del catálogo
        </p>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="Ej: taller mecánico con camiones diésel, empresa minera con Caterpillar..."
          style={{
            flex: 1, padding: '0 14px', height: '40px',
            border: '1px solid #d1d5db', borderRadius: '8px',
            fontSize: '14px', outline: 'none'
          }}
        />
        <button
          onClick={() => buscar()}
          style={{
            background: '#0071BD', color: '#fff', border: 'none',
            borderRadius: '8px', padding: '0 20px', height: '40px',
            fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          Consultar
        </button>
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
        {chips.map(c => (
          <button key={c.label} onClick={() => preset(c.q)}
            style={{
              border: '1px solid #d1d5db', borderRadius: '16px',
              padding: '4px 12px', fontSize: '12px', color: '#555',
              cursor: 'pointer', background: '#f9fafb'
            }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Resultados */}
      {searched && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No se encontraron productos para esta búsqueda. Intenta con otros términos.
        </div>
      )}

      {results.length > 0 && (
        <>
          {/* Narrative */}
          <div style={{
            background: '#EEF7FF', borderLeft: '3px solid #0071BD',
            borderRadius: '0 8px 8px 0', padding: '12px 16px',
            fontSize: '13px', color: '#435664', lineHeight: '1.6', marginBottom: '12px'
          }}>
            {narrative}
          </div>

          {/* Filtros por segmento */}
          {availSegs.length > 1 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Filtrar por categoría:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {availSegs.map(([g, c]) => (
                  <button key={g} onClick={() => setSegFilter(segFilter === g ? null : g)}
                    style={{
                      border: `1px solid ${segFilter === g ? '#0071BD' : '#d1d5db'}`,
                      borderRadius: '4px', padding: '3px 10px', fontSize: '11px',
                      color: segFilter === g ? '#0071BD' : '#555',
                      background: segFilter === g ? '#EEF7FF' : '#f9fafb',
                      cursor: 'pointer'
                    }}>
                    {g} ({c})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px', borderBottom: '1px solid #f0f0f0', paddingBottom: '8px' }}>
            Mostrando {shown.length} productos · búsqueda: "{query}"
          </div>

          {/* Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {shown.map((p, i) => (
              <div key={i} style={{
                background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: '10px', padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{p.n}</span>
                  <span style={{
                    fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                    background: '#EEF7FF', color: '#0C447C', whiteSpace: 'nowrap'
                  }}>{p.t}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#555', lineHeight: '1.5', marginBottom: '8px' }}>{p.d}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>{p.s}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', color: '#555' }}>{p.p}</span>
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', color: '#0F6E56', background: '#E1F5EE' }}>
                    Relevancia {Math.min(100, Math.round(p._sc))}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#bbb' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
          Ingresa el tipo de negocio o usa uno de los accesos rápidos
        </div>
      )}
    </div>
  )
}
