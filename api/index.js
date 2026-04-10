require('dotenv').config();
const express = require('express');
const pool = require('./db');
const cors = require('cors');
const app = express();
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const axios = require('axios');

// ROOT = carpeta padre de api/ (funciona en local y Vercel)
const ROOT = path.join(__dirname, '..');
console.log('[START] ROOT:', ROOT, '| __dirname:', __dirname);

const specsPath = path.join(__dirname, 'data', 'filtros_specs.json');
console.log('[START] specsPath:', specsPath, '| exists:', fs.existsSync(specsPath));
const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'));

// Caché simple en memoria para YouTube para ahorrar cuota de API
const youtubeCache = {};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/pages', express.static(path.join(ROOT, 'public', 'pages')));
app.use('/styles', express.static(path.join(ROOT, 'public', 'styles')));
app.use('/scripts', express.static(path.join(ROOT, 'public', 'scripts')));
app.use('/assets', express.static(path.join(ROOT, 'public', 'assets')));
app.use('/Vistas', express.static(path.join(ROOT, 'public', 'pages')));
app.use('/images', express.static(path.join(ROOT, 'public', 'assets', 'images')));


app.post('/registrar', async (req, res) => {
    const { nombre, correo, password } = req.body;
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.LapCompareGmailUser,
            pass: process.env.LapCompareGmailPassword
        }
    });

    try {
        // 1. Insertamos el usuario en la base de datos
        const nuevoUsuario = await pool.query(
            'INSERT INTO usuario (correo, usuario, contrasena) VALUES ($1, $2, $3) RETURNING *',
            [correo, nombre, password]
        );

        // 2. Si la inserción fue exitosa, intentamos enviar el correo
        try {
            const htmlPath = path.join(__dirname, '.\.', 'public', 'pages', 'VistaCorreo.html');
            const contenidoHTML = fs.readFileSync(htmlPath, 'utf8');
            const mailOptions = {
                from: '"Lap-Compare" <no.reply.lapcom@gmail.com>',
                to: correo,
                subject: '¡Bienvenido a LapCompare!',
                html: contenidoHTML
            };

            await transporter.sendMail(mailOptions);
            console.log('Email enviado exitosamente a:', correo);

        } catch (mailErr) {
            // Si el correo falla, logueamos el error pero NO detenemos el registro
            console.error('Error al enviar el email, pero el usuario se registró:', mailErr);
        }

        // 3. Respondemos al cliente que el registro fue exitoso
        res.status(201).json({
            mensaje: "Usuario creado!",
            usuario: nuevoUsuario.rows[0]
        });

    } catch (err) {
        // Este catch atrapa errores de la base de datos (ej. correo duplicado)
        console.error('Error en el registro:', err.message, err.stack);
        res.status(500).json({ error: "Hubo un error en el servidor: " + err.message });
    }
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;

    try {
        // Ejecutamos la consulta
        const usuario = await pool.query(
            'SELECT * FROM usuario WHERE usuario = $1 AND contrasena = $2',
            [nombre, password]
        );

        if (usuario.rows.length > 0) {
            const datosUsuario = usuario.rows[0];
            res.json({
                mensaje: "Bienvenido",
                usuario: {
                    id: datosUsuario.id,
                    usuario: datosUsuario.usuario,
                    correo: datosUsuario.correo
                }
            });
        } else {
            res.status(401).json({ error: "Credenciales incorrectas" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error en el servidor" });
    }
});


app.get('/Computadoras', async (req, res) => {
    try {
        console.log('[DB] DATABASE_URL presente:', !!process.env.DATABASE_URL);
        const result = await pool.query('SELECT * FROM computadora');
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener computadoras:", err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
});

app.post('/favoritos/toggle', async (req, res) => {
    const { id_usu, id_comp } = req.body;
    try {
        const existe = await pool.query('SELECT esfavorito FROM lista WHERE id_usu = $1 AND id_comp = $2', [id_usu, id_comp]);

        if (existe.rows.length > 0) {
            const nuevoEstado = !existe.rows[0].esfavorito;
            await pool.query('UPDATE lista SET esfavorito = $1 WHERE id_usu = $2 AND id_comp = $3', [nuevoEstado, id_usu, id_comp]);
            res.json({ esfavorito: nuevoEstado });
        } else {
            await pool.query('INSERT INTO lista (id_usu, id_comp, fechahora, esfavorito, cantidadvi) VALUES ($1, $2, NOW(), true, 0)', [id_usu, id_comp]);
            res.json({ esfavorito: true });
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});
app.post('/interaccion/vista', async (req, res) => {
    const { id_usu, id_comp } = req.body;

    try {
        // 1. Verificamos si ya existe en la tabla "lista"
        const existe = await pool.query(
            'SELECT * FROM lista WHERE id_usu = $1 AND id_comp = $2',
            [id_usu, id_comp]
        );

        if (existe.rows.length > 0) {
            const registro = existe.rows[0];

            if (registro.cantidadvi > 0) {
                // Ya tiene una posición en el historial, solo actualizamos la fecha
                await pool.query(
                    'UPDATE lista SET fechahora = NOW() WHERE id_usu = $1 AND id_comp = $2',
                    [id_usu, id_comp]
                );
            } else {
                // Existe (como favorito) pero NO está en el historial (cantidadvi = 0). 
                // Hay que meterlo al historial de vistos.
                const conteoRes = await pool.query(
                    'SELECT COUNT(*) FROM lista WHERE id_usu = $1 AND cantidadvi > 0',
                    [id_usu]
                );
                const totalVistos = parseInt(conteoRes.rows[0].count);

                if (totalVistos < 10) {
                    // Hay espacio: Le asignamos la siguiente posición y actualizamos la fecha
                    await pool.query(
                        'UPDATE lista SET fechahora = NOW(), cantidadvi = $3 WHERE id_usu = $1 AND id_comp = $2',
                        [id_usu, id_comp, totalVistos + 1]
                    );
                } else {
                    // NO HAY ESPACIO: Buscamos el registro más antiguo del historial
                    const masAntiguoRes = await pool.query(`
                        SELECT id_comp, cantidadvi, esfavorito FROM lista 
                        WHERE id_usu = $1 AND cantidadvi > 0
                        ORDER BY fechahora ASC LIMIT 1
                    `, [id_usu]);

                    if (masAntiguoRes.rows.length > 0) {
                        const antiguo = masAntiguoRes.rows[0];

                        // ¡Importante! Si el antiguo es favorito, NO lo borramos, solo lo sacamos del historial (cantidadvi = 0)
                        if (antiguo.esfavorito) {
                            await pool.query('UPDATE lista SET cantidadvi = 0 WHERE id_usu = $1 AND id_comp = $2', [id_usu, antiguo.id_comp]);
                        } else {
                            await pool.query('DELETE FROM lista WHERE id_usu = $1 AND id_comp = $2', [id_usu, antiguo.id_comp]);
                        }

                        // Ahora sí, actualizamos el registro actual para que ocupe el lugar que se liberó
                        await pool.query(
                            'UPDATE lista SET fechahora = NOW(), cantidadvi = $3 WHERE id_usu = $1 AND id_comp = $2',
                            [id_usu, id_comp, antiguo.cantidadvi]
                        );
                    }
                }
            }
        } else {
            // 2. Si es TOTALMENTE NUEVO, contamos cuántos hay en el historial
            const conteoRes = await pool.query(
                'SELECT COUNT(*) FROM lista WHERE id_usu = $1 AND cantidadvi > 0',
                [id_usu]
            );
            const totalVistos = parseInt(conteoRes.rows[0].count);

            if (totalVistos < 10) {
                // Hay espacio: Insertamos normalmente
                await pool.query(
                    'INSERT INTO lista (id_usu, id_comp, fechahora, esfavorito, cantidadvi) VALUES ($1, $2, NOW(), false, $3)',
                    [id_usu, id_comp, totalVistos + 1]
                );
            } else {
                // NO HAY ESPACIO: Buscamos el más antiguo
                const masAntiguoRes = await pool.query(`
                    SELECT id_comp, cantidadvi, esfavorito FROM lista 
                    WHERE id_usu = $1 AND cantidadvi > 0
                    ORDER BY fechahora ASC LIMIT 1
                `, [id_usu]);

                if (masAntiguoRes.rows.length > 0) {
                    const antiguo = masAntiguoRes.rows[0];

                    // Volvemos a proteger el registro si es favorito
                    if (antiguo.esfavorito) {
                        await pool.query('UPDATE lista SET cantidadvi = 0 WHERE id_usu = $1 AND id_comp = $2', [id_usu, antiguo.id_comp]);
                    } else {
                        await pool.query('DELETE FROM lista WHERE id_usu = $1 AND id_comp = $2', [id_usu, antiguo.id_comp]);
                    }

                    // INSERTAMOS el nuevo dispositivo ocupando ese lugar
                    await pool.query(
                        'INSERT INTO lista (id_usu, id_comp, fechahora, esfavorito, cantidadvi) VALUES ($1, $2, NOW(), false, $3)',
                        [id_usu, id_comp, antiguo.cantidadvi]
                    );
                }
            }
        }
        res.sendStatus(200);
    } catch (err) {
        console.error("Error en historial:", err);
        res.status(500).send(err.message);
    }
});
// OBTENER FAVORITOS DEL USUARIO
app.get('/api/favoritos/:id_usu', async (req, res) => {
    const { id_usu } = req.params; // id_usu es ahora el ID numérico
    try {

        const query = `
            SELECT c.* FROM lista l
            INNER JOIN computadora c ON l.id_comp = c.id
            WHERE l.id_usu = $1 AND l.esfavorito = true
        `;
        const result = await pool.query(query, [id_usu]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error BD Favoritos:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// OBTENER HISTORIAL DE VISTOS DEL USUARIO
app.get('/api/vistos/:id_usu', async (req, res) => {
    const { id_usu } = req.params; // id_usu es ahora el ID numérico
    try {
        const query = `
            SELECT c.* FROM lista l
            INNER JOIN computadora c ON l.id_comp = c.id
            WHERE l.id_usu = $1 AND l.cantidadvi > 0
            ORDER BY l.fechahora DESC
        `;
        const result = await pool.query(query, [id_usu]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error BD Vistos:", err.message);
        res.status(500).json({ error: err.message });
    }
});
//MODULO DE FILTROS AVANZADOS

// Helper para parsear precios robustamente (ej: "$1,200.50" -> 1200.5)
function parsePrecio(p) {
    if (typeof p === 'number') return p;
    if (!p) return 0;
    const limpio = p.toString().replace(/[^0-9.]/g, '');
    return parseFloat(limpio) || 0;
}

// Helper para parsear RAM (ej: "16GB" -> 16)
function parseRAM(ramStr) {
    if (!ramStr) return 0;
    const match = ramStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

// Helper para parsear SSD/Memoria (ej: "512GB SSD" -> 512, "1TB" -> 1024)
function parseSSD(memStr) {
    if (!memStr) return 0;
    const match = memStr.match(/(\d+)\s*(GB|TB)/i);
    if (!match) return 0;
    let valor = parseInt(match[1]);
    if (match[2].toUpperCase() === 'TB') valor *= 1024;
    return valor;
}

// Helper para determinar el "Tier" del CPU (i3=3, i5=5, etc)
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

// Helper para determinar la generación del CPU
function getCPUGen(cpuStr) {
    if (!cpuStr) return 0;
    cpuStr = cpuStr.toLowerCase();

    // Intel: busca iX-NN... o iX NN...
    const intelMatch = cpuStr.match(/i\d[- ](\d+)/);
    if (intelMatch) return parseInt(intelMatch[1].substring(0, intelMatch[1].length > 2 ? 2 : 1));
    if (intelMatch && intelMatch[1].length >= 4) return parseInt(intelMatch[1].substring(0, 2)); // 10, 11, 12...

    // AMD Ryzen: busca Ryzen X N...
    const amdMatch = cpuStr.match(/ryzen \d (\d)/);
    if (amdMatch) {
        const firstDigit = parseInt(amdMatch[1]);
        // Mapeo simple: Ryzen 5000 -> aprox Gen 11 Intel, Ryzen 7000 -> Gen 13
        if (firstDigit === 7) return 13;
        if (firstDigit === 5) return 11;
        if (firstDigit === 3) return 9;
        return firstDigit + 5;
    }
    return 1;
}

// Función para llamar al LLM local
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

//Endpoint para buscar video reseñas en YouTube
app.get('/api/search-video', async (req, res) => {
    const { q } = req.query;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "YouTube API Key no configurada en el servidor." });
    }

    //Revisar si ya tenemos este resultado en caché
    if (youtubeCache[q]) {
        console.log(`[YouTube Cache] Sirviendo resultado para: ${q}`);
        return res.json({ videoId: youtubeCache[q] });
    }

    try {
        console.log(`[YouTube API] Buscando: ${q}`);
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: `${q} review español`,
                maxResults: 1,
                type: 'video',
                relevanceLanguage: 'es',
                key: apiKey
            }
        });

        const items = response.data.items;
        if (items && items.length > 0) {
            const videoId = items[0].id.videoId;
            //Guardar en cache antes de responder
            youtubeCache[q] = videoId;
            res.json({ videoId });
        } else {
            res.status(404).json({ error: "No se encontraron videos." });
        }
    } catch (error) {
        console.error("Error en YouTube API:", error.response?.data || error.message);
        res.status(500).json({ error: "Error al buscar en YouTube." });
    }
});

app.post('/api/laptops/filtrar', async (req, res) => {
    const { etiquetas, precio_min, precio_max, modo } = req.body;
    console.log(`[Filtrado] Etiquetas: ${etiquetas} | Precio: ${precio_min}-${precio_max} | Modo UI: ${modo}`);

    try {
        const result = await pool.query('SELECT * FROM computadora');
        const laptops = result.rows;

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
            console.log(`[Filtrado] Fase 1 sin resultados para ${etiquetas}. Intentando Fallback...`);

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

            // 2. El más barato que cumple MÍNIMO (obteniendo requerimientos mínimos otra vez para seguridad)
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

        res.json({
            laptops: filtradas,
            mensaje,
            tipo,
            sugerencia
        });

    } catch (err) {
        console.error("[ERROR Filtrado]", err);
        res.status(500).json({ error: "Error interno procesando filtros" });
    }
});

//Endpoint separado para el feedback del asistente
app.post('/api/laptops/feedback', async (req, res) => {
    const { laptops, userReq } = req.body;
    try {
        const feedback = await getLLMFeedback(laptops, userReq);
        res.json({ feedback });
    } catch (err) {
        console.error("Error en feedback endpoint:", err);
        res.json({ feedback: "No pudimos obtener el análisis detallado en este momento." });
    }
});

//Endpoint para resumen IA de una sola computadora
app.get('/api/computadora/:id/resumen', async (req, res) => {
    const { id } = req.params;
    console.log(`[Resumen IA] Recibida petición para ID: ${id}`);

    try {
        // Obtener datos de la computadora desde la DB
        console.log(`[Resumen IA] Consultando DB para ID ${id}...`);
        const result = await pool.query('SELECT * FROM computadora WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            console.log(`[Resumen IA] No se encontró computadora con ID ${id}`);
            return res.status(404).json({ error: "Computadora no encontrada" });
        }

        const laptop = result.rows[0];
        console.log(`[Resumen IA] Laptop encontrada: ${laptop.nombre}`);

        // Generar prompt para análisis individual
        const prompt = `Análisis técnico individual.
Laptop: ${laptop.nombre} | Precio: $${laptop.precio}
Especificaciones: CPU=${laptop.cpu}, RAM=${laptop.ram}, GPU=${laptop.gpu}, Almacenamiento=${laptop.memoria}
Proporciona un análisis de 2-3 líneas sobre el perfil de usuario ideal y si el precio es justo para las especificaciones. Responde en español, sé directo y utiliza un tono profesional.`;

        console.log(`[Resumen IA] Solicitando a Ollama...`);
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

        console.log(`[Resumen IA] Respuesta recibida exitosamente`);
        res.json({ resumen: response.data.response });

    } catch (error) {
        console.error(`[Resumen IA Error] ${error.message}${error.response ? ' | Status: ' + error.response.status : ''}`);
        res.json({
            resumen: "Esta laptop ofrece un equilibrio sólido entre rendimiento y precio. Revisa las especificaciones técnicas para confirmar que se ajusta a tus necesidades específicas."
        });
    }
});

// Extraccion de reseñas
app.get('/api/computadora/:id/reviews', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT link, nombre FROM computadora WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "No encontrada" });

        const { link, nombre } = result.rows[0];
        console.log(`[Reviews] Extrayendo para: ${nombre} desde ${link}`);

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-MX,es;q=0.9',
            'Referer': 'https://www.google.com/'
        };

        let reviews = [];

        if (link.includes('mercadolibre.com.mx')) {
            // MERCADO LIBRE: extraer del HTML.
            // En Vercel, las IPs de datacenter son bloqueadas por MeLi, así que
            // intentamos primero directo y si falla usamos allorigins como proxy.
            let html = '';
            try {
                const response = await axios.get(link, { headers, timeout: 10000 });
                html = response.data;
                console.log(`[Reviews] MeLi directo OK. Length: ${html.length}`);
            } catch (directErr) {
                console.log(`[Reviews] MeLi directo falló (${directErr.response?.status || directErr.message}). Intentando proxy...`);
                try {
                    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(link)}`;
                    const proxyResp = await axios.get(proxyUrl, { timeout: 12000 });
                    html = proxyResp.data?.contents || '';
                    console.log(`[Reviews] MeLi proxy OK. Length: ${html.length}`);
                } catch (proxyErr) {
                    console.log(`[Reviews] MeLi proxy también falló: ${proxyErr.message}`);
                }
            }

            if (html) {
                const reviewBlocks = html.split('ui-review-capability-comments__comment__content').slice(1);
                reviewBlocks.forEach(block => {
                    const textMatch = block.match(/>([^<]{10,})<\/p>/);
                    if (textMatch) {
                        reviews.push({
                            author: "Usuario de Mercado Libre",
                            rating: 5,
                            text: textMatch[1].trim()
                        });
                    }
                });
            }

        } else if (link.includes('liverpool.com.mx')) {
            // LIVERPOOL: Las reseñas son cargadas por JavaScript (Bazaarvoice con passkey privado).
            // No es posible obtenerlas con una petición HTTP simple. Se retornara vacio.
            console.log('[Reviews] Liverpool: reseñas requieren JS. Retornando vacío.');

        } else if (link.includes('walmart.com.mx')) {
            // WALMART: Las páginas de producto devuelven HTML muy corto por deteccion de bot.
            // Intentamos con la URL directa.
            try {
                const wmHtml = await axios.get(link, { headers, timeout: 8000 });
                const matches = wmHtml.data.match(/"reviewText":"([^"]{15,})"/g);
                if (matches) {
                    matches.slice(0, 5).forEach(m => {
                        const text = m.replace(/"reviewText":"/, '').replace(/"$/, '');
                        reviews.push({ author: "Comprador de Walmart", rating: 5, text });
                    });
                } else {
                    console.log('[Reviews] Walmart: sin datos de reseñas en HTML.');
                }
            } catch (wmErr) {
                console.log(`[Reviews] Walmart error: ${wmErr.message}`);
            }

        } else if (link.includes('ddtech.mx')) {
            // DD TECH: Cargar página directamente
            try {
                const response = await axios.get(link, { headers, timeout: 10000 });
                const html = response.data;
                const reviewSections = html.split('class="review"').slice(1);
                reviewSections.forEach(section => {
                    const authorMatch = section.match(/<strong>(.*?)<\/strong>/);
                    const textMatch = section.match(/<p>(.*?)<\/p>/);
                    if (textMatch && textMatch[1].length > 5) {
                        reviews.push({
                            author: authorMatch ? authorMatch[1] : "Cliente DD Tech",
                            rating: 5,
                            text: textMatch[1].trim()
                        });
                    }
                });
            } catch (ddErr) {
                console.log(`[Reviews] DD Tech error: ${ddErr.message}`);
            }
        }

        // Limpieza de HTML
        reviews = reviews
            .filter(r => r.text && r.text.length > 5)
            .map(r => ({
                ...r,
                text: r.text
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
                    .trim()
            }));

        console.log(`[Reviews] Total encontradas: ${reviews.length}`);
        res.json({ reviews });

    } catch (error) {
        console.error("[Reviews Error]", error.message);
        res.json({ reviews: [] });
    }
});

// Redirección principal (va ANTES del listen)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '.\.', 'public', 'pages', 'index.html'));
});

// Levantar el servidor (SIEMPRE va al final)
app.listen(3000, '0.0.0.0', () => {
    console.log("Servidor corriendo en red local. Accede desde otro dispositivo usando http://192.168.50.209:3000");
});
module.exports = app;
