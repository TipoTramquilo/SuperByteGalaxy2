/* Easter egg del fondo: si el visitante fuerza mucho el scroll o la flecha abajo al final de la landing,
   el contenido y el pie suben como una liga con un leve rebote al abrir y cerrar para revelar un gato aleatorio. */

export const ABYSS_DEADZONE = 900;
export const ABYSS_THRESHOLD = 2100;
export const ABYSS_HOLD_GRACE_MS = 280;
export const CAT_SOURCES = [
  '/img/cat-kungfu.mp4',
  '/img/cat-cats.mp4',
  '/img/cat-scuba.mp4',
  '/img/cat-stare.mp4',
  '/img/cat-eat.mp4',
  '/img/cat-tongue.mp4',
  '/img/cat-gang.mp4',
] as const;

const MAX_WHEEL_STEP = 130;
const TOUCH_MULTIPLIER = 2.6;
const KEY_STEP = 310;
const KEY_REPEAT_STEP = 175;
const UNLOCK_GRACE_MS = 180;
const CLOSE_LOCK_MS = 180;
const DECAY_PER_SEC = 3800;
const PULL_OMEGA = 24;
const OPEN_OMEGA = 20;
const OPEN_ZETA = 0.56;
const RETURN_OMEGA = 24;
const RETURN_ZETA = 0.64;
const CLOSE_REBOUND_MIN_LIFT = 40;
const CLOSE_REBOUND_VELOCITY = 410;
const PEEK_RATIO = 0.85;
const MAX_OVERSHOOT_PX = 18;
const BOTTOM_TOLERANCE_PX = 6;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? Boolean(window.matchMedia('(prefers-reduced-motion:reduce)').matches)
    : false;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  return Boolean((target as Element).closest('input,textarea,select,[contenteditable="true"]'));
}

function preventIfPossible(ev: { cancelable?: boolean; preventDefault?: () => void }): void {
  if (ev.cancelable !== false && typeof ev.preventDefault === 'function') {
    ev.preventDefault();
  }
}

function consumeKeyEvent(ev: KeyboardEvent): void {
  preventIfPossible(ev);
  if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
  if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
}

/** Elige un gato al azar evitando repetir el inmediatamente anterior cuando hay más de uno. */
export function pickRandomCat(
  sources: readonly string[] = CAT_SOURCES,
  rng: () => number = Math.random,
  exclude?: string | null,
): string {
  const pool = exclude && sources.length > 1 ? sources.filter((s) => s !== exclude) : sources;
  const list = pool.length ? pool : sources;
  const idx = Math.floor(Math.max(0, Math.min(0.999999, rng())) * list.length);
  return list[idx] ?? sources[0];
}

/** Paso analítico de resorte (zeta = 1 sin rebote; zeta < 1 con rebote elástico controlado). */
export function stepSpring(
  value: number,
  velocity: number,
  target: number,
  omega: number,
  dt: number,
  zeta = 1,
): [number, number] {
  const x0 = value - target;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const exp = Math.exp(-zeta * omega * dt);
    const cos = Math.cos(wd * dt);
    const sin = Math.sin(wd * dt);
    const b = (velocity + zeta * omega * x0) / wd;
    const nextX = exp * (x0 * cos + b * sin);
    const nextV = exp * ((b * wd - zeta * omega * x0) * cos - (x0 * wd + zeta * omega * b) * sin);
    return [target + nextX, nextV];
  }
  const exp = Math.exp(-omega * dt);
  const c2 = velocity + omega * x0;
  const nextX = (x0 + c2 * dt) * exp;
  const nextV = (velocity - c2 * omega * dt) * exp;
  return [target + nextX, nextV];
}

/** Convierte deltaY de WheelEvent a píxeles acotados para exigir insistencia real. */
export function normalizeWheelDelta(deltaY: number, deltaMode: number, viewportHeight = 800): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  let px = deltaY;
  if (deltaMode === 1) px = deltaY * 32;
  else if (deltaMode === 2) px = deltaY * viewportHeight * 0.5;
  return Math.max(-MAX_WHEEL_STEP, Math.min(MAX_WHEEL_STEP, px));
}

/** Progreso [0..1] tras superar la zona muerta inicial. */
export function computeAbyssProgress(effort: number): number {
  if (effort <= ABYSS_DEADZONE) return 0;
  const span = Math.max(1, ABYSS_THRESHOLD - ABYSS_DEADZONE);
  return Math.max(0, Math.min(1, (effort - ABYSS_DEADZONE) / span));
}

