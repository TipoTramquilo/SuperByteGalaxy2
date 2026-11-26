/* Menú contextual personalizado con estética Órbita.
   Intercepta el clic derecho en escritorio; con Shift + clic derecho (o en táctil / campos editables)
   se abre el menú nativo del navegador junto con las extensiones del usuario. */

const DEFAULT_EMAIL = 'proyectos@byteservices.net';
const MARGIN = 12;
const TOAST_MS = 2200;

export interface MenuPosition {
  left: number;
  top: number;
  ox: '0%' | '100%';
  oy: '0%' | '100%';
}

export interface LinkContext {
  href: string;
  rawHref: string;
  kind: 'mail' | 'tel' | 'hash' | 'url';
  value: string;
  badge: string;
}

export interface ImageContext {
  src: string;
  badge: string;
}

export interface CopyContext {
  value: string;
  label: string;
}

export interface ContextInfo {
  selection: string;
  link: LinkContext | null;
  image: ImageContext | null;
  copyData: CopyContext | null;
  cat: boolean;
  scrolled: boolean;
  isHome: boolean;
}

interface MenuAction {
  id: string;
  label: string;
  icon: IconName;
  shortcut?: string;
  run: () => void;
}

type IconName =
  | 'back'
  | 'forward'
  | 'reload'
  | 'link'
  | 'copy'
  | 'search'
  | 'external'
  | 'image'
  | 'up'
  | 'mail'
  | 'home'
  | 'native'
  | 'check'
  | 'hand';

const ICONS: Record<IconName, string> = {
  back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  forward: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
  reload: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  up: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>',
  native: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="7" cy="6.5" r=".7" fill="currentColor" stroke="none"/><circle cx="10" cy="6.5" r=".7" fill="currentColor" stroke="none"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
};

const mq = (q: string): boolean => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches;

