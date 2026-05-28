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
    )
`).then(() => {
    console.log('[DB Init] Tabla api_cache verificada/creada con éxito.');
}).catch(err => {
    console.error('[DB Init Error] No se pudo crear api_cache:', err.message);
});

module.exports = pool;