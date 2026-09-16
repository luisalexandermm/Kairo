/**
 * Carga las variables de entorno desde .env para desarrollo local.
 * En Vercel no se usa: las variables se configuran en el dashboard.
 */
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match) process.env[match[1]] = match[2];
  }
}
