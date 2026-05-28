// Helpers para parsear especificaciones de laptops
function parsePrecio(p) {
    if (typeof p === 'number') return p;
    if (!p) return 0;
    const limpio = p.toString().replace(/[^0-9.]/g, '');
    return parseFloat(limpio) || 0;
}

function parseRAM(ramStr) {
    if (!ramStr) return 0;
    const match = ramStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

function parseSSD(memStr) {
    if (!memStr) return 0;
    const match = memStr.match(/(\d+)\s*(GB|TB)/i);
    if (!match) return 0;
    let valor = parseInt(match[1]);
    if (match[2].toUpperCase() === 'TB') valor *= 1024;
    return valor;
}

function getCPUTier(cpuStr) {
    if (!cpuStr) return 0;
    cpuStr = cpuStr.toLowerCase();
    if (cpuStr.includes('i9') || cpuStr.includes('ryzen 9')) return 9;
    if (cpuStr.includes('i7') || cpuStr.includes('ryzen 7')) return 7;
    if (cpuStr.includes('i5') || cpuStr.includes('ryzen 5')) return 5;
    if (cpuStr.includes('i3') || cpuStr.includes('ryzen 3')) return 3;
    if (cpuStr.includes('celeron') || cpuStr.includes('athlon')) return 2;
    return 2;
}

function getCPUGen(cpuStr) {
    if (!cpuStr) return 0;
    cpuStr = cpuStr.toLowerCase();

    const intelMatch = cpuStr.match(/i\d[- ](\d+)/);
    if (intelMatch) return parseInt(intelMatch[1].substring(0, intelMatch[1].length > 2 ? 2 : 1));

    const amdMatch = cpuStr.match(/ryzen \d (\d)/);
    if (amdMatch) {
        const firstDigit = parseInt(amdMatch[1]);
        if (firstDigit === 7) return 13;
        if (firstDigit === 5) return 11;
        if (firstDigit === 3) return 9;
        return firstDigit + 5;
    }
    return 1;
}

// Función principal de filtrado
function filterLaptops(laptops, specs, { etiquetas, precio_min, precio_max, modo }) {
    // 1. Calcular requerimientos combinados (Máximo entre etiquetas seleccionadas)
    let req = { ram: 0, cpu_tier: 0, cpu_gen: 0, ssd: 0 };
    etiquetas.forEach(tag => {
        const cat = specs.categorias[tag];
        if (cat) {
            const s = cat[modo === 'minimo' ? 'minimo' : 'optimo'];
            req.ram = Math.max(req.ram, s.ram);
            req.cpu_tier = Math.max(req.cpu_tier, s.cpu_tier);
            req.cpu_gen = Math.max(req.cpu_gen, s.cpu_gen || 0);
            req.ssd = Math.max(req.ssd, s.ssd);
        }
    });

    const filterFn = (lap, pMax, rRAM, rTier, rGen, rSSD) => {
        const p = parsePrecio(lap.precio);
        const ram = parseRAM(lap.ram);
        const tier = getCPUTier(lap.cpu);
        const gen = getCPUGen(lap.cpu);
        const ssd = parseSSD(lap.memoria);
        return p <= pMax && p >= precio_min && ram >= rRAM && tier >= rTier && gen >= rGen && ssd >= rSSD;
    };

    // --- FASE 1: Búsqueda exacta (Óptimo/Mínimo según UI + Precio) ---
    let filtradas = laptops.filter(l => filterFn(l, precio_max, req.ram, req.cpu_tier, req.cpu_gen, req.ssd));
    let mensaje = "";
    let tipo = "Exacta";

    // --- FASE 2: Fallback (Si no hay resultados exactos) ---
    if (filtradas.length === 0) {
        // Sub-intento A: Usar specs MÍNIMOS si estábamos en óptimo
        if (modo === 'optimo') {
            let reqMin = { ram: 0, cpu_tier: 0, cpu_gen: 0, ssd: 0 };
            etiquetas.forEach(tag => {
                const cat = specs.categorias[tag] || {};
                const s = cat.minimo || {};
                reqMin.ram = Math.max(reqMin.ram, s.ram || 0);
                reqMin.cpu_tier = Math.max(reqMin.cpu_tier, s.cpu_tier || 0);
                reqMin.cpu_gen = Math.max(reqMin.cpu_gen, s.cpu_gen || 0);
                reqMin.ssd = Math.max(reqMin.ssd, s.ssd || 0);
            });
            filtradas = laptops.filter(l => filterFn(l, precio_max, reqMin.ram, reqMin.cpu_tier, reqMin.cpu_gen, reqMin.ssd));
            if (filtradas.length > 0) {
                mensaje = "No encontramos equipos con tus requisitos Óptimos en este precio, pero estos cumplen con lo Mínimo.";
                tipo = "Minimos";
            }
        }

        // Sub-intento B: Expandir presupuesto ±15% manteniendo specs originales
        if (filtradas.length === 0) {
            const precioExpandido = precio_max * 1.15;
            filtradas = laptops.filter(l => filterFn(l, precioExpandido, req.ram, req.cpu_tier, req.cpu_gen, req.ssd));
            if (filtradas.length > 0) {
                mensaje = "Expandimos un poco tu presupuesto (+15%) para encontrar equipos que cumplan tus requerimientos Óptimos.";
                tipo = "Presupuesto Ext";
            }
        }
    }

    // --- FASE 3: Fallback Crítico (Modo Referencia) ---
    if (filtradas.length === 0) {
        tipo = "Referencia";
        mensaje = "No hay equipos en este rango de precios. Aquí tienes las mejores opciones técnica que cumplen tus requerimientos independientemente del precio.";

        // 1. El más barato que cumple ÓPTIMO
        const opt = laptops
            .filter(l => parseRAM(l.ram) >= req.ram && getCPUTier(l.cpu) >= req.cpu_tier && getCPUGen(l.cpu) >= req.cpu_gen && parseSSD(l.memoria) >= req.ssd)
            .sort((a, b) => parsePrecio(a.precio) - parsePrecio(b.precio))[0];

        // 2. El más barato que cumple MÍNIMO
        let reqMin = { ram: 0, cpu_tier: 0, cpu_gen: 0, ssd: 0 };
        etiquetas.forEach(tag => {
            const s = (specs.categorias[tag] || {}).minimo || {};
            reqMin.ram = Math.max(reqMin.ram, s.ram || 0);
            reqMin.cpu_tier = Math.max(reqMin.cpu_tier, s.cpu_tier || 0);
            reqMin.cpu_gen = Math.max(reqMin.cpu_gen, s.cpu_gen || 0);
            reqMin.ssd = Math.max(reqMin.ssd, s.ssd || 0);
        });
        const min = laptops
            .filter(l => parseRAM(l.ram) >= reqMin.ram && getCPUTier(l.cpu) >= reqMin.cpu_tier)
            .sort((a, b) => parsePrecio(a.precio) - parsePrecio(b.precio))[0];

        filtradas = [opt, min].filter(Boolean);
    }

    // Ordenamiento final por precio más cercano al máximo del usuario
    filtradas.sort((a, b) => Math.abs(parsePrecio(a.precio) - precio_max) - Math.abs(parsePrecio(b.precio) - precio_max));

    // Sugerencia fija (Sugerencia del Especialista)
    const sugerencia = laptops
        .filter(l => parseRAM(l.ram) >= req.ram && getCPUTier(l.cpu) >= req.cpu_tier && getCPUGen(l.cpu) >= req.cpu_gen)
        .sort((a, b) => parsePrecio(a.precio) - parsePrecio(b.precio))[0];

    return {
        laptops: filtradas,
        mensaje,
        tipo,
        sugerencia
    };
}

function levenshteinDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const len1 = s1.length, len2 = s2.length;
    const matrix = [];
    for (let i = 0; i <= len1; i++) matrix[i] = [i];
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return matrix[len1][len2];
}

function levenshteinSimilarity(s1, s2) {
    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    return 1.0 - (distance / maxLength);
}

function getTokens(s) {
    return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
}

function jaccardIndex(s1, s2) {
    const set1 = getTokens(s1);
    const set2 = getTokens(s2);
    if (set1.size === 0 && set2.size === 0) return 1.0;
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

function areSimilar(name1, name2) {
    if (!name1 || !name2) return false;
    if (name1.toLowerCase() === name2.toLowerCase()) return true;

    const jaccard = jaccardIndex(name1, name2);
    const levenshtein = levenshteinSimilarity(name1, name2);
    const combinedScore = (jaccard + levenshtein) / 2;
    return combinedScore >= 0.75;
}

module.exports = {
    parsePrecio,
    parseRAM,
    parseSSD,
    getCPUTier,
    getCPUGen,
    filterLaptops,
    areSimilar
};
