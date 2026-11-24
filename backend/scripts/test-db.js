// Quick command-line check that the backend can reach MySQL.
import { checkDatabase, pool } from '../src/config/db.js';

try {
  const info = await checkDatabase();
  console.log(`OK: connected to "${info.db}" (MySQL/MariaDB ${info.version})`);
  await pool.end();
} catch (err) {
  console.error(`FAILED: ${err.code || err.message}`);
  if (err.code === 'ECONNREFUSED') console.error('MySQL is not running. Start it in XAMPP.');
  if (err.code === 'ER_BAD_DB_ERROR') console.error('Database missing. Run: npm run db:init');
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('Wrong DB_USER or DB_PASSWORD in .env');
  await pool.end();
  process.exit(1);
}
