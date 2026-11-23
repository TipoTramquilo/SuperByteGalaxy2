/* Utilidades compartidas por los scripts de la página. */

const mq = (q: string) => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches;

/** El visitante pidió menos movimiento: nada avanza solo. */
export const reducedMotion = (): boolean => mq('(prefers-reduced-motion:reduce)');

/** Hay mouse (no táctil). */
export const finePointer = (): boolean => mq('(hover:hover) and (pointer:fine)');

/** Ejecuta fn como mucho una vez por cuadro. */
export function perFrame(fn: () => void): () => void {
  let raf = 0;
  return () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      fn();
    });
  };
}

/** Debajo de este ancho la página usa el diseño móvil. */
export const MOBILE = 760;

export const pad2 = (i: number): string => String(i).padStart(2, '0');
