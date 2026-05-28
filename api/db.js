const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = process.env.DATABASE_URL 
    ? new Pool({ 
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } 
      })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DATABASE,
        password: process.env.BDPASSWORD,
        port: process.env.DB_PORT || 5432,
    });

// Inicializar tablas necesarias de forma automática (útil para Supabase en Vercel)
pool.query(`
    CREATE TABLE IF NOT EXISTS api_cache (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS control_actualizacion (
        id SERIAL PRIMARY KEY,
        fuente VARCHAR(100) NOT NULL,
        fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(50) NOT NULL,
        detalles TEXT
    );
`).then(() => {
    console.log('[DB Init] Tablas api_cache y control_actualizacion verificadas/creadas con éxito.');
}).catch(err => {
    console.error('[DB Init Error] No se pudieron crear las tablas iniciales:', err.message);
});

// Funciones de caché en base de datos
async function getCache(key, maxAgeMs) {
    try {
        const res = await pool.query('SELECT value, created_at FROM api_cache WHERE key = $1', [key]);
        if (res.rows.length > 0) {
            const row = res.rows[0];
            const age = Date.now() - new Date(row.created_at).getTime();
            if (age < maxAgeMs) {
                console.log(`[Cache DB] Acierto (Hit) para la clave: ${key}`);
                return JSON.parse(row.value);
            } else {
                console.log(`[Cache DB] Clave expirada: ${key}`);
            }
        }
    } catch (err) {
        console.error('[Cache DB Error] Error leyendo de caché:', err.message);
    }
    return null;
}

async function setCache(key, value) {
    try {
        const valueStr = JSON.stringify(value);
        await pool.query(
            `INSERT INTO api_cache (key, value, created_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (key) 
             DO UPDATE SET value = EXCLUDED.value, created_at = NOW()`,
            [key, valueStr]
        );
        console.log(`[Cache DB] Clave guardada/actualizada: ${key}`);
    } catch (err) {
        console.error('[Cache DB Error] Error escribiendo en caché:', err.message);
    }
}

pool.getCache = getCache;
pool.setCache = setCache;

module.exports = pool;