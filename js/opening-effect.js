/* ============================================================
   Arcano — Efecto "Opening" (tapa de cofre)
   Aparece la primera vez por sesión en la home.
   No se puede saltar: el usuario DEBE scrollear para abrirlo.
   Funciona en desktop (wheel/keyboard) y mobile (touch).
   ============================================================ */

(function() {
  'use strict';

  var SESSION_KEY = 'arcano_opening_seen';

  // ¿Debería mostrarse el efecto?
  function shouldRun() {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    var path = window.location.pathname;
    var isHome = path === '/' || path === '/index.html' || path === '';
    if (!isHome) return false;
    if (window.location.hash) return false; // navegación interna (#tienda, etc.)
    return true;
  }

  if (!shouldRun()) {
    document.documentElement.classList.add('no-opening');
    return;
  }

  // Marcar como visto inmediatamente (para que no reaparezca si el usuario
  // navega a otra página y vuelve en la misma sesión)
  sessionStorage.setItem(SESSION_KEY, '1');

  function init() {
    var overlay = document.getElementById('opening-overlay');
    if (!overlay) {
      document.documentElement.classList.add('no-opening');
      return;
    }

    var lid = overlay.querySelector('.opening-lid');
    var content = overlay.querySelector('.opening-content');
    var hint = overlay.querySelector('.opening-hint');

    if (!lid) {
      document.documentElement.classList.add('no-opening');
      return;
    }

    var progress = 0; // 0 (cerrado) → 1 (totalmente abierto)
    var unlocked = false;
    var SCROLL_THRESHOLD = 500; // "pixels virtuales" necesarios para abrir completo

    function update() {
      // Rotación de la tapa: 0 → -110deg (cae hacia atrás)
      var rotation = -110 * progress;
      lid.style.transform = 'perspective(1200px) rotateX(' + rotation + 'deg)';

      // Contenido (logo + título): se desvanece rápido
      if (content) {
        content.style.opacity = Math.max(0, 1 - progress * 1.8);
        content.style.transform = 'scale(' + (1 + progress * 0.15) + ')';
      }

      // Hint: se desvanece inmediatamente al primer scroll
      if (hint) {
        hint.style.opacity = Math.max(0, 1 - progress * 5);
      }

      // Tapa: se desvanece en el último 40%
      var lidOpacity = progress < 0.6 ? 1 : Math.max(0, 1 - (progress - 0.6) / 0.4);
      lid.style.opacity = lidOpacity;

      if (progress >= 1 && !unlocked) {
        unlock();
      }
    }

    function unlock() {
      if (unlocked) return;
      unlocked = true;
      // Quitar clase opening-active del body → libera scroll
      document.body.classList.remove('opening-active');
      // Ocultar overlay con transición suave
      overlay.style.transition = 'opacity 0.5s ease';
      overlay.style.opacity = '0';
      setTimeout(function() {
        overlay.style.display = 'none';
      }, 500);
      // Remover listeners
      window.removeEventListener('wheel', onWheel, { passive: false });
      window.removeEventListener('touchstart', onTouchStart, { passive: false });
      window.removeEventListener('touchmove', onTouchMove, { passive: false });
      window.removeEventListener('keydown', onKey);
    }

    function addProgress(delta) {
      if (unlocked) return;
      // Solo aumentar (no se puede cerrar parcialmente y retroceder)
      progress = Math.min(1, progress + Math.max(0, delta) / SCROLL_THRESHOLD);
      update();
    }

    // Wheel (desktop)
    function onWheel(e) {
      if (unlocked) return;
      e.preventDefault();
      if (e.deltaY > 0) {
        addProgress(e.deltaY);
      }
    }

    // Touch (mobile)
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
        var delta = touchLastY - touchY; // positivo = scroll abajo
        if (delta > 0) {
          addProgress(delta);
        }
        touchLastY = touchY;
      }
    }

    // Keyboard (accesibilidad)
    function onKey(e) {
      if (unlocked) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        addProgress(80);
      }
    }

    // Attaching
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);

    // Estado inicial
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
