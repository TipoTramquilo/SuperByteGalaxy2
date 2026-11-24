/* Sistema solar de sectores:
   - Escritorio (> 900px): sol monumental izquierdo + arco orbital vertical con brazos rotatorios reales
     (los planetas viajan sobre la curva, sin cruzarse; el planeta que sale por un extremo se desvanece
     hacia el horizonte y entra suavemente desde el horizonte opuesto).
   - Móvil / tablet (<= 900px): rotación 90° con horizonte solar arriba, arco horizontal táctil y swipe. */
import { finePointer, pad2, perFrame, reducedMotion } from './env';

const COMPACT_BP = 900;
const SWIPE_PX = 34;
const SWIPE_VEL = 0.14;
const INITIAL_COOLDOWN_MS = 4000;
const ROTATE_MS = 4800;
const CLICK_RESUME_MS = 5200;
const RESUME_MS = 2400;

const D_CX = -74;
const D_R = 485;
/* Ángulos compensados por radio visual (proporción plena 566x582) para mantener separación uniforme borde a borde. */
const D_ANGLES = [0, 20.4, 33.8];

interface ArcGeom {
  compact: boolean;
  cx: number;
  cy: number;
  r: number;
  angles: number[];
  w: number;
  h: number;
}

function measure(vis: HTMLElement, compact: boolean): ArcGeom {
  const w = vis.clientWidth || (compact ? 360 : 566);
  const h = vis.clientHeight || (compact ? 276 : 582);
  if (!compact) {
    const scale = Math.min(1, w / 566);
    return {
      compact: false,
      cx: D_CX * scale,
      cy: h / 2,
      r: D_R * scale,
      angles: D_ANGLES,
      w,
      h,
    };
  }
  const narrow = w < 420;
  /* Centro solar arriba (coincide con el sol ancho en móvil) para que el arco abrace su horizonte */
  const cy = narrow ? -54 : -70;
  const pd = narrow ? 80 : 88;
  /* Radios visuales reales en móvil (activo + anillo punteado, vecino y extremo) para igualar el espacio borde a borde */
  const r0 = (pd * 1.04) / 2 + 10;
  const r1 = (pd * 0.58) / 2;
  const r2 = (pd * 0.48) / 2;
  const r = Math.max(206, Math.min(296, h - cy - r0 - 4));
  const maxX = Math.max(100, w / 2 - r2 - 6);
  const maxOuterRad = Math.asin(Math.min(0.92, maxX / r));
  const arcTotal = r * maxOuterRad;
  const gap = Math.max(10, (arcTotal - (r0 + r1 * 2 + r2)) / 2);
  const a1 = ((r0 + gap + r1) / r) * (180 / Math.PI);
  const a2 = a1 + ((r1 + gap + r2) / r) * (180 / Math.PI);
  return { compact: true, cx: w / 2, cy, r, angles: [0, a1, a2], w, h };
}

function angleForOffset(g: ArcGeom, off: number): number {
  const abs = Math.abs(off);
  const deg = g.angles[abs] ?? g.angles[g.angles.length - 1] + (abs - (g.angles.length - 1)) * 13;
  return Math.sign(off) * deg;
}

function pointOnArc(g: ArcGeom, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  if (!g.compact) {
    return [g.cx + g.r * Math.cos(rad), g.cy + g.r * Math.sin(rad)];
  }
  return [g.cx + g.r * Math.sin(rad), g.cy + g.r * Math.cos(rad)];
}

