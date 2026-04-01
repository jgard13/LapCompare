import re

def limpiar_texto(texto):
    """Normaliza texto para parseo consistente."""
    texto = texto.replace("-", " ").replace("+", " ").replace("_", " ").replace("|", " ").replace("/", " ")
    return re.sub(r'\s+', ' ', texto).strip()

def especificaciones(texto):
    """
    Extrae especificaciones de laptops desde un texto (título, URL, etc.)
    Retorna diccionario con: Procesador, RAM, Almacenamiento, Tarjeta Gráfica, Pantalla
    """
    specs = {
        "Procesador": None,
        "RAM": None,
        "Almacenamiento": None,
        "Tarjeta Gráfica": None
    }
    texto_limpio = limpiar_texto(texto)

    #PROCESADOR

    # Intel Core i-Series (i3, i5, i7, i9) con modelo específico
    intel_core = re.search(
        r'(?:intel\s*)?core\s*(i\d)\s*[- ]+\s*(\d{3,6}[A-Z0-9]*)',
        texto_limpio, re.IGNORECASE
    )

    # Intel Core Ultra (nueva nomenclatura)
    intel_core_ultra = re.search(
        r'(?:intel\s*)?core\s*ultra\s*(\d)\s*[- ]+\s*(\d{2,5}[A-Z]*)',
        texto_limpio, re.IGNORECASE
    )

    # Intel Ultra (sin "Core")
    intel_ultra = re.search(
        r'intel\s*ultra\s*(\d)\s*[- ]+\s*(\d{2,5}[A-Z]*)',
        texto_limpio, re.IGNORECASE
    )

    # Intel Celeron
    intel_celeron = re.search(
        r'celeron\s*[- ]*(\w?\d{3,5}\w*)',
        texto_limpio, re.IGNORECASE
    )

    # Intel Pentium (Silver/Gold)
    intel_pentium = re.search(
        r'pentium\s*(silver|gold)?\s*[- ]*(\w?\d{3,5}\w*)',
        texto_limpio, re.IGNORECASE
    )

    # AMD Ryzen con modelo específico
    amd_ryzen = re.search(
        r'(?:amd\s*)?ryzen\s*(\d)\s*[- ]+\s*(\d{4}[A-Z]*)',
        texto_limpio, re.IGNORECASE
    )

    # AMD Athlon
    amd_athlon = re.search(
        r'(?:amd\s*)?athlon\s*(silver|gold)?\s*[- ]*(\d{4}\w*)',
        texto_limpio, re.IGNORECASE
    )

    # Apple M-Series
    apple_m = re.search(
        r'\b(M[1-4])\s*(Pro|Max|Ultra)?\b',
        texto_limpio, re.IGNORECASE
    )

    # Intel Core i-Series genérico (sin modelo, fallback)
    intel_core_generico = re.search(
        r'(?:intel\s*)?core\s*(i\d)\b',
        texto_limpio, re.IGNORECASE
    )

    # AMD Ryzen genérico (sin modelo, fallback)
    amd_ryzen_generico = re.search(
        r'(?:amd\s*)?ryzen\s*(\d)\b',
        texto_limpio, re.IGNORECASE
    )

    # Asignar procesador (prioridad: específico > genérico)
    if intel_core_ultra:
        specs["Procesador"] = f"Intel Core Ultra {intel_core_ultra.group(1)} {intel_core_ultra.group(2)}"
    elif intel_ultra:
        specs["Procesador"] = f"Intel Ultra {intel_ultra.group(1)} {intel_ultra.group(2)}"
    elif intel_core:
        modelo = intel_core.group(2)
        # Evitar capturar "16GB" como modelo
        if not re.match(r'^\d+(GB|TB)$', modelo, re.IGNORECASE):
            specs["Procesador"] = f"Intel Core {intel_core.group(1)} {modelo}"
    elif amd_ryzen:
        specs["Procesador"] = f"AMD Ryzen {amd_ryzen.group(1)} {amd_ryzen.group(2)}"
    elif apple_m:
        sufijo = f" {apple_m.group(2)}" if apple_m.group(2) else ""
        specs["Procesador"] = f"Apple {apple_m.group(1)}{sufijo}"
    elif intel_celeron:
        specs["Procesador"] = f"Intel Celeron {intel_celeron.group(1)}"
    elif intel_pentium:
        tier = f" {intel_pentium.group(1)}" if intel_pentium.group(1) else ""
        specs["Procesador"] = f"Intel Pentium{tier} {intel_pentium.group(2)}"
    elif amd_athlon:
        tier = f" {amd_athlon.group(1)}" if amd_athlon.group(1) else ""
        specs["Procesador"] = f"AMD Athlon{tier} {amd_athlon.group(2)}"
    # Fallbacks genéricos (solo serie, sin modelo)
    elif intel_core_generico:
        specs["Procesador"] = f"Intel Core {intel_core_generico.group(1)}"
    elif amd_ryzen_generico:
        specs["Procesador"] = f"AMD Ryzen {amd_ryzen_generico.group(1)}"


    # 2. RAM & ALMACENAMIENTO 
    matches_capacidad = list(re.finditer(r'\b(\d+)\s*(GB|TB)\b', texto_limpio, re.IGNORECASE))

    # Paso 2: Clasificar cada match con contexto que NO se solape
    for i, match in enumerate(matches_capacidad):
        val = int(match.group(1))
        unidad = match.group(2).upper()

        inicio, fin = match.span()

        # Contexto: texto entre este match y los adyacentes (no solapar)
        ctx_inicio = matches_capacidad[i-1].end() if i > 0 else max(0, inicio - 20)
        ctx_fin = matches_capacidad[i+1].start() if i < len(matches_capacidad) - 1 else min(len(texto_limpio), fin + 20)
        contexto = texto_limpio[ctx_inicio:ctx_fin].upper()

        es_ram = False
        es_storage = False

        if unidad == "TB":
            es_storage = True
        elif unidad == "GB":
            # Contexto explícito
            if "RAM" in contexto or "DDR" in contexto or "MEMORIA" in contexto or "MEMORY" in contexto:
                es_ram = True
            elif "SSD" in contexto or "HDD" in contexto or "NVME" in contexto or "EMMC" in contexto or "ALMACENAMIENTO" in contexto or "DISCO" in contexto or "PCIE" in contexto:
                es_storage = True
            else:
                # Heurística por magnitud: ≤64GB sin contexto = RAM
                if val <= 64:
                    es_ram = True
                else:
                    es_storage = True

        # Asignar (no sobreescribir si ya se encontró)
        if es_ram and not specs["RAM"]:
            specs["RAM"] = f"{val}GB"
        elif es_storage and not specs["Almacenamiento"]:
            tipo = ""
            if "SSD" in contexto: tipo = " SSD"
            elif "HDD" in contexto: tipo = " HDD"
            elif "NVME" in contexto: tipo = " NVMe"
            elif "EMMC" in contexto: tipo = " eMMC"
            specs["Almacenamiento"] = f"{val}{unidad}{tipo}"

    # 3. TARJETA GRÁFICA

    gpu_encontrada = None

    # NVIDIA RTX / GTX
    nvidia = re.search(r'\b(RTX|GTX)\s*(\d{3,4})\s*(Ti|Super)?\b', texto_limpio, re.IGNORECASE)

    # AMD Radeon (dedicada o integrada)
    radeon = re.search(r'\b(Radeon)\s*(RX\s*\d{3,4}\w*|Vega\s*\d+|Graphics)\b', texto_limpio, re.IGNORECASE)

    # Intel Arc
    arc = re.search(r'\bIntel\s*Arc\s*(\w?\d{3}\w*)\b', texto_limpio, re.IGNORECASE)

    # Intel integradas específicas
    intel_iris = re.search(r'\bIris\s*Xe\b', texto_limpio, re.IGNORECASE)
    intel_uhd = re.search(r'\bUHD\s*Graphics(?:\s*(\d{3}))?\b', texto_limpio, re.IGNORECASE)

    if nvidia:
        sufijo = f" {nvidia.group(3)}" if nvidia.group(3) else ""
        gpu_encontrada = f"{nvidia.group(1).upper()} {nvidia.group(2)}{sufijo}"
    elif radeon:
        gpu_encontrada = f"Radeon {radeon.group(2)}"
    elif arc:
        gpu_encontrada = f"Intel Arc {arc.group(1)}"
    elif intel_iris:
        gpu_encontrada = "Intel Iris Xe"
    elif intel_uhd:
        modelo = f" {intel_uhd.group(1)}" if intel_uhd.group(1) else ""
        gpu_encontrada = f"Intel UHD Graphics{modelo}"

    if gpu_encontrada:
        specs["Tarjeta Gráfica"] = gpu_encontrada

    return specs


def hay_None(specs):
    """Retorna True si algún valor obligatorio es None."""
    campos_obligatorios = ["Procesador", "RAM", "Almacenamiento"]
    return any(specs.get(campo) is None for campo in campos_obligatorios)