/* ============================================================
   Arcano — Efecto "Opening"
   - Top: cofre cerrado → se abre al scrollear abajo
   - Medio: cofre abierto, overlay oculto
   - Bottom: cofre aparece ABIERTO y se cierra con animación CSS
   ============================================================ */

(function() {
  'use strict';

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
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
    return audioCtx;
  }

  var lastClickTime = 0;
  function playClickSound() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var now = ctx.currentTime;
    if (now - lastClickTime < 0.15) return;
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
    if (now - lastClickTime < 0.15) return;
    lastClickTime = now;

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

  // === Init ===
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

    var OPEN_THRESHOLD = 600;
    var phase = 'opening';  // 'opening' | 'browsing' | 'closing'
    var prevProgress = 0;

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function update(progress) {
      var eased = easeInOutCubic(progress);

      topLid.style.transition = 'none';
      bottomLid.style.transition = 'none';

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
        hint.style.opacity = Math.max(0, 1 - progress * 8);
      }
    }

    // Cierre con CSS transition (no depende del scroll)
    function animateClose() {
      var duration = 1800; // 1.8 segundos
      var startTime = performance.now();

      topLid.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.4, 0, 0.2, 1), opacity ' + duration + 'ms ease';
      bottomLid.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.4, 0, 0.2, 1), opacity ' + duration + 'ms ease';
      if (content) {
        content.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.4, 0, 0.2, 1), opacity ' + duration + 'ms ease';
      }

      // Estado: ABIERTO (progress=1)
      topLid.style.transform = 'translateY(-105%)';
      bottomLid.style.transform = 'translateY(105%)';
      topLid.style.opacity = '1';
      bottomLid.style.opacity = '1';
      if (content) {
        content.style.transform = 'translate(-50%, -50%) scale(1.15)';
        content.style.opacity = '0';
      }

      // Forzar reflow para que la transición arranque
      overlay.offsetHeight;

      // Animar hacia CERRADO (progress=0)
      topLid.style.transform = 'translateY(0%)';
      bottomLid.style.transform = 'translateY(0%)';
      if (content) {
        content.style.transform = 'translate(-50%, -50%) scale(1)';
        content.style.opacity = '1';
      }
      if (hint) hint.style.opacity = '0';

      // Sonido de click al empezar a cerrar
      playClickSound();

      // Sonido de thud al terminar
      setTimeout(function() {
        playCloseSound();
      }, duration - 200);
    }

    function showOverlay(withFade) {
      overlay.style.transition = withFade ? 'opacity 0.5s ease' : 'none';
      overlay.style.display = 'block';
      if (withFade) {
        overlay.style.opacity = '0';
        overlay.offsetHeight;
        overlay.style.opacity = '1';
      } else {
        overlay.style.opacity = '1';
      }
    }

    function hideOverlay() {
      overlay.style.transition = 'opacity 0.3s ease';
      overlay.style.opacity = '0';
      setTimeout(function() {
        if (phase === 'browsing') overlay.style.display = 'none';
      }, 300);
    }

    function onScroll() {
      var scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight;
      var winHeight = window.innerHeight;
      var maxScroll = docHeight - winHeight;
      var scrollBottom = maxScroll - scrollY;

      // Zona de cierre: últimos 300px de la página
      var BOTTOM_TRIGGER = 300;

      // === FASE 3: Bottom — animación de cierre ===
      if (scrollBottom < BOTTOM_TRIGGER && maxScroll > OPEN_THRESHOLD + BOTTOM_TRIGGER) {
        if (phase !== 'closing') {
          phase = 'closing';
          // Mostrar cofre ABIERTO
          showOverlay(true);
          update(1); // cofre abierto

          // Esperar 500ms (fade in) y luego animar cierre
          setTimeout(function() {
            if (phase === 'closing') {
              animateClose();
            }
          }, 500);
        }
        return;
      }

      // === FASE 1: Top — abrir con scroll ===
      if (scrollY < OPEN_THRESHOLD) {
        var progress = Math.min(1, scrollY / OPEN_THRESHOLD);
        phase = 'opening';
        showOverlay(false);
        update(progress);

        if (prevProgress < 0.5 && progress >= 0.5) {
          playClickSound();
        }
        prevProgress = progress;
        return;
      }

      // === FASE 2: Medio — abierto, overlay oculto ===
      if (phase !== 'browsing') {
        phase = 'browsing';
        hideOverlay();
      }
    }

    // === Scroll listener throttled ===
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

    // === Unlock audio ===
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

    // === Estado inicial ===
    update(0);
    setTimeout(onScroll, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
