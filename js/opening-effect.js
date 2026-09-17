/* ============================================================
   Arcano — Efecto "Opening" (cortina bidireccional)
   Abre al scrollear abajo, cierra al scrollear arriba.
   Logo grande plano (sin animación). Cofre 3D negro realista.
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

    var progress = 0; // 0 = cerrado, 1 = totalmente abierto
    var SCROLL_THRESHOLD = 500;
    var wheelAccum = 0;

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function update() {
      var eased = easeInOutCubic(progress);

      // Mitades: se desplazan hacia afuera (110% del tamaño)
      // BIDIRECCIONAL: si progress baja, las mitades vuelven
      var topTranslate = -eased * 105;
      var bottomTranslate = eased * 105;
      topLid.style.transform = 'translateY(' + topTranslate + '%)';
      bottomLid.style.transform = 'translateY(' + bottomTranslate + '%)';

      // Opacidad: se mantienen opacas hasta el 80%, luego fade out
      var lidOpacity = eased < 0.8 ? 1 : Math.max(0, 1 - (eased - 0.8) / 0.2);
      topLid.style.opacity = lidOpacity;
      bottomLid.style.opacity = lidOpacity;

      // Lock central: se desvanece temprano (más fluido)
      if (lock) {
        lock.style.opacity = Math.max(0, 1 - eased * 3);
        lock.style.transform = 'translateX(-50%) scale(' + (1 + eased * 0.3) + ')';
      }

      // Logo + título: escalan sutilmente y desvanecen
      if (content) {
        var contentScale = 1 + eased * 0.15;
        var contentOpacity = Math.max(0, 1 - eased * 2.5);
        content.style.transform = 'translate(-50%, -50%) scale(' + contentScale + ')';
        content.style.opacity = contentOpacity;
      }

      // Hint: se desvanece rápido al primer scroll
      if (hint) {
        hint.style.opacity = Math.max(0, 1 - progress * 8);
      }
    }

    function setProgress(newProgress) {
      progress = Math.max(0, Math.min(1, newProgress));
      update();
    }

    function addProgress(delta) {
      setProgress(progress + delta / SCROLL_THRESHOLD);
    }

    function onWheel(e) {
      e.preventDefault();
      // delta positivo = scroll abajo = abre
      // delta negativo = scroll arriba = cierra
      addProgress(e.deltaY);
    }

    var touchLastY = 0;
    function onTouchStart(e) {
      if (e.touches.length > 0) {
        touchLastY = e.touches[0].clientY;
      }
    }
    function onTouchMove(e) {
      e.preventDefault();
      if (e.touches.length > 0) {
        var touchY = e.touches[0].clientY;
        var delta = touchLastY - touchY; // positivo = scroll abajo
        addProgress(delta);
        touchLastY = touchY;
      }
    }

    function onKey(e) {
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

    // Estado inicial: cofre cerrado
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
