/**
 * SoundVision AI — Servidor local
 * Sirve los archivos estáticos y genera automáticamente
 * la lista de imágenes/audios disponibles en /img y /audios.
 *
 * USO:
 *   node server.js
 *   Luego abre http://localhost:3000 en el navegador.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = 3000;
const ROOT    = __dirname;
const IMG_DIR = path.join(ROOT, 'img');
const AUD_DIR = path.join(ROOT, 'audios');

/* ── tipos MIME básicos ────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.mp3':  'audio/mpeg',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

/* ── API: listar medios disponibles ────────────────────── */
function getMediaList() {
  const imgExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
  const audExts = new Set(['.mp3', '.ogg', '.wav', '.m4a']);

  // leer carpeta img/
  let images = [];
  try {
    images = fs.readdirSync(IMG_DIR).filter(f => {
      return imgExts.has(path.extname(f).toLowerCase());
    });
  } catch (_) {}

  // leer carpeta audios/
  let audios = new Set();
  try {
    fs.readdirSync(AUD_DIR).forEach(f => {
      if (audExts.has(path.extname(f).toLowerCase())) {
        // registrar nombre base SIN extensión
        audios.add(path.basename(f, path.extname(f)));
      }
    });
  } catch (_) {}

  // solo imágenes que tienen audio del mismo nombre
  const tracks = images
    .filter(img => {
      const base = path.basename(img, path.extname(img));
      return audios.has(base);
    })
    .map(img => {
      const base  = path.basename(img, path.extname(img));
      // buscar archivo de audio correspondiente
      let audioFile = base + '.mp3';
      try {
        const found = fs.readdirSync(AUD_DIR).find(f =>
          path.basename(f, path.extname(f)) === base
        );
        if (found) audioFile = found;
      } catch (_) {}

      const title = base
        .replace(/^\d+[\s\-\.]*/, '')  // quita número inicial
        .trim();

      return { title, image: img, audio: audioFile };
    });

  return tracks;
}

/* ── Servidor HTTP ─────────────────────────────────────── */
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0]; // ignorar query strings

  /* API route */
  if (url === '/api/media') {
    const tracks = getMediaList();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(tracks));
    return;
  }

  /* Archivos estáticos */
  let filePath = path.join(ROOT, url === '/' ? 'index.html' : url);

  // seguridad: no salir del directorio raíz
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + url);
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ◈ SoundVision AI — Servidor local iniciado');
  console.log(`  → Abre en tu navegador: http://localhost:${PORT}`);
  console.log('');
  console.log('  Carpetas monitoreadas:');
  console.log(`    • Imágenes : ./img/`);
  console.log(`    • Audios   : ./audios/`);
  console.log('');
  console.log('  Agrega imágenes y audios con el mismo nombre base.');
  console.log('  No necesitas editar ningún archivo. Recarga el navegador.');
  console.log('');
});
