/* Método Byte (Pipeline).
   Escritorio: avanza solo y en ciclo mientras la sección está en pantalla; el pulso late al llegar a cada etapa.
   Móvil: el pulso baja con el scroll y enciende cada etapa al alcanzarla. */
import { MOBILE, perFrame, reducedMotion } from './env';

const STEP_MS = 2300;

export function initMethod(): void {
  const wrap = document.querySelector<HTMLElement>('#metodo .mp');
  if (!wrap) return;
  const section = document.getElementById('metodo')!;
  const rail = wrap.querySelector<HTMLElement>('.mp-rail')!;
  const items = Array.from(wrap.querySelectorAll<HTMLElement>('.mp-steps > li'));
  const dots = Array.from(wrap.querySelectorAll<HTMLElement>('.mp-steps .mstep-node'));
  const n = items.length;
  const mod = (i: number) => ((i % n) + n) % n;

  let turn = 0;
  let previous: number | null = null;
  const narrow = window.matchMedia(`(max-width:${MOBILE - 0.02}px)`);
  let mobile = narrow.matches;
  let visible = false;

  const render = () => {
    const i = mod(turn);
    const auto = !reducedMotion() && !mobile;
    wrap.className = 'mp' + (auto ? ' auto' : '') + (mobile ? ' scrub' : '') + (previous === n - 1 && i === 0 ? ' rewind' : '');
    wrap.style.setProperty('--mf', (i / (n - 1)).toFixed(3));
    items.forEach((li, k) => {
      li.className = k === i ? 'on' : k < i ? 'done' : '';
      li.setAttribute('aria-current', k === i ? 'true' : 'false');
    });
  };

  const setStep = (t: number) => {
    const cur = mod(turn);
    if (mod(t) !== cur) previous = cur;
    turn = t;
    render();
  };

  let timer = 0;
  const syncTimer = () => {
    const shouldRun = !document.hidden && visible && !reducedMotion() && !mobile;
    if (shouldRun && !timer) {
      timer = window.setInterval(() => {
        if (document.hidden || !visible || reducedMotion() || mobile) return;
        setStep(turn + 1);
      }, STEP_MS);
    } else if (!shouldRun && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };

  /* escritorio: avance automático */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (es) => {
        visible = es[0].isIntersecting;
        syncTimer();
      },
      { threshold: 0.35 },
    ).observe(section);
  } else {
    visible = true;
    syncTimer();
  }
  document.addEventListener('visibilitychange', syncTimer);

  /* móvil: el scroll mueve el pulso */
  const scrub = perFrame(() => {
    if (!mobile || dots.length < 2) return;
    const rr = rail.getBoundingClientRect();
    if (rr.bottom < -300 || rr.top > window.innerHeight + 300) return;
    const r0 = dots[0].getBoundingClientRect();
    const r1 = dots[dots.length - 1].getBoundingClientRect();
    const c0 = r0.top + r0.height / 2;
    const c1 = r1.top + r1.height / 2;
    const p = Math.max(0, Math.min(1, (window.innerHeight * 0.55 - c0) / (c1 - c0 || 1)));
    const k = Math.min(dots.length - 1, Math.floor(p * (dots.length - 1) + 0.02));
    rail.style.setProperty('--mf', p.toFixed(4));
    if (k !== mod(turn)) setStep(k);
  });
  window.addEventListener(
    'scroll',
    () => {
      if (mobile) scrub();
    },
    { passive: true },
  );
  narrow.addEventListener('change', () => {
    mobile = narrow.matches;
    if (!mobile) rail.style.removeProperty('--mf');
    render();
    syncTimer();
    if (mobile) scrub();
  });

  render();
  syncTimer();
  if (mobile) scrub();
}
