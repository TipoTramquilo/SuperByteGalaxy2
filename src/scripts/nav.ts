/* Barra: marca la sección visible, abre y cierra el menú móvil, y centra la sección al navegar. */
import { perFrame, reducedMotion } from './env';

const SECTIONS = ['inicio', 'sectores', 'productos', 'metodo', 'nosotros', 'contacto'];

export function initNav(): void {
  const header = document.querySelector<HTMLElement>('.nav');
  if (!header) return;

  /* ---- sección visible ---- */
  const links = SECTIONS.map((id) => header.querySelectorAll<HTMLAnchorElement>(`a[href="#${id}"]`));
  let current = '';
  const spy = perFrame(() => {
    header.classList.toggle('scrolled', window.scrollY > 36);
    const line = window.innerHeight * 0.45;
    let next = '';
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) next = id;
    });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) next = 'contacto';
    if (next === current) return;
    current = next;
    SECTIONS.forEach((id, k) => links[k].forEach((a) => a.classList.toggle('on', id === current)));
  });
  window.addEventListener('scroll', spy, { passive: true });
  spy();

  /* ---- menú móvil ---- */
  const button = header.querySelector<HTMLButtonElement>('.mbtn');
  const menu = document.getElementById('mnav');
  if (button && menu) {
    const setMenu = (open: boolean) => {
      menu.classList.toggle('open', open);
      header.classList.toggle('menu-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
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
      /* se calcula en el cuadro siguiente, cuando el menú móvil ya se cerró */
      requestAnimationFrame(() => {
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
          const h = b - t;
          y = t - navH - (h < avail - 48 ? (avail - h) / 2 : vh < 760 ? 16 : 24);
        }
        y = Math.max(0, Math.min(max, Math.round(y)));
        window.scrollTo({ top: y, behavior: reducedMotion() ? 'auto' : 'smooth' });
      });
    },
    true,
  );
}
