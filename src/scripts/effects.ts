/* Pausa decoraciones fuera de pantalla y congela el fondo pesado (como en móvil)
   si no hay aceleración por hardware o si el navegador no mantiene fluidez. */
const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render driver|warp|mesa offscreen|subzero/i;

/** Detecta si el navegador renderiza por software (sin aceleración por hardware). */
export function isSoftwareRenderer(): boolean {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
  try {
    const canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    const strict =
      (canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) ||
        canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true })) as WebGLRenderingContext | null;
    if (!strict) {
      const fallback = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (fallback) {
        fallback.getExtension('WEBGL_lose_context')?.loseContext();
        return true;
      }
      return typeof WebGLRenderingContext !== 'undefined';
    }
    const debug = strict.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? String(strict.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '') : '';
    strict.getExtension('WEBGL_lose_context')?.loseContext();
    return SOFTWARE_GPU.test(renderer);
  } catch {
    return false;
  }
}

export function initEffects(): void {
  const html = document.documentElement;
  const syncVisibility = () => html.classList.toggle('page-hidden', document.hidden);
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('effects-paused', !entry.isIntersecting));
    }, { rootMargin: '160px' });
    document.querySelectorAll('.hero,.trust,#sectores,.cons-sec,#metodo,#nosotros,.cta,.privacy-main').forEach((section) => observer.observe(section));
  }

  let low = false;
  const enableLowEffects = () => {
    if (low) return;
    low = true;
    html.classList.add('low-effects');
    document.dispatchEvent(new Event('effectschange'));
  };

  if (isSoftwareRenderer()) {
    enableLowEffects();
    return;
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let previous = 0;
  let frames = 0;
  let slowFrames = 0;
  const sample = (now: number) => {
    // Una pestaña en segundo plano no indica que el equipo sea lento.
    if (document.hidden) {
      previous = frames = slowFrames = 0;
      document.addEventListener('visibilitychange', resume, { once: true });
      return;
    }
    if (previous) {
      frames++;
      if (now - previous > 34) slowFrames++;
    }
    previous = now;
    if (frames < 90) requestAnimationFrame(sample);
    else if (slowFrames > frames / 3) enableLowEffects();
  };
  const resume = () => requestAnimationFrame(sample);
  const start = () => window.setTimeout(resume, 2000);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
