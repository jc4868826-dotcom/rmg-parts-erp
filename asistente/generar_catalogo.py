import pandas as pd

def get_technical_data(articulo_raw):
    articulo = str(articulo_raw).upper()
    
    if any(k in articulo for k in ['FORZA PLUS', 'FORZA ADVANCED']):
        return 'Base Mineral Premium (Grupo II)', 'Alto TBN, dispersión de hollín, neutraliza ácidos. Flota pesada.'
    if 'RAYGOLD' in articulo:
        return 'Mineral / Semisintético Low SAPS', 'Protege DPF/EGR en camiones modernos. Bajas cenizas.'
    if 'FORZA TRUCK' in articulo or 'FORZA VIS' in articulo:
        return 'Base Mineral pesada con polímeros', 'Sella holguras en flotas envejecidas, evita consumo de aceite.'
    if 'ULTRA D' in articulo:
        return 'Monogrado sin polímeros', 'Resistencia al cizallamiento 100%. Motores estacionarios.'
    if 'MAXFORCE' in articulo:
        return 'Semisintético/Sintético (Grupo II+/III)', 'Certificación CK-4, soporta degradación oxidativa extrema (minería).'
    if 'ATTOM S3' in articulo or 'ATTOM S4' in articulo:
        return '100% Sintético (Grupo III/IV)', 'Previene LSPI en inyección directa/turbo. Resistencia térmica extrema.'
    if 'ATTOM RACING' in articulo:
        return 'Sintético hiper-reforzado', 'Presión intacta bajo abuso térmico en competición.'
    if 'MAXTECH PRO' in articulo and 'DPF' in articulo:
        return 'Base Sintética Premium (C3/DPF)', 'Bajas cenizas metálicas. Protege catalizador/DPF en furgones modernos.'
    if 'MAXTECH PRO' in articulo:
        return 'Base Sintética Premium', 'Estabilidad estructural impecable, mínima resistencia parasitaria.'
    if 'SINTEK' in articulo:
        return 'Mezcla Semisintética', 'Evita lodos en trayectos cortos. Todoterreno para reparto liviano.'
    if 'BLINDAX HD' in articulo:
        return 'Mineral robusto', 'Alto ZDDP para proteger trenes de válvulas antiguos.'
    if 'S-CLASS' in articulo or 'BLINDAX SUPER' in articulo:
        return 'Mineral de alta viscosidad', 'Sella fugas en motores carburados o con desgaste.'
    if 'BLINDAX DUO' in articulo:
        return 'Semisintético económico', 'Estabilidad en caliente para motores de gama media.'
        
    if 'GEAR OIL' in articulo or 'TRANSMISSION' in articulo:
        if 'SYNTHETIC' in articulo:
            return 'Base Sintética (API GL-5)', 'Soporta impactos brutales en diferenciales y mandos finales pesados.'
        return 'Base Mineral Pesada EP (API GL-5)', 'Previene la soldadura en frío y aplastamiento de engranajes hipoidales.'
    if 'LSD' in articulo:
        return 'Mineral con Modificadores de Fricción', 'Controla el patinamiento en diferenciales autoblocantes (LSD).'
    if 'ATF III' in articulo:
        return 'Mineral refinado', 'Estándar robusto para direcciones y automáticas tradicionales.'
    if 'ATF VI' in articulo:
        return '100% Sintético', 'Escudo térmico contra cizallamiento en cajas modernas (6-10 vel).'
    if 'DRAULACAT' in articulo:
        return 'OHT (Off-Highway Transmission)', 'Norma Caterpillar TO-4. Elimina patinamiento en discos Powershift de maquinaria pesada.'
    if 'DRAULA H' in articulo or 'HYDRO' in articulo or 'HIDRAULAN' in articulo:
        return 'Mineral Alto Índice de Viscosidad', 'Aditivos Anti-Wear. Previene cavitación en bombas hidráulicas de grúas/excavadoras.'
    if 'VELTRON' in articulo:
        return 'Mineral ultra pesado EP', 'Soporta micropicado en reductores industriales (molinos/chancadoras).'
    if 'COMPRESSOR' in articulo:
        return 'Fluido sin cenizas', 'Resiste temperatura extrema de descarga. Evita barniz en líneas de aire.'
    if 'TEXVAC' in articulo:
        return 'Presión de vapor bajísima', 'No se evapora en vacío profundo (bombas de paletas rotativas).'
    if 'TURBINIUM' in articulo:
        return 'Alta demulsibilidad', 'Separa el agua condensada al instante para turbinas de generación.'

    if 'MOLIBDENO' in articulo:
        return 'Jabón Litio + MoS2 sólido', 'Blindaje microscópico antidesgaste para pasadores en movimiento de tierras.'
    if 'COMPLEX' in articulo:
        return 'Complejo de Litio', 'Punto de goteo >260°C. Innegociable para masas de camiones pesados.'
    if 'LITHIUM MULTIPROPOSITO' in articulo or 'EP GREASE' in articulo:
        return 'Jabón de Litio + EP', 'Soporta 130°C y resiste lavado por agua. Pasadores y rotulas.'
    if 'WHITE' in articulo:
        return 'Litio + Dióxido de Titanio', 'Limpia, no oxida. Para rieles de furgones y chapas.'
    if '150AMP' in articulo or 'N150' in articulo or '200AMP' in articulo or '100AMP' in articulo or '120AMP' in articulo or 'PT120' in articulo or 'PT150' in articulo:
        return 'Celdas plomo-ácido Heavy Duty', 'Alto CCA y resistencia a vibraciones para arranques de motores diésel pesados.'
    if '70AMP' in articulo or '75AMP' in articulo or '90AMP' in articulo or 'NX110' in articulo or '80 AMP' in articulo:
        return 'Placas de Ciclo Profundo Ligero', 'Evita sulfatación por arranques/paradas continuas en furgones de reparto (Stop & Go).'
    if '35AMP' in articulo or '40AMP' in articulo or '55AMP' in articulo:
        return 'Placas delgadas/livianas', 'Entrega instantánea para city cars a gasolina.'
    if 'NOAT' in articulo or 'HEAVY-DUTY HYBRID' in articulo:
        return 'Nitrito-Orgánico (NOAT)', 'Armadura química contra cavitación sónica en camisas de cilindros diésel pesados.'
    if 'SI-OAT' in articulo or 'G12++' in articulo:
        return 'Silicato-Orgánico (Si-OAT)', 'Sella microfisuras. Obligatorio para grupo VAG (Amarok, Crafter).'
    if 'COOLANT ICE FREEZE ORGANIC' in articulo or 'LONG LIFE' in articulo:
        return 'Tecnología OAT (Organic Acid Tech)', 'Sin silicatos/boratos. Larga vida útil, no genera sarro en el radiador.'
    if 'AIRBLUE' in articulo or 'UREA' in articulo or 'DEF' in articulo:
        return 'Urea al 32.5% de alta pureza', 'Convierte NOx letales. Previene cristalización del inyector SCR.'
    if 'DOT-4' in articulo or 'DOT- 4' in articulo:
        return 'Sintético Poliglicol Alto Pto. Ebullición', 'Previene Vapor Lock en flotas que frenan en bajadas prolongadas.'
    if 'LIMPIA CONTACTO' in articulo:
        return 'Solvente Dieléctrico', 'Limpia sensores y ECUs sin cortocircuitos.'
    if 'LIMPIA MANOS' in articulo:
        return 'Tensoactivos con abrasivo suave', 'Arranca grasa y cuida pH. No es grasa mecánica.'
        
    return 'Dato genérico', 'Sujeto a especificación del manual del fabricante.'

try:
    df = pd.read_excel('RMG_Catalogo_Familias.xlsx', sheet_name='Catálogo Jerárquico')
    df['Composición (Ingeniería)'] = ''
    df['Resistencia Técnica / Aplicación'] = ''

    for index, row in df.iterrows():
        comp, res = get_technical_data(row['Artículo'])
        df.at[index, 'Composición (Ingeniería)'] = comp
        df.at[index, 'Resistencia Técnica / Aplicación'] = res

    df.to_excel('RMG_Catalogo_Ingenieria.xlsx', index=False)
    print("¡ÉXITO BOLUDO! Archivo 'RMG_Catalogo_Ingenieria.xlsx' creado en tu carpeta.")
except Exception as e:
    print(f"Error: {e}")
