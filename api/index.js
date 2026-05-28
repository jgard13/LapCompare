const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const pool = require('./db');
const cors = require('cors');
const app = express();
const nodemailer = require('nodemailer');
const fs = require('fs');
const axios = require('axios');

// ROOT = carpeta padre de api/ (funciona en local y Vercel)
const ROOT = path.join(__dirname, '..');
console.log('[START] ROOT:', ROOT, '| __dirname:', __dirname);

const specsPath = path.join(__dirname, 'data', 'filtros_specs.json');
const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'));

// Caché simple en memoria para YouTube para ahorrar cuota de API
const youtubeCache = {};

// Caché en memoria para token de Mercado Libre (OAuth Client Credentials)
let mlToken = null;
let mlTokenExpiry = 0;

async function getMLToken() {
    if (mlToken && Date.now() < mlTokenExpiry) {
        return mlToken;
    }
    const clientId = process.env.ML_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.warn('[ML OAuth] Faltan ML_CLIENT_ID o ML_CLIENT_SECRET en variables de entorno.');
        return null;
    }
    try {
        console.log('[ML OAuth] Solicitando nuevo access token...');
        const resp = await axios.post('https://api.mercadolibre.com/oauth/token', 
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        mlToken = resp.data.access_token;
        // Restamos 5 minutos (300 segundos) para evitar expiración cercana
        mlTokenExpiry = Date.now() + (resp.data.expires_in - 300) * 1000;
        console.log('[ML OAuth] Token obtenido con éxito. Vence en:', new Date(mlTokenExpiry).toISOString());
        return mlToken;
    } catch (error) {
        console.error('[ML OAuth Error] Error al obtener token:', error.response?.data || error.message);
        return null;
    }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sincronización
const syncHandler = async (req, res) => {
    const { laptops, token } = req.body;
    if (token !== 'lapcompare_sync_secret_2026') return res.status(403).json({ error: 'No autorizado' });
    if (!laptops || !Array.isArray(laptops)) return res.status(400).json({ error: 'Datos inválidos' });
    
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const lap of laptops) {
                // Verificar si ya existe una computadora con el mismo nombre y tienda
                const existingRes = await client.query(`
                    SELECT id, link FROM computadora 
                    WHERE tienda = $1 AND LOWER(nombre) = LOWER($2)
                `, [lap.tienda, lap.nombre]);

                if (existingRes.rows.length > 0) {
                    const existing = existingRes.rows[0];
                    
                    // Criterio para decidir si actualizamos el link a uno más limpio/corto
                    const existingIsAd = existing.link.includes("click1.mercadolibre") || existing.link.includes("/mclics/");
                    const newIsAd = lap.link.includes("click1.mercadolibre") || lap.link.includes("/mclics/");
                    
                    let updateLink = false;
                    if (existingIsAd && !newIsAd) {
                        updateLink = true; // El enlace guardado era de anuncio y el nuevo es orgánico
                    } else if (!existingIsAd && newIsAd) {
                        updateLink = false; // El enlace guardado es orgánico y el nuevo es anuncio
                    } else {
                        // Ambos orgánicos o ambos anuncios, preferir el más corto
                        if (lap.link.length < existing.link.length) {
                            updateLink = true;
                        }
                    }

                    if (updateLink) {
                        await client.query(`
                            UPDATE computadora SET
                                nombre = $1, precio = $2, cpu = $3, ram = $4, memoria = $5,
                                gpu = $6, rutaimg = $7, link = $8
                            WHERE id = $9
                        `, [lap.nombre, lap.precio, lap.cpu, lap.ram, lap.memoria, lap.gpu, lap.rutaimg, lap.link, existing.id]);
                    } else {
                        await client.query(`
                            UPDATE computadora SET
                                nombre = $1, precio = $2, cpu = $3, ram = $4, memoria = $5,
                                gpu = $6, rutaimg = $7
                            WHERE id = $8
                        `, [lap.nombre, lap.precio, lap.cpu, lap.ram, lap.memoria, lap.gpu, lap.rutaimg, existing.id]);
                    }
                } else {
                    // No existe, procedemos con la inserción normal
                    await client.query(`
                        INSERT INTO computadora (nombre, precio, cpu, ram, memoria, gpu, tienda, rutaimg, link)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT (link) DO NOTHING
                    `, [lap.nombre, lap.precio, lap.cpu, lap.ram, lap.memoria, lap.gpu, lap.tienda, lap.rutaimg, lap.link]);
                }
            }
            await client.query('COMMIT');
            res.json({ mensaje: 'Sincronización exitosa', procesadas: laptops.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally { client.release(); }
    } catch (error) {
        console.error("Error en sincronización:", error);
        res.status(500).json({ error: 'Error interno' });
    }
};

app.post('/api/sincronizar', syncHandler);
app.post('/sincronizar', syncHandler);

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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Referer': 'https://www.google.com.mx/'
        };

        let reviews = [];
        let status = 'ok';

        // ─────────────────────────────────────────────────────────────
        // MERCADO LIBRE — API oficial con soporte de OAuth 2.0 (Client Credentials)
        // ─────────────────────────────────────────────────────────────
        if (link.includes('mercadolibre.com.mx')) {
            let itemId = null;
            const widMatch = link.match(/[?&]wid=(MLM[A-Z0-9]+)/);
            if (widMatch) {
                itemId = widMatch[1];
            } else {
                const artMatch = link.match(/\/MLM-?(\d+)/);
                if (artMatch) {
                    itemId = 'MLM' + artMatch[1];
                } else {
                    const pMatch = link.match(/\/p\/(MLM[A-Z0-9]+)/);
                    if (pMatch) itemId = pMatch[1];
                }
            }

            if (itemId) {
                console.log(`[Reviews] ML item ID: ${itemId}`);
                try {
                    const reqHeaders = { 'Accept': 'application/json' };
                    const token = await getMLToken();
                    if (token) {
                        reqHeaders['Authorization'] = `Bearer ${token}`;
                    }
                    const mlRes = await axios.get(
                        `https://api.mercadolibre.com/reviews/item/${itemId}`,
                        { headers: reqHeaders, timeout: 8000 }
                    );
                    (mlRes.data.reviews || []).slice(0, 6).forEach(rev => {
                        const text = rev.content || rev.title || '';
                        if (text.length > 5) reviews.push({
                            author: rev.reviewer_name || 'Usuario de Mercado Libre',
                            rating: Math.round(rev.rate || 5),
                            text: text.trim()
                        });
                    });
                    console.log(`[Reviews] ML API OK – ${reviews.length} reseñas`);
                    status = 'ok';
                } catch (e) {
                    console.log(`[Reviews] ML API falló (${e.response?.status ?? e.message})`);
                    status = 'blocked';
                }
            } else {
                status = 'blocked';
            }

        // ─────────────────────────────────────────────────────────────
        // LIVERPOOL — TurnTo: extraer turntokey del __NEXT_DATA__ del HTML
        // ─────────────────────────────────────────────────────────────
        } else if (link.includes('liverpool.com.mx')) {
            try {
                const lvResp = await axios.get(link, { headers, timeout: 12000 });
                const lvHtml = lvResp.data;
                console.log(`[Reviews] Liverpool HTML: ${lvHtml.length} bytes`);

                // 1. Extraer turntokey desde el JSON de __NEXT_DATA__
                let turntoKey = null;
                const ndMatch = lvHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
                if (ndMatch) {
                    try {
                        const nd = JSON.parse(ndMatch[1]);
                        // El key está en flags.data.turntokey o en pageProps.data directamente
                        turntoKey = nd?.props?.pageProps?.data?.flags?.turntokey
                            || nd?.props?.pageProps?.flags?.turntokey
                            || nd?.props?.pageProps?.data?.turntokey;
                        // También puede estar en cualquier nivel, buscamos con regex en el JSON string
                        if (!turntoKey) {
                            const ttMatch = ndMatch[1].match(/"turntokey"\s*:\s*"([^"]+)"/);
                            if (ttMatch) turntoKey = ttMatch[1];
                        }
                    } catch (_) {}
                }

                // Si no lo encontramos en __NEXT_DATA__, buscar directamente en el HTML
                if (!turntoKey) {
                    const ttHtmlMatch = lvHtml.match(/"turntokey"\s*:\s*"([^"]+)"/);
                    if (ttHtmlMatch) turntoKey = ttHtmlMatch[1];
                }

                // Extraer productId: número largo al final de la URL de Liverpool
                const lvProductIdMatch = link.match(/\/(\d{8,})(?:[/?#]|$)/);
                const lvProductId = lvProductIdMatch ? lvProductIdMatch[1] : null;

                if (turntoKey && lvProductId) {
                    console.log(`[Reviews] Liverpool TurnTo key: ${turntoKey} productId: ${lvProductId}`);
                    // Endpoint de TurnTo para ratings+reviews en formato JSON
                    const ttUrl = `https://api.turnto.com/v4/${turntoKey}/${lvProductId}/reviews?locale=es_MX`;
                    try {
                        const ttResp = await axios.get(ttUrl, {
                            headers: { 'Accept': 'application/json', 'Referer': 'https://liverpool.com.mx/' },
                            timeout: 8000
                        });
                        const ttData = ttResp.data;
                        const reviewList = ttData.reviews || ttData.items || ttData.data || [];
                        reviewList.slice(0, 6).forEach(rev => {
                            const text = rev.text || rev.reviewText || rev.body || '';
                            if (text.length > 5) reviews.push({
                                author: rev.author?.name || rev.userNickname || rev.nickname || 'Comprador de Liverpool',
                                rating: Math.round(rev.rating || rev.overallRating || 5),
                                text: text.trim()
                            });
                        });
                        console.log(`[Reviews] TurnTo OK – ${reviews.length} reseñas`);
                        status = 'ok';
                    } catch (ttErr) {
                        console.log(`[Reviews] TurnTo falló (${ttErr.response?.status ?? ttErr.message})`);
                        status = 'blocked';
                    }
                } else {
                    console.log(`[Reviews] Liverpool – turntoKey: ${turntoKey}, productId: ${lvProductId}`);
                    status = 'blocked';
                }

            } catch (lvErr) {
                console.log(`[Reviews] Liverpool error: ${lvErr.message}`);
                status = 'blocked';
            }

        // ─────────────────────────────────────────────────────────────
        // WALMART — __NEXT_DATA__ JSON + regex fallback
        //   Nota: Walmart usa bot-detection (página "Verifica tu identidad")
        //   en IPs de datacenter. Los intentos pueden fallar.
        // ─────────────────────────────────────────────────────────────
        } else if (link.includes('walmart.com.mx')) {
            try {
                let wmHtml = '';
                const zenrowsKey = process.env.ZENROWS_API_KEY;
                if (zenrowsKey) {
                    const proxyUrl = `https://api.zenrows.com/v1/?apikey=${zenrowsKey}&url=${encodeURIComponent(link)}&premium_proxy=true&js_render=true`;
                    const wmResp = await axios.get(proxyUrl, { timeout: 30000 });
                    wmHtml = wmResp.data;
                } else {
                    console.log(`[Reviews] Walmart: Sin ZENROWS_API_KEY, intentando directo...`);
                    const wmResp = await axios.get(link, { headers, timeout: 10000 });
                    wmHtml = wmResp.data;
                }
                console.log(`[Reviews] Walmart HTML: ${wmHtml.length} bytes`);

                const nextDataMatch = wmHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
                if (nextDataMatch) {
                    try {
                        const state = JSON.parse(nextDataMatch[1]);
                        const rList = state?.props?.pageProps?.initialData?.reviews?.reviews
                            || state?.props?.pageProps?.data?.reviews?.reviews || [];
                        rList.slice(0, 5).forEach(r => {
                            const text = r.reviewText || r.text || '';
                            if (text.length > 5) reviews.push({
                                author: r.reviewerName || r.userNickname || 'Comprador de Walmart',
                                rating: Math.round(r.rating || r.overallRating || 5),
                                text: text.trim()
                            });
                        });
                    } catch (_) {}
                }

                if (reviews.length === 0) {
                    const txtMatches = wmHtml.match(/"reviewText"\s*:\s*"([^"]{15,})"/g);
                    if (txtMatches) {
                        txtMatches.slice(0, 5).forEach(m => {
                            const text = m.replace(/"reviewText"\s*:\s*"/, '').replace(/"$/, '');
                            reviews.push({ author: 'Comprador de Walmart', rating: 5, text: text.trim() });
                        });
                    }
                }

                console.log(`[Reviews] Walmart: ${reviews.length} reseñas encontradas`);
                status = reviews.length > 0 ? 'ok' : 'blocked';
            } catch (wmErr) {
                console.log(`[Reviews] Walmart error: ${wmErr.message}`);
                status = 'blocked';
            }

        // ─────────────────────────────────────────────────────────────
        // DD TECH — No cuenta con sistema de reseñas de clientes.
        //   Confirmado por diagnóstico directo del HTML del sitio.
        // ─────────────────────────────────────────────────────────────
        } else if (link.includes('ddtech.mx')) {
            console.log('[Reviews] DDTech: sin sistema de reseñas – retornando vacío.');
            status = 'no_reviews_system';
        }

        // Limpieza final de HTML entities y límite
        reviews = reviews
            .filter(r => r.text && r.text.length > 5)
            .slice(0, 6)
            .map(r => ({
                ...r,
                text: r.text
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
                    .replace(/\\n/g, ' ')
                    .replace(/\\"/g, '"')
                    .trim()
            }));

        console.log(`[Reviews] Total encontradas: ${reviews.length} (Status: ${status})`);
        res.json({ reviews, status });

    } catch (error) {
        console.error("[Reviews Error]", error.message);
        res.json({ reviews: [], status: 'error' });
    }
});

// Redirección principal (va ANTES del listen)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '.\.', 'public', 'pages', 'index.html'));
});

// Levantar el servidor (SIEMPRE va al final)
if (process.env.NODE_ENV !== 'test') {
    app.listen(3000, '0.0.0.0', () => {
        console.log("Servidor corriendo...");
    });
}


module.exports = app;

