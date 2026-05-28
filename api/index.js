const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const pool = require('./db');
const { getCache, setCache } = pool;
const { fetchReviews } = require('./reviews');
const { filterLaptops } = require('./filters');
const { getLLMFeedback, getLaptopSummary } = require('./ai');
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

//Endpoint para buscar video reseñas en YouTube
app.get('/api/search-video', async (req, res) => {
    const { q } = req.query;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "YouTube API Key no configurada en el servidor." });
    }

    //Revisar si ya tenemos este resultado en caché (7 días de vida útil)
    const cacheKey = `yt:${q}`;
    const cachedVideoId = await getCache(cacheKey, 604800000);
    if (cachedVideoId) {
        return res.json({ videoId: cachedVideoId });
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
            await setCache(cacheKey, videoId);
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

        const filteredResult = filterLaptops(laptops, specs, { etiquetas, precio_min, precio_max, modo });
        res.json(filteredResult);

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
        const result = await pool.query('SELECT * FROM computadora WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            console.log(`[Resumen IA] No se encontró computadora con ID ${id}`);
            return res.status(404).json({ error: "Computadora no encontrada" });
        }

        const laptop = result.rows[0];
        const resumen = await getLaptopSummary(laptop);
        res.json({ resumen });

    } catch (error) {
        console.error(`[Resumen IA Error] ${error.message}`);
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

        const cacheKey = `reviews:${id}`;
        const cachedData = await getCache(cacheKey, 172800000); // 2 días de vida útil (en ms)
        if (cachedData) {
            return res.json(cachedData);
        }

        const responseData = await fetchReviews(link);

        if (responseData.status === 'ok' || responseData.status === 'no_reviews_system') {
            await setCache(cacheKey, responseData);
        }
        res.json(responseData);

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

