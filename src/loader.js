/* =====================================================================
   Pantalla de carga de kAIRO — "Cargando tu experiencia · Arma tu estilo"
   Se arma el tenis del logo pieza por pieza (suela, cuerpo, franja, cordones,
   líneas de velocidad) mientras carga el catálogo; al terminar, el tenis
   "arranca" hacia la derecha y la cortina sube.
   Fuente: src/loader.js → se empaqueta con:  npm run build:loader
   ===================================================================== */
import { gsap } from 'gsap';

(function () {
  const el = document.getElementById('kLoader');
  if (!el) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = performance.now();
  const MIN = reduce ? 500 : 1500;   // tiempo mínimo para que se vea el armado
  const MAX = 5000;                  // nunca bloquea más de 5 s
  const bar = el.querySelector('.kl-bar i');
  const pct = el.querySelector('.kl-pct');
  const prog = { v: 0 };
  let finished = false;
  el.classList.add('kl-js'); // apaga la animación CSS de respaldo
  const paint = () => {
    bar.style.transform = 'scaleX(' + (prog.v / 100) + ')';
    pct.textContent = Math.round(prog.v) + '%';
  };

  if (!reduce) {
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.kl-sole', { y: 46, opacity: 0, duration: 0.45, ease: 'back.out(1.7)' })
      .from('.kl-tread', { scaleY: 0, transformOrigin: '50% 0%', stagger: 0.03, duration: 0.2 }, '-=0.2')
      .from('.kl-body', { y: -60, opacity: 0, duration: 0.55, ease: 'back.out(1.4)' }, '-=0.15')
      .from('.kl-stripe', { scale: 0, rotation: -40, transformOrigin: '50% 50%', duration: 0.4, ease: 'back.out(3)' }, '-=0.1')
      .from('.kl-lace', { x: -12, y: 8, opacity: 0, stagger: 0.07, duration: 0.25 }, '-=0.15')
      .from('.kl-speed', { x: -50, opacity: 0, stagger: 0.08, duration: 0.4, ease: 'power2.out' }, '-=0.35')
      .from('.kl-word', { y: 26, opacity: 0, skewX: -18, duration: 0.5 }, '-=0.35')
      .from('.kl-tag', { y: 10, opacity: 0, duration: 0.4 }, '-=0.25')
      .from('.kl-foot', { opacity: 0, duration: 0.3 }, '-=0.2');
    // en espera: el tenis "trota" y las líneas de velocidad titilan
    gsap.to('.kl-shoe', { y: -7, rotation: -2.5, transformOrigin: '60% 100%', duration: 0.55, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.4 });
    gsap.to('.kl-speed', { x: -10, opacity: 0.35, duration: 0.32, yoyo: true, repeat: -1, stagger: 0.1, ease: 'sine.inOut', delay: 1.4 });
  }

  const fake = gsap.to(prog, { v: 88, duration: 2.8, ease: 'power2.out', onUpdate: paint });

  function exit() {
    const out = gsap.timeline({
      onComplete() {
        el.remove();
        document.documentElement.classList.remove('k-loading');
        const app = document.getElementById('app');
        if (app) app.removeAttribute('inert');
        window.dispatchEvent(new Event('kairo:ready'));
      }
    });
    if (reduce) out.to(el, { opacity: 0, duration: 0.25 });
    else out
      .to('.kl-speed', { x: -30, opacity: 0, duration: 0.2, stagger: 0.04 })
      .to('.kl-shoe', { x: window.innerWidth, rotation: 0, duration: 0.6, ease: 'power3.in' }, '<')
      .to(el, { yPercent: -100, duration: 0.6, ease: 'power3.inOut' }, '-=0.2');
  }

  function done() {
    if (finished) return;
    finished = true;
    fake.kill();
    const wait = Math.max(0, MIN - (performance.now() - start)) / 1000;
    gsap.to(prog, { v: 100, duration: 0.35, delay: wait, ease: 'power1.out', onUpdate: paint, onComplete: exit });
  }

  window.KairoLoader = { done };
  setTimeout(done, MAX);
})();
