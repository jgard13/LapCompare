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

module.exports = pool;