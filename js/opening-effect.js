/* ============================================================
   Arcano — Efecto "Opening" (cortina bidireccional con scroll)
   - Aparece al inicio (top de la página)
   - Se abre al scrollear abajo
   - Se cierra al volver al top
   - Aparece también al llegar al final del sitio
   - Logo en tapa superior, texto en tapa inferior
   - Tapas estilo madera negra realista
   - Sonido de click al abrir (Web Audio API)
   ============================================================ */

(function() {
  'use strict';

  // Solo en la home
  var path = window.location.pathname;
  var isHome = path === '/' || path === '/index.html' || path === '';
  if (!isHome || window.location.hash) {
    document.documentElement.classList.add('no-opening');
    return;
  }

  // === Audio ===
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { audioCtx = null; }
    }
    return audioCtx;
  }

  var lastClickTime = 0;
  function playClickSound() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var now = ctx.currentTime;
    if (now - lastClickTime < 0.1) return;
    lastClickTime = now;

    var osc1 = ctx.createOscillator();
    var gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(2400, now);
    osc1.frequency.exponentialRampToValueAtTime(800, now + 0.04);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now); osc1.stop(now + 0.08);

    var osc2 = ctx.createOscillator();
    var gain2 = ctx.createGain();
    var filter2 = ctx.createBiquadFilter();
    filter2.type = 'lowpass'; filter2.frequency.value = 600;
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(180, now);
    osc2.frequency.exponentialRampToValueAtTime(120, now + 0.15);
    gain2.gain.setValueAtTime(0.08, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc2.connect(filter2).connect(gain2).connect(ctx.destination);
    osc2.start(now); osc2.stop(now + 0.2);
  }

  function playCloseSound() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.16);
  }

  // === Configuración ===
  var SCROLL_THRESHOLD = 500;     // px para abrir completo
  var TOP_TRIGGER = 5;            // px desde el top para reactivar
  var BOTTOM_TRIGGER = 100;       // px desde el bottom para activar
  var OPENING_PHASE = 'opening';  // 'opening' | 'browsing' | 'bottom'

  function init() {
    var overlay = document.getElementById('opening-overlay');
    if (!overlay) {
      document.documentElement.classList.add('no-opening');
      return;
    }

    var topLid = overlay.querySelector('.opening-lid-top');
    var bottomLid = overlay.querySelector('.opening-lid-bottom');
    var content = overlay.querySelector('.opening-content');
    var hint = overlay.querySelector('.opening-hint');

    if (!topLid || !bottomLid) {
      document.documentElement.classList.add('no-opening');
      return;
    }

    var progress = 0;
    var lastProgress = 0;
    var isAtBottom = false;
    var wasOpening = false;

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function update(openProgress, mode) {
      var eased = easeInOutCubic(openProgress);

      var topTranslate = -eased * 105;
      var bottomTranslate = eased * 105;
      topLid.style.transform = 'translateY(' + topTranslate + '%)';
      bottomLid.style.transform = 'translateY(' + bottomTranslate + '%)';

      var lidOpacity = eased < 0.8 ? 1 : Math.max(0, 1 - (eased - 0.8) / 0.2);
      topLid.style.opacity = lidOpacity;
      bottomLid.style.opacity = lidOpacity;

      if (content) {
        var contentScale = 1 + eased * 0.15;
        var contentOpacity = Math.max(0, 1 - eased * 2.5);
        content.style.transform = 'translate(-50%, -50%) scale(' + contentScale + ')';
        content.style.opacity = contentOpacity;
      }

      if (hint) {
        hint.style.opacity = Math.max(0, 1 - openProgress * 8);
      }
    }

    function showOverlay() {
      overlay.style.display = 'block';
      overlay.style.opacity = '1';
      overlay.style.transition = '';
    }

    function hideOverlay() {
      overlay.style.transition = 'opacity 0.3s ease';
      overlay.style.opacity = '0';
      setTimeout(function() {
        if (OPENING_PHASE !== 'opening' && OPENING_PHASE !== 'bottom') {
          overlay.style.display = 'none';
        }
      }, 300);
    }

    function onScroll() {
      var scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight;
      var winHeight = window.innerHeight;
      var scrollBottom = docHeight - winHeight - scrollY;

      // === Detectar si está en el bottom ===
      if (scrollBottom < BOTTOM_TRIGGER && scrollY > winHeight) {
        if (OPENING_PHASE !== 'bottom') {
          OPENING_PHASE = 'bottom';
          showOverlay();
          update(0, 'bottom');
          playClickSound();
        }
        // El cofre se abre con scroll en el bottom también
        // Pero como ya estamos abajo, mostramos el cofre cerrado
        // y permite "cerrar" scrolleando hacia arriba
        return;
      }

      // === Detectar si está en el top ===
      if (scrollY <= TOP_TRIGGER) {
        if (OPENING_PHASE !== 'opening') {
          OPENING_PHASE = 'opening';
          showOverlay();
          update(0, 'opening');
          playCloseSound();
        }
        return;
      }

      // === En el medio: cofre abierto ===
      if (OPENING_PHASE === 'opening' || OPENING_PHASE === 'bottom') {
        // Calcular progreso de apertura basado en scroll
        var p = Math.min(1, scrollY / SCROLL_THRESHOLD);
        if (p >= 0.95) {
          // Cofre totalmente abierto
          if (OPENING_PHASE !== 'browsing') {
            OPENING_PHASE = 'browsing';
            update(1, 'browsing');
            playClickSound();
            setTimeout(function() {
              if (OPENING_PHASE === 'browsing') hideOverlay();
            }, 400);
          }
        } else {
          update(p, 'opening');
        }
      }
    }

    // === Listener de scroll (throttled con requestAnimationFrame) ===
    var ticking = false;
    function onScrollThrottled() {
      if (!ticking) {
        requestAnimationFrame(function() {
          onScroll();
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScrollThrottled, { passive: true });

    // === Unlock audio en primera interacción ===
    function unlockAudio() {
      var ctx = getAudioCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    }
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // === Estado inicial: cofre cerrado en el top ===
    OPENING_PHASE = 'opening';
    document.body.classList.add('opening-active');
    update(0, 'opening');

    // No bloquear scroll (el usuario puede scrollear libremente)
    // El efecto sigue el scroll en vez de bloquearlo
    document.body.classList.remove('opening-active');

    // Verificar posición inicial
    setTimeout(onScroll, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
