/* Geometría compartida entre la compilación (HTML inicial) y el navegador (al cambiar de ancho o de producto).
   Funciones puras: no tocan el DOM. */

export type Style = Record<string, string>;

/** Convierte un objeto de estilos en el texto del atributo style. */
export function css(s: Style): string {
  return Object.entries(s)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

/* ---------- Órbita de servicios (hero) ---------- */

export interface OrbitNode {
  /** Posición del botón dentro de la órbita */
  pos: Style;
  /** Radio punteado que une el centro con el botón */
  spoke: Style;
}

/** Cinco servicios repartidos sobre un círculo de radio 206 en un lienzo de 540. */
export function orbitNodes(count: number, startDeg = -90, step = 72): OrbitNode[] {
  const out: OrbitNode[] = [];
  for (let i = 0; i < count; i++) {
    const deg = startDeg + i * step;
    const ang = (deg * Math.PI) / 180;
    const x = 270 + 206 * Math.cos(ang);
    const y = 270 + 206 * Math.sin(ang);
    out.push({
      pos: { left: ((x / 540) * 100).toFixed(2) + '%', top: ((y / 540) * 100).toFixed(2) + '%' },
      spoke: {
        left: (((270 + 72 * Math.cos(ang)) / 540) * 100).toFixed(2) + '%',
        top: (((270 + 72 * Math.sin(ang)) / 540) * 100).toFixed(2) + '%',
        width: (((206 - 72) / 540) * 100).toFixed(2) + '%',
        transform: 'rotate(' + deg + 'deg)',
      },
    });
  }
  return out;
}

/* ---------- Constelación de productos ---------- */

/** Ondulación vertical de la fila de productos (se repite si hay más productos). */
const CONS_Y = [0, -64, 38, -34, 56, -58, 22];

/* Constelaciones lejanas decorativas: puntos normalizados y uniones. */
interface Shape {
  p: number[][];
  e: number[][];
  ax?: number;
}
const FAR_SHAPES: Shape[] = [
  { p: [[0, 0.55], [0.18, 0.42], [0.34, 0.47], [0.5, 0.36], [0.62, 0.62], [0.86, 0.7], [1, 0.48]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
  { p: [[0, 0.2], [0.25, 0.75], [0.5, 0.35], [0.75, 0.8], [1, 0.25]], e: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { p: [[0.5, 0], [0.5, 0.45], [0.5, 1], [0, 0.38], [1, 0.52]], e: [[0, 1], [1, 2], [3, 1], [1, 4]] },
  { p: [[0, 0.8], [0.3, 0.2], [0.7, 0.3], [1, 0.85], [0.5, 0.6]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
  { p: [[0, 0.5], [0.35, 0.3], [0.55, 0.55], [0.9, 0.2], [1, 0.7]], e: [[0, 1], [1, 2], [2, 3], [2, 4]] },
];
/** La B de Byte escondida entre las constelaciones lejanas (una de cada tres). */
const B_SHAPE: Shape = {
  p: [[0, 0], [0, 0.48], [0, 1], [0.56, 0], [0.8, 0.22], [0.58, 0.47], [0.68, 0.52], [0.94, 0.75], [0.62, 1]],
  e: [[0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [5, 1], [1, 6], [6, 7], [7, 8], [8, 2]],
  ax: 0.72,
};

/** Pseudoaleatorio estable: el mismo número da siempre el mismo valor. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function line(x1: number, y1: number, x2: number, y2: number): Style {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return {
    left: x1.toFixed(1) + 'px',
    top: y1.toFixed(1) + 'px',
    width: Math.sqrt(dx * dx + dy * dy).toFixed(1) + 'px',
    transform: 'rotate(' + ((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2) + 'deg)',
  };
}

function dot(x: number, y: number, r: number, o: number): Style {
  return {
    left: x.toFixed(1) + 'px',
    top: y.toFixed(1) + 'px',
    width: (r * 2).toFixed(1) + 'px',
    height: (r * 2).toFixed(1) + 'px',
    opacity: o.toFixed(2),
  };
}

export interface ConsGeometry {
  sw: number;
  n: number;
  mob: boolean;
  CD: number;
  R: number;
  IW: number;
  rowY: number;
  CH: number;
  PAD: number;
  X: number[];
  Y: number[];
}

/** Medidas de la constelación para un ancho de pantalla (sw) y n productos. */
export function consGeometry(sw: number, n: number): ConsGeometry {
  const mob = sw < 760;
  const GAP = mob ? Math.round(sw * 0.56) : 600;
  const CD = mob ? 132 : 168;
  const IW = mob ? Math.min(sw - 48, 330) : 420;
  const rowY = mob ? 215 : 255;
  const X: number[] = [];
  const Y: number[] = [];
  for (let i = 0; i < n; i++) {
    X.push(40 + IW / 2 + i * GAP);
    Y.push(rowY + (mob ? 0.6 : 1) * CONS_Y[i % CONS_Y.length]);
  }
  return { sw, n, mob, CD, R: CD / 2, IW, rowY, CH: mob ? 590 : 660, PAD: Math.max(mob ? 20 : 48, (sw - 1240) / 2 + 48), X, Y };
}

/** Variables CSS del contenedor. */
export function consStyle(g: ConsGeometry): Style {
  return { '--ch': g.CH + 'px', '--rowy': g.rowY + 'px', '--cd': g.CD + 'px' };
}

/** Posición de cada producto (no depende del producto activo). */
export function nodeStyle(g: ConsGeometry, i: number, color: string): Style {
  return { left: g.X[i] - g.IW / 2 + 'px', top: g.Y[i] - g.R + 'px', width: g.IW + 'px', '--pc': color };
}

/** Desplazamiento de la fila para centrar el producto activo sin dejar huecos en los extremos. */
function trackOffset(g: ConsGeometry, pi: number): number {
  const { sw, X, PAD, IW, n } = g;
  let off = sw / 2 - X[pi];
  const oMax = PAD + IW / 2 - X[0];
  const oMin = sw - PAD - IW / 2 - X[n - 1];
  off = Math.min(off, oMax);
  if (oMin < oMax) off = Math.max(off, oMin);
  return off;
}

export function trackStyle(g: ConsGeometry, pi: number): Style {
  return { width: g.X[g.n - 1] + g.IW / 2 + 40 + 'px', transform: 'translateX(' + trackOffset(g, pi).toFixed(1) + 'px)' };
}

/** Líneas entre productos: se acortan para no tocar los círculos (el activo es más grande). */
export function segments(g: ConsGeometry, pi: number): { style: Style; on: boolean }[] {
  const { X, Y, R, n } = g;
  const rad = (i: number) => (i === pi ? R * 1.12 : R * 0.54) + 14;
  const out: { style: Style; on: boolean }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = X[i + 1] - X[i];
    const dy = Y[i + 1] - Y[i];
    const L = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / L;
    const uy = dy / L;
    out.push({
      style: line(X[i] + ux * rad(i), Y[i] + uy * rad(i), X[i + 1] - ux * rad(i + 1), Y[i + 1] - uy * rad(i + 1)),
      on: i === pi || i + 1 === pi,
    });
  }
  return out;
}

/** Ramas y polvo de estrellas alrededor de las líneas (no dependen del producto activo). */
export function decoration(g: ConsGeometry): { deco: { line: Style; dot: Style }[]; dust: Style[] } {
  const { X, Y, n } = g;
  const deco: { line: Style; dot: Style }[] = [];
  const dust: Style[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = X[i + 1] - X[i];
    const dy = Y[i + 1] - Y[i];
    const L = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / L;
    const uy = dy / L;
    const t = 0.35 + hash(i) * 0.3;
    const side = hash(i + 9) > 0.5 ? 1 : -1;
    const d = 46 + hash(i + 3) * 50;
    const mx = X[i] + dx * t;
    const my = Y[i] + dy * t;
    const ex = mx - uy * d * side;
    const ey = my + ux * d * side;
    deco.push({ line: line(mx, my, ex, ey), dot: dot(ex, ey, 1.6 + hash(i + 5), 0.45 + hash(i + 7) * 0.35) });
    for (let k = 0; k < 5; k++) {
      const tt = hash(i * 7 + k);
      dust.push(
        dot(X[i] + dx * tt + (hash(i * 13 + k) - 0.5) * 120, Y[i] + dy * tt + (hash(i * 17 + k) - 0.5) * 170, 0.6 + hash(i * 5 + k) * 0.9, 0.2 + hash(i * 3 + k) * 0.45),
      );
    }
  }
  return { deco, dust };
}

/** Parallax: las constelaciones lejanas se mueven a esta fracción de la velocidad de la fila. */
const FP = 0.35;

/** Constelaciones lejanas (con dos B de Byte por tramo: una arriba, pequeña; otra abajo, más grande). */
export function farField(g: ConsGeometry): { width: number; lines: Style[]; dots: Style[] } {
  const { sw, X, n, mob, CH } = g;
  const farW = sw + (X[n - 1] - X[0]) * FP + 400;
  const lines: Style[] = [];
  const dots: Style[] = [];
  let fx = -200;
  let fi = 0;
  while (fx < farW) {
    const isB = fi % 3 === 1;
    const bTop = isB && ((fi - 1) / 3) % 2 === 0;
    const sh = isB ? B_SHAPE : FAR_SHAPES[fi % FAR_SHAPES.length];
    const ax = sh.ax || 1.6;
    const sc = isB
      ? (bTop ? (mob ? 60 : 78) : mob ? 76 : 98) + hash(fi * 3 + 1) * (mob ? 10 : 16)
      : (mob ? 70 : 110) + hash(fi * 3 + 1) * (mob ? 50 : 90);
    const oy = isB
      ? bTop
        ? (mob ? 14 : 20) + hash(fi * 5 + 2) * 12
        : CH - sc - 10 - hash(fi * 5 + 2) * 8
      : hash(fi * 5 + 2) * (CH - sc - 60) + 20;
    const ox = fx + hash(fi * 7 + 3) * 80;
    const rot = isB ? (((bTop ? -11 : 7) + (hash(fi * 19) - 0.5) * 6) * Math.PI) / 180 : 0;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const hw = (sc * ax) / 2;
    const hh = sc / 2;
    const P = (q: number[]) => {
      const x = q[0] * sc * ax - hw;
      const y = q[1] * sc - hh;
      return [ox + hw + x * cs - y * sn, oy + hh + x * sn + y * cs];
    };
    sh.e.forEach((e) => {
      const a = P(sh.p[e[0]]);
      const b = P(sh.p[e[1]]);
      lines.push(line(a[0], a[1], b[0], b[1]));
    });
    sh.p.forEach((q, k) => {
      const c = P(q);
      dots.push(dot(c[0], c[1], (k === 0 ? 1.6 : 1.1) + hash(fi * 11 + k) * 0.6, (isB ? 0.45 : 0.35) + hash(fi * 13 + k) * 0.35));
    });
    fx += sc * ax + (mob ? 140 : 220) + hash(fi * 17) * 160;
    fi++;
  }
  return { width: farW, lines, dots };
}

export function farStyle(g: ConsGeometry, farWidth: number, pi: number): Style {
  const farOff = (trackOffset(g, pi) - (g.sw / 2 - g.X[0])) * FP - 100;
  return { width: farWidth + 'px', transform: 'translateX(' + farOff.toFixed(1) + 'px)' };
}

/* Marcado de las capas decorativas: lo usan el componente (HTML inicial) y el script (al cambiar de ancho). */
export function farMarkup(f: { lines: Style[]; dots: Style[] }): string {
  return f.lines.map((s) => `<i class="fl" style="${css(s)}"></i>`).join('') + f.dots.map((s) => `<i class="fd" style="${css(s)}"></i>`).join('');
}

export function clusterMarkup(g: ConsGeometry, pi: number): string {
  const { deco, dust } = decoration(g);
  return (
    deco.map((d) => `<i class="br" style="${css(d.line)}"></i><i class="ds" style="${css(d.dot)}"></i>`).join('') +
    dust.map((s) => `<i class="ds" style="${css(s)}"></i>`).join('') +
    segments(g, pi)
      .map((s) => `<i class="seg${s.on ? ' on' : ''}" style="${css(s.style)}"></i>`)
      .join('')
  );
}
