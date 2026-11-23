/* Pie: onda de feedback al pulsar el logotipo de Byte en el footer. */
const WAVE_MS = 760;

export function initFooter(): void {
  const logo = document.querySelector<HTMLButtonElement>('.foot-logo');
  if (!logo) return;

  logo.addEventListener('click', () => {
    const r = logo.getBoundingClientRect();
    const wave = document.createElement('span');
    wave.className = 'foot-wave';
    wave.setAttribute('aria-hidden', 'true');
    wave.style.left = `${(r.left + r.width / 2).toFixed(1)}px`;
    wave.style.top = `${(r.top + r.height / 2).toFixed(1)}px`;
    const cleanup = () => wave.remove();
    wave.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, WAVE_MS + 140);
    document.body.appendChild(wave);
  });
}
