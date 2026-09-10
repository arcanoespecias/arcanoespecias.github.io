/* ===================== ARCANO TIENDA — FONDO DINÁMICO v2 =====================
   Concepto: "De la luz dorada al misterio oscuro"

   Mejoras v2:
   - Configuración remota desde Firebase (admin controla todo).
   - Texto y fondo usan curvas de easing DIFERENTES para mantener
     contraste legible en TODO el rango de scroll.
   - Tipos de partículas: dust, sparkles, snow, embers, stars.
   - Velocidad, cantidad e intensidad configurables.

   Estrategia de contraste:
   - BG cambia en [0 → 0.65] con smoothstep.
   - Texto cambia en [0.30 → 0.65] (más tarde y más rápido) → siempre
     hay buen contraste porque el texto solo empieza a invertirse
     cuando el fondo ya está suficientemente oscuro.
   ==================================================================== */

(function() {
  'use strict';

  // === CONFIG DEFAULT (overrideable por Firebase) ===
  var DEFAULT_CONFIG = {
    tipoParticulas: 'dust',     // dust | sparkles | snow | embers | stars
    cantidadParticulas: 18,     // 0 | 8 | 18 | 30
    velocidadParticulas: 'normal', // slow | normal | fast
    velocidadMesh: 'normal',    // slow | normal | fast | none
    intensidad: 'normal',       // sutil | normal | dramatico
    vignette: true,
    habilitado: true,
    scrollCompleteAt: 0.65      // 0.4 | 0.65 | 0.9
  };

  // === PALETA ===
  var THEME_START = {
    bg:        [248, 243, 235],   // #F8F3EB
    bgCard:    [255, 255, 255],   // #FFFFFF
    surface:   [235, 227, 213],   // #EBE3D5
    border:    [221, 210, 194],   // #DDD2C2
    text:      [30, 18, 10],      // #1E120A
    textSec:   [90, 74, 62],      // #5A4A3E
    textMuted: [138, 122, 106]    // #8A7A6A
  };

  var THEME_END = {
    bg:        [22, 14, 8],       // #160E08 — café muy oscuro
    bgCard:    [38, 26, 16],      // #261A10
    surface:   [50, 36, 22],      // #322416
    border:    [80, 60, 40],      // #503C28
    text:      [245, 230, 208],   // #F5E6D0
    textSec:   [200, 180, 152],   // #C8B498
    textMuted: [150, 130, 105]    // #968269
  };

  // === PRESETS DE PARTÍCULAS ===
  var PARTICLE_PRESETS = {
    dust: {
      // Polvo dorado de especias (original)
      color: 'radial-gradient(circle, rgba(196, 148, 58, 0.9), rgba(160, 118, 44, 0))',
      sizeMin: 2, sizeMax: 6,
      blur: 0.5
    },
    sparkles: {
      // Destellos dorados más grandes y brillantes
      color: 'radial-gradient(circle, rgba(255, 215, 100, 1), rgba(196, 148, 58, 0))',
      sizeMin: 3, sizeMax: 8,
      blur: 0
    },
    snow: {
      // Copos blancos suaves
      color: 'radial-gradient(circle, rgba(255, 255, 255, 0.85), rgba(245, 230, 208, 0))',
      sizeMin: 3, sizeMax: 7,
      blur: 1
    },
    embers: {
      // Brasas anaranjadas (fuego)
      color: 'radial-gradient(circle, rgba(255, 140, 50, 0.9), rgba(220, 80, 30, 0))',
      sizeMin: 2, sizeMax: 5,
      blur: 0.8
    },
    stars: {
      // Estrellas blancas pequeñas (cielo nocturno)
      color: 'radial-gradient(circle, rgba(255, 255, 255, 1), rgba(200, 200, 220, 0))',
      sizeMin: 1, sizeMax: 3,
      blur: 0
    }
  };

  var SPEED_MULTIPLIERS = {
    slow: 1.8,   // 80% más lento
    normal: 1.0,
    fast: 0.5    // 50% más rápido
  };

  var INTENSITY_CONFIG = {
    sutil:     { meshOpacityBase: 0.3, meshOpacityMax: 0.6,  particlesOpacityMax: 0.5, vignetteMax: 0.3, scrollCompleteAt: 0.9 },
    normal:    { meshOpacityBase: 0.5, meshOpacityMax: 1.0,  particlesOpacityMax: 0.9, vignetteMax: 0.5, scrollCompleteAt: 0.65 },
    dramatico: { meshOpacityBase: 0.7, meshOpacityMax: 1.2,  particlesOpacityMax: 1.0, vignetteMax: 0.7, scrollCompleteAt: 0.4 }
  };

  // === ESTADO ===
  var config = Object.assign({}, DEFAULT_CONFIG);
  var root = document.documentElement;
  var lastProgress = -1;
  var ticking = false;

  // === HELPERS ===
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(start, end, t) {
    return [
      Math.round(lerp(start[0], end[0], t)),
      Math.round(lerp(start[1], end[1], t)),
      Math.round(lerp(start[2], end[2], t))
    ];
  }
  // Smoothstep (curva S): 0→0, 0.5→0.5, 1→1, derivada 0 en extremos
  function smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }
  // Remap de un valor de un rango a otro con clamp
  function remapClamp(t, inStart, inEnd) {
    if (t <= inStart) return 0;
    if (t >= inEnd) return 1;
    return (t - inStart) / (inEnd - inStart);
  }

  // === APLICAR TEMA ===
  // Estrategia de contraste:
  // - BG: cambia en [0 → scrollCompleteAt] con smoothstep
  // - Texto: cambia en [scrollCompleteAt * 0.45 → scrollCompleteAt] con smoothstep
  //   (texto empieza a invertirse después de que el fondo ya bajó un 45% del camino)
  // Esto asegura que SIEMPRE hay buen contraste: el texto solo cambia
  // de color cuando el fondo es lo suficientemente oscuro para justificarlo.
  function applyTheme(progress) {
    var scrollEnd = config.scrollCompleteAt;
    var intensity = INTENSITY_CONFIG[config.intensidad] || INTENSITY_CONFIG.normal;

    // BG: interpola en el rango completo [0 → scrollEnd]
    var bgT = smoothstep(progress / scrollEnd);

    // Texto: empieza a cambiar a los 0.45 * scrollEnd, completa al final
    // Esto da como resultado: bg baja un 45% antes de que el texto empiece a cambiar
    var textStart = scrollEnd * 0.45;
    var textT = smoothstep(remapClamp(progress, textStart, scrollEnd));

    // Aplicar
    var bg = lerpColor(THEME_START.bg, THEME_END.bg, bgT);
    var bgCard = lerpColor(THEME_START.bgCard, THEME_END.bgCard, bgT);
    var surface = lerpColor(THEME_START.surface, THEME_END.surface, bgT);
    var border = lerpColor(THEME_START.border, THEME_END.border, bgT);
    var text = lerpColor(THEME_START.text, THEME_END.text, textT);
    var textSec = lerpColor(THEME_START.textSec, THEME_END.textSec, textT);
    var textMuted = lerpColor(THEME_START.textMuted, THEME_END.textMuted, textT);

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
    // scroll-progress ahora refleja el progreso del BG (no del texto)
    // para que las partículas y vignette se sincronicen con el fondo, no con el texto
    root.style.setProperty('--scroll-progress', bgT);

    // Gold glow ajusta brillo en oscuro
    var glowAlpha = 0.15 + bgT * 0.20;
    root.style.setProperty('--gold-glow', 'rgba(196, 148, 58, ' + glowAlpha.toFixed(3) + ')');

    // Aplicar intensidad al mesh y partículas via CSS vars adicionales
    var meshOpacity = intensity.meshOpacityBase + bgT * (intensity.meshOpacityMax - intensity.meshOpacityBase);
    root.style.setProperty('--mesh-opacity', meshOpacity.toFixed(3));
    var particlesOpacity = 0.3 + bgT * (intensity.particlesOpacityMax - 0.3);
    root.style.setProperty('--particles-opacity', particlesOpacity.toFixed(3));
    var vignetteOpacity = config.vignette ? (bgT * intensity.vignetteMax) : 0;
    root.style.setProperty('--vignette-opacity', vignetteOpacity.toFixed(3));

    lastProgress = progress;
  }

  // === SCROLL PROGRESS ===
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

  function update() {
    if (!config.habilitado) return;
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

  // === PARTÍCULAS ===
  function generateParticles() {
    var container = document.getElementById('bg-particles');
    if (!container) return;
    container.innerHTML = '';

    if (!config.habilitado) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var count = config.cantidadParticulas;
    // Reducir en mobile
    if (window.innerWidth < 768) count = Math.min(count, Math.ceil(count / 2));
    if (count <= 0) return;

    var preset = PARTICLE_PRESETS[config.tipoParticulas] || PARTICLE_PRESETS.dust;
    var speedMul = SPEED_MULTIPLIERS[config.velocidadParticulas] || 1;

    for (var i = 0; i < count; i++) {
      var p = document.createElement('div');
      p.className = 'bg-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = Math.random() * 100 + '%';
      var size = preset.sizeMin + Math.random() * (preset.sizeMax - preset.sizeMin);
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.background = preset.color;
      p.style.filter = preset.blur > 0 ? 'blur(' + preset.blur + 'px)' : 'none';
      // Duración base 15-35s, multiplicada por factor de velocidad
      var baseDuration = 15 + Math.random() * 20;
      p.style.setProperty('--p-duration', (baseDuration * speedMul) + 's');
      p.style.setProperty('--p-delay', (Math.random() * -20 * speedMul) + 's');
      p.style.setProperty('--p-opacity', (0.3 + Math.random() * 0.5).toFixed(2));
      container.appendChild(p);
    }
  }

  // === APLICAR CONFIG REMOTA ===
  function applyConfig(remoteConfig) {
    if (!remoteConfig) return;
    config = Object.assign({}, DEFAULT_CONFIG, remoteConfig);
    // Re-aplicar intensidad / scrollComplete
    var intensity = INTENSITY_CONFIG[config.intensidad] || INTENSITY_CONFIG.normal;
    config.scrollCompleteAt = intensity.scrollCompleteAt;

    // Aplicar velocidad del mesh via data attribute (CSS lo lee)
    var bgDynamic = document.querySelector('.bg-dynamic');
    if (bgDynamic) {
      bgDynamic.setAttribute('data-mesh-speed', config.velocidadMesh);
    }

    // Toggle de vignette
    var vignette = document.querySelector('.bg-vignette');
    if (vignette) {
      vignette.style.display = config.vignette ? '' : 'none';
    }

    // Toggle partículas
    var particles = document.getElementById('bg-particles');
    if (particles) {
      particles.style.display = config.habilitado ? '' : 'none';
    }

    // Regenerar partículas con nuevo tipo/cantidad/velocidad
    generateParticles();
    // Re-aplicar tema con nueva config
    applyTheme(getScrollProgress());
  }

  // === CARGAR CONFIG DESDE FIREBASE ===
  function loadConfigFromFirebase() {
    try {
      if (typeof firebase === 'undefined' || !firebase.database) return;
      var ref = firebase.database().ref('arcano/db/tiendaConfig/dinamico');
      ref.on('value', function(snap) {
        var data = snap.val();
        if (data && typeof data === 'object') {
          applyConfig(data);
        } else {
          // No hay config remota, usar defaults
          applyConfig(DEFAULT_CONFIG);
        }
      }, function(err) {
        console.warn('[bg-dynamic] No se pudo cargar config remota:', err);
      });
    } catch (e) {
      console.warn('[bg-dynamic] Firebase no disponible, usando defaults:', e);
    }
  }

  // === INIT ===
  function init() {
    // Aplicar defaults inicial
    applyConfig(DEFAULT_CONFIG);
    applyTheme(0);
    // Listener de scroll
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function() {
      generateParticles();
      update();
    }, { passive: true });
    // Aplicar una vez más después del primer paint
    setTimeout(update, 50);
    // Cargar config remota (Firebase puede no estar listo aún, lo reintentamos)
    var attempts = 0;
    function tryLoadConfig() {
      if (typeof firebase !== 'undefined' && firebase.database) {
        loadConfigFromFirebase();
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryLoadConfig, 500);
      }
    }
    tryLoadConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exponer API para debugging/manual override
  window.ArcanoBgDynamic = {
    getConfig: function() { return config; },
    applyConfig: applyConfig,
    regenerate: generateParticles
  };
})();
