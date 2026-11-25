/* Cometas rápidos ocasionales que cruzan el fondo estrellado detrás del contenido. */
import { reducedMotion } from './env';

const MIN_GAP_MS = 2500;
const MAX_GAP_MS = 5600;

export function initMeteors(): void {
  const isDisabled = () => reducedMotion() || document.documentElement.classList.contains('low-effects');
  if (isDisabled()) return;
  const skies = Array.from(document.querySelectorAll<HTMLElement>('.stars'));
  if (!skies.length) return;

  let timer = 0;

  const pickSky = (): HTMLElement | null => {
    const vh = window.innerHeight;
    const visible = skies.filter((s) => {
      if (s.classList.contains('off')) return false;
      const r = s.getBoundingClientRect();
      return r.bottom > 80 && r.top < vh - 80;
    });
    if (!visible.length) return null;
    return visible[Math.floor(Math.random() * visible.length)];
  };

  const spawn = () => {
    if (document.hidden || isDisabled()) return;
    const sky = pickSky();
    if (!sky) return;

    const m = document.createElement('i');
    m.className = 'meteor';
    m.setAttribute('aria-hidden', 'true');

    // Dirección diagonal descendente (izquierda→derecha o derecha→izquierda ocasionalmente)
    const reverse = Math.random() < 0.35;
    const angle = reverse ? 148 + Math.random() * 14 : 18 + Math.random() * 16;
    const mx = reverse ? 45 + Math.random() * 42 : 8 + Math.random() * 48;
    const my = 8 + Math.random() * 52;
    const length = Math.round(115 + Math.random() * 85);
    const travel = Math.round(280 + Math.random() * 200);
    const duration = Math.round(490 + Math.random() * 240);

    m.style.setProperty('--mx', `${mx.toFixed(1)}%`);
    m.style.setProperty('--my', `${my.toFixed(1)}%`);
    m.style.setProperty('--ma', `${angle.toFixed(1)}deg`);
    m.style.setProperty('--ml', `${length}px`);
    m.style.setProperty('--mt', `${travel}px`);
    m.style.setProperty('--md', `${duration}ms`);

    let fallbackTimer = 0;
    const cleanup = () => {
      window.clearTimeout(fallbackTimer);
      m.remove();
    };
    m.addEventListener('animationend', cleanup, { once: true });
    fallbackTimer = window.setTimeout(cleanup, duration + 250);
    sky.appendChild(m);
  };

  const stop = () => {
    window.clearTimeout(timer);
    timer = 0;
  };

  const schedule = (delay?: number) => {
    stop();
    if (isDisabled() || document.hidden) return;
    const wait = delay ?? Math.round(MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
    timer = window.setTimeout(() => {
      spawn();
      schedule();
    }, wait);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else schedule(1400);
  });

  document.addEventListener('effectschange', () => {
    if (isDisabled()) stop();
  });

  // Primer cometa tras un respiro breve al cargar
  schedule(1700);
}