/** Acorta texto largo con elipsis limpia. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
}

/** Determina si debe respetarse el menú nativo del navegador (extensiones, táctil, edición o pase único). */
export function shouldUseNativeMenu(
  ev: { shiftKey?: boolean; pointerType?: string },
  target: EventTarget | null,
  hasFinePointer: boolean,
  bypassOnce = false,
): boolean {
  if (bypassOnce) return true;
  if (ev.shiftKey) return true;
  if (ev.pointerType === 'touch') return true;
  if (!hasFinePointer) return true;
  if (target && typeof (target as Element).closest === 'function') {
    const el = target as HTMLElement;
    if (el.isContentEditable) return true;
    if (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  }
  return false;
}

/** Ajusta la posición del menú para que nunca se salga de la ventana. */
export function clampPosition(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
  viewW: number,
  viewH: number,
  margin = MARGIN,
): MenuPosition {
  const flipX = x + menuW + margin > viewW;
  const flipY = y + menuH + margin > viewH;
  const rawLeft = flipX ? x - menuW : x;
  const rawTop = flipY ? y - menuH : y;
  const maxLeft = Math.max(margin, viewW - menuW - margin);
  const maxTop = Math.max(margin, viewH - menuH - margin);
  return {
    left: Math.round(Math.min(maxLeft, Math.max(margin, rawLeft))),
    top: Math.round(Math.min(maxTop, Math.max(margin, rawTop))),
    ox: flipX ? '100%' : '0%',
    oy: flipY ? '100%' : '0%',
  };
}

/** Resume un enlace para mostrarlo en el encabezado contextual del menú. */
export function formatLinkBadge(href: string, rawHref: string): LinkContext {
  const trimmed = rawHref.trim();
  if (trimmed.startsWith('mailto:')) {
    const value = trimmed.slice(7).split('?')[0];
    return { href, rawHref: trimmed, kind: 'mail', value, badge: truncate(value, 32) };
  }
  if (trimmed.startsWith('tel:')) {
    const value = trimmed.slice(4);
    return { href, rawHref: trimmed, kind: 'tel', value, badge: truncate(value, 32) };
  }
  if (trimmed.startsWith('#')) {
    return { href, rawHref: trimmed, kind: 'hash', value: href, badge: `Sección ${trimmed}` };
  }
  let badge = href;
  try {
    const u = new URL(href);
    const path = u.pathname === '/' ? '' : u.pathname;
    badge = `${u.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    badge = trimmed || href;
  }
  return { href, rawHref: trimmed, kind: 'url', value: href, badge: truncate(badge, 32) };
}

/** Analiza el elemento bajo el puntero y la selección activa. */
export function inspectContext(target: EventTarget | null, selectionText: string, scrollY: number, isHome: boolean): ContextInfo {
  const el = target && typeof (target as Element).closest === 'function' ? (target as Element) : null;
  const anchor = el?.closest<HTMLAnchorElement>('a[href]') || null;
  const img = el?.closest<HTMLImageElement>('img[src]') || null;
  const copyEl = el?.closest<HTMLElement>('[data-copy]') || null;
  const cat = Boolean(el?.closest('.abyss-cat'));

  let link: LinkContext | null = null;
  if (anchor) {
    const rawHref = anchor.getAttribute('href') || '';
    if (rawHref) link = formatLinkBadge(anchor.href || rawHref, rawHref);
  }

  let image: ImageContext | null = null;
  if (img && img.src) {
    const alt = (img.getAttribute('alt') || '').trim();
    const fileName = img.src.split('/').pop()?.split('?')[0] || 'imagen';
    image = { src: img.src, badge: truncate(alt || fileName, 32) };
  }

  let copyData: CopyContext | null = null;
  if (copyEl) {
    const value = (copyEl.dataset.copy || '').trim();
    if (value) copyData = { value, label: value.includes('@') ? 'Copiar correo' : 'Copiar dato' };
  }

  return {
    selection: selectionText.trim(),
    link,
    image,
    copyData,
    cat,
    scrolled: scrollY > 120,
    isHome,
  };
}

function makeIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');
}

function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallbackCopy(text),
    );
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus({ preventScroll: true });
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

export function initContextMenu(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const mod = isMac() ? '⌘' : 'Ctrl+';
  let menu: HTMLDivElement | null = null;
  let toast: HTMLDivElement | null = null;
  let toastText: HTMLSpanElement | null = null;
  let toastTimer = 0;
  let open = false;
  let bypassOnce = false;
  let lastFocused: HTMLElement | null = null;

  const contactEmail = () =>
    document.querySelector<HTMLElement>('[data-copy]')?.dataset.copy?.trim() || DEFAULT_EMAIL;

  const showToast = (message: string, duration = TOAST_MS) => {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'ctxm-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.appendChild(makeIcon('check'));
      toastText = document.createElement('span');
      toast.appendChild(toastText);
      document.body.appendChild(toast);
    }
    if (toastText) toastText.textContent = message;
    toast.classList.add('open');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast?.classList.remove('open'), duration);
  };

  const copyAndNotify = (text: string, label: string) => {
    void copyToClipboard(text).then((ok) => {
      showToast(ok ? label : 'No se pudo copiar');
    });
  };

  const close = (restoreFocus = false) => {
    if (!open || !menu) return;
    open = false;
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    if (restoreFocus && lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
    lastFocused = null;
  };

  const ensureMenu = (): HTMLDivElement => {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.className = 'ctxm';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Menú contextual');
    menu.setAttribute('aria-hidden', 'true');
    menu.addEventListener('contextmenu', (ev) => {
      if (!ev.shiftKey) ev.preventDefault();
    });
    document.body.appendChild(menu);
    return menu;
  };

  const scrollToSection = (hash: string) => {
    const navLink = Array.from(document.querySelectorAll<HTMLAnchorElement>('.nav a[href^="#"]')).find(
      (a) => a.getAttribute('href') === hash,
    );
    if (navLink) {
      navLink.click();
      return;
    }
    const target = document.getElementById(hash.slice(1));
    if (target) {
      target.scrollIntoView({ behavior: mq('(prefers-reduced-motion:reduce)') ? 'auto' : 'smooth' });
    }
  };

  const buildMenu = (info: ContextInfo) => {
    const root = ensureMenu();
    root.textContent = '';

    /* ---- barra superior compacta (navegación del navegador) ---- */
    const bar = document.createElement('div');
    bar.className = 'ctxm-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Navegación');

    const tools: Array<{ label: string; icon: IconName; run: () => void }> = [
      { label: 'Atrás', icon: 'back', run: () => window.history.back() },
      { label: 'Adelante', icon: 'forward', run: () => window.history.forward() },
      { label: 'Recargar', icon: 'reload', run: () => window.location.reload() },
      {
        label: 'Copiar enlace de esta página',
        icon: 'link',
        run: () => copyAndNotify(window.location.href, 'Enlace de la página copiado'),
      },
    ];

    tools.forEach((tool) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctxm-tool';
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('aria-label', tool.label);
      btn.title = tool.label;
      btn.appendChild(makeIcon(tool.icon));
      btn.addEventListener('click', () => {
        close();
        tool.run();
      });
      bar.appendChild(btn);
    });
    root.appendChild(bar);

    /* ---- insignia contextual (selección, enlace, imagen o correo) ---- */
    const badgeText = info.selection
      ? `«${truncate(info.selection, 28)}»`
      : info.link?.badge || info.copyData?.value || info.image?.badge || '';
    if (badgeText) {
      const ctx = document.createElement('div');
      ctx.className = 'ctxm-ctx';
      const span = document.createElement('span');
      span.textContent = badgeText;
      ctx.appendChild(span);
      root.appendChild(ctx);
    }

    const addSep = () => {
      const sep = document.createElement('div');
      sep.className = 'ctxm-sep';
      sep.setAttribute('role', 'separator');
      root.appendChild(sep);
    };

    const addGroup = (items: MenuAction[]) => {
      if (!items.length) return;
      addSep();
      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ctxm-item';
        btn.setAttribute('role', 'menuitem');
        btn.dataset.action = item.id;
        btn.appendChild(makeIcon(item.icon));
        const lbl = document.createElement('span');
        lbl.className = 'ctxm-lbl';
        lbl.textContent = item.label;
        btn.appendChild(lbl);
        if (item.shortcut) {
          const kbd = document.createElement('kbd');
          kbd.textContent = item.shortcut;
          btn.appendChild(kbd);
        }
        btn.addEventListener('click', () => {
          close();
          item.run();
        });
        root.appendChild(btn);
      });
    };

    /* ---- acciones contextuales ---- */
    const contextual: MenuAction[] = [];

    if (info.cat) {
      contextual.push({
        id: 'pet-cat',
        label: 'Acariciar',
        icon: 'hand',
        run: () => {
          document.dispatchEvent(new CustomEvent('abyss:pet'));
        },
      });
    }

    if (info.selection) {
      contextual.push(
        {
          id: 'copy-selection',
          label: 'Copiar selección',
          icon: 'copy',
          shortcut: `${mod}C`,
          run: () => copyAndNotify(info.selection, 'Texto copiado'),
        },
        {
          id: 'search-selection',
          label: 'Buscar en Google',
          icon: 'search',
          run: () => {
            window.open(
              `https://www.google.com/search?q=${encodeURIComponent(info.selection)}`,
              '_blank',
              'noopener,noreferrer',
            );
          },
        },
      );
    }

    if (info.link) {
      const link = info.link;
      if (link.kind === 'url') {
        contextual.push({
          id: 'open-link',
          label: 'Abrir en pestaña nueva',
          icon: 'external',
          run: () => {
            window.open(link.href, '_blank', 'noopener,noreferrer');
          },
        });
      } else if (link.kind === 'hash') {
        contextual.push({
          id: 'jump-hash',
          label: 'Ir a esta sección',
          icon: 'external',
          run: () => scrollToSection(link.rawHref),
        });
      }
      const copyLabel =
        link.kind === 'mail' ? 'Copiar correo' : link.kind === 'tel' ? 'Copiar teléfono' : 'Copiar enlace';
      const toastLabel =
        link.kind === 'mail' ? 'Correo copiado' : link.kind === 'tel' ? 'Teléfono copiado' : 'Enlace copiado';
      contextual.push({
        id: 'copy-link',
        label: copyLabel,
        icon: 'copy',
        run: () => copyAndNotify(link.value, toastLabel),
      });
    }

    if (info.copyData && info.copyData.value !== info.link?.value) {
      const data = info.copyData;
      contextual.push({
        id: 'copy-data',
        label: data.label,
        icon: 'copy',
        run: () => copyAndNotify(data.value, data.value.includes('@') ? 'Correo copiado' : 'Copiado al portapapeles'),
      });
    }

    if (info.image) {
      const image = info.image;
      contextual.push(
        {
          id: 'open-image',
          label: 'Abrir imagen en pestaña nueva',
          icon: 'image',
          run: () => {
            window.open(image.src, '_blank', 'noopener,noreferrer');
          },
        },
        {
          id: 'copy-image',
          label: 'Copiar enlace de imagen',
          icon: 'link',
          run: () => copyAndNotify(image.src, 'Enlace de imagen copiado'),
        },
      );
    }

    addGroup(contextual);

    /* ---- acciones de página y accesos rápidos de Byte Services ---- */
    const appActions: MenuAction[] = [];
    if (info.scrolled) {
      appActions.push({
        id: 'scroll-top',
        label: 'Volver arriba',
        icon: 'up',
        run: () => window.scrollTo({ top: 0, behavior: mq('(prefers-reduced-motion:reduce)') ? 'auto' : 'smooth' }),
      });
    }
    if (info.isHome) {
      appActions.push({
        id: 'go-contact',
        label: 'Ir a Contacto',
        icon: 'mail',
        run: () => scrollToSection('#contacto'),
      });
    } else {
      appActions.push({
        id: 'go-home',
        label: 'Volver al inicio',
        icon: 'home',
        run: () => {
          window.location.href = '/';
        },
      });
    }

    const email = contactEmail();
    if (info.copyData?.value !== email && info.link?.value !== email) {
      appActions.push({
        id: 'copy-byte-email',
        label: 'Copiar correo de Byte',
        icon: 'copy',
        run: () => copyAndNotify(email, 'Correo copiado al portapapeles'),
      });
    }

    addGroup(appActions);

    /* ---- opción seleccionable para abrir el menú nativo y extensiones ---- */
    addGroup([
      {
        id: 'native-menu',
        label: 'Menú del navegador',
        icon: 'native',
        shortcut: 'Shift+clic',
        run: () => {
          bypassOnce = true;
          showToast('Haz clic derecho ahora para abrir el menú nativo', 3200);
        },
      },
    ]);
  };

  const getItems = (): HTMLButtonElement[] =>
    menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')) : [];

  document.addEventListener('contextmenu', (ev) => {
    const fine = mq('(hover:hover) and (pointer:fine)');
    const useBypass = bypassOnce;
    bypassOnce = false;
    if (shouldUseNativeMenu(ev as PointerEvent, ev.target, fine, useBypass)) {
      close();
      return;
    }

    ev.preventDefault();
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const selectionText = window.getSelection?.()?.toString() || '';
    const info = inspectContext(ev.target, selectionText, window.scrollY, !!document.getElementById('contacto'));
    buildMenu(info);

    const root = ensureMenu();
    root.style.left = '0px';
    root.style.top = '0px';

    let x = ev.clientX;
    let y = ev.clientY;
    const openedByKeyboard = x === 0 && y === 0;
    /* apertura por teclado (tecla Menú / Shift+F10 sin Shift+clic) */
    if (openedByKeyboard && lastFocused) {
      const r = lastFocused.getBoundingClientRect();
      x = r.left + Math.min(r.width / 2, 40);
      y = r.bottom + 6;
    }

    const pos = clampPosition(
      x,
      y,
      root.offsetWidth || 276,
      root.offsetHeight || 320,
      window.innerWidth,
      window.innerHeight,
    );
    root.style.left = `${pos.left}px`;
    root.style.top = `${pos.top}px`;
    root.style.setProperty('--ox', pos.ox);
    root.style.setProperty('--oy', pos.oy);
    root.setAttribute('aria-hidden', 'false');
    root.classList.add('open');
    open = true;

    if (openedByKeyboard) {
      const first = getItems()[4] || getItems()[0];
      if (first) first.focus({ preventScroll: true });
    }
  });

  document.addEventListener('pointerdown', (ev) => {
    if (!open || !menu) return;
    if (ev.button === 2) return;
    if (!menu.contains(ev.target as Node)) close();
  });

  document.addEventListener('keydown', (ev) => {
    if (!open || !menu) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close(true);
    } else if (ev.key === 'Tab') {
      close();
    }
  });

  window.addEventListener('scroll', () => close(), { passive: true });
  window.addEventListener('resize', () => close(), { passive: true });
  window.addEventListener('blur', () => close());
  document.addEventListener('sectionnav', () => close());
}
