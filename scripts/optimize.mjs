/*
 * Optimiza dist/ para servirlo con el mínimo peso posible:
 *   - escribe una versión precomprimida .br (y .gz con --gzip) de cada archivo de texto
 *   - informa el peso real y el peso transferido
 *
 * Uso:
 *   node scripts/optimize.mjs                 # crea .br
 *   node scripts/optimize.mjs --gzip          # crea .br y .gz
 *   node scripts/optimize.mjs --report-only   # solo mide, no escribe nada
 *
 * No usa dependencias: todo sale de node:zlib.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brotliCompressSync,
  constants as zlib,
  gzipSync,
} from 'node:zlib';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TEXT = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.webmanifest',
]);
const MIN_BYTES = 512;

const args = new Set(process.argv.slice(2));
const reportOnly = args.has('--report-only');
const withGzip = args.has('--gzip');

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const pad = (value, width) => String(value).padStart(width);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

let files;
try {
  files = (await walk(DIST)).sort();
} catch {
  console.error('No existe dist/. Ejecuta `npm run build` primero.');
  process.exit(1);
}

const rows = [];
let rawTotal = 0;
let brTotal = 0;
let gzTotal = 0;
let extraBytes = 0;
let compressed = 0;

for (const file of files) {
  const rel = relative(DIST, file);
  const ext = extname(file).toLowerCase();
  const { size } = await stat(file);
  rawTotal += size;

  const canCompress = TEXT.has(ext) && size >= MIN_BYTES;
  if (!canCompress) {
    brTotal += size;
    gzTotal += size;
    continue;
  }

  const source = await readFile(file);
  const br = brotliCompressSync(source, {
    params: {
      [zlib.BROTLI_PARAM_QUALITY]: 11,
      [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
      [zlib.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  });
  const gz = gzipSync(source, { level: 9 });

  const brSize = Math.min(br.length, size);
  const gzSize = Math.min(gz.length, size);
  brTotal += brSize;
  gzTotal += gzSize;
  compressed += 1;

  if (!reportOnly && br.length < size) {
    await writeFile(`${file}.br`, br);
    extraBytes += br.length;
  }
  if (!reportOnly && withGzip && gz.length < size) {
    await writeFile(`${file}.gz`, gz);
    extraBytes += gz.length;
  }

  rows.push({ rel, size, br: brSize, gz: gzSize });
}

rows.sort((a, b) => b.size - b.br - (a.size - a.br));

const nameWidth = Math.max(5, ...rows.map((row) => row.rel.length));
console.log(`\n${'Archivo'.padEnd(nameWidth)}  ${pad('crudo', 9)}  ${pad('brotli', 9)}  ${pad('gzip', 9)}`);
console.log(`${'-'.repeat(nameWidth)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}`);
for (const row of rows) {
  console.log(
    `${row.rel.padEnd(nameWidth)}  ${pad(kb(row.size), 9)}  ${pad(kb(row.br), 9)}  ${pad(kb(row.gz), 9)}`,
  );
}

const saved = rawTotal - brTotal;
const percent = rawTotal ? Math.round((saved / rawTotal) * 100) : 0;
console.log(`${'-'.repeat(nameWidth)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}`);
console.log(`${`Total (${rows.length} archivos de texto)`.padEnd(nameWidth)}  ${pad(kb(rawTotal), 9)}  ${pad(kb(brTotal), 9)}  ${pad(kb(gzTotal), 9)}`);
console.log(`\nTransferencia estimada con brotli: ${kb(brTotal)} (${percent}% menos que ${kb(rawTotal)})`);

if (reportOnly) {
  console.log('Modo informe: no se escribió ningún archivo.\n');
} else {
  const written = withGzip ? '.br + .gz' : '.br';
  console.log(`Escritos ${compressed} archivos ${written}; dist/ ocupa ahora ${kb(rawTotal + extraBytes)}.\n`);
}
