const express = require('express');
const pool = require('./db');
const cors = require('cors');
const app = express();
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');

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
// Redirección principal (va ANTES del listen)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'index.html'));
});

// Levantar el servidor (SIEMPRE va al final)
app.listen(3000, '0.0.0.0', () => {
    console.log("Servidor corriendo en red local. Accede desde otro dispositivo usando http://192.168.50.209:3000");
});