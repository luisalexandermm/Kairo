#!/usr/bin/env node
/* =====================================================================
   Genera el logo de Punto Club y todos los íconos de la web/PWA.
   Uso:  node tools/generar-logos.js
   Necesita Google Chrome o Microsoft Edge instalado (se usa en modo headless).

   Diseño: "PUNTO ● CLUB" en Anton inclinada, con el punto lima de la marca
   (anillo negro en fondo claro) y "SNEAKERS" espaciado debajo.
   Ícono de la app: una "P." negra sobre lima.
   ===================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'img');
const FONTS = path.join(ROOT, 'public', 'fonts').replace(/\\/g, '/');
const INK = '#0e0e0e', LIME = '#c6ff3d', PAPER = '#f4f2ec';

const CHROMES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(Boolean);
const CHROME = CHROMES.find(p => fs.existsSync(p));
if (!CHROME) { console.error('No encontré Chrome ni Edge. Pon su ruta en CHROME_PATH.'); process.exit(1); }

const fontCss = `
@font-face{font-family:Anton;src:url(file:///${FONTS}/anton-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:Manrope;font-weight:800;src:url(file:///${FONTS}/manrope-latin-800-normal.woff2) format('woff2')}
html,body{margin:0;padding:0;background:transparent;overflow:hidden}`;

/* Logo horizontal (proporción 4,7 : 1). tinta = color de las letras; anillo = borde del punto */
function logoHtml(tinta, anillo) {
  return `<!doctype html><meta charset="utf-8"><style>${fontCss}
  .l{width:940px;height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:${tinta}}
  .w{font-family:Anton;font-size:150px;line-height:.86;letter-spacing:2px;transform:skewX(-9deg);display:flex;align-items:center;gap:22px;white-space:nowrap}
  .d{width:62px;height:62px;border-radius:50%;background:${LIME};box-sizing:border-box;border:${anillo ? '11px solid ' + anillo : '0'};flex:none;transform:translateY(4px)}
  .s{font-family:Manrope;font-weight:800;font-size:27px;letter-spacing:22px;margin:12px 0 0 22px}
  </style><div class="l"><div class="w">PUNTO<i class="d"></i>CLUB</div><div class="s">SNEAKERS</div></div>`;
}

/* Ícono cuadrado: "P." negra sobre lima. pad = margen interno (0–0.5) para la versión "maskable" */
function iconHtml(size, pad, redondo) {
  const inner = size * (1 - pad * 2);
  return `<!doctype html><meta charset="utf-8"><style>${fontCss}
  .i{width:${size}px;height:${size}px;background:${LIME};display:flex;align-items:center;justify-content:center;border-radius:${redondo ? size * 0.22 + 'px' : '0'}}
  .m{width:${inner}px;height:${inner}px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:${inner * 0.16}px;box-sizing:border-box}
  .p{font-family:Anton;color:${INK};font-size:${inner * 0.86}px;line-height:.74;transform:skewX(-9deg) translateX(${inner * 0.05}px)}
  .d{display:inline-block;width:${inner * 0.2}px;height:${inner * 0.2}px;border-radius:50%;background:${INK};margin-left:${inner * 0.03}px;vertical-align:baseline}
  </style><div class="i"><div class="m"><span class="p">P<i class="d"></i></span></div></div>`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'punto-club-logos-'));
function render(name, html, w, h) {
  const src = path.join(tmp, name + '.html');
  const out = path.join(OUT, name);
  fs.writeFileSync(src, html);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', '--allow-file-access-from-files', `--user-data-dir=${path.join(tmp, 'perfil')}`,
    `--window-size=${w},${h}`, `--screenshot=${out}`, 'file:///' + src.replace(/\\/g, '/')
  ], { stdio: 'ignore' });
  console.log('  ✓', path.relative(ROOT, out));
  return out;
}

/* favicon.ico con PNG adentro (16, 32 y 48 px) */
function writeIco(pngs, out) {
  const imgs = pngs.map(p => fs.readFileSync(p));
  const head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let offset = head.length;
  imgs.forEach((b, i) => {
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20), e = 6 + 16 * i;
    head.writeUInt8(w >= 256 ? 0 : w, e); head.writeUInt8(h >= 256 ? 0 : h, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += b.length;
  });
  fs.writeFileSync(out, Buffer.concat([head, ...imgs]));
  console.log('  ✓', path.relative(ROOT, out));
}

console.log('Generando logos de Punto Club…');
render('punto-club-negro.png', logoHtml(INK, INK), 940, 200);     // para fondos claros
render('punto-club-blanco.png', logoHtml(PAPER, null), 940, 200); // para fondos oscuros
/* Los íconos llevan el prefijo pc- (Punto Club): con un nombre nuevo, el navegador, la app instalada
   y Google no pueden seguir mostrando la copia vieja de kAIRO que tenían guardada. */
for (const s of [180, 192, 512]) render(`pc-icon-${s}.png`, iconHtml(s, 0.08, false), s, s);
render('pc-icon-maskable-512.png', iconHtml(512, 0.16, false), 512, 512); // zona segura del 80 %
for (const s of [32, 48, 96]) render(`pc-favicon-${s}.png`, iconHtml(s, 0.02, true), s, s);
const f16 = render('_f16.png', iconHtml(16, 0, true), 16, 16);
writeIco([f16, path.join(OUT, 'pc-favicon-32.png'), path.join(OUT, 'pc-favicon-48.png')], path.join(OUT, 'pc-favicon.ico'));
// Copia en la raíz: Google y muchos navegadores buscan primero /favicon.ico
fs.copyFileSync(path.join(OUT, 'pc-favicon.ico'), path.join(ROOT, 'public', 'favicon.ico'));
console.log('  ✓ public/favicon.ico');
fs.unlinkSync(f16);

/* Imágenes para el centro de un código QR que lleve a la web (no se publican: van en branding/).
   Borde blanco ancho para separar el logo de los cuadritos del QR. */
const BRAND = path.join(ROOT, 'branding');
fs.mkdirSync(BRAND, { recursive: true });
function qrHtml(size) {
  const b = Math.round(size * 0.07);
  return `<!doctype html><meta charset="utf-8"><style>${fontCss}
  .q{width:${size}px;height:${size}px;background:#fff;border-radius:${size * 0.2}px;box-sizing:border-box;padding:${b}px}
  </style><div class="q">${iconHtml(size - b * 2, 0.08, true).split('</style>')[1]}</div>`.replace('<div class="q">', '<style>' + iconHtml(size - b * 2, 0.08, true).split('<style>')[1].split('</style>')[0] + '</style><div class="q">');
}
const qrOut = (name, html, s) => { const p = render(name, html, s, s); fs.renameSync(p, path.join(BRAND, name)); };
qrOut('qr-centro-punto-club.png', qrHtml(600), 600);            // "P." con borde blanco redondeado
qrOut('qr-centro-punto-club-cuadrado.png', iconHtml(600, 0.08, false), 600); // sin borde, por si la app del QR ya lo pone
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Listo.');
