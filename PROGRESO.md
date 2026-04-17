# PROGRESO — SoundVision AI
## Arte & Estética · Politécnico Gran Colombiano
---

## Estado del proyecto
Proyecto web interactivo que convierte imágenes en composiciones musicales.
Corre con `node server.js` → `http://localhost:3000`

## Archivos principales
- `index.html` — Estructura HTML (desktop + mobile)
- `style.css` — Estilos glassmorphism
- `app.js` — Lógica principal
- `server.js` — Servidor Node.js con API `/api/media`
- `media-config.js` — Fallback manual de tracks
- `img/` — Imágenes (4 obras)
- `audios/` — Audios MP3 (mismo nombre que imagen)

## Imágenes disponibles
1. `01 - l YFantin-Latour Un Coin de Table.jpg`
2. `02 - La Madonna Sixtina-Rafael Sanzio (1512).jpg`
3. `03 - El Beso-Francesco Hayes (1859).jpg`
4. `99 - Monalisa Marcel Duchamp.jpg`

---

## Sesión 2026-04-17 (conversación 6dbf9a7a / c6fc06b1)
### Lo que se hizo antes del apagón:
- Rediseño completo UI: glassmorphism, dark mode, layout de dos columnas
- Historial en dropdown del top-bar
- Botón "Nueva Creación" prominente
- Modo mobile con control remoto via PeerJS (PIN de 6 dígitos)
- Modo standalone en mobile (sin necesidad de conectarse a desktop)
- Explorador de archivos simulado cargando imágenes dinámicamente desde `/api/media`
- Server.js con API que detecta automáticamente imágenes/audios por nombre

### Problemas pendientes al apagarse (usuario reportó):
1. ✅ **Explorador de imágenes**: ya carga dinámicamente desde carpeta img via API
2. ✅ **Mobile standalone**: ya existe el botón "Usar sin conexión"
3. ❌ **Play remoto no reproduce**: cuando mobile envía play, el desktop no reproduce
4. ❌ **Layout cambia por imagen**: `ar-landscape` altera la interfaz según aspecto de imagen

---

## Sesión 2026-04-17 (conversación actual: 9264eb5b)

### Fix 1 — Play remoto no reproduce
**Problema**: El desktop recibe `cmd-play-pause` pero si el autoplay fue bloqueado por el navegador, `audioEl.play()` falla silenciosamente. El overlay de autoplay existe pero el móvil no puede "hacer clic" en él.
**Solución**: Cuando el móvil envía `cmd-play-pause`, si el audio está cargado pero pausado (incluso por política de autoplay), forzar `audioEl.play()` con un `unlock` de contexto de audio. Si no hay track cargado pero hay historial, lanzar el último.

### Fix 2 — Layout consistente (eliminar ar-landscape)
**Problema**: Las imágenes landscape cambiaban el layout del reproductor (clase `ar-landscape`), haciendo que la interfaz fuera diferente según la imagen.  
**Solución**: Eliminar la lógica de `ar-landscape` y usar siempre el mismo layout de dos columnas.

### Cambios realizados:
- [x] `PROGRESO.md` creado y mantenido desde esta sesión
- [x] **Fix play remoto** (`app.js` v5): nueva función `unlockAudioOnFirstGesture()` que desbloquea el AudioContext silenciosamente al primer gesto del usuario en desktop (clic, tecla, touch). Así cuando el móvil envía `cmd-play-pause`, el navegador ya no bloquea la reproducción.
- [x] **Fix cmd-play-pause mejorado**: ahora maneja directamente `audioEl.play()`, oculta el overlay de autoplay y sincroniza estado al móvil. Si sigue bloqueado (edge case), muestra el overlay como fallback.
- [x] **Fix interfaz consistente**: eliminado todo el bloque `applyRatio` / `ar-landscape` de `launchPlayer()`. El layout es siempre el mismo diseño de dos columnas independientemente de la imagen.

### Estado final:
- Servidor: `node server.js` → `http://localhost:3000`
- API: `/api/media` detecta automáticamente imágenes+audios en `img/` y `audios/`
- Mobile remote: conectarse con PIN → controla desktop incluyendo reproducción
- Mobile standalone: "Usar sin conexión" → reproduce localmente en el celular
- Interfaz: siempre igual (glassmorphism, dos columnas) sin importar la imagen

---
