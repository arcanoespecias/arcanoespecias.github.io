/* ============================================================
   Arcano — Efecto "Opening" (cortina bidireccional con scroll)
   - Top: cofre cerrado → se abre al scrollear abajo
   - Medio: cofre abierto, overlay oculto
   - Bottom: cofre aparece ABIERTO y se CIERRA al seguir scrolleando
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

    var OPEN_THRESHOLD = 600;     // px para abrir desde el top
    var CLOSE_ZONE = 1500;        // px de zona de cierre en el bottom (GRANDE)
    var prevProgress = 0;
    var overlayVisible = true;
    var phase = 'opening';        // 'opening' | 'browsing' | 'closing'
    var closingScrollStart = 0;  // scrollY donde empezó el cierre

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function update(progress) {
      var eased = easeInOutCubic(progress);

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

    function showOverlay(withFade) {
      if (!overlayVisible) {
        overlay.style.display = 'block';
        if (withFade) {
          overlay.style.transition = 'opacity 0.5s ease';
          overlay.style.opacity = '0';
          overlay.offsetHeight; // forzar reflow
          overlay.style.opacity = '1';
        } else {
          overlay.style.transition = '';
          overlay.style.opacity = '1';
        }
        overlayVisible = true;
      }
    }

    function hideOverlay() {
      if (overlayVisible) {
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '0';
        overlayVisible = false;
        setTimeout(function() {
          if (!overlayVisible) overlay.style.display = 'none';
        }, 300);
      }
    }

    function onScroll() {
      var scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight;
      var winHeight = window.innerHeight;
      var maxScroll = docHeight - winHeight;
      var scrollBottom = maxScroll - scrollY;

      // ¿Hay suficiente altura para zona de cierre?
      var hasClosingZone = maxScroll > (OPEN_THRESHOLD + CLOSE_ZONE);

      var progress;

      // === FASE 1: Top — abrir (0 → 1) ===
      if (scrollY < OPEN_THRESHOLD) {
        progress = Math.min(1, scrollY / OPEN_THRESHOLD);
        phase = 'opening';
        showOverlay(false);
      }
      // === FASE 2: Bottom — cerrar (1 → 0) ===
      else if (hasClosingZone && scrollBottom < CLOSE_ZONE) {

        if (phase !== 'closing') {
          // PRIMERA VEZ entrando en zona de cierre
          // Marcar dónde empezó el scroll de cierre
          closingScrollStart = scrollY;
          phase = 'closing';
          // Mostrar el cofre ABIERTO (progress=1) con fade in
          showOverlay(true);
          update(1);
          playClickSound();
          prevProgress = 1;
          return; // este frame solo muestra el cofre abierto, el siguiente empieza a cerrar
        }

        // Calcular cuánto scrolleó desde que empezó el cierre
        var closingDistance = scrollY - closingScrollStart;
        progress = Math.max(0, 1 - (closingDistance / CLOSE_ZONE));
        showOverlay(false);

        // Mantener en 1 si aún no empezó a scrollear dentro de la zona
        if (closingDistance < 50) {
          progress = 1;
        }
      }
      // === FASE 3: Medio — abierto, overlay oculto ===
      else {
        progress = 1;
        phase = 'browsing';
        hideOverlay();
      }

      update(progress);

      // === Sonidos ===
      if (prevProgress < 0.5 && progress >= 0.5 && phase === 'opening') {
        playClickSound();
      }
      if (prevProgress > 0.05 && progress <= 0.05 && phase === 'closing') {
        playCloseSound();
      }

      prevProgress = progress;
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
