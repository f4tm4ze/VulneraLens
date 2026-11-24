import 'dotenv/config';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32 || secret.startsWith('replace_with')) {
  console.error('FATAL: set JWT_SECRET in backend/.env to a random string of at least 32 characters.');
  process.exit(1);
}

const { default: app } = await import('./app.js');

const port = Number(process.env.PORT) || 5050;

app.listen(port, '127.0.0.1', () => {
  console.log(`VulneraLens API listening on http://127.0.0.1:${port}`);
});
