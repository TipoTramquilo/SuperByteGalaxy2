/* Quiénes somos: escritura tipo terminal letra por letra tras el fade-in, sin saltos de layout. */
import { reducedMotion } from './env';

const FADE_WAIT_MS = 450;
const CHAR_MS = 32;
const SPACE_MS = 22;
const COMMA_MS = 130;
const SENTENCE_MS = 280;
const DONE_CLEANUP_MS = 2500;

function charDelay(ch: string): number {
  if (ch === '.' || ch === ':') return SENTENCE_MS;
  if (ch === ',') return COMMA_MS;
  if (ch === ' ') return SPACE_MS;
  return CHAR_MS;
}

export function initAbout(): void {
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
  live.append(leadOut, restOut, cursor);

  el.append(ghost, live);
  el.classList.add('is-term');

  let started = false;
  let index = 0;

  const finish = () => {
    el.classList.remove('is-typing');
    el.classList.add('is-done');
    window.setTimeout(() => {
      el.classList.remove('is-term', 'is-done');
      live.remove();
      while (ghost.firstChild) el.appendChild(ghost.firstChild);
      ghost.remove();
    }, DONE_CLEANUP_MS);
  };

  const step = () => {
    if (reducedMotion()) {
      leadOut.textContent = leadText;
      restOut.textContent = restText;
      finish();
      return;
    }
    if (document.hidden) {
      document.addEventListener('visibilitychange', () => window.setTimeout(step, CHAR_MS), { once: true });
      return;
    }

    index += 1;
    let ch: string;
    if (index <= leadText.length) {
      leadOut.textContent = leadText.slice(0, index);
      ch = leadText.charAt(index - 1);
    } else {
      const k = index - leadText.length;
      if (leadOut.textContent.length < leadText.length) leadOut.textContent = leadText;
      restOut.textContent = restText.slice(0, k);
      ch = restText.charAt(k - 1);
    }

    if (index < total) {
      window.setTimeout(step, charDelay(ch));
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
