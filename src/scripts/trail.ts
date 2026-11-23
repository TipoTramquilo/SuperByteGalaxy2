/* Cometa luminoso que reemplaza el cursor en escritorio y deja una estela suave.
   Usa borrado por rectángulo sucio (dirty-rect) y escala su resolución/tasa en low-effects
   para funcionar fluido incluso sin aceleración por hardware, y duerme al 0 % cuando el cursor para. */
import { finePointer, reducedMotion } from './env';

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
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const points: Point[] = [];
  let raf = 0;
  let lastDraw = 0;
  let dirty: [number, number, number, number] | null = null;
  let visible = false;
  let curX = 0;
  let curY = 0;

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
    head.classList.remove('vis', 'hot');
    stop();
  };

  const render = (now: number) => {
    raf = 0;
    if (document.hidden || reducedMotion()) {
      hideHead();
      return;
    }

    if (low && now - lastDraw < 30) {
      raf = requestAnimationFrame(render);
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
    dirty = [
      Math.max(0, Math.floor(minX - DIRTY_PAD)),
      Math.max(0, Math.floor(minY - DIRTY_PAD)),
      Math.ceil(maxX - minX + DIRTY_PAD * 2),
      Math.ceil(maxY - minY + DIRTY_PAD * 2),
    ];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

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
    head.style.transform = `translate3d(${curX}px,${curY}px,0)`;
    if (!visible) {
      visible = true;
      head.classList.add('vis');
    }
    const overInteractive = !!(ev.target as Element | null)?.closest?.(INTERACTIVE);
    head.classList.toggle('hot', overInteractive);

    const now = performance.now();
    const last = points[points.length - 1];
    if (last && Math.hypot(curX - last.x, curY - last.y) < (low ? 4 : 2)) return;
    points.push({ x: curX, y: curY, t: now });
    const limit = low ? 12 : 20;
    if (points.length > limit) points.shift();
    if (!raf) raf = requestAnimationFrame(render);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', hideHead);
  window.addEventListener('blur', hideHead);
  document.addEventListener('effectschange', () => {
    const nextLow = document.documentElement.classList.contains('low-effects');
    if (nextLow !== low) {
      low = nextLow;
      clearDirty();
      resize();
    }
  });
}
