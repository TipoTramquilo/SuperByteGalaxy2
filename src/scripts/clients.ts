/* Cinta de clientes: reevalúa qué logo está bajo un cursor estático mientras el carrusel se desplaza,
   evitando que el :hover nativo se quede pegado al logo que ya se alejó. */
import { finePointer, reducedMotion } from './env';

export function initClients(): void {
  if (!finePointer()) return;
  const wrap = document.querySelector<HTMLElement>('.trust .logos');
  if (!wrap) return;

  let active: Element | null = null;
  let inside = false;
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
    if (!inside || document.hidden) {
      stop();
      return;
    }
    if (now - lastCheck >= 40) {
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
    lastCheck = performance.now();
    hit();
    if (!raf && !reducedMotion()) raf = requestAnimationFrame(loop);
  };

  wrap.addEventListener('pointerenter', onPointer, { passive: true });
  wrap.addEventListener('pointermove', onPointer, { passive: true });
  wrap.addEventListener('pointerleave', stop);
  window.addEventListener('blur', stop);
}