function arcPath(g: ArcGeom, startDeg: number, endDeg: number): string {
  const [x1, y1] = pointOnArc(g, startDeg);
  const [x2, y2] = pointOnArc(g, endDeg);
  const sweep = g.compact ? 0 : 1;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${g.r.toFixed(1)} ${g.r.toFixed(1)} 0 0 ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Transformaciones del brazo rotatorio y su planeta (siempre derecho, pegado a la curva real). */
function armRot(g: ArcGeom, deg: number): string {
  const rot = g.compact ? -deg : deg;
  return `rotate(${rot.toFixed(2)}deg)`;
}

function planetOffset(g: ArcGeom, deg: number): string {
  const counter = g.compact ? deg : -deg;
  return g.compact
    ? `translate3d(0,${g.r.toFixed(1)}px,0) rotate(${counter.toFixed(2)}deg)`
    : `translate3d(${g.r.toFixed(1)}px,0,0) rotate(${counter.toFixed(2)}deg)`;
}

export function initSectors(): void {
  const section = document.getElementById('sectores');
  if (!section) return;
  const stage = section.querySelector<HTMLElement>('.sol-stage');
  const vis = section.querySelector<HTMLElement>('.sol-vis');
  const arcSvg = section.querySelector<SVGSVGElement>('.sol-arc');
  const arcBg = section.querySelector<SVGPathElement>('.sol-arc-bg');
  const arcHi = section.querySelector<SVGPathElement>('.sol-arc-hi');
  const arcGrad = section.querySelector<SVGLinearGradientElement>('#sol-arc-g');
  const planetsWrap = section.querySelector<HTMLElement>('.sol-planets');
  const pivot = section.querySelector<HTMLElement>('.sol-pivot');
  const arms = Array.from(section.querySelectorAll<HTMLElement>('.sol-arm'));
  const slides = Array.from(section.querySelectorAll<HTMLElement>('.sol-slide'));
  const dots = Array.from(section.querySelectorAll<HTMLButtonElement>('.sol-dot'));
  const counter = section.querySelector<HTMLElement>('.ct');
  const prevBtn = section.querySelector<HTMLButtonElement>('.sol-prev');
  const nextBtn = section.querySelector<HTMLButtonElement>('.sol-next');
  const sun = section.querySelector<HTMLElement>('.sol-sun');
  const sunSpot = section.querySelector<SVGGElement>('.sol-spot');

  if (!stage || !vis || !pivot || !arms.length || !slides.length) return;

  const n = arms.length;
  const half = Math.floor(n / 2);
  const mod = (i: number) => ((i % n) + n) % n;
  const signedOffset = (i: number, act: number) => ((i - act + n + half) % n) - half;

  const mq = window.matchMedia(`(max-width:${COMPACT_BP}px)`);
  let compact = mq.matches;
  let g = measure(vis, compact);
  let active = 0;
  let lastOffsets = arms.map((_, i) => signedOffset(i, 0));
  let exitTimer = 0;

  const clearGhosts = () => {
    pivot.querySelectorAll('.sol-ghost').forEach((node) => node.remove());
  };

  /** Clona el planeta saliente para desvanecerlo suavemente más allá del horizonte del arco. */
  const spawnHorizonExit = (arm: HTMLElement, fromDeg: number, exitDeg: number) => {
    const sectorIdx = arm.dataset.sector;
    if (sectorIdx != null) {
      pivot.querySelectorAll(`.sol-ghost[data-sector="${sectorIdx}"]`).forEach((node) => node.remove());
    }
    const ghost = arm.cloneNode(true) as HTMLElement;
    ghost.classList.add('sol-ghost');
    ghost.classList.remove('on', 'sol-snap');
    ghost.setAttribute('aria-hidden', 'true');
    const gBtn = ghost.querySelector<HTMLButtonElement>('.sol-pbtn');
    if (gBtn) {
      gBtn.removeAttribute('id');
      gBtn.tabIndex = -1;
      gBtn.disabled = true;
    }
    const gPlanet = ghost.querySelector<HTMLElement>('.sol-p');
    ghost.style.transform = armRot(g, fromDeg);
    ghost.style.opacity = '1';
    if (gPlanet) gPlanet.style.transform = planetOffset(g, fromDeg);
    pivot.appendChild(ghost);

    if (typeof ghost.animate !== 'function') {
      ghost.remove();
      return;
    }
    const animArm = ghost.animate(
      [
        { transform: armRot(g, fromDeg), opacity: 1 },
        { transform: armRot(g, exitDeg), opacity: 0 },
      ],
      { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
    );
    if (gPlanet) {
      gPlanet.animate(
        [
          { transform: planetOffset(g, fromDeg) },
          { transform: planetOffset(g, exitDeg) },
        ],
        { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
      );
    }
    animArm.onfinish = () => ghost.remove();
    animArm.oncancel = () => ghost.remove();
  };

  const syncArc = () => {
    if (!arcSvg || !arcBg || !arcHi) return;
    arcSvg.setAttribute('viewBox', `0 0 ${g.w} ${g.h}`);
    const outer = g.angles[2] ?? 34;
    const mid = g.angles[1] ?? 20;
    const span = outer + 5;
    const hiSpan = mid * 1.04;
    arcBg.setAttribute('d', arcPath(g, -span, span));
    arcHi.setAttribute('d', arcPath(g, -hiSpan, hiSpan));
    if (arcGrad) {
      arcGrad.setAttribute('x1', '0%');
      arcGrad.setAttribute('y1', '0%');
      arcGrad.setAttribute('x2', g.compact ? '100%' : '0%');
      arcGrad.setAttribute('y2', g.compact ? '0%' : '100%');
    }
  };

  const positionPlanets = (instant = false, dir = 1) => {
    pivot.style.transform = `translate3d(${g.cx.toFixed(1)}px,${g.cy.toFixed(1)}px,0)`;
    if (instant) clearGhosts();
    if (instant && planetsWrap) planetsWrap.classList.add('sol-instant');

    const reduce = reducedMotion();
    const outerDeg = g.angles[2] ?? 34;
    const horizonPad = g.compact ? 14 : 12;
    const entering: { arm: HTMLElement; p: HTMLElement | null; targetDeg: number }[] = [];

    arms.forEach((arm, i) => {
      const off = signedOffset(i, active);
      const prevOff = lastOffsets[i];
      const deg = angleForOffset(g, off);
      const prevDeg = angleForOffset(g, prevOff);
      const tier = off === 0 ? '0' : Math.abs(off) === 1 ? '1' : '2';
      const p = arm.querySelector<HTMLElement>('.sol-p');

      /* Un planeta hace wrap cuando cruza el extremo del arco en sentido contrario al avance. */
      const deltaOff = off - prevOff;
      const isWrap = !instant && !reduce && Math.abs(deltaOff) > 2;

      arm.classList.toggle('on', off === 0);
      arm.dataset.off = String(off);
      arm.dataset.tier = tier;

      const btn = arm.querySelector<HTMLButtonElement>('.sol-pbtn');
      if (btn) {
        const baseName = slides[i]?.querySelector('.sol-title')?.textContent?.trim() || '';
        btn.setAttribute('aria-selected', off === 0 ? 'true' : 'false');
        btn.setAttribute('aria-label', off === 0 ? `${baseName} (seleccionado)` : baseName);
        btn.tabIndex = off === 0 ? 0 : -1;
      }

      if (isWrap) {
        /* 1) Fantasma saliendo suavemente por el horizonte que deja atrás */
        const exitSign = prevOff === 0 ? -dir : Math.sign(prevOff);
        const exitDeg = exitSign * (outerDeg + horizonPad);
        spawnHorizonExit(arm, prevDeg, exitDeg);

        /* 2) Planeta real entra suavemente desde el horizonte opuesto hacia su nueva posición */
        const enterSign = off === 0 ? dir : Math.sign(off);
        const startDeg = enterSign * (outerDeg + horizonPad);
        arm.classList.add('sol-snap');
        arm.style.opacity = '0';
        arm.style.transform = armRot(g, startDeg);
        if (p) p.style.transform = planetOffset(g, startDeg);
        entering.push({ arm, p, targetDeg: deg });
      } else {
        arm.classList.remove('sol-snap');
        arm.style.opacity = '1';
        arm.style.transform = armRot(g, deg);
        if (p) p.style.transform = planetOffset(g, deg);
      }

      lastOffsets[i] = off;
    });

    if (instant && planetsWrap) {
      void planetsWrap.offsetWidth;
      planetsWrap.classList.remove('sol-instant');
    } else if (entering.length) {
      /* Forzamos un único reflujo para que el estado inicial en el horizonte se pinte antes de deslizar. */
      void pivot.offsetWidth;
      entering.forEach(({ arm, p, targetDeg }) => {
        arm.classList.remove('sol-snap');
        arm.style.opacity = '1';
        arm.style.transform = armRot(g, targetDeg);
        if (p) p.style.transform = planetOffset(g, targetDeg);
      });
    }
  };

  const syncDeck = (prev: number, animate: boolean) => {
    const accent = arms[active]?.style.getPropertyValue('--pc').trim();
    if (accent) stage.style.setProperty('--sc', accent);

    if (exitTimer) {
      window.clearTimeout(exitTimer);
      exitTimer = 0;
    }

    const useAnim = animate && !reducedMotion();
    slides.forEach((el, i) => {
      const on = i === active;
      const isLeaving = useAnim && i === prev && prev !== active;
      el.classList.remove('on', 'enter', 'out');
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (on) {
        if (useAnim) void el.offsetWidth;
        el.classList.add('on');
        if (useAnim) el.classList.add('enter');
      } else if (isLeaving) {
        el.classList.add('out');
      }
    });

    if (useAnim && prev !== active) {
      exitTimer = window.setTimeout(() => {
        slides[prev]?.classList.remove('out');
        exitTimer = 0;
      }, 260);
    }

    dots.forEach((dot, i) => {
      const on = i === active;
      dot.classList.toggle('on', on);
      dot.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (counter) counter.textContent = `${pad2(active + 1)} / ${pad2(n)}`;
  };

  const select = (target: number, explicitDir?: number) => {
    const next = mod(target);
    if (next === active) return;
    const prev = active;
    const off = signedOffset(next, prev);
    const dir = explicitDir ?? (off >= 0 ? 1 : -1);
    stage.style.setProperty('--sdir', String(dir));
    stage.dataset.dir = String(dir);
    active = next;
    positionPlanets(false, dir);
    syncDeck(prev, true);
  };

  const relayout = () => {
    compact = mq.matches;
    g = measure(vis, compact);
    syncArc();
    positionPlanets(true);
  };

  let autoTimer = 0;
  let inView = false;
  let cooledDown = false;

  const scheduleAuto = (delay = ROTATE_MS) => {
    window.clearTimeout(autoTimer);
    autoTimer = 0;
    if (reducedMotion() || !inView || document.hidden) return;
    autoTimer = window.setTimeout(tickAuto, delay);
  };

  const tickAuto = () => {
    autoTimer = 0;
    if (!inView || document.hidden || reducedMotion()) return;
    cooledDown = true;
    const keyboardFocus = Boolean(stage.querySelector(':focus-visible'));
    if (!keyboardFocus) {
      select(active + 1, 1);
    }
    scheduleAuto(ROTATE_MS);
  };

  const userSelect = (target: number, explicitDir?: number) => {
    cooledDown = true;
    select(target, explicitDir);
    scheduleAuto(CLICK_RESUME_MS);
  };

  arms.forEach((arm, i) => {
    arm.querySelector<HTMLButtonElement>('.sol-pbtn')?.addEventListener('click', () => userSelect(i));
  });

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => userSelect(i));
  });

  prevBtn?.addEventListener('click', () => userSelect(active - 1, -1));
  nextBtn?.addEventListener('click', () => userSelect(active + 1, 1));

  stage.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!stage.contains(document.activeElement)) {
        scheduleAuto(cooledDown ? RESUME_MS : INITIAL_COOLDOWN_MS);
      }
    }, 0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.clearTimeout(autoTimer);
      autoTimer = 0;
    } else if (inView) {
      scheduleAuto(cooledDown ? RESUME_MS : INITIAL_COOLDOWN_MS);
    }
  });

  stage.addEventListener('keydown', (e) => {
    if ((!compact && e.key === 'ArrowDown') || (compact && e.key === 'ArrowRight')) {
      e.preventDefault();
      userSelect(active + 1, 1);
      arms[active]?.querySelector<HTMLButtonElement>('.sol-pbtn')?.focus();
    } else if ((!compact && e.key === 'ArrowUp') || (compact && e.key === 'ArrowLeft')) {
      e.preventDefault();
      userSelect(active - 1, -1);
      arms[active]?.querySelector<HTMLButtonElement>('.sol-pbtn')?.focus();
    }
  });

  /* Swipe horizontal en toda la sección (círculos, sol, textos y cabecera) en modo compacto */
  let downX: number | null = null;
  let downY: number | null = null;
  let downT = 0;
  let activePointer: number | null = null;

  const resetSwipe = () => {
    downX = null;
    downY = null;
    activePointer = null;
  };

  section.addEventListener('pointerdown', (e) => {
    if (!compact || activePointer !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activePointer = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
  });

  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointer) resetSwipe();
  });

  window.addEventListener('pointerup', (e) => {
    if (!compact || e.pointerId !== activePointer || downX === null || downY === null) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    const dt = Math.max(1, performance.now() - downT);
    const vel = Math.abs(dx) / dt;
    resetSwipe();
    if (Math.abs(dx) > Math.abs(dy) * 1.15 && (Math.abs(dx) >= SWIPE_PX || (Math.abs(dx) >= 18 && vel > SWIPE_VEL))) {
      userSelect(active + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }
  });

  if ('ResizeObserver' in window) new ResizeObserver(perFrame(relayout)).observe(vis);
  else window.addEventListener('resize', perFrame(relayout));
  mq.addEventListener('change', relayout);

  relayout();
  syncDeck(0, false);

  /* Cooldown inicial de 4 s al entrar en pantalla por primera vez antes de iniciar el loop normal. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible === inView) return;
        inView = visible;
        if (inView) {
          scheduleAuto(cooledDown ? ROTATE_MS : INITIAL_COOLDOWN_MS);
        } else {
          window.clearTimeout(autoTimer);
          autoTimer = 0;
        }
      },
      { threshold: 0.2 },
    ).observe(section);
  } else {
    inView = true;
    scheduleAuto(INITIAL_COOLDOWN_MS);
  }

  /* ---- Destello reactivo del borde solar al cursor (solo escritorio con puntero fino) ----
     El sol permanece fijo en su sitio; únicamente el arco luminoso .sol-spot sigue el ángulo y cercanía
     del cursor usando transform + opacity en GPU, deteniendo el rAF automáticamente al asentarse. */
  if (!finePointer() || reducedMotion() || !sun || !sunSpot) return;

  let tSpotOp = 0;
  let tAngle = 0;
  let cSpotOp = 0;
  let cAngle = 0;
  let spotRaf = 0;

  const stepSun = () => {
    spotRaf = 0;
    if (document.hidden || compact || reducedMotion() || document.documentElement.classList.contains('low-effects')) {
      sunSpot.style.opacity = '0';
      cSpotOp = 0;
      tSpotOp = 0;
      return;
    }

    cSpotOp += (tSpotOp - cSpotOp) * 0.095;

    /* Interpolación angular más corta (-180°..+180°) para que el brillo nunca dé vuelta larga */
    const diff = ((((tAngle - cAngle) % 360) + 540) % 360) - 180;
    cAngle += diff * 0.12;

    sunSpot.style.transform = `rotate(${cAngle.toFixed(2)}deg)`;
    sunSpot.style.opacity = cSpotOp.toFixed(3);

    const moving = Math.abs(tSpotOp - cSpotOp) > 0.004 || (cSpotOp > 0.01 && Math.abs(diff) > 0.25);
    if (moving) spotRaf = requestAnimationFrame(stepSun);
  };

  const kickSun = () => {
    if (!spotRaf) spotRaf = requestAnimationFrame(stepSun);
  };

  let ptrX = 0;
  let ptrY = 0;
  const sampleSun = perFrame(() => {
    if (
      compact ||
      document.hidden ||
      reducedMotion() ||
      section.classList.contains('effects-paused') ||
      document.documentElement.classList.contains('low-effects')
    ) {
      return;
    }
    const r = sun.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = ptrX - cx;
    const dy = ptrY - cy;
    const dist = Math.hypot(dx, dy);
    const maxR = Math.max(540, r.width * 1.15);
    let pull = Math.max(0, 1 - dist / maxR);
    pull = pull * pull * (3 - 2 * pull);

    tSpotOp = Math.min(0.92, pull * 1.2);
    tAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    kickSun();
  });

  section.addEventListener(
    'pointermove',
    (ev) => {
      if (
        compact ||
        reducedMotion() ||
        section.classList.contains('effects-paused') ||
        document.documentElement.classList.contains('low-effects')
      ) {
        return;
      }
      ptrX = ev.clientX;
      ptrY = ev.clientY;
      sampleSun();
    },
    { passive: true },
  );

  section.addEventListener('pointerleave', () => {
    tSpotOp = 0;
    kickSun();
  });
}
