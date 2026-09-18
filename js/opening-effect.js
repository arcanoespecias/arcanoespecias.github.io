/* ============================================================
   Arcano — Efecto "Opening"
   - Top: cofre cerrado → se abre al scrollear
   - Medio: overlay oculto
   - Bottom: cofre aparece ABIERTO y se cierra con animación JS
   ============================================================ */

(function() {
  'use strict';

  var path = window.location.pathname;
  var isHome = path === '/' || path === '/index.html' || path === '';
  if (!isHome || window.location.hash) {
    document.documentElement.classList.add('no-opening');
    return;
  }

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
    var osc1 = ctx.createOscillator(), gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(2400, now);
    osc1.frequency.exponentialRampToValueAtTime(800, now + 0.04);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now); osc1.stop(now + 0.08);
    var osc2 = ctx.createOscillator(), gain2 = ctx.createGain(), filter2 = ctx.createBiquadFilter();
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
    var osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.16);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

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
    var phase = 'opening';
    var prevProgress = 0;
    var isClosing = false;
    var closeAnimId = null;

    function setLids(progress) {
      // Sin transition, seteo directo
      topLid.style.transition = 'none';
      bottomLid.style.transition = 'none';
      if (content) content.style.transition = 'none';

      var eased = easeInOutCubic(progress);
      topLid.style.transform = 'translateY(' + (-eased * 105) + '%)';
      bottomLid.style.transform = 'translateY(' + (eased * 105) + '%)';

      var lidOpacity = eased < 0.8 ? 1 : Math.max(0, 1 - (eased - 0.8) / 0.2);
      topLid.style.opacity = lidOpacity;
      bottomLid.style.opacity = lidOpacity;

      if (content) {
        content.style.transform = 'translate(-50%, -50%) scale(' + (1 + eased * 0.15) + ')';
        content.style.opacity = Math.max(0, 1 - eased * 2.5);
      }
      if (hint) hint.style.opacity = Math.max(0, 1 - progress * 8);
    }

    // Animación de cierre frame-by-frame con JS (NO CSS transition)
    function animateClose() {
      if (isClosing) return;
      isClosing = true;

      var duration = 2000;
      var startTime = performance.now();

      playClickSound();

      function frame(now) {
        var elapsed = now - startTime;
        var progress = Math.min(1, elapsed / duration);
        // progress va de 1 (abierto) a 0 (cerrado)
        var closeProgress = 1 - progress;

        var eased = easeInOutCubic(closeProgress);
        topLid.style.transition = 'none';
        bottomLid.style.transition = 'none';

        topLid.style.transform = 'translateY(' + (-eased * 105) + '%)';
        bottomLid.style.transform = 'translateY(' + (eased * 105) + '%)';

        var lidOpacity = eased < 0.8 ? 1 : Math.max(0, 1 - (eased - 0.8) / 0.2);
        topLid.style.opacity = lidOpacity;
        bottomLid.style.opacity = lidOpacity;

        if (content) {
          content.style.transform = 'translate(-50%, -50%) scale(' + (1 + eased * 0.15) + ')';
          content.style.opacity = Math.max(0, 1 - eased * 2.5);
        }

        if (progress < 1) {
          closeAnimId = requestAnimationFrame(frame);
        } else {
          // Terminó
          playCloseSound();
          isClosing = false;
        }
      }

      closeAnimId = requestAnimationFrame(frame);
    }

    function showOverlay(withFade) {
      overlay.style.display = 'block';
      if (withFade) {
        overlay.style.transition = 'opacity 0.5s ease';
        overlay.style.opacity = '0';
        overlay.offsetHeight;
        overlay.style.opacity = '1';
      } else {
        overlay.style.transition = '';
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
      if (isClosing) return;

      var scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight;
      var winHeight = window.innerHeight;
      var maxScroll = docHeight - winHeight;
      var scrollBottom = maxScroll - scrollY;

      var BOTTOM_TRIGGER = 300;

      // === FASE 3: Bottom ===
      if (scrollBottom < BOTTOM_TRIGGER && maxScroll > OPEN_THRESHOLD + BOTTOM_TRIGGER) {
        if (phase !== 'closing') {
          phase = 'closing';
          // Mostrar cofre ABIERTO
          showOverlay(true);
          setLids(1);

          // Esperar fade in, luego animar cierre frame-by-frame
          setTimeout(function() {
            if (phase === 'closing' && !isClosing) {
              animateClose();
            }
          }, 700);
        }
        return;
      }

      // === FASE 1: Top ===
      if (scrollY < OPEN_THRESHOLD) {
        var progress = Math.min(1, scrollY / OPEN_THRESHOLD);
        phase = 'opening';
        showOverlay(false);
        setLids(progress);

        if (prevProgress < 0.5 && progress >= 0.5) {
          playClickSound();
        }
        prevProgress = progress;
        return;
      }

      // === FASE 2: Medio ===
      if (phase !== 'browsing') {
        phase = 'browsing';
        hideOverlay();
      }
    }

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

    setLids(0);
    setTimeout(onScroll, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
