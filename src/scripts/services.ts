/* Hero: los servicios rotan solos (01 → 05); tras interacción del usuario retoman tras 3,2 s (clic) o 2,6 s (al soltar hover).
   El texto del servicio que sale baja y se desvanece; el nuevo entra desde arriba.
   La B del centro crece un poco cuando el cursor se acerca (solo con mouse). */
import services from '../data/services.json';
import { finePointer, pad2, reducedMotion } from './env';

const ROTATE_MS = 3800;
const CLICK_RESUME_MS = 3200;
const HOVER_RESUME_MS = 2600;

function initHeroTagline(hero: HTMLElement): void {
  const el = hero.querySelector<HTMLElement>('.eb-txt');
  if (!el || reducedMotion()) return;
  const full = el.textContent || '';
  if (!full) return;

  const ghost = document.createElement('span');
  ghost.className = 'eb-ghost';
  ghost.textContent = full;

  const live = document.createElement('span');
  live.className = 'eb-live';
  live.setAttribute('aria-hidden', 'true');
  const out = document.createElement('span');
  const cur = document.createElement('span');
  cur.className = 'eb-cur';
  cur.setAttribute('aria-hidden', 'true');
  live.append(out, cur);

  el.textContent = '';
  el.append(ghost, live);
  el.classList.add('is-term');

  let i = 0;
  const finish = () => {
    el.classList.remove('is-typing', 'is-term');
    live.remove();
    el.textContent = full;
    el.appendChild(cur);
  };

  const step = () => {
    if (reducedMotion()) {
      finish();
      cur.remove();
      return;
    }
    if (document.hidden) {
      document.addEventListener('visibilitychange', () => window.setTimeout(step, 32), { once: true });
      return;
    }
    i += 1;
    out.textContent = full.slice(0, i);
    const ch = full.charAt(i - 1);
    if (i < full.length) {
      const delay = ch === '·' ? 140 : ch === ',' ? 100 : ch === ' ' ? 20 : 34;
      window.setTimeout(step, delay);
    } else {
      finish();
    }
  };

  window.setTimeout(() => {
    el.classList.add('is-typing');
    step();
  }, 380);
}

export function initServices(): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  const orb = hero?.querySelector<HTMLElement>('.orb');
  const cap = hero?.querySelector<HTMLElement>('.cap');
  if (!hero || !orb || !cap) return;

  initHeroTagline(hero);

  const buttons = Array.from(orb.querySelectorAll<HTMLButtonElement>('.nb'));
  const spokes = Array.from(orb.querySelectorAll<HTMLElement>('.spoke'));
  const [outgoing, incoming] = Array.from(cap.querySelectorAll<HTMLElement>('.capi'));
  const total = cap.dataset.total || pad2(services.length);
  const rm = reducedMotion();
  const hasFinePointer = finePointer();

  let active = 0;
  let previous: number | null = null;
  let swaps = 0;
  let timer = 0;

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

  const schedule = (delay = ROTATE_MS) => {
    window.clearTimeout(timer);
    if (reducedMotion()) return;
    timer = window.setTimeout(tick, delay);
  };

  const tick = () => {
    if (!document.hidden && !reducedMotion() && !hero.classList.contains('effects-paused')) {
      const r = hero.getBoundingClientRect();
      if (r.bottom >= 0 && r.top <= window.innerHeight && (!hasFinePointer || !orb.querySelector('.nb:hover'))) {
        show((active + 1) % buttons.length);
      }
    }
    schedule(ROTATE_MS);
  };

  buttons.forEach((b, i) => {
    const pick = (ev: Event) => {
      show(i);
      schedule(ev.type === 'mouseenter' ? HOVER_RESUME_MS : CLICK_RESUME_MS);
    };
    b.addEventListener('click', pick);
    b.addEventListener('focus', pick);
    if (hasFinePointer) {
      b.addEventListener('mouseenter', pick);
      b.addEventListener('mouseleave', () => schedule(HOVER_RESUME_MS));
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.clearTimeout(timer);
    else schedule(HOVER_RESUME_MS);
  });

  schedule(ROTATE_MS);

  /* ---- la B se acerca al cursor ---- */
  if (!hasFinePointer || rm) return;
  const img = orb.querySelector<HTMLElement>('.core img');
  const core = img?.parentElement;
  const halo = orb.querySelector<HTMLElement>('.halo');
  if (!img || !core) return;
  let x = 0;
  let y = 0;
  let raf = 0;
  let coreRect: DOMRect | null = null;
  const invalidateRect = () => {
    coreRect = null;
  };
  const resetCore = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    img.style.transform = '';
    if (halo) halo.style.transform = '';
  };
  window.addEventListener('scroll', invalidateRect, { passive: true });
  window.addEventListener('resize', invalidateRect, { passive: true });
  document.addEventListener('effectschange', () => {
    if (document.documentElement.classList.contains('low-effects')) resetCore();
  });
  hero.addEventListener(
    'pointermove',
    (ev) => {
      if (
        reducedMotion() ||
        hero.classList.contains('effects-paused') ||
        document.documentElement.classList.contains('low-effects')
      ) {
        return;
      }
      x = ev.clientX;
      y = ev.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (reducedMotion() || document.documentElement.classList.contains('low-effects')) return;
        const r = coreRect ?? (coreRect = core.getBoundingClientRect());
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
  hero.addEventListener('pointerleave', resetCore);
}