/** Curva progresiva: resiste al principio (cuesta despegarlo) y se facilita al abrirse. */
export function rubberBandLift(progress: number, panelHeight = 140): number {
  const p = Math.max(0, Math.min(1, progress));
  const maxPeek = panelHeight * PEEK_RATIO;
  return maxPeek * Math.pow(p, 2.1);
}

export interface AbyssOptions {
  rng?: () => number;
}

export interface AbyssController {
  close: () => void;
  destroy: () => void;
}

export function initAbyss(options: AbyssOptions = {}): AbyssController | null {
  const pg = document.querySelector<HTMLElement>('.pg:not(.privacy-page)');
  const main = pg?.querySelector<HTMLElement>('main') ?? null;
  const foot = pg?.querySelector<HTMLElement>('.foot');
  if (!pg || !foot) return null;

  const rng = options.rng ?? Math.random;

  const panel = document.createElement('aside');
  panel.className = 'abyss';
  panel.setAttribute('aria-label', 'Secreto del fondo');
  panel.setAttribute('aria-hidden', 'true');

  const inner = document.createElement('div');
  inner.className = 'abyss-in';

  const video = document.createElement('video');
  video.className = 'abyss-cat';
  video.width = 200;
  video.height = 200;
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('loop', '');
  video.setAttribute('autoplay', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('preload', 'none');
  video.setAttribute('aria-label', 'Gato secreto');

  const onMediaReady = () => video.classList.remove('loading');
  video.addEventListener?.('loadeddata', onMediaReady);
  video.addEventListener?.('canplay', onMediaReady);
  video.addEventListener?.('playing', onMediaReady);
  video.addEventListener?.('error', onMediaReady);

  inner.appendChild(video);
  panel.appendChild(inner);
  document.body.append(panel);

  let effort = 0;
  let visualLift = 0;
  let velocity = 0;
  let unlocked = false;
  let unlockedAt = 0;
  let closingUntil = 0;
  let allowCloseBounce = false;
  let lastInputAt = 0;
  let activeSrc: string | null = null;
  let lastSrc: string | null = null;
  let cachedHeight = 0;
  let rafId = 0;
  let lastFrameAt = 0;
  let touchY: number | null = null;
  let trackingTouch = false;

  const measurePanelHeight = (): number => {
    cachedHeight = panel.offsetHeight || 140;
    return cachedHeight;
  };

  const getPanelHeight = (): number => cachedHeight || measurePanelHeight();

  const isAtBottom = (): boolean => {
    const scroller = document.scrollingElement || document.documentElement;
    const max = Math.max(0, scroller.scrollHeight - window.innerHeight);
    return max > 0 && window.scrollY >= max - BOTTOM_TOLERANCE_PX;
  };

  const playMedia = () => {
    if (document.hidden) return;
    if (typeof video.play === 'function') {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  };

  const pauseMedia = () => {
    if (typeof video.pause === 'function') {
      video.pause();
    }
  };

  const ensureMediaLoaded = () => {
    if (!activeSrc) {
      activeSrc = pickRandomCat(CAT_SOURCES, rng, lastSrc);
      lastSrc = activeSrc;
      if (video.getAttribute('src') !== activeSrc) {
        if (typeof video.readyState === 'number') video.classList.add('loading');
        video.src = activeSrc;
        video.setAttribute('src', activeSrc);
      }
    }
    playMedia();
  };

  const resetMedia = () => {
    pauseMedia();
    activeSrc = null;
    video.classList.remove('loading');
    if (typeof video.removeAttribute === 'function') video.removeAttribute('src');
    video.src = '';
    if (typeof video.load === 'function') video.load();
  };

  const applyLift = (lift: number) => {
    const h = getPanelHeight();
    if (lift <= 0.12 && !allowCloseBounce) {
      if (main) {
        main.style.transform = '';
        main.style.willChange = '';
      }
      foot.style.transform = '';
      foot.style.willChange = '';
      panel.classList.remove('visible', 'open');
      panel.style.transform = '';
      panel.setAttribute('aria-hidden', 'true');
      if (activeSrc && !unlocked && effort <= ABYSS_DEADZONE) resetMedia();
      return;
    }

    const clamped = Math.max(0, Math.min(h + MAX_OVERSHOOT_PX, lift));
    const y = -clamped;
    const panelY = h - clamped;
    const shift = `translate3d(0, ${y.toFixed(2)}px, 0)`;

    if (main) {
      main.style.willChange = 'transform';
      main.style.transform = shift;
    }
    foot.style.willChange = 'transform';
    foot.style.transform = shift;
    panel.classList.add('visible');
    panel.classList.toggle('open', unlocked);
    panel.style.transform = `translate3d(0, ${panelY.toFixed(2)}px, 0)`;
    panel.setAttribute('aria-hidden', unlocked ? 'false' : 'true');
  };

  const stopLoop = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastFrameAt = 0;
  };

  const step = (ts: number) => {
    rafId = 0;
    const dt = lastFrameAt ? Math.min(0.05, Math.max(0.001, (ts - lastFrameAt) / 1000)) : 1 / 60;
    lastFrameAt = ts;

    const h = getPanelHeight();

    if (!unlocked && effort > 0 && Date.now() - lastInputAt > ABYSS_HOLD_GRACE_MS) {
      effort = Math.max(0, effort - DECAY_PER_SEC * dt);
    }

    const progress = unlocked ? 1 : computeAbyssProgress(effort);
    const targetLift = unlocked ? h : rubberBandLift(progress, h);

    if (prefersReducedMotion()) {
      visualLift = targetLift;
      velocity = 0;
      allowCloseBounce = false;
    } else {
      const closingToZero = !unlocked && targetLift === 0;
      const omega = unlocked ? OPEN_OMEGA : targetLift > visualLift ? PULL_OMEGA : RETURN_OMEGA;
      const zeta = unlocked ? OPEN_ZETA : closingToZero && allowCloseBounce ? RETURN_ZETA : 1;
      [visualLift, velocity] = stepSpring(visualLift, velocity, targetLift, omega, dt, zeta);

      if (visualLift <= 0) {
        if (closingToZero && allowCloseBounce && velocity < -120) {
          /* Rebote sutil contra el borde inferior (~6 px) al cerrar, una sola vez. */
          allowCloseBounce = false;
          visualLift = 0.5;
          velocity = CLOSE_REBOUND_VELOCITY;
        } else {
          allowCloseBounce = false;
          visualLift = 0;
          velocity = 0;
        }
      } else if (visualLift > h + MAX_OVERSHOOT_PX) {
        visualLift = h + MAX_OVERSHOOT_PX;
        velocity = 0;
      }

      if (!allowCloseBounce && Math.abs(targetLift - visualLift) < 0.15 && Math.abs(velocity) < 0.5) {
        visualLift = targetLift;
        velocity = 0;
      }
    }

    applyLift(visualLift);

    const settled = !allowCloseBounce && Math.abs(targetLift - visualLift) < 0.15 && Math.abs(velocity) < 0.5;
    const needsMore = !settled || (!unlocked && (effort > 0 || visualLift > 0.12));
    if (needsMore) {
      rafId = requestAnimationFrame(step);
    } else {
      lastFrameAt = 0;
    }
  };

  const startLoop = () => {
    if (!rafId) {
      lastFrameAt = 0;
      rafId = requestAnimationFrame(step);
    }
  };

  const open = () => {
    measurePanelHeight();
    ensureMediaLoaded();
    unlocked = true;
    unlockedAt = Date.now();
    closingUntil = 0;
    allowCloseBounce = false;
    effort = ABYSS_THRESHOLD;
    if (!prefersReducedMotion()) {
      velocity = Math.max(velocity, 360);
    }
    startLoop();
  };

  const close = (lockScroll = false) => {
    effort = 0;
    unlocked = false;
    if (lockScroll) closingUntil = Date.now() + CLOSE_LOCK_MS;
    if (visualLift > 0.12) {
      allowCloseBounce = !prefersReducedMotion() && visualLift >= CLOSE_REBOUND_MIN_LIFT;
      startLoop();
    } else {
      allowCloseBounce = false;
      stopLoop();
      visualLift = 0;
      velocity = 0;
      applyLift(0);
    }
  };

  const pushDown = (amount: number) => {
    if (amount <= 0 || unlocked) return;
    closingUntil = 0;
    allowCloseBounce = false;
    lastInputAt = Date.now();
    const progress = computeAbyssProgress(effort);
    const gain = 1 + 1.5 * progress;
    effort = Math.min(ABYSS_THRESHOLD, effort + amount * gain);
    if (effort > ABYSS_DEADZONE) {
      if (!cachedHeight) measurePanelHeight();
      ensureMediaLoaded();
    }
    if (effort >= ABYSS_THRESHOLD) {
      open();
      return;
    }
    startLoop();
  };

  const onWheel = (ev: WheelEvent) => {
    const delta = normalizeWheelDelta(ev.deltaY, ev.deltaMode, window.innerHeight);
    if (delta < 0) {
      if (unlocked) {
        preventIfPossible(ev);
        if (Date.now() - unlockedAt > UNLOCK_GRACE_MS && delta <= -4) {
          close(true);
        }
        return;
      }
      if (visualLift > 0.12 || Date.now() < closingUntil) {
        preventIfPossible(ev);
        if (effort > 0) {
          effort = 0;
          startLoop();
        }
        return;
      }
      if (effort > 0) {
        effort = 0;
        startLoop();
      }
      return;
    }

    if (delta === 0 || !isAtBottom()) {
      if (!unlocked && (effort > 0 || visualLift > 0.12)) {
        effort = 0;
        startLoop();
      }
      return;
    }

    pushDown(delta);
  };

  const onTouchStart = (ev: TouchEvent) => {
    if (ev.touches.length !== 1) {
      trackingTouch = false;
      touchY = null;
      return;
    }
    if (!unlocked && visualLift <= 0.12 && !isAtBottom()) {
      trackingTouch = false;
      touchY = null;
      return;
    }
    trackingTouch = true;
    touchY = ev.touches[0].clientY;
  };

  const onTouchMove = (ev: TouchEvent) => {
    if (!trackingTouch || ev.touches.length !== 1 || touchY === null) return;
    const currentY = ev.touches[0].clientY;
    const delta = touchY - currentY;
    touchY = currentY;

    if (delta < 0 && (unlocked || visualLift > 0.12 || Date.now() < closingUntil)) {
      preventIfPossible(ev);
      if (unlocked && delta <= -8 && Date.now() - unlockedAt > UNLOCK_GRACE_MS) {
        close(true);
      } else if (!unlocked && effort > 0) {
        effort = 0;
        startLoop();
      }
      return;
    }
    if (delta > 0 && !unlocked && isAtBottom()) {
      pushDown(delta * TOUCH_MULTIPLIER);
    } else if (delta < -6 && !unlocked && effort > 0) {
      effort = 0;
      startLoop();
    }
  };

  const onTouchEnd = () => {
    trackingTouch = false;
    touchY = null;
  };

  const onScroll = () => {
    if (isAtBottom()) return;
    if (unlocked || effort > 0 || visualLift > 0.12) close(false);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && unlocked) {
      close(false);
      return;
    }
    if (isEditableTarget(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;

    if (ev.key === 'ArrowDown') {
      if (unlocked || isAtBottom()) {
        consumeKeyEvent(ev);
        pushDown(ev.repeat ? KEY_REPEAT_STEP : KEY_STEP);
      }
      return;
    }

    if (ev.key === 'ArrowUp') {
      if (unlocked) {
        consumeKeyEvent(ev);
        if (!ev.repeat && Date.now() - unlockedAt > UNLOCK_GRACE_MS) {
          close(true);
        }
        return;
      }
      if (visualLift > 0.12 || Date.now() < closingUntil) {
        consumeKeyEvent(ev);
        if (effort > 0) {
          effort = 0;
          startLoop();
        }
        return;
      }
      if (effort > 0) {
        effort = 0;
        startLoop();
      }
      return;
    }

    if ((ev.key === 'PageDown' || ev.key === 'End') && !unlocked && isAtBottom()) {
      pushDown(KEY_STEP);
    }
  };

  const onResize = () => {
    const h = measurePanelHeight();
    if (unlocked) {
      visualLift = h;
      velocity = 0;
      applyLift(visualLift);
    }
  };

  const onVisibilityChange = () => {
    if (!activeSrc) return;
    if (document.hidden) pauseMedia();
    else if (unlocked) playMedia();
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener?.('visibilitychange', onVisibilityChange);

  const destroy = () => {
    stopLoop();
    effort = 0;
    unlocked = false;
    allowCloseBounce = false;
    visualLift = 0;
    velocity = 0;
    closingUntil = 0;
    resetMedia();
    applyLift(0);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener?.('visibilitychange', onVisibilityChange);
    panel.remove();
  };

  return { close: () => close(false), destroy };
}
