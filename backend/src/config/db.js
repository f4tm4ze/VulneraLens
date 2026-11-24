import mysql from 'mysql2/promise';
import 'dotenv/config';

// Unified configuration object
export const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || 'vulneralens_db',
};

// Connection pool: reuses connections instead of opening a new one per request.
export const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000,
});

// Simple connectivity check used by the health endpoint and db:test script.
export async function checkDatabase() {
  try {
    const [rows] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version');
    return rows[0];
  } catch (err) {
    console.error('Database connectivity check failed:', err.message);
    throw err; // Re-throw so the caller knows it failed
  }
}

export default pool;
