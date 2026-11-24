/* Barra: marca la sección visible, abre y cierra el menú móvil, centra la sección al navegar
   y permite cambiar de categoría (sección) con ↑ / ↓. */
import { resolveNextSectionIndex } from '../lib/section-nav';
import { perFrame, reducedMotion } from './env';
import { isEditable } from './noselect';

const SECTIONS = ['inicio', 'sectores', 'productos', 'metodo', 'nosotros', 'contacto'];
const KEY_NAV_LOCK_MS = 750;

export function initNav(): void {
  const header = document.querySelector<HTMLElement>('.nav');
  if (!header) return;

  /* ---- sección visible ---- */
  const sectionEls = SECTIONS.map((id) => document.getElementById(id));
  const links = SECTIONS.map((id) => header.querySelectorAll<HTMLAnchorElement>(`a[href="#${id}"]`));
  let current = '';
  let isScrolled = false;
  const spy = perFrame(() => {
    /* Leer geometría antes de escribir clases evita reflow forzado en cada cuadro del scroll. */
    const y = window.scrollY;
    const vh = window.innerHeight;
    const nextScrolled = y > 36;
    const line = vh * 0.45;
    let next = '';
    for (let k = 0; k < SECTIONS.length; k++) {
      const el = sectionEls[k];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) next = SECTIONS[k];
    }
    if (vh + y >= document.documentElement.scrollHeight - 4) next = 'contacto';

    if (nextScrolled !== isScrolled) {
      isScrolled = nextScrolled;
      header.classList.toggle('scrolled', isScrolled);
    }
    if (next === current) return;
    current = next;
    SECTIONS.forEach((id, k) => links[k].forEach((a) => a.classList.toggle('on', id === current)));
  });
  window.addEventListener('scroll', spy, { passive: true });
  spy();

  /* ---- menú móvil ---- */
  const button = header.querySelector<HTMLButtonElement>('.mbtn');
  const menu = document.getElementById('mnav');
  let closeMobileMenu = () => {};
  if (button && menu) {
    const setMenu = (open: boolean) => {
      menu.classList.toggle('open', open);
      header.classList.toggle('menu-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    };
    closeMobileMenu = () => {
      if (menu.classList.contains('open')) setMenu(false);
    };
    button.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
    menu.addEventListener('click', (ev) => {
      if ((ev.target as Element).closest('a')) setMenu(false);
    });
    document.addEventListener('pointerdown', (ev) => {
      if (menu.classList.contains('open') && !header.contains(ev.target as Node)) setMenu(false);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && menu.classList.contains('open')) {
        setMenu(false);
        button.focus();
      }
    });
  }

  /* ---- cálculo de posición centrada para cada sección ---- */
  const scrollYForSection = (id: string, section: HTMLElement): number => {
    const navH = header.offsetHeight || 72;
    const vh = window.innerHeight;
    const max = (document.scrollingElement || document.documentElement).scrollHeight - vh;
    const avail = vh - navH;
    let y: number;
    if (id === 'inicio') y = 0;
    else if (id === 'contacto' && window.innerWidth > 1000) y = max;
    else {
      /* alto del contenido real de la sección (sin las capas decorativas) */
      const top0 = section.getBoundingClientRect().top + window.scrollY;
      let t = Infinity;
      let b = -Infinity;
      Array.from(section.children).forEach((c) => {
        const el = c as HTMLElement;
        if (!el.offsetHeight || el.matches('.stars,.milky,.grain')) return;
        t = Math.min(t, top0 + el.offsetTop);
        b = Math.max(b, top0 + el.offsetTop + el.offsetHeight);
      });
      const h = t < b ? b - t : section.getBoundingClientRect().height;
      const anchorTop = t < b ? t : top0;
      y = anchorTop - navH - (h < avail - 48 ? (avail - h) / 2 : vh < 760 ? 16 : 24);
    }
    return Math.max(0, Math.min(max, Math.round(y)));
  };

  const scrollToSection = (id: string, section: HTMLElement): void => {
    const y = scrollYForSection(id, section);
    window.scrollTo({ top: y, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  /* ---- navegación por categorías con ↑ / ↓ ---- */
  const availableSections = SECTIONS.map((id, i) => ({ id, el: sectionEls[i] })).filter(
    (entry): entry is { id: string; el: HTMLElement } => Boolean(entry.el),
  );
  let pendingTarget: number | null = null;
  let pendingTimer = 0;
  const clearPending = () => {
    pendingTarget = null;
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    }
  };
  window.addEventListener('wheel', clearPending, { passive: true });
  window.addEventListener('touchstart', clearPending, { passive: true });

  window.addEventListener(
    'keydown',
    (ev) => {
      if (isEditable(ev.target)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
      if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;

      ev.preventDefault();
      ev.stopPropagation();
      if (ev.repeat || !availableSections.length) return;

      const active = document.activeElement;
      if (active instanceof HTMLElement && !isEditable(active)) active.blur();
      closeMobileMenu();
      document.dispatchEvent(new Event('sectionnav'));

      const dir: -1 | 1 = ev.key === 'ArrowDown' ? 1 : -1;
      const stops = availableSections.map(({ id, el }) => scrollYForSection(id, el));
      const nextIdx = resolveNextSectionIndex(window.scrollY, stops, dir, pendingTarget);
      pendingTarget = nextIdx;
      if (pendingTimer) window.clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(clearPending, KEY_NAV_LOCK_MS);

      const targetY = stops[nextIdx];
      if (Math.abs(targetY - window.scrollY) > 1) {
        window.scrollTo({ top: targetY, behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
    },
    true,
  );

  /* ---- enlaces internos (barra, menú móvil, Contactar): la sección queda centrada en el espacio visible bajo la barra ---- */
  document.addEventListener(
    'click',
    (ev) => {
      if (ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as Element | null)?.closest?.('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href')!.slice(1);
      const section = id ? document.getElementById(id) : null;
      if (!section) return;
      ev.preventDefault();
      clearPending();
      /* se calcula en el cuadro siguiente, cuando el menú móvil ya se cerró */
      requestAnimationFrame(() => {
        scrollToSection(id, section);
      });
    },
    true,
  );
}
