/* Bloquea la selección y arrastre de texto e imágenes, así como la interacción con
   la interfaz mediante Espacio y flechas, preservando campos editables y la copia en Contacto. */
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

const BLOCKED_KEYS = new Set([' ', 'Spacebar', 'ArrowLeft', 'ArrowRight']);
const VERTICAL_ARROWS = new Set(['ArrowUp', 'ArrowDown']);

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

function isSpaceKey(ev: KeyboardEvent): boolean {
  return ev.key === ' ' || ev.key === 'Spacebar' || ev.code === 'Space';
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

  /* Bloquea Espacio y ← / → en fase de captura antes de que cualquier botón, enlace o carrusel los reciba. */
  window.addEventListener(
    'keydown',
    (ev) => {
      if (isEditable(ev.target)) return;
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (isSpaceKey(ev) || BLOCKED_KEYS.has(ev.key))) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    },
    true,
  );

  /* En varios navegadores un botón enfocado dispara click en keyup de Espacio. */
  window.addEventListener(
    'keyup',
    (ev) => {
      if (isEditable(ev.target)) return;
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && isSpaceKey(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    },
    true,
  );

  /* Respaldo para ↑ / ↓ en páginas sin barra de secciones (ej. política de privacidad) o con Shift:
     nav.ts intercepta ↑ / ↓ antes en window (capture) en la landing. */
  document.addEventListener(
    'keydown',
    (ev) => {
      if (isEditable(ev.target)) return;
      const mod = ev.ctrlKey || ev.metaKey;
      const key = ev.key.toLowerCase();
      if (mod && !ev.shiftKey && !ev.altKey && (key === 'a' || key === 'c')) {
        ev.preventDefault();
        window.getSelection?.()?.removeAllRanges();
        return;
      }
      if (!mod && !ev.altKey && VERTICAL_ARROWS.has(ev.key)) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (ev.shiftKey && !mod && !ev.altKey && SELECTION_KEYS.has(ev.key)) {
        ev.preventDefault();
      }
    },
    true,
  );
}
