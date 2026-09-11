/* ===================== ARCANO TIENDA — FONDO DINÁMICO v3 =====================
   Concepto: "De la luz dorada al misterio oscuro"

   v3 — Cambios principales:
   - MECANISMO TIEMPO (no scroll): el tema cambia según segundos de
     navegación del usuario en el sitio, no por scroll.
   - Se interpolan TODAS las variables de texto (--text, --text-sec,
     --text-muted, --dark) para que ningún texto se vuelva invisible.
   - Curva diferenciada: bg empieza a cambiar primero, texto retrasado
     para mantener contraste legible en TODO el rango.
   ==================================================================== */

(function() {
  'use strict';

  // === CONFIG DEFAULT (overrideable por Firebase) ===
  var DEFAULT_CONFIG = {
    tipoParticulas: 'dust',         // dust | sparkles | snow | embers | stars
    cantidadParticulas: 18,         // 0 | 8 | 18 | 30
    velocidadParticulas: 'normal', // slow | normal | fast
    velocidadMesh: 'normal',        // slow | normal | fast | none
    intensidad: 'normal',           // sutil | normal | dramatico
    vignette: true,
    habilitado: true,
    // Tiempo total de transición en segundos (configurable por admin)
    // sutil = más lento, dramatico = más rápido
    duracionSegundos: 60            // default normal
  };

  // === PALETA INICIAL (negro café profundo - Arcano Nocturno) ===
  var THEME_START = {
    bg:        [14, 10, 7],       // #0E0A07 — negro café profundo
    bgCard:    [26, 19, 13],      // #1A130D
    bgSecondary: [37, 26, 17],    // #251A11
    surface:   [43, 31, 20],      // #2B1F14
    border:    [61, 42, 28],      // #3D2A1C
    text:      [245, 230, 208],   // #F5E6D0 — crema principal
    textSec:   [201, 184, 154],   // #C9B89A — crema medio
    textMuted: [154, 138, 120],   // #9A8A78 — crema tenue (WCAG AA small)
    dark:      [245, 230, 208]    // #F5E6D0 — headings claros
  };

  // === PALETA FINAL (negro MÁS profundo + dorado más vibrante) ===
  // El efecto dinámico es ahora MUY sutil: profundiza el negro y aviva el dorado
  var THEME_END = {
    bg:        [6, 4, 3],         // #060403 — negro casi puro
    bgCard:    [16, 12, 8],       // #100C08
    bgSecondary: [26, 18, 12],    // #1A120C
    surface:   [33, 24, 16],       // #211810
    border:    [50, 35, 22],      // #322316
    text:      [255, 240, 215],   // #FFF0D7 — crema más brillante
    textSec:   [220, 200, 165],   // #DCC8A5
    textMuted: [165, 145, 122],   // #A5917A
    dark:      [255, 240, 215]    // #FFF0D7
  };

  // Colores FIJOS (no cambian con tema): dorados y especias
  // Dorado más vivo para destacar sobre negro
  var GOLD = {
    gold: '#E8B84B',
    goldHover: '#C9963A',
    goldLight: 'rgba(232,184,75,0.15)',
    success: '#6B8E4E',
    error: '#C0492C'
  };

  // === PRESETS DE PARTÍCULAS ===
  // Optimizados para fondo oscuro — colores más vivos
  var PARTICLE_PRESETS = {
    dust: {
      color: 'radial-gradient(circle, rgba(232, 184, 75, 0.95), rgba(201, 150, 58, 0))',
      sizeMin: 2, sizeMax: 6, blur: 0.5
    },
    sparkles: {
      color: 'radial-gradient(circle, rgba(255, 220, 120, 1), rgba(232, 184, 75, 0))',
      sizeMin: 3, sizeMax: 8, blur: 0
    },
    snow: {
      color: 'radial-gradient(circle, rgba(245, 230, 208, 0.85), rgba(220, 200, 165, 0))',
      sizeMin: 3, sizeMax: 7, blur: 1
    },
    embers: {
      color: 'radial-gradient(circle, rgba(255, 140, 50, 0.95), rgba(192, 73, 44, 0))',
      sizeMin: 2, sizeMax: 5, blur: 0.8
    },
    stars: {
      color: 'radial-gradient(circle, rgba(255, 255, 255, 1), rgba(220, 220, 240, 0))',
      sizeMin: 1, sizeMax: 3, blur: 0
    }
  };

  var SPEED_MULTIPLIERS = {
    slow: 1.8, normal: 1.0, fast: 0.5
  };

  // Configuración de duración según intensidad (en segundos)
  var INTENSITY_DURATION = {
    sutil: 120,     // 2 minutos
    normal: 60,      // 1 minuto
    dramatico: 30    // 30 segundos
  };

  // Opacidades según intensidad
  var INTENSITY_OPACITY = {
    sutil:     { meshBase: 0.3, meshMax: 0.6,  particlesMax: 0.5, vignetteMax: 0.3 },
    normal:    { meshBase: 0.5, meshMax: 1.0,  particlesMax: 0.9, vignetteMax: 0.5 },
    dramatico: { meshBase: 0.7, meshMax: 1.2,  particlesMax: 1.0, vignetteMax: 0.7 }
  };

  // === ESTADO ===
  var config = Object.assign({}, DEFAULT_CONFIG);
  var root = document.documentElement;
  var startTime = null;
  var lastProgress = -1;
  var ticking = false;
  var timeInterval = null;

  // === HELPERS ===
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(start, end, t) {
    return [
      Math.round(lerp(start[0], end[0], t)),
      Math.round(lerp(start[1], end[1], t)),
      Math.round(lerp(start[2], end[2], t))
    ];
  }
  function smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }
  function remapClamp(t, inStart, inEnd) {
    if (t <= inStart) return 0;
    if (t >= inEnd) return 1;
    return (t - inStart) / (inEnd - inStart);
  }
  function rgbStr(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  // === APLICAR TEMA ===
  // Estrategia de contraste (v3 - SALTO RÁPIDO en vez de transición suave):
  //
  // PROBLEMA anterior: BG y texto transicionaban suavemente al mismo tiempo,
  // cruzando ambos por tonos grises medios → contraste ~0 en el medio
  // → textos invisibles durante un momento.
  //
  // SOLUCIÓN: el texto "salta" de oscuro a claro en un rango MUY corto
  // (5% del progreso) justo cuando el BG ya está al 50% de oscurecido.
  // Así:
  //   - BG 0% a 50%: texto oscuro sobre fondo claro/medio → buen contraste
  //   - BG 50% a 55%: texto salta rápido (imperceptible) → contraste mínimo solo 5%
  //   - BG 55% a 100%: texto claro sobre fondo oscuro → buen contraste
  //
  // El texto NUNCA se queda en gris medio mientras el BG también está en gris medio.
  function applyTheme(progress) {
    // BG: cambia suavemente en todo el rango [0 → 1] con smoothstep
    var bgT = smoothstep(progress);

    // Texto: SALTO RÁPIDO cuando BG cruza el 50% de oscurecimiento.
    // Mapear bgT en [0.50 → 0.55] a [0 → 1] con smoothstep.
    // Fuera de ese rango: 0 (texto oscuro) o 1 (texto claro).
    var textT = smoothstep(remapClamp(bgT, 0.50, 0.55));

    var bg = lerpColor(THEME_START.bg, THEME_END.bg, bgT);
    var bgCard = lerpColor(THEME_START.bgCard, THEME_END.bgCard, bgT);
    var bgSecondary = lerpColor(THEME_START.bgSecondary, THEME_END.bgSecondary, bgT);
    var surface = lerpColor(THEME_START.surface, THEME_END.surface, bgT);
    var border = lerpColor(THEME_START.border, THEME_END.border, bgT);
    var text = lerpColor(THEME_START.text, THEME_END.text, textT);
    var textSec = lerpColor(THEME_START.textSec, THEME_END.textSec, textT);
    var textMuted = lerpColor(THEME_START.textMuted, THEME_END.textMuted, textT);
    var dark = lerpColor(THEME_START.dark, THEME_END.dark, textT);

    root.style.setProperty('--bg-r', bg[0]);
    root.style.setProperty('--bg-g', bg[1]);
    root.style.setProperty('--bg-b', bg[2]);
    root.style.setProperty('--bg-card-r', bgCard[0]);
    root.style.setProperty('--bg-card-g', bgCard[1]);
    root.style.setProperty('--bg-card-b', bgCard[2]);
    root.style.setProperty('--bg-secondary-r', bgSecondary[0]);
    root.style.setProperty('--bg-secondary-g', bgSecondary[1]);
    root.style.setProperty('--bg-secondary-b', bgSecondary[2]);
    root.style.setProperty('--surface-r', surface[0]);
    root.style.setProperty('--surface-g', surface[1]);
    root.style.setProperty('--surface-b', surface[2]);
    root.style.setProperty('--border-r', border[0]);
    root.style.setProperty('--border-g', border[1]);
    root.style.setProperty('--border-b', border[2]);
    root.style.setProperty('--text-r', text[0]);
    root.style.setProperty('--text-g', text[1]);
    root.style.setProperty('--text-b', text[2]);
    // Actualizar TODAS las variables de color de texto (no solo --text)
    // para que los elementos con --dark, --text-sec, --text-muted también cambien
    root.style.setProperty('--dark', rgbStr(dark));
    root.style.setProperty('--text-sec', rgbStr(textSec));
    root.style.setProperty('--text-muted', rgbStr(textMuted));
    // Variable para bg-secondary (reemplaza hex #F0E4D0 hardcodeado)
    root.style.setProperty('--bg-secondary', rgbStr(bgSecondary));

    // scroll-progress ahora refleja el progreso del BG (no del texto)
    root.style.setProperty('--scroll-progress', bgT);

    // Gold glow ajusta brillo en oscuro
    var glowAlpha = 0.15 + bgT * 0.20;
    root.style.setProperty('--gold-glow', 'rgba(196, 148, 58, ' + glowAlpha.toFixed(3) + ')');

    // Aplicar intensidad al mesh y partículas
    var intensity = INTENSITY_OPACITY[config.intensidad] || INTENSITY_OPACITY.normal;
    var meshOpacity = intensity.meshBase + bgT * (intensity.meshMax - intensity.meshBase);
    root.style.setProperty('--mesh-opacity', meshOpacity.toFixed(3));
    var particlesOpacity = 0.3 + bgT * (intensity.particlesMax - 0.3);
    root.style.setProperty('--particles-opacity', particlesOpacity.toFixed(3));
    var vignetteOpacity = config.vignette ? (bgT * intensity.vignetteMax) : 0;
    root.style.setProperty('--vignette-opacity', vignetteOpacity.toFixed(3));

    lastProgress = progress;
  }

  // === PROGRESO POR TIEMPO (no por scroll) ===
  function getProgress() {
    if (!startTime) return 0;
    var elapsed = (Date.now() - startTime) / 1000;  // segundos
    var duration = config.duracionSegundos || 60;
    return Math.min(1, elapsed / duration);
  }

  function update() {
    if (!config.habilitado) return;
    var progress = getProgress();
    if (Math.abs(progress - lastProgress) > 0.001) {
      applyTheme(progress);
    }
    ticking = false;
    // Si ya llegamos al 100%, no hace seguir actualizando
    if (progress >= 1) {
      if (timeInterval) { clearInterval(timeInterval); timeInterval = null; }
      return;
    }
  }

  function tick() {
    if (!ticking) {
      // Usar requestAnimationFrame para sincronizar con el paint del browser
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(update);
      } else {
        update();
      }
      ticking = true;
    }
  }

  function startTimer() {
    if (timeInterval) clearInterval(timeInterval);
    startTime = Date.now();
    // Update cada 500ms (suficiente para transición suave de 0.6s)
    timeInterval = setInterval(tick, 500);
    // Update inmediato
    update();
  }

  // === PARTÍCULAS ===
  function generateParticles() {
    var container = document.getElementById('bg-particles');
    if (!container) return;
    container.innerHTML = '';

    if (!config.habilitado) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var count = config.cantidadParticulas;
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
    // Mapear intensidad a duración de segundos
    if (!config.duracionSegundos && INTENSITY_DURATION[config.intensidad]) {
      config.duracionSegundos = INTENSITY_DURATION[config.intensidad];
    }

    var bgDynamic = document.querySelector('.bg-dynamic');
    if (bgDynamic) {
      bgDynamic.setAttribute('data-mesh-speed', config.velocidadMesh);
    }

    var vignette = document.querySelector('.bg-vignette');
    if (vignette) {
      vignette.style.display = config.vignette ? '' : 'none';
    }

    var particles = document.getElementById('bg-particles');
    if (particles) {
      particles.style.display = config.habilitado ? '' : 'none';
    }

    generateParticles();
    // Resetear el timer con la nueva duración
    if (config.habilitado) {
      startTimer();
    } else {
      // Si está deshabilitado, aplicar tema inicial fijo
      applyTheme(0);
    }
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
          applyConfig(DEFAULT_CONFIG);
        }
      }, function(err) {
        console.warn('[bg-dynamic] No se pudo cargar config remota:', err);
        applyConfig(DEFAULT_CONFIG);
      });
    } catch (e) {
      console.warn('[bg-dynamic] Firebase no disponible, usando defaults:', e);
      applyConfig(DEFAULT_CONFIG);
    }
  }

  // === INIT ===
  function init() {
    // Aplicar defaults inicial
    applyConfig(DEFAULT_CONFIG);
    applyTheme(0);
    // Listener de resize con debounce (evita thrash del DOM)
    var _resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(generateParticles, 200);
    }, { passive: true });
    // Aplicar una vez más después del primer paint
    setTimeout(update, 50);
    // Cargar config remota (Firebase puede no estar listo aún)
    var attempts = 0;
    function tryLoadConfig() {
      if (typeof firebase !== 'undefined' && firebase.database) {
        loadConfigFromFirebase();
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryLoadConfig, 500);
      } else {
        // Sin Firebase, usar defaults y arrancar timer
        startTimer();
      }
    }
    tryLoadConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exponer API para debugging
  window.ArcanoBgDynamic = {
    getConfig: function() { return config; },
    applyConfig: applyConfig,
    regenerate: generateParticles,
    restartTimer: function() { startTimer(); },
    setProgress: function(p) { applyTheme(Math.max(0, Math.min(1, p))); }
  };
})();
