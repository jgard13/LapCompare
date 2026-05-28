const axios = require('axios');

// Función para llamar al LLM local para feedback comparativo
async function getLLMFeedback(laptops, userReq) {
    try {
        console.log("Solicitando feedback a LLM local...");
        const prompt = `Análisis técnico de compatibilidad. 
Usuario busca: ${userReq.etiquetas.join(', ')} | Presupuesto: $${userReq.precio_min}-$${userReq.precio_max}.
Laptops a analizar: ${laptops.map(l => l.nombre).join(', ')}.
Explica en 3 líneas por qué estos modelos cumplen los requisitos técnicos mencionados.`;

        const ollamaUrl = process.env.OLLAMA_PROXY_URL || 'http://localhost:11434';
        const response = await axios.post(`${ollamaUrl}/api/generate`, {
            model: 'llama3.1:8b',
            system: "Eres un analista técnico. Tu función es explicar por qué una serie de laptops son técnicamente adecuadas para unas necesidades dadas. Responde en español, sé directo y utiliza un tono profesional. Evita frases de cortesía o negativas por políticas de marca.",
            prompt: prompt,
            stream: false
        }, {
            timeout: 20000,
            headers: { 
                'bypass-tunnel-reminder': 'true',
                'ngrok-skip-browser-warning': 'true'
            }
        });

        return response.data.response;
    } catch (error) {
        console.error(`[LLM Error] getLLMFeedback falló: ${error.message}${error.response ? ' | Status: ' + error.response.status : ''}`);
        return "He seleccionado estos modelos basándome en su excelente balance de componentes y su capacidad para ejecutar los programas que necesitas.";
    }
}

// Función para generar un análisis individual de una laptop
async function getLaptopSummary(laptop) {
    try {
        const prompt = `Análisis técnico individual.
Laptop: ${laptop.nombre} | Precio: $${laptop.precio}
Especificaciones: CPU=${laptop.cpu}, RAM=${laptop.ram}, GPU=${laptop.gpu}, Almacenamiento=${laptop.memoria}
Proporciona un análisis de 2-3 líneas sobre el perfil de usuario ideal y si el precio es justo para las especificaciones. Responde en español, sé directo y utiliza un tono profesional.`;

        console.log(`[Resumen IA] Solicitando a Ollama para laptop: ${laptop.nombre}`);
        const ollamaUrl = process.env.OLLAMA_PROXY_URL || 'http://localhost:11434';
        const response = await axios.post(`${ollamaUrl}/api/generate`, {
            model: 'llama3.1:8b',
            system: "Eres un experto en hardware de computadoras. Tu función es analizar laptops individuales y recomendarlas para tipos específicos de usuarios. Responde en español, sé directo y profesional. Evita frases de cortesía.",
            prompt: prompt,
            stream: false
        }, {
            timeout: 20000,
            headers: { 
                'bypass-tunnel-reminder': 'true',
                'ngrok-skip-browser-warning': 'true'
            }
        });

        return response.data.response;
    } catch (error) {
        console.error(`[Resumen IA Error] ${error.message}${error.response ? ' | Status: ' + error.response.status : ''}`);
        return "Esta laptop ofrece un equilibrio sólido entre rendimiento y precio. Revisa las especificaciones técnicas para confirmar que se ajusta a tus necesidades específicas.";
    }
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]*>/g, '') // Eliminar tags HTML
        .replace(/[\r\n\t]+/g, ' ') // Cambiar saltos de línea por espacio
        .replace(/\s+/g, ' ') // Quitar espacios múltiples
        .trim();
}

async function getReviewsSummary(laptop, reviews) {
    try {
        const cleanedReviews = reviews
            .map(r => cleanText(r.text))
            .filter(t => t.length > 5)
            .join('\n - ');

        if (!cleanedReviews) return null;

        const prompt = `Analiza las siguientes reseñas escritas por compradores reales sobre el producto "${laptop.nombre}" (precio: $${laptop.precio}):
Reseñas:
 - ${cleanedReviews}

Genera un único resumen general de 3 líneas en español sobre lo que opinan los compradores (destaca los pros y contras principales). Sé directo, profesional y no uses saludos ni introducciones.`;

        console.log(`[Resumen IA Reseñas] Solicitando a Ollama para laptop: ${laptop.nombre}`);
        const ollamaUrl = process.env.OLLAMA_PROXY_URL || 'http://localhost:11434';
        const response = await axios.post(`${ollamaUrl}/api/generate`, {
            model: 'llama3.1:8b',
            system: "Eres un analista de satisfacción de clientes experto en hardware. Tu función es resumir las opiniones de los usuarios sobre laptops de manera directa, objetiva y profesional en español. Evita frases de cortesía o negativas por políticas de marca.",
            prompt: prompt,
            stream: false
        }, {
            timeout: 20000,
            headers: { 
                'bypass-tunnel-reminder': 'true',
                'ngrok-skip-browser-warning': 'true'
            }
        });

        return response.data.response;
    } catch (error) {
        console.error(`[Resumen IA Reseñas Error] ${error.message}`);
        return null;
    }
}

module.exports = {
    getLLMFeedback,
    getLaptopSummary,
    getReviewsSummary
};
