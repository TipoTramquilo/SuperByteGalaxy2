/* Bloquea la selección y arrastre de texto e imágenes (ratón, táctil y atajos de teclado),
   preservando campos editables y el respaldo de copia en Contacto. */
const SELECTION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])'));
}

export function initNoSelect(): void {
  document.addEventListener('selectstart', (ev) => {
    if (!isEditable(ev.target)) ev.preventDefault();
  });

  document.addEventListener('dragstart', (ev) => {
    if (!isEditable(ev.target)) ev.preventDefault();
  });

  document.addEventListener('copy', (ev) => {
    if (!isEditable(ev.target)) ev.preventDefault();
  });

  document.addEventListener('keydown', (ev) => {
    if (isEditable(ev.target)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();
    if (mod && !ev.shiftKey && !ev.altKey && (key === 'a' || key === 'c')) {
      ev.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      return;
    }
    if (ev.shiftKey && !mod && !ev.altKey && SELECTION_KEYS.has(ev.key)) {
      ev.preventDefault();
    }
  });
}
