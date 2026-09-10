/* ===================== ARCANO TIENDA — FONDO DINÁMICO =====================
   Concepto: "De la luz dorada al misterio oscuro"
   - El usuario entra viendo el fondo crema cálido (#F8F3EB)
   - A medida que hace scroll, el fondo transiciona suavemente a tonos
     más oscuros (café profundo → casi negro con destellos dorados)
   - Manteniendo acentos dorados como hilo conductor de la marca
   - Respeta prefers-reduced-motion (accesibilidad)
   ==================================================================== */

(function() {
  'use strict';

  // Paleta de inicio: crema cálido + dorado + texto oscuro
  var THEME_START = {
    bg:        [248, 243, 235],   // #F8F3EB
    bgCard:    [255, 255, 255],   // #FFFFFF
    surface:   [235, 227, 213],   // #EBE3D5
    border:    [221, 210, 194],   // #DDD2C2
    text:      [30, 18, 10],      // #1E120A
    textSec:   [90, 74, 62],      // #5A4A3E
    textMuted: [138, 122, 106]   // #8A7A6A
  };

  // Paleta final: negro profundo con tinte café (no negro puro para mantener calidez)
  var THEME_END = {
    bg:        [22, 14, 8],       // #160E08 — café muy oscuro, casi negro
    bgCard:    [38, 26, 16],      // #261A10 — café oscuro
    surface:   [50, 36, 22],      // #322416
    border:    [80, 60, 40],      // #503C28
    text:      [245, 230, 208],   // #F5E6D0 — crema (invierte contraste)
    textSec:   [200, 180, 152],   // #C8B498
    textMuted: [150, 130, 105]    // #968269
  };

  // A qué fracción del scroll total llegar al tema final (0.7 = 70% de scroll = tema oscuro completo)
  var SCROLL_COMPLETE_AT = 0.65;

  var root = document.documentElement;
  var lastProgress = -1;
  var ticking = false;

  // === LERP (interpolación lineal) ===
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(start, end, t) {
    return [
      Math.round(lerp(start[0], end[0], t)),
      Math.round(lerp(start[1], end[1], t)),
      Math.round(lerp(start[2], end[2], t))
    ];
  }

  // === Aplicar tema según progreso (0 a 1) ===
  function applyTheme(progress) {
    // Normalizar progreso al rango efectivo
    var t = Math.min(1, Math.max(0, progress / SCROLL_COMPLETE_AT));
    // Curva ease-in-out para que el cambio no sea lineal (más natural)
    var eased = t * t * (3 - 2 * t); // smoothstep

    var bg = lerpColor(THEME_START.bg, THEME_END.bg, eased);
    var bgCard = lerpColor(THEME_START.bgCard, THEME_END.bgCard, eased);
    var surface = lerpColor(THEME_START.surface, THEME_END.surface, eased);
    var border = lerpColor(THEME_START.border, THEME_END.border, eased);
    var text = lerpColor(THEME_START.text, THEME_END.text, eased);
    var textSec = lerpColor(THEME_START.textSec, THEME_END.textSec, eased);
    var textMuted = lerpColor(THEME_START.textMuted, THEME_END.textMuted, eased);

    root.style.setProperty('--bg-r', bg[0]);
    root.style.setProperty('--bg-g', bg[1]);
    root.style.setProperty('--bg-b', bg[2]);
    root.style.setProperty('--bg-card-r', bgCard[0]);
    root.style.setProperty('--bg-card-g', bgCard[1]);
    root.style.setProperty('--bg-card-b', bgCard[2]);
    root.style.setProperty('--surface-r', surface[0]);
    root.style.setProperty('--surface-g', surface[1]);
    root.style.setProperty('--surface-b', surface[2]);
    root.style.setProperty('--border-r', border[0]);
    root.style.setProperty('--border-g', border[1]);
    root.style.setProperty('--border-b', border[2]);
    root.style.setProperty('--text-r', text[0]);
    root.style.setProperty('--text-g', text[1]);
    root.style.setProperty('--text-b', text[2]);
    root.style.setProperty('--scroll-progress', eased);

    // Ajustar gold-glow para que sea más brillante en oscuro
    var glowAlpha = 0.15 + eased * 0.20;
    root.style.setProperty('--gold-glow', 'rgba(196, 148, 58, ' + glowAlpha.toFixed(3) + ')');

    lastProgress = progress;
  }

  // === Calcular progreso de scroll (0 a 1) ===
  function getScrollProgress() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    ) - window.innerHeight;
    if (docHeight <= 0) return 0;
    return Math.min(1, Math.max(0, scrollTop / docHeight));
  }

  // === RAF throttled update ===
  function update() {
    var progress = getScrollProgress();
    if (Math.abs(progress - lastProgress) > 0.001) {
      applyTheme(progress);
    }
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }

  // === Generar partículas doradas (polvo de especias) ===
  function generateParticles(count) {
    var container = document.getElementById('bg-particles');
    if (!container) return;
    container.innerHTML = '';
    // Respetar prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Limitar partículas en pantallas pequeñas para performance
    var isMobile = window.innerWidth < 768;
    var finalCount = isMobile ? Math.min(count || 12, 8) : (count || 18);
    for (var i = 0; i < finalCount; i++) {
      var p = document.createElement('div');
      p.className = 'bg-particle';
      // Posición aleatoria
      p.style.left = Math.random() * 100 + '%';
      p.style.top = Math.random() * 100 + '%';
      // Variación de tamaño 2-6px
      var size = 2 + Math.random() * 4;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      // Variables CSS personalizadas para la animación
      p.style.setProperty('--p-duration', (15 + Math.random() * 20) + 's');
      p.style.setProperty('--p-delay', (Math.random() * -20) + 's');
      p.style.setProperty('--p-opacity', (0.3 + Math.random() * 0.5).toFixed(2));
      container.appendChild(p);
    }
  }

  // === INIT ===
  function init() {
    // Aplicar tema inicial
    applyTheme(0);
    // Generar partículas
    generateParticles(18);
    // Listener de scroll (passive para no bloquear)
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function() {
      // Regenerar partículas en resize (puede cambiar count por mobile)
      generateParticles(18);
      update();
    }, { passive: true });
    // Aplicar una vez más después del primer paint
    setTimeout(update, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
