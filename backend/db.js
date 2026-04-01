const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database:process.env.DATABASE,
    password:process.env.BDPASSWORD,
    port: 5432,
});

module.exports = pool;