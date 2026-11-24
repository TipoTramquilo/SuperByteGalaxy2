/* Cinta de clientes: reevalúa qué logo está bajo un cursor estático mientras el carrusel se desplaza,
   evitando que el :hover nativo se quede pegado al logo que ya se alejó. */
import { finePointer, reducedMotion } from './env';

export function initClients(): void {
  if (!finePointer()) return;
  const section = document.querySelector<HTMLElement>('.trust');
  const wrap = section?.querySelector<HTMLElement>('.logos');
  if (!section || !wrap) return;

  let active: Element | null = null;
  let inside = false;
  let moved = false;
  let px = 0;
  let py = 0;
  let raf = 0;
  let lastCheck = 0;

  const setActive = (next: Element | null) => {
    if (next === active) return;
    active?.classList.remove('is-hot');
    active = next;
    active?.classList.add('is-hot');
  };

  const stop = () => {
    inside = false;
    moved = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    setActive(null);
  };

  const hit = () => {
    const el = document.elementFromPoint(px, py);
    if (!el || !wrap.contains(el)) {
      stop();
      return;
    }
    setActive(el.closest('.lg'));
  };

  const loop = (now: number) => {
    raf = 0;
    if (!inside || document.hidden || section.classList.contains('effects-paused')) {
      stop();
      return;
    }
    if (moved || now - lastCheck >= 40) {
      moved = false;
      lastCheck = now;
      hit();
    }
    if (inside && !reducedMotion()) raf = requestAnimationFrame(loop);
  };

  const onPointer = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch') return;
    px = ev.clientX;
    py = ev.clientY;
    inside = true;
    moved = true;
    if (!raf) raf = requestAnimationFrame(loop);
  };

  wrap.addEventListener('pointerenter', onPointer, { passive: true });
  wrap.addEventListener('pointermove', onPointer, { passive: true });
  wrap.addEventListener('pointerleave', stop);
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
}
