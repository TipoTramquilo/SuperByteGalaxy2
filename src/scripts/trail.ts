/* Estela luminosa que sigue al puntero en escritorio.
   Usa borrado por rectángulo sucio (dirty-rect) y escala su resolución/tasa en low-effects
   para funcionar fluida incluso sin aceleración por hardware, y duerme al 0 % cuando el cursor para. */
import { finePointer, reducedMotion } from './env';

interface Point {
  x: number;
  y: number;
  t: number;
}

const LIFE_MS = 280;
const DIRTY_PAD = 12;

export function initTrail(): void {
  if (!finePointer() || reducedMotion()) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'ctrail';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  document.body.appendChild(canvas);

  let low = document.documentElement.classList.contains('low-effects');
  let width = 0;
  let height = 0;
  let dpr = 1;

  const resize = () => {
    dpr = low ? 1 : Math.min(window.devicePixelRatio || 1, 2);
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
  let lastDraw = 0;
  let dirty: [number, number, number, number] | null = null;

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

  const render = (now: number) => {
    raf = 0;
    if (document.hidden || reducedMotion()) {
      stop();
      return;
    }

    // En modo sin aceleración por hardware limita a ~30 fps para no cargar la CPU.
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

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const age = 1 - (now - b.t) / LIFE_MS;
      const progress = i / (points.length - 1);
      const alpha = Math.max(0, age * progress * 0.68);
      if (alpha <= 0.01) continue;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = progress > 0.45 ? `rgba(95,214,255,${alpha.toFixed(3)})` : `rgba(80,54,234,${(alpha * 0.9).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.8, progress * 5.2 * age);
      ctx.stroke();
    }

    const tip = points[points.length - 1];
    const tipAge = Math.max(0, 1 - (now - tip.t) / LIFE_MS);
    if (tipAge > 0.05) {
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 3.6 * tipAge, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,240,255,${(tipAge * 0.65).toFixed(3)})`;
      ctx.fill();
    }

    raf = requestAnimationFrame(render);
  };

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch' || document.hidden || reducedMotion()) return;
    const now = performance.now();
    const last = points[points.length - 1];
    if (last && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < (low ? 4 : 2)) return;
    points.push({ x: ev.clientX, y: ev.clientY, t: now });
    const limit = low ? 12 : 20;
    if (points.length > limit) points.shift();
    if (!raf) raf = requestAnimationFrame(render);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', stop);
  document.addEventListener('effectschange', () => {
    const nextLow = document.documentElement.classList.contains('low-effects');
    if (nextLow !== low) {
      low = nextLow;
      clearDirty();
      resize();
    }
  });
}
