/* Constelación de productos: recalcula la geometría con el ancho real y maneja la navegación
   (flechas, botones, clic en una estrella y deslizar con el dedo). */
import products from '../data/products.json';
import {
  css,
  consGeometry,
  consStyle,
  nodeStyle,
  trackStyle,
  segments,
  farField,
  farStyle,
  farMarkup,
  clusterMarkup,
  type ConsGeometry,
} from '../lib/geometry';
import { pad2, perFrame } from './env';

const SWIPE_PX = 36;

export function initProducts(): void {
  const root = document.querySelector<HTMLElement>('.cons');
  if (!root) return;
  const vp = root.querySelector<HTMLElement>('.vp')!;
  const far = root.querySelector<HTMLElement>('.far')!;
  const track = root.querySelector<HTMLElement>('.track')!;
  const cluster = root.querySelector<HTMLElement>('.cl')!;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.cn'));
  const prev = root.querySelector<HTMLButtonElement>('.cnav.l')!;
  const next = root.querySelector<HTMLButtonElement>('.cnav.r')!;
  const counter = document.querySelector<HTMLElement>('#productos .ct');
  const n = nodes.length;
  if (!n) return;

  const orbButtons = nodes.map((node) => node.querySelector<HTMLElement>('.orbn'));
  const moreEls = nodes.map((node) => node.querySelector<HTMLElement>('.more'));
  let segEls = Array.from(cluster.querySelectorAll<HTMLElement>('.seg'));

  let active = 0;
  let sw = Number(root.dataset.sw) || 0;
  let g: ConsGeometry = consGeometry(sw, n);
  let farWidth = farField(g).width;

  /** Lo que cambia con el producto activo. */
  const apply = () => {
    track.style.cssText = css(trackStyle(g, active));
    far.style.cssText = css(farStyle(g, farWidth, active));
    const segs = segments(g, active);
    segEls.forEach((el, i) => {
      const s = segs[i];
      if (!s) return;
      el.className = s.on ? 'seg on' : 'seg';
      el.style.cssText = css(s.style);
    });
    nodes.forEach((node, i) => {
      const on = i === active;
      node.classList.toggle('on', on);
      const btn = orbButtons[i];
      if (btn) {
        btn.setAttribute('aria-current', on ? 'true' : 'false');
        btn.setAttribute('aria-label', products[i].name + (on ? ' (seleccionado)' : ''));
      }
      moreEls[i]?.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    if (counter) counter.textContent = `${pad2(active + 1)} / ${pad2(n)}`;
    prev.setAttribute('aria-disabled', active === 0 ? 'true' : 'false');
    next.setAttribute('aria-disabled', active === n - 1 ? 'true' : 'false');
  };

  /** Lo que cambia con el ancho de la pantalla. */
  const layout = () => {
    const w = vp.clientWidth;
    if (!w || w === sw) return;
    sw = w;
    g = consGeometry(sw, n);
    const f = farField(g);
    farWidth = f.width;
    root.style.cssText = css(consStyle(g));
    nodes.forEach((node, i) => (node.style.cssText = css(nodeStyle(g, i, products[i].colors[1]))));
    far.innerHTML = farMarkup(f);
    cluster.innerHTML = clusterMarkup(g, active);
    segEls = Array.from(cluster.querySelectorAll<HTMLElement>('.seg'));
    apply();
  };

  const go = (i: number) => {
    i = Math.max(0, Math.min(n - 1, i));
    if (i === active) return;
    active = i;
    apply();
  };

  orbButtons.forEach((btn, i) => btn?.addEventListener('click', () => go(i)));
  prev.addEventListener('click', () => go(active - 1));
  next.addEventListener('click', () => go(active + 1));
  let downX: number | null = null;
  let downY: number | null = null;
  let activePointer: number | null = null;
  const resetSwipe = () => {
    downX = null;
    downY = null;
    activePointer = null;
  };
  vp.addEventListener('pointerdown', (e) => {
    if (activePointer !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activePointer = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
  });
  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointer) resetSwipe();
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointer || downX == null || downY == null) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    resetSwipe();
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2) go(active + (dx < 0 ? 1 : -1));
  });

  const scheduleLayout = perFrame(layout);
  /* ResizeObserver entrega el ancho ya calculado: leerlo al cargar forzaría un reflujo de toda la página */
  if ('ResizeObserver' in window) new ResizeObserver(scheduleLayout).observe(vp);
  else {
    layout();
    window.addEventListener('resize', scheduleLayout);
  }
}
