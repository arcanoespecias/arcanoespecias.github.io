/* ============================================================
   Arcano — Efecto "Opening" (cortina mitades)
   La tapa se abre en 2 mitades: arriba y abajo.
   La tienda aparece desde el fondo del movimiento.
   Primera vez por sesión. No se puede saltar.
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

    if (!topLid || !bottomLid) {
      document.documentElement.classList.add('no-opening');
      return;
    }

    var progress = 0;
    var unlocked = false;
    var SCROLL_THRESHOLD = 400; // más bajo = más fluido

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function update() {
      var eased = easeInOutCubic(progress);

      // Top lid: sube (translateY negativo) + fade out en última etapa
      var topTranslate = -eased * 110; // 110% hacia arriba (sale de pantalla)
      topLid.style.transform = 'translateY(' + topTranslate + '%)';
      topLid.style.opacity = eased < 0.85 ? 1 : Math.max(0, 1 - (eased - 0.85) / 0.15);

      // Bottom lid: baja (translateY positivo) + fade out
      var bottomTranslate = eased * 110;
      bottomLid.style.transform = 'translateY(' + bottomTranslate + '%)';
      bottomLid.style.opacity = eased < 0.85 ? 1 : Math.max(0, 1 - (eased - 0.85) / 0.15);

      // Contenido (logo + título): escala + fade rápido
      if (content) {
        var contentScale = 1 + eased * 0.2;
        var contentOpacity = Math.max(0, 1 - eased * 2.2);
        content.style.transform = 'scale(' + contentScale + ')';
        content.style.opacity = contentOpacity;
      }

      // Hint: desaparece al primer toque
      if (hint) {
        hint.style.opacity = Math.max(0, 1 - progress * 8);
      }

      // Overlay: fade out al final
      if (progress >= 1 && !unlocked) {
        unlock();
      }
    }

    function unlock() {
      if (unlocked) return;
      unlocked = true;
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
      // Suavizado: incrementa con factor para más fluidez
      progress = Math.min(1, progress + Math.max(0, delta) / SCROLL_THRESHOLD);
      update();
    }

    function onWheel(e) {
      if (unlocked) return;
      e.preventDefault();
      if (e.deltaY > 0) {
        addProgress(e.deltaY);
      }
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
        if (delta > 0) {
          addProgress(delta);
        }
        touchLastY = touchY;
      }
    }

    function onKey(e) {
      if (unlocked) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        addProgress(60);
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);

    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
