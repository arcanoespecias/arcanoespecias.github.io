/* ============================================================
   Arcano — Efecto "Opening" (cortina bidireccional + frasco + especias)
   - Abre al scrollear abajo, cierra al scrollear arriba
   - Cuando llega al 100%, libera el scroll y oculta el overlay
   - Frasco aparece al abrirse, se inclina, suelta especias
   - Especias caen con física (gravedad, rotación) sobre la tienda
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

  // Sonido sutil de especias cayendo (shhhh)
  function playSpiceSound() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var now = ctx.currentTime;
    // White noise burst, filtered
    var bufferSize = ctx.sampleRate * 0.5;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    var noise = ctx.createBufferSource();
    noise.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  // === Sistema de partículas ===
  var jar = null;
  var canvas = null;
  var ctx2d = null;
  var particles = [];
  var animId = null;
  var lastSpawnTime = 0;

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function spawnParticle(originX, originY, intensity) {
    // Colores reales de especias
    var colors = [
      '#c7553f', // pimentón rojo
      '#E8B84B', // cúrcuma amarilla
      '#8a5a2c', // comino marrón
      '#6b8e4e', // orégano verde
      '#2a1a0a', // pimienta negra
      '#d4a574', // canela clara
      '#a0522d', // canela oscura
      '#f0e6d3', // sal/blanco
      '#8B4513', // cacao
    ];
    return {
      x: originX + (Math.random() - 0.5) * 25,
      y: originY + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 4 * intensity,
      vy: Math.random() * 1.5 - 0.5,
      size: 2.5 + Math.random() * 3.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      life: 1,
      shape: Math.random() < 0.3 ? 'circle' : 'ellipse' // variación de forma
    };
  }

  function updateParticles() {
    if (!ctx2d) return;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += 0.18; // gravedad
      p.vx *= 0.99; // resistencia del aire
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      p.life -= 0.0035;

      // Eliminar partículas fuera de pantalla o sin vida
      if (p.y > canvas.height + 30 || p.life <= 0 || p.x < -30 || p.x > canvas.width + 30) {
        particles.splice(i, 1);
        continue;
      }

      // Dibujar partícula
      ctx2d.save();
      ctx2d.translate(p.x, p.y);
      ctx2d.rotate(p.rotation);
      ctx2d.fillStyle = p.color;
      ctx2d.globalAlpha = Math.min(1, p.life * 2);
      ctx2d.beginPath();
      if (p.shape === 'circle') {
        ctx2d.arc(0, 0, p.size, 0, Math.PI * 2);
      } else {
        ctx2d.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
      }
      ctx2d.fill();
      ctx2d.restore();
    }
  }

  function animateParticles() {
    updateParticles();

    // Continuar animación si hay partículas o el frasco sigue visible
    var jarVisible = jar && parseFloat(jar.style.opacity || '0') > 0.01;
    var overlay = document.getElementById('opening-overlay');
    var overlayVisible = overlay && overlay.style.display !== 'none';

    if (particles.length > 0 || (jarVisible && overlayVisible)) {
      animId = requestAnimationFrame(animateParticles);
    } else {
      animId = null;
      if (canvas) canvas.style.display = 'none';
    }
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
    jar = document.getElementById('opening-jar');
    canvas = document.getElementById('opening-particles');

    if (!topLid || !bottomLid) {
      document.documentElement.classList.add('no-opening');
      return;
    }

    if (canvas) {
      ctx2d = canvas.getContext('2d');
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
    }

    var progress = 0;
    var unlocked = false;
    var SCROLL_THRESHOLD = 500;
    var lastProgress = 0;
    var spiceSoundPlayed = false;

    // Capa negra detrás (se desvanece al abrir para revelar la tienda)
    var bgLayer = document.getElementById('opening-bg');

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function update() {
      var eased = easeInOutCubic(progress);

      // Capa negra: se desvanece entre progress 0.4 y 0.8
      // A partir de progress 0.4, la tienda empieza a asomar por los lados
      // donde las tapas ya se corrieron
      if (bgLayer) {
        var bgOpacity = progress < 0.4 ? 1 : Math.max(0, 1 - (progress - 0.4) / 0.4);
        bgLayer.style.opacity = bgOpacity;
      }

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

      // === Frasco: aparece al abrirse, se inclina, suelta especias ===
      if (jar) {
        var jarOpacity = progress < 0.3 ? 0 : Math.min(1, (progress - 0.3) / 0.3);
        var jarRotation = progress < 0.5 ? 0 : -50 * Math.min(1, (progress - 0.5) / 0.5);
        var jarScale = 0.85 + progress * 0.15;

        jar.style.opacity = jarOpacity;
        jar.style.transform = 'translate(-50%, -50%) rotate(' + jarRotation + 'deg) scale(' + jarScale + ')';

        if (progress > 0.55 && canvas && ctx2d) {
          var intensity = (progress - 0.55) / 0.45;
          var spawnRate = Math.floor(intensity * 5) + 1;

          if (!spiceSoundPlayed && intensity > 0.1) {
            playSpiceSound();
            spiceSoundPlayed = true;
          }

          var jarRect = jar.getBoundingClientRect();
          var jarCenterX = jarRect.left + jarRect.width / 2;
          var jarCenterY = jarRect.top + jarRect.height / 2;
          var radRotation = jarRotation * Math.PI / 180;
          var mouthOffset = jarRect.height * 0.35;
          var mouthX = jarCenterX + Math.sin(radRotation) * mouthOffset;
          var mouthY = jarCenterY - Math.cos(radRotation) * mouthOffset;

          for (var i = 0; i < spawnRate; i++) {
            particles.push(spawnParticle(mouthX, mouthY, intensity));
          }

          if (!animId) {
            animId = requestAnimationFrame(animateParticles);
          }
        }
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
        spiceSoundPlayed = false; // reset para próxima apertura
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
      overlay.style.transition = 'opacity 0.5s ease';
      overlay.style.opacity = '0';
      if (bgLayer) {
        bgLayer.style.transition = 'opacity 0.5s ease';
        bgLayer.style.opacity = '0';
        setTimeout(function() {
          if (bgLayer) bgLayer.style.display = 'none';
        }, 500);
      }
      setTimeout(function() {
        overlay.style.display = 'none';
      }, 500);
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
