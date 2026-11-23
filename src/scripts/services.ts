/* Hero: los servicios rotan solos (01 → 05) hasta que el visitante toque uno; pasar el cursor solo pausa 6 s.
   El texto del servicio que sale baja y se desvanece; el nuevo entra desde arriba.
   La B del centro crece un poco cuando el cursor se acerca (solo con mouse). */
import services from '../data/services.json';
import { finePointer, pad2, reducedMotion } from './env';

const ROTATE_MS = 3800;
const HOVER_HOLD_MS = 6000;

export function initServices(): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  const orb = hero?.querySelector<HTMLElement>('.orb');
  const cap = hero?.querySelector<HTMLElement>('.cap');
  if (!hero || !orb || !cap) return;

  const buttons = Array.from(orb.querySelectorAll<HTMLButtonElement>('.nb'));
  const spokes = Array.from(orb.querySelectorAll<HTMLElement>('.spoke'));
  const [outgoing, incoming] = Array.from(cap.querySelectorAll<HTMLElement>('.capi'));
  const total = cap.dataset.total || pad2(services.length);
  const rm = reducedMotion();

  let active = 0;
  let previous: number | null = null;
  let swaps = 0;
  let stopped = false;
  let holdUntil = 0;

  const fill = (el: HTMLElement, i: number) => {
    const [small, h3, p] = Array.from(el.children) as HTMLElement[];
    small.textContent = `SERVICIO ${pad2(i + 1)} / ${total}`;
    h3.textContent = services[i].title;
    p.textContent = services[i].description;
  };

  const render = () => {
    buttons.forEach((b, i) => {
      b.classList.toggle('on', i === active);
      b.setAttribute('aria-pressed', i === active ? 'true' : 'false');
    });
    spokes.forEach((s, i) => s.classList.toggle('on', i === active));
    /* la paridad (a/b) cambia el nombre de la animación para que vuelva a empezar en cada cambio */
    const par = swaps % 2 ? 'a' : 'b';
    if (previous == null || previous === active) {
      fill(outgoing, active);
      outgoing.className = 'capi gone';
    } else {
      fill(outgoing, previous);
      outgoing.className = `capi out ${par}`;
    }
    fill(incoming, active);
    incoming.className = previous == null ? 'capi in' : `capi in ${par}`;
  };

  const show = (i: number) => {
    if (i === active) return;
    previous = active;
    active = i;
    swaps++;
    render();
  };

  buttons.forEach((b, i) => {
    const pick = (ev: Event) => {
      if (ev.type === 'click' || ev.type === 'focus') stopped = true;
      else holdUntil = Date.now() + HOVER_HOLD_MS;
      show(i);
    };
    b.addEventListener('click', pick);
    b.addEventListener('focus', pick);
    b.addEventListener('mouseenter', pick);
  });

  window.setInterval(() => {
    if (document.hidden || stopped || reducedMotion() || Date.now() < holdUntil) return;
    const r = hero.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    if (orb.querySelector('.nb:hover')) return;
    show((active + 1) % buttons.length);
  }, ROTATE_MS);

  /* ---- la B se acerca al cursor ---- */
  if (!finePointer() || rm) return;
  const img = orb.querySelector<HTMLElement>('.core img');
  const halo = orb.querySelector<HTMLElement>('.halo');
  if (!img) return;
  let x = 0;
  let y = 0;
  let raf = 0;
  window.addEventListener(
    'pointermove',
    (ev) => {
      if (reducedMotion()) return;
      x = ev.clientX;
      y = ev.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (reducedMotion()) return;
        const r = (img.parentNode as HTMLElement).getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        const R = Math.max(340, r.width * 3);
        let t = Math.max(0, 1 - d / R);
        t = t * t * (3 - 2 * t);
        img.style.transform = `translateX(-11%) scale(${(1 + 0.24 * t).toFixed(3)})`;
        if (halo) halo.style.transform = `translate(-50%,-50%) scale(${(1 + 0.3 * t).toFixed(3)})`;
      });
    },
    { passive: true },
  );
}
