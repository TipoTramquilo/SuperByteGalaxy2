# Byte · landing Órbita (Astro)

Migración de la landing **v2 · Órbita** desde el lienzo de diseño a [Astro](https://astro.build).
La página se genera como **HTML estático** y solo envía unos 6 KB (gzip) de JavaScript propio para las interacciones.
No usa React ni Tailwind.

## Requisitos

- Node.js 22.12 o superior (lo exige Astro 6)

## Uso

```bash
npm install
npm run dev      # servidor local en http://localhost:4321
npm run build    # genera dist/, listo para cualquier hosting estático
npm run preview  # sirve dist/ para revisarlo antes de publicar
```

`dist/` se puede subir tal cual a Netlify, Vercel, Cloudflare Pages, GitHub Pages o un servidor con Nginx/Apache.
Cambia `site` en `astro.config.mjs` si el dominio final no es `https://www.byteservices.net`.

## Build mínimo

`npm run build` ya genera el sitio minificado (HTML, CSS y JS) y con el CSS incrustado
para ahorrar una petición que bloquea el render. Para exprimirlo más:

```bash
npm run build:tiny        # build + versiones precomprimidas .br en dist/
npm run build:tiny:gzip   # build + .br y .gz
npm run size              # mide dist/ sin escribir nada
```

El script `scripts/optimize.mjs` no usa dependencias: comprime con `node:zlib` los
HTML, CSS, JS, JSON, SVG, XML y TXT. Los `.woff` y `.webp` ya vienen comprimidos y
se dejan intactos. La ganancia típica es del 70–80 % en el peso de texto.

- **Netlify, Vercel y Cloudflare Pages** comprimen solos en el borde: basta `npm run build`.
  Los `.br` no estorban, pero tampoco hacen falta.
- **Nginx** necesita `brotli_static on;` (o `gzip_static on;` para los `.gz`) para
  servir los archivos precomprimidos. Sin esa directiva se sirve el original.
- **Apache** usa `mod_brotli`/`mod_deflate` con `AddEncoding br .br`.

Para bajar aún más el peso:

1. **Fuentes a `.woff2`** (el mayor ahorro pendiente: ~30 KB). Requiere `woff2_compress`
   (`brew install woff2`) o `fonttools` (`pip install fonttools brotli`). Después hay que
   cambiar los `@font-face` de `src/styles/base.css` y los `preload` de `src/layouts/Base.astro`.
2. **Subconjunto de fuentes** con `pyftsubset` (solo glifos latinos usados): puede dejar
   cada fuente en la mitad.
3. **Logos**: reencodificar los `.webp` con `cwebp -q 82 -m 6` ahorra ~10–15 % sin
   diferencia visible a 60 px de alto.

## Dónde se edita cada cosa

| Quiero cambiar… | Archivo |
| --- | --- |
| Teléfono, WhatsApp, correo, oficina, redes, enlaces del menú, cifras del hero | `src/data/site.json` |
| Servicios de la órbita (texto e ícono) | `src/data/services.json` |
| Productos (nombre, descripción, características, glifo y colores) | `src/data/products.json` |
| Experiencia por sector (nombre, descripción y glifo) | `src/data/sectors.json` |
| Etapas del Método Byte | `src/data/method.json` |
| Logos de clientes | `src/data/clients.json` + imágenes en `public/logos/` (`<slug>-mono.webp` y `<slug>-color.webp`) |
| Easter egg del fondo (gatos, explosión y caricia) | `src/scripts/abyss.ts`, `src/styles/abyss.css` y assets en `public/img/` (`cat-*.mp4`, `cat-boom-*`, `cat-pet-fx.webp`) |
| Textos de Quiénes somos | `src/components/About.astro` |
| Colores, tamaños y animaciones | `src/styles/` (un archivo por sección) |

Para sumar un producto basta con añadirlo a `products.json`: la constelación calcula sola posiciones, líneas y botones.
Si necesita un glifo nuevo, se dibuja en `src/lib/glyphs.ts` (9 × 9, `#` = celda encendida).

## Estándar de videos del easter egg (`.abyss`)

Al añadir un nuevo GIF o video a `CAT_SOURCES` en `src/scripts/abyss.ts`, conviértelo siempre a MP4 con estos parámetros para mantener todo el easter egg muy liviano (los clips se muestran a `112×112 px` en escritorio y `88×88 px` en móvil con `border-radius: 6px`):

- **Formato:** `.mp4` (`H.264 / libx264`, `-pix_fmt yuv420p`, `-movflags +faststart`, sin audio `-an`, sin metadatos `-map_metadata -1`).
- **Dimensiones:** cuadrado **1:1 `128×128 px`** (múltiplo de 16 para macrobloques H.264; recorte centrado o ajustado al sujeto si el encuadre centrado corta la cabeza).
- **Cuadros por segundo:** **`12 fps`** por defecto (`10 fps` si el original ya viene a `<= 10.5 fps`; mínimo `10 fps`, máximo `12 fps`).
- **Compresión:** `-preset veryslow -crf 31` para clips cortos (`<= 5 s`) y `-crf 32` para clips largos (`> 5 s`).
- **Presupuesto objetivo:** ideal `5–20 KB`, máximo `35 KB` por clip.
- **Registro y pruebas:** guardar en `public/img/<nombre>.mp4`, añadir la ruta a `CAT_SOURCES` en `src/scripts/abyss.ts` y actualizar el conteo esperado en `tests/abyss.test.mjs`.

```bash
ffmpeg -y -i entrada.gif \
  -vf "crop=min(iw\,ih):min(iw\,ih),scale=128:128:flags=lanczos,fps=12" \
  -c:v libx264 -crf 31 -preset veryslow \
  -pix_fmt yuv420p -movflags +faststart -an -map_metadata -1 \
  public/img/cat-nuevo.mp4
```

## Estructura

```
src/
  pages/index.astro        la página: une las secciones
  layouts/Base.astro       <head>, tipografías, hoja global y el script de la página
  components/              una pieza por sección (Nav, Hero, Clients, Sectors, Products, Method, About, Contact, Footer)
                           y piezas compartidas (Starfield, Grain, SvgDefs)
  data/                    contenido en JSON
  lib/geometry.ts          geometría de la órbita y de la constelación (la usan la compilación y el navegador)
  lib/glyphs.ts            glifos de los productos
  scripts/                 interacciones, en TypeScript simple, un módulo por sección
  styles/global.css        importa las hojas en orden (el orden importa)
public/
  fonts/  img/  logos/     archivos que se sirven tal cual
  stars/                   capas de estrellas en SVG (se guardan en caché y las de abajo cargan al acercarse)
```

## Cómo funciona

- **HTML inicial completo.** Todo el contenido (textos, productos, etapas, contacto) sale en el HTML, así que se indexa y se ve antes de que cargue el script.
- **Constelación de productos.** El HTML se calcula para 1440 px de ancho; al cargar, `scripts/products.ts` la recalcula con el ancho real usando la misma función de `lib/geometry.ts`.
- **Interacciones** (`src/scripts/`):
  - `services.ts`: rotación 01 → 05 cada 3,8 s hasta que el visitante toca un servicio; el cursor encima pausa 6 s; zoom de la B al acercar el mouse.
  - `products.ts`: flechas, teclado (← →), clic en una estrella y deslizar con el dedo.
  - `method.ts`: en escritorio el Pipeline avanza solo cada 3,4 s mientras se ve; en móvil lo guía el scroll.
  - `nav.ts`: marca la sección visible, menú móvil, y centra la sección al navegar desde la barra.
  - `reveal.ts`: aparición al hacer scroll y pausa de las estrellas fuera de pantalla.
  - `contact.ts`: copia el correo al portapapeles.
- **Móvil y táctil.** Mismas reglas que en el lienzo: fondo estrellado quieto, sin grano ni desenfoques, logos a color y teléfono en lugar de WhatsApp.
- **Movimiento reducido.** Si el sistema lo pide, nada avanza solo y las animaciones se apagan.

## Notas

- Las fuentes se sirven desde `public/fonts/`; no se consulta Google Fonts. Los pesos intermedios usan las variantes locales disponibles.
- `Base.astro` genera canonical, Open Graph y datos de la organización usando el dominio de `astro.config.mjs`. `robots.txt` y `sitemap.xml` se generan al compilar; al añadir páginas indexables, incluirlas en `src/pages/sitemap.xml.ts`.
- Las decoraciones se pausan fuera de pantalla y en pestañas ocultas. Si se detecta renderizado por software (sin aceleración por hardware vía WebGL) o si en la muestra tras la carga de 90 cuadros más de un tercio tarda más de 34 ms, se activa `.low-effects`: congela el fondo estrellado, el grano y los blobs dejando destellos tenues fijos (como en móvil), pero mantiene activas las animaciones de interfaz (órbita, Método Byte, constelación y logos).
- Las fuentes locales están en `.woff`. Pasarlas a `.woff2` reduciría unos 25–30 KB.
- Las variantes descartadas del Método (Ciclo y Recorrido) no se migraron.
