/* ============================================================
   Arcano — Efecto "Opening" (cortina bidireccional)
   - Abre al scrollear abajo, cierra al scrollear arriba
   - Cuando llega al 100%, libera el scroll y oculta el overlay
   - La tienda es visible desde el inicio (las tapas se abren y se ve)
   - Sonido de click al abrir (Web Audio API)
   ============================================================ */

(function() {
  'use strict';

  var SESSION_KEY = 'arcano_opening_seen';

  function shouldRun() {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    var path = window.location.pathname;
    var isHome = path === '/' || path === '/index.html' || path === '';
    if (!isHome) return false;
    if (window.location.hash) return false;
    return true;
  }

  if (!shouldRun()) {
    document.documentElement.classList.add('no-opening');
    return;
  }

  sessionStorage.setItem(SESSION_KEY, '1');

  // === Audio ===
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audioCtx = null;
      }
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
    osc1.start(now);
    osc1.stop(now + 0.08);

    var osc2 = ctx.createOscillator();
    var gain2 = ctx.createGain();
    var filter2 = ctx.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.value = 600;
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(180, now);
    osc2.frequency.exponentialRampToValueAtTime(120, now + 0.15);
    gain2.gain.setValueAtTime(0.08, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc2.connect(filter2).connect(gain2).connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.2);
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
    osc.start(now);
    osc.stop(now + 0.16);
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
    var lock = overlay.querySelector('.opening-lock');

    if (!topLid || !bottomLid) {
      document.documentElement.classList.add('no-opening');
      return;
    }

    var progress = 0;
    var unlocked = false;
    var SCROLL_THRESHOLD = 500;
    var lastProgress = 0;

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function update() {
      var eased = easeInOutCubic(progress);

      var topTranslate = -eased * 105;
      var bottomTranslate = eased * 105;
      topLid.style.transform = 'translateY(' + topTranslate + '%)';
      bottomLid.style.transform = 'translateY(' + bottomTranslate + '%)';

      var lidOpacity = eased < 0.8 ? 1 : Math.max(0, 1 - (eased - 0.8) / 0.2);
      topLid.style.opacity = lidOpacity;
      bottomLid.style.opacity = lidOpacity;

      if (lock) {
        lock.style.opacity = Math.max(0, 1 - eased * 3);
        lock.style.transform = 'translateX(-50%) scale(' + (1 + eased * 0.3) + ')';
      }

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

    function setProgress(newProgress) {
      newProgress = Math.max(0, Math.min(1, newProgress));
      var wasOpening = lastProgress < newProgress;
      var crossedHalf = (lastProgress < 0.5 && newProgress >= 0.5) || (lastProgress >= 0.5 && newProgress < 0.5);
      var returnedToZero = lastProgress > 0 && newProgress === 0;

      progress = newProgress;
      update();

      if (wasOpening && crossedHalf) {
        playClickSound();
      }
      if (returnedToZero && lastProgress > 0.05) {
        playCloseSound();
      }

      lastProgress = progress;

      if (progress >= 1 && !unlocked) {
        setTimeout(function() {
          if (progress >= 1) unlock();
        }, 400);
      }
    }

    function unlock() {
      if (unlocked) return;
      unlocked = true;
      playClickSound();
      document.body.classList.remove('opening-active');
      overlay.style.transition = 'opacity 0.4s ease';
      overlay.style.opacity = '0';
      setTimeout(function() {
        overlay.style.display = 'none';
      }, 400);
      window.removeEventListener('wheel', onWheel, { passive: false });
      window.removeEventListener('touchstart', onTouchStart, { passive: false });
      window.removeEventListener('touchmove', onTouchMove, { passive: false });
      window.removeEventListener('keydown', onKey);
    }

    function addProgress(delta) {
      if (unlocked) return;
      setProgress(progress + delta / SCROLL_THRESHOLD);
    }

    function onWheel(e) {
      if (unlocked) return;
      e.preventDefault();
      addProgress(e.deltaY);
    }

    var touchLastY = 0;
    function onTouchStart(e) {
      if (e.touches.length > 0) {
        touchLastY = e.touches[0].clientY;
      }
    }
    function onTouchMove(e) {
      if (unlocked) return;
      e.preventDefault();
      if (e.touches.length > 0) {
        var touchY = e.touches[0].clientY;
        var delta = touchLastY - touchY;
        addProgress(delta);
        touchLastY = touchY;
      }
    }

    function onKey(e) {
      if (unlocked) return;
      var keys = ['ArrowDown', 'PageDown', ' ', 'Enter', 'ArrowUp', 'PageUp'];
      if (keys.indexOf(e.key) >= 0) {
        e.preventDefault();
        if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          addProgress(-60);
        } else {
          addProgress(60);
        }
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);

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

    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
