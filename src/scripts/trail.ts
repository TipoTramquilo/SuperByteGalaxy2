/* Cometa luminoso que reemplaza el cursor en escritorio y deja una estela suave.
   Usa borrado por rectángulo sucio (dirty-rect) y escala su resolución/tasa en low-effects
   para funcionar fluido incluso sin aceleración por hardware, y duerme al 0 % cuando el cursor para. */
import { finePointer, perFrame, reducedMotion } from './env';

interface Point {
  x: number;
  y: number;
  t: number;
}

const LIFE_MS = 300;
const DIRTY_PAD = 24;
const INTERACTIVE = 'a[href],button,[role="button"],summary,label';

export function initTrail(): void {
  if (!finePointer() || reducedMotion()) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'ctrail';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const head = document.createElement('i');
  head.className = 'comet-head';
  head.setAttribute('aria-hidden', 'true');

  document.body.append(canvas, head);
  document.documentElement.classList.add('has-comet');

  let low = document.documentElement.classList.contains('low-effects');
  let width = 0;
  let height = 0;
  let dpr = 1;

  const resize = () => {
    dpr = low ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    /* Usa clientWidth/clientHeight (sin barra de scroll) para que el canvas coincida 1:1 en px CSS con clientX/clientY. */
    width = document.documentElement.clientWidth;
    height = document.documentElement.clientHeight;
    const nextW = Math.round(width * dpr);
    const nextH = Math.round(height * dpr);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };
  resize();
  window.addEventListener('resize', perFrame(resize), { passive: true });

  const points: Point[] = [];
  let raf = 0;
  let lastDraw = 0;
  let dirty: [number, number, number, number] | null = null;
  let visible = false;
  let curX = 0;
  let curY = 0;
  let headDirty = false;
  let lastTarget: EventTarget | null = null;
  let lastHot = false;

  const syncHead = () => {
    if (!headDirty) return;
    headDirty = false;
    head.style.transform = `translate3d(${curX}px,${curY}px,0)`;
    if (!visible) {
      visible = true;
      head.classList.add('vis');
    }
    head.classList.toggle('hot', lastHot);
  };

  const clearDirty = () => {
    if (!dirty) return;
    ctx.clearRect(dirty[0], dirty[1], dirty[2], dirty[3]);
    dirty = null;
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    points.length = 0;
    clearDirty();
  };

  const hideHead = () => {
    visible = false;
    headDirty = false;
    lastTarget = null;
    lastHot = false;
    head.classList.remove('vis', 'hot');
    stop();
  };

  const render = (now: number) => {
    raf = 0;
    if (document.hidden || reducedMotion()) {
      hideHead();
      return;
    }

    syncHead();

    if (low && now - lastDraw < 40) {
      if (points.length || headDirty) raf = requestAnimationFrame(render);
      return;
    }
    lastDraw = now;

    while (points.length && now - points[0].t > LIFE_MS) points.shift();
    clearDirty();

    if (points.length < 2) {
      if (points.length) raf = requestAnimationFrame(render);
      return;
    }

    // Ancla la punta exacta de la estela al centro actual del cometa
    const tip = points[points.length - 1];
    tip.x = curX;
    tip.y = curY;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const dx0 = Math.max(0, Math.floor(minX - DIRTY_PAD));
    const dy0 = Math.max(0, Math.floor(minY - DIRTY_PAD));
    dirty = [
      dx0,
      dy0,
      Math.max(0, Math.min(width - dx0, Math.ceil(maxX + DIRTY_PAD) - dx0)),
      Math.max(0, Math.min(height - dy0, Math.ceil(maxY + DIRTY_PAD) - dy0)),
    ];

    // Tono azul celeste ligeramente contenido para armonizar con el cielo oscuro
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const age = 1 - (now - b.t) / LIFE_MS;
      const progress = i / (points.length - 1);
      const alpha = Math.max(0, age * progress * 0.64);
      if (alpha <= 0.01) continue;

      const widthPx = Math.max(1.4, progress * 10.5 * age);
      const isBlue = progress > 0.42;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isBlue ? `rgba(56,162,226,${(alpha * 0.22).toFixed(3)})` : `rgba(74,58,214,${(alpha * 0.2).toFixed(3)})`;
      ctx.lineWidth = widthPx * 1.85;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isBlue ? `rgba(56,162,226,${alpha.toFixed(3)})` : `rgba(74,58,214,${(alpha * 0.88).toFixed(3)})`;
      ctx.lineWidth = widthPx;
      ctx.stroke();
    }

    raf = requestAnimationFrame(render);
  };

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch' || document.hidden || reducedMotion()) return;
    curX = ev.clientX;
    curY = ev.clientY;
    headDirty = true;
    if (ev.target !== lastTarget) {
      lastTarget = ev.target;
      lastHot = !!(ev.target as Element | null)?.closest?.(INTERACTIVE);
    }

    const now = performance.now();
    const last = points[points.length - 1];
    const minDist = low ? 4 : 2;
    if (!last || (curX - last.x) * (curX - last.x) + (curY - last.y) * (curY - last.y) >= minDist * minDist) {
      points.push({ x: curX, y: curY, t: now });
      const limit = low ? 12 : 20;
      if (points.length > limit) points.shift();
    }
    if (!raf) raf = requestAnimationFrame(render);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', hideHead);
  window.addEventListener('blur', hideHead);
  const rmQuery = window.matchMedia('(prefers-reduced-motion:reduce)');
  rmQuery.addEventListener('change', () => {
    const rm = rmQuery.matches;
    document.documentElement.classList.toggle('has-comet', !rm);
    if (rm) hideHead();
  });
  document.addEventListener('effectschange', () => {
    const nextLow = document.documentElement.classList.contains('low-effects');
    if (nextLow !== low) {
      low = nextLow;
      clearDirty();
      resize();
    }
  });
}
