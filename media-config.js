/* ═══════════════════════════════════════════════════════════
   MEDIA CONFIG — Arte & Estética · SoundVision
   ─────────────────────────────────────────────────────────
   INSTRUCCIONES:
     1. Pon tus imágenes en  /img/
     2. Pon los audios  en  /audios/  con EXACTAMENTE el mismo
        nombre que la imagen, pero con extensión .mp3
     3. Agrega el nombre del archivo de imagen en IMAGE_FILES
        (el título se genera automáticamente del nombre)
   ─────────────────────────────────────────────────────────
   Ejemplo:
     img/   → Mi Pintura.jpg
     audios/→ Mi Pintura.mp3
     Aquí   → "Mi Pintura.jpg"
   ═══════════════════════════════════════════════════════════ */

const IMAGE_FILES = [
  // ── Agrega aquí el nombre EXACTO del archivo de imagen ──
  "01 - l YFantin-Latour Un Coin de Table.jpg",
  "02 - La Madonna Sixtina-Rafael Sanzio (1512).jpg",
  "03 - El Beso-Francesco Hayes (1859).jpg",
  "04 - La gran Odalisca-Jean Auguste (1814).jpg",
  "05 - The Blue Boy- Thomas Gainsborough (1770).jpg",
  "06 - El columpio (Fragonard).jpg",
  "07- Dánae, Gustav Klimt (1907 - 1908 ).jpg",
  "08 - L'Étoile, (La estrella )Edgar Degas  (1876 - 1878).jpg",
  "09 - Monalisa Marcel Duchamp.jpg",
  "10 - Sin título (Calavera, 1982).jpg",
  "11 - Ironia Policia Negro (1981).jpg",
  "12 - In the Face of Death Damien Hirst and the Thrill of Mortality.jpg",
  "13 - Zdzislaw Beksinski Untitled.jpg",
  "14 - Animal crucificado en vitrina – Damien Hirs.jpg",
  // ────────────────────────────────────────────────────────
];

/* ── No modificar debajo de esta línea ─────────────────── */
window.TRACKS = IMAGE_FILES.map(f => ({
  title: f
    .replace(/\.[^.]+$/, '')            // quita extensión
    .replace(/^[\d]+[\s\-\.]*/, '')     // quita número inicial
    .trim(),
  image: f,
  audio: f.replace(/\.[^.]+$/, '.mp3'),
}));
