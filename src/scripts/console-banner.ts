/* Firma de consola: banner ASCII de BYTE con degradado violeta → azul y eslogan. */

const ART = [
  ' ███████████  █████ █████ ███████████ ██████████',
  '░░███░░░░░███░░███ ░░███ ░█░░░███░░░█░░███░░░░░█',
  ' ░███    ░███ ░░███ ███  ░   ░███  ░  ░███  █ ░',
  ' ░██████████   ░░█████       ░███     ░██████',
  ' ░███░░░░░███   ░░███        ░███     ░███░░█',
  ' ░███    ░███    ░███        ░███     ░███ ░   █',
  ' ███████████     █████       █████    ██████████',
  '░░░░░░░░░░░     ░░░░░       ░░░░░    ░░░░░░░░░░',
] as const;

const START_RGB: readonly [number, number, number] = [196, 113, 245];
const END_RGB: readonly [number, number, number] = [72, 156, 234];
const STEP = 2;
const MONO = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';

function lerpRgb(t: number): string {
  const r = Math.round(START_RGB[0] + (END_RGB[0] - START_RGB[0]) * t);
  const g = Math.round(START_RGB[1] + (END_RGB[1] - START_RGB[1]) * t);
  const b = Math.round(START_RGB[2] + (END_RGB[2] - START_RGB[2]) * t);
  return `rgb(${r},${g},${b})`;
}

export function buildConsoleBanner(): { format: string; styles: string[] } {
  const maxCols = Math.max(...ART.map((line) => line.length));
  const denom = Math.max(1, maxCols - 1);
  const styles: string[] = [];
  const rows: string[] = [];

  for (const line of ART) {
    let row = '';
    for (let col = 0; col < line.length; col += STEP) {
      const chunk = line.slice(col, col + STEP);
      const t = Math.min(1, (col + chunk.length / 2) / denom);
      row += `%c${chunk}`;
      styles.push(`${MONO}font-size:11px;line-height:1.15;color:${lerpRgb(t)}`);
    }
    rows.push(row);
  }

  const format =
    `\n${rows.join('\n')}\n\n` +
    `%cConstruyendo tus sueños... byte a byte.\n` +
    `%cpsst... hazle click-spamming a Byte en el footer\n`;
  styles.push(
    `${MONO}font-size:12px;font-weight:500;color:#9BB4E0;letter-spacing:0.03em`,
    `${MONO}font-size:10px;font-style:italic;color:rgba(155,180,224,0.48);letter-spacing:0.02em`,
  );

  return { format, styles };
}

export function initConsoleBanner(): void {
  if (typeof console === 'undefined' || typeof console.log !== 'function') return;
  const { format, styles } = buildConsoleBanner();
  const print = console.log.bind(console, format, ...styles);
  /* Invocar console.log ligado desde setTimeout evita mostrar el nombre del bundle a la derecha en DevTools. */
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(print, 0);
  } else {
    print();
  }
}
