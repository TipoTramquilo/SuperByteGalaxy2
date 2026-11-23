/* Pequeña estela luminosa que sigue al puntero en escritorio.
   Se detiene sola cuando el cursor descansa, en modo low-effects o con movimiento reducido. */
import { finePointer, reducedMotion } from './env';

interface Point {
  x: number;
  y: number;
  t: number;
}

const LIFE_MS = 240;
const MAX_POINTS = 18;

export function initTrail(): void {
  if (!finePointer() || reducedMotion()) return;
  if (document.documentElement.classList.contains('low-effects')) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'ctrail';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  document.body.appendChild(canvas);

  let width = 0;
  let height = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const points: Point[] = [];
  let raf = 0;
  let disabled = false;

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    points.length = 0;
    ctx.clearRect(0, 0, width, height);
  };

  const render = () => {
    raf = 0;
    if (disabled || document.hidden || reducedMotion()) {
      stop();
      return;
    }

    const now = performance.now();
    while (points.length && now - points[0].t > LIFE_MS) points.shift();

    ctx.clearRect(0, 0, width, height);
    if (points.length < 2) {
      if (points.length) raf = requestAnimationFrame(render);
      return;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const age = 1 - (now - b.t) / LIFE_MS;
      const progress = i / (points.length - 1);
      const alpha = Math.max(0, age * progress * 0.52);
      if (alpha <= 0.01) continue;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = progress > 0.45 ? `rgba(95,214,255,${alpha.toFixed(3)})` : `rgba(80,54,234,${(alpha * 0.85).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.6, progress * 2.4 * age);
      ctx.stroke();
    }

    const tip = points[points.length - 1];
    const tipAge = Math.max(0, 1 - (now - tip.t) / LIFE_MS);
    if (tipAge > 0.05) {
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 2.2 * tipAge, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,240,255,${(tipAge * 0.55).toFixed(3)})`;
      ctx.fill();
    }

    raf = requestAnimationFrame(render);
  };

  const onMove = (ev: PointerEvent) => {
    if (disabled || ev.pointerType === 'touch' || document.hidden || reducedMotion()) return;
    const now = performance.now();
    const last = points[points.length - 1];
    if (last && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < 2) return;
    points.push({ x: ev.clientX, y: ev.clientY, t: now });
    if (points.length > MAX_POINTS) points.shift();
    if (!raf) raf = requestAnimationFrame(render);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', stop);
  document.addEventListener('effectschange', () => {
    if (document.documentElement.classList.contains('low-effects')) {
      disabled = true;
      stop();
      canvas.remove();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
    }
  });
}
