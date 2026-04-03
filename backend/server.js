const express = require('express');
const pool = require('./db');
const cors = require('cors');
const app = express();
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const axios = require('axios');
const specsPath = path.join(__dirname, 'data', 'filtros_specs.json');
const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/pages', express.static(path.join(__dirname, '..', 'frontend', 'pages')));
app.use('/styles', express.static(path.join(__dirname, '..', 'frontend', 'styles')));
app.use('/scripts', express.static(path.join(__dirname, '..', 'frontend', 'scripts')));
app.use('/assets', express.static(path.join(__dirname, '..', 'frontend', 'assets')));
// Legacy paths for compatibility
app.use('/Vistas', express.static(path.join(__dirname, '..', 'frontend', 'pages')));
app.use('/images', express.static(path.join(__dirname, '..', 'frontend', 'assets', 'images')));

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
            'INSERT INTO Usuario (Correo, Usuario, Contrasena) VALUES ($1, $2, $3) RETURNING *',
            [correo, nombre, password]
        );

        // 2. Si la inserción fue exitosa, intentamos enviar el correo
        try {
            const htmlPath = path.join(__dirname, '..', 'frontend', 'pages', 'VistaCorreo.html');
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
        console.error('Error en el registro:', err);
        res.status(500).json({ error: "El correo ya está registrado o hubo un error en el servidor." });
    }
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;

    try {
        // Ejecutamos la consulta
        const usuario = await pool.query(
            'SELECT * FROM Usuario WHERE Usuario = $1 AND Contrasena = $2',
            [nombre, password]
        );

        if (usuario.rows.length > 0) {
            const datosUsuario = usuario.rows[0];
            res.json({
                mensaje: "Bienvenido",
                usuario: {
                    id: datosUsuario.id,          // El ID numérico (INTEGER)
                    usuario: datosUsuario.usuario, // El nombre para el saludo
                    correo: datosUsuario.correo   // El correo para la ID
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
        const result = await pool.query('SELECT * FROM computadora');
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener computadoras:", err);
        res.status(500).json({ error: "Error en el servidor" });
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

// Helper para determinar el "Tier" del CPU
function getCPUTier(cpuStr) {
    if (!cpuStr) return 0;
    cpuStr = cpuStr.toLowerCase();
    if (cpuStr.includes('i9') || cpuStr.includes('ryzen 9') || cpuStr.includes('hx')) return 9;
    if (cpuStr.includes('i7') || cpuStr.includes('ryzen 7')) return 7;
    if (cpuStr.includes('i5') || cpuStr.includes('ryzen 5')) return 5;
    if (cpuStr.includes('i3') || cpuStr.includes('ryzen 3')) return 3;
    return 2; // Básico
}

// Función para llamar al LLM local (Ollama)
// Función para llamar al LLM local (Ollama)
async function getLLMFeedback(laptops, userReq) {
    try {
        console.log("Solicitando feedback a LLM local...");
        const prompt = `Como experto en hardware, explica brevemente (máximo 3 líneas) por qué estas laptops son ideales para un usuario que busca ${userReq.etiquetas.join(', ')} con un presupuesto de $${userReq.precio_min}-$${userReq.precio_max}. Laptops encontradas: ${laptops.map(l => l.nombre).join(', ')}. Responde en español y de forma natural.`;

        const response = await axios.post('http://localhost:11434/api/generate', {
            model: 'llama3',
            prompt: prompt,
            stream: false
        }, { timeout: 3000 });

        return response.data.response;
    } catch (error) {
        console.log("LLM no disponible o timeout, usando respuesta genérica.");
        return "He seleccionado estos modelos basándome en su excelente balance de componentes y su capacidad para ejecutar los programas que necesitas.";
    }
}

// NUEVO: Endpoint para buscar video reseñas en YouTube
app.get('/api/search-video', async (req, res) => {
    const { q } = req.query;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "YouTube API Key no configurada en el servidor." });
    }

    try {
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
            res.json({ videoId: items[0].id.videoId });
        } else {
            res.status(404).json({ error: "No se encontraron videos." });
        }
    } catch (error) {
        console.error("Error en YouTube API:", error.response?.data || error.message);
        res.status(500).json({ error: "Error al buscar en YouTube." });
    }
});

app.post('/api/laptops/filtrar', async (req, res) => {
    console.log("Petición de filtrado recibida:", req.body);
    const { etiquetas, precio_min, precio_max, modo } = req.body;

    try {
        // 1. Obtener todas las laptops
        const result = await pool.query('SELECT * FROM computadora');
        let laptops = result.rows;

        // 2. Determinar los requerimientos combinados de las etiquetas
        let reqRAM = 0, reqCPU = 0, reqSSD = 0;
        etiquetas.forEach(tag => {
            const catSpecs = specs.categorias[tag];
            if (catSpecs) {
                const s = catSpecs[modo === 'minimo' ? 'minimo' : 'optimo'];
                reqRAM = Math.max(reqRAM, s.ram);
                reqCPU = Math.max(reqCPU, s.cpu_tier);
                reqSSD = Math.max(reqSSD, s.ssd);
            }
        });

        // 3. Filtrado por especificaciones y precio
        let filtradas = laptops.filter(lap => {
            const p = parseFloat(lap.precio);
            const r = parseRAM(lap.ram);
            const c = getCPUTier(lap.cpu);
            const s = parseSSD(lap.memoria);

            return p >= precio_min && p <= precio_max &&
                r >= reqRAM && c >= reqCPU && s >= reqSSD;
        });

        let mensaje = "";
        let tipoBusqueda = "Exacta";

        // 4. Lógica de Fallback (Similares)
        if (filtradas.length === 0) {
            tipoBusqueda = "Similares";
            mensaje = "No encontramos laptops exactas en ese rango, pero aquí tienes unas similares (expandiendo +-15% presupuesto y specs).";

            const tolP = 1.15; // 15% más de presupuesto
            const tolS = 0.85; // 15% menos de specs

            filtradas = laptops.filter(lap => {
                const p = parseFloat(lap.precio);
                const r = parseRAM(lap.ram);
                const c = getCPUTier(lap.cpu);
                const s = parseSSD(lap.memoria);

                return p <= (precio_max * tolP) &&
                    r >= (reqRAM * tolS) && c >= (reqCPU * tolS) && s >= (reqSSD * tolS);
            });
        }

        // 5. Fallback Crítico (2 Dispositivos Fijos sugeridos)
        if (filtradas.length === 0) {
            tipoBusqueda = "Referencia";
            mensaje = "No se encontraron dispositivos en tu rango de precio. Aquí tienes los que sí cumplen tus requerimientos independientemente del precio.";

            const opt = laptops.filter(l => parseRAM(l.ram) >= reqRAM && getCPUTier(l.cpu) >= reqCPU).sort((a, b) => a.precio - b.precio)[0];
            const min = laptops.filter(l => parseRAM(l.ram) >= (reqRAM * 0.5)).sort((a, b) => a.precio - b.precio)[0];
            filtradas = [opt, min].filter(Boolean);
        }

        // Ordenar por precio más cercano al máximo (decisión de prioridad)
        filtradas.sort((a, b) => Math.abs(a.precio - precio_max) - Math.abs(b.precio - precio_max));

        // Sugerencia: El más barato que cumple los filtros Óptimos
        const sugerencia = laptops
            .filter(lap => parseRAM(lap.ram) >= reqRAM && getCPUTier(lap.cpu) >= reqCPU)
            .sort((a, b) => a.precio - b.precio)[0];

        // Obtener retroalimentación del LLM para los tops
        const feedback = await getLLMFeedback(filtradas.slice(0, 3), { etiquetas, precio_min, precio_max });

        res.json({
            laptops: filtradas,
            mensaje: mensaje,
            tipo: tipoBusqueda,
            sugerencia: sugerencia,
            feedback: feedback
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Redirección principal (va ANTES del listen)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'index.html'));
});

// Levantar el servidor (SIEMPRE va al final)
app.listen(3000, '0.0.0.0', () => {
    console.log("Servidor corriendo en red local. Accede desde otro dispositivo usando http://192.168.50.209:3000");
});