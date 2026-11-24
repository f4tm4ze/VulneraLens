import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function initDb() {
  const database = process.env.DB_NAME || 'vulneralens_db';

  // Prevent SQL injection via database name
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    console.error('DB_NAME may only contain letters, numbers and underscores.');
    process.exit(1);
  }

  // Connect WITHOUT selecting a database, because it may not exist yet
  const serverConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
    connectTimeout: 5000,
  };

  let connection;
  try {
    connection = await mysql.createConnection(serverConfig);

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`OK: database "${database}" is ready.`);

    await connection.changeUser({ database });

    const sql = fs.readFileSync(path.resolve(__dirname, '../schema.sql'), 'utf8');

    await connection.query(sql);
    console.log(`OK: all tables initialized in "${database}".`);
  } catch (err) {
    console.error(`FAILED: ${err.code || err.message}`);
    console.error('Is MySQL running in the XAMPP Control Panel? Check backend/.env values.');
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

await initDb();
