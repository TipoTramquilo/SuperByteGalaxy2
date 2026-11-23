/* Quiénes somos: escritura tipo terminal letra por letra tras el fade-in y carrusel móvil de mini terminales. */
import { perFrame, reducedMotion } from './env';

const FADE_WAIT_MS = 450;
const LEAD_CHAR_MS = 32;
const LEAD_SPACE_MS = 22;
const LEAD_SENTENCE_MS = 240;
const REST_CHAR_MS = 12;
const REST_SPACE_MS = 7;
const REST_COMMA_MS = 55;
const REST_SENTENCE_MS = 120;

function charDelay(ch: string, isLead: boolean): number {
  if (isLead) {
    if (ch === '.' || ch === ':') return LEAD_SENTENCE_MS;
    if (ch === ' ') return LEAD_SPACE_MS;
    return LEAD_CHAR_MS;
  }
  if (ch === '.' || ch === ':') return REST_SENTENCE_MS;
  if (ch === ',') return REST_COMMA_MS;
  if (ch === ' ') return REST_SPACE_MS;
  return REST_CHAR_MS;
}

export function initAbout(): void {
  initAboutCarousel();

  const el = document.querySelector<HTMLElement>('#nosotros .state');
  if (!el || reducedMotion() || !('IntersectionObserver' in window)) return;

  const sub = el.querySelector<HTMLElement>('.state-sub');
  if (!sub) return;

  const restText = sub.textContent || '';
  const leadNodes = Array.from(el.childNodes).filter((n) => n !== sub);
  const leadText = leadNodes.map((n) => n.textContent || '').join('');
  const total = leadText.length + restText.length;
  if (!total) return;

  /* Mantiene el texto original en un bloque fantasma para reservar la altura exacta (CLS = 0)
     y conservar el contenido completo para lectores de pantalla. */
  const ghost = document.createElement('span');
  ghost.className = 'state-ghost';
  while (el.firstChild) ghost.appendChild(el.firstChild);

  const live = document.createElement('span');
  live.className = 'state-live';
  live.setAttribute('aria-hidden', 'true');
  const leadOut = document.createElement('span');
  const restOut = document.createElement('span');
  restOut.className = 'state-sub';
  const cursor = document.createElement('i');
  cursor.className = 'state-cur';
  cursor.setAttribute('aria-hidden', 'true');
  live.append(leadOut, restOut, cursor);

  el.append(ghost, live);
  el.classList.add('is-term');

  let started = false;
  let index = 0;

  const finish = () => {
    el.classList.remove('is-typing', 'is-term');
    live.remove();
    while (ghost.firstChild) el.appendChild(ghost.firstChild);
    ghost.remove();
    el.appendChild(cursor);
  };

  const step = () => {
    if (reducedMotion()) {
      finish();
      cursor.remove();
      return;
    }
    if (document.hidden) {
      document.addEventListener('visibilitychange', () => window.setTimeout(step, REST_CHAR_MS), { once: true });
      return;
    }

    index += 1;
    const isLead = index <= leadText.length;
    let ch: string;
    if (isLead) {
      leadOut.textContent = leadText.slice(0, index);
      ch = leadText.charAt(index - 1);
    } else {
      const k = index - leadText.length;
      if (leadOut.textContent.length < leadText.length) leadOut.textContent = leadText;
      restOut.textContent = restText.slice(0, k);
      ch = restText.charAt(k - 1);
    }

    if (index < total) {
      window.setTimeout(step, charDelay(ch, isLead));
    } else {
      finish();
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      if (started || !entries.some((e) => e.isIntersecting)) return;
      started = true;
      io.disconnect();
      window.setTimeout(() => {
        el.classList.add('is-typing');
        step();
      }, FADE_WAIT_MS);
    },
    { threshold: 0.08, rootMargin: '0px 0px 2% 0px' },
  );
  io.observe(el);
}

function initAboutCarousel(): void {
  const wrap = document.querySelector<HTMLElement>('#nosotros .why-wrap');
  const track = wrap?.querySelector<HTMLElement>('.why');
  const prev = wrap?.querySelector<HTMLButtonElement>('.wnav.l');
  const next = wrap?.querySelector<HTMLButtonElement>('.wnav.r');
  if (!wrap || !track || !prev || !next) return;

  const slides = Array.from(track.querySelectorAll<HTMLElement>('.why-slot'));
  const pips = Array.from(wrap.querySelectorAll<HTMLElement>('.why-pips i'));
  const counter = wrap.querySelector<HTMLElement>('.why-ct');
  const n = slides.length;
  if (n < 2) return;

  let active = 0;
  let lockTimer = 0;
  let locked = false;

  const unlock = () => {
    locked = false;
    window.clearTimeout(lockTimer);
    lockTimer = 0;
  };

  const sync = (index: number) => {
    active = Math.max(0, Math.min(n - 1, index));
    if (counter) counter.textContent = `${String(active + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    pips.forEach((p, i) => p.classList.toggle('on', i === active));
    prev.setAttribute('aria-disabled', active === 0 ? 'true' : 'false');
    next.setAttribute('aria-disabled', active === n - 1 ? 'true' : 'false');
  };

  const go = (index: number) => {
    const target = Math.max(0, Math.min(n - 1, index));
    const padLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const left = Math.max(0, slides[target].offsetLeft - padLeft);
    locked = true;
    window.clearTimeout(lockTimer);
    lockTimer = window.setTimeout(unlock, 560);
    sync(target);
    track.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  const onScroll = perFrame(() => {
    if (locked) return;
    const padLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const maxScroll = track.scrollWidth - track.clientWidth;
    if (maxScroll <= 2) return;
    if (track.scrollLeft >= maxScroll - 6) {
      sync(n - 1);
      return;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(slides[i].offsetLeft - padLeft - track.scrollLeft);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    sync(best);
  });

  prev.addEventListener('click', () => go(active - 1));
  next.addEventListener('click', () => go(active + 1));
  track.addEventListener('scroll', onScroll, { passive: true });
  track.addEventListener('scrollend', unlock, { passive: true });
  track.addEventListener('touchstart', unlock, { passive: true });
  sync(0);
}
