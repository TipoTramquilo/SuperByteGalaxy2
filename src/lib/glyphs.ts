/* Glifos de 9 × 9 de cada producto y sector: "#" es una celda encendida.
   Para dibujar un producto nuevo, añade aquí su glifo y usa su clave en products.json. */
export const GLYPHS: Record<string, string[]> = {
  cpu: ['..#.#.#..', '.#######.', '##.....##', '.#.###.#.', '##.#.#.##', '.#.###.#.', '##.....##', '.#######.', '..#.#.#..'],
  modules: ['####.####', '####.####', '####.####', '####.####', '.........', '####.####', '####.#..#', '####.#..#', '####.####'],
  shield: ['#########', '##.....##', '##.....##', '##..#..##', '##.###.##', '.##.#.##.', '.##...##.', '..##.##..', '...###...'],
  pin: ['...###...', '..#...#..', '..#.#.#..', '..#...#..', '...#.#...', '....#....', '.........', '#.#.#.#.#', '.........'],
  chat: ['#########', '#.......#', '#.##.##.#', '#.......#', '#.#####.#', '#.......#', '#########', '.##......', '.#.......'],
  monitor: ['#########', '#.......#', '#.....#.#', '#...#.#.#', '#.#.#.#.#', '#.#.#.#.#', '#########', '...###...', '..#####..'],
  // Sectores (src/data/sectors.json)
  helmet: ['.........', '...###...', '..#####..', '.###.###.', '.###.###.', '.#######.', '#########', '#########', '.........'],
  car: ['.........', '.........', '..#####..', '.##...##.', '#########', '#########', '#########', '.##...##.', '.........'],
  bank: ['....#....', '..#####..', '#########', '.........', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '.........', '#########'],
  coin: ['..#####..', '.#..#..#.', '#..###..#', '#..#....#', '#..###..#', '#....#..#', '#..###..#', '.#..#..#.', '..#####..'],
  truck: ['.........', '.........', '#####....', '#####.##.', '#####.#.#', '#########', '#########', '.##...##.', '.........'],
};

/** Celda de 7 px más 2 px de separación. */
const CELL = 9;
const GAP = 2;

function hex(h: string): number[] {
  return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
}

/** Glifo como imagen SVG para usar en background-image: un solo elemento en lugar de 81 celdas en el DOM.
   Cada celda encendida toma su color de un degradado diagonal entre los dos colores. */
export function glyphImage(key: string, light: string, base: string): string {
  const rows = GLYPHS[key] ?? GLYPHS.modules;
  const a = hex(light);
  const b = hex(base);
  const R = rows.length;
  const C = rows[0].length;
  let cells = '';
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (rows[r].charAt(c) !== '#') continue;
      const t = (c + r) / (R + C - 2);
      const fill = 'rgb(' + [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)).join(',') + ')';
      cells += `<rect x='${c * CELL}' y='${r * CELL}' width='${CELL - GAP}' height='${CELL - GAP}' rx='1.5' fill='${fill}'/>`;
    }
  }
  const size = C * CELL - GAP;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${R * CELL - GAP}'>${cells}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}
