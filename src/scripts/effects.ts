/* Pausa decoraciones fuera de pantalla y activa el modo ligero (.low-effects) en 3 capas:
   1) Detección instantánea de renderizado por software o GPU/APU integrada débil (WebGL renderer).
   2) Micro-benchmark rápido de fill-rate WebGL solo cuando el nombre de la GPU es ambiguo u oculto.
   3) Monitor continuo de fluidez (inicial + durante scroll e interacción + LoAF) con caché de sesión. */

export type GpuTier = 'low' | 'high' | 'unknown';

const SOFTWARE_GPU =
  /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render driver|\bwarp\b|mesa offscreen|subzero/i;

/* GPUs virtuales, integradas antiguas o de gama de entrada con poco ancho de banda / fill-rate.
   Deja fuera cadenas genéricas ("Intel(R) UHD Graphics" sin modelo, "AMD Radeon(TM) Graphics")
   para que la capa 2 mida su velocidad real en lugar de adivinar. */
const WEAK_GPU =
  /vmware|svga3d|virtualbox|\bvbox\b|parallels|virgl|\bqxl\b|hyper-v|citrix|remote desktop|intel[^\n]*(?:gma\b|express chipset|media accelerator|\bhd graphics\b|\buhd graphics (?:600|605|610|615|617|620|630|p630)\b|bay ?trail|braswell|cherry ?trail|apollo ?lake|gemini ?lake|jasper ?lake|elkhart ?lake|ironlake|sandybridge|ivybridge|haswell|broadwell|skylake|kabylake|coffeelake|whiskeylake|amberlake|cometlake)|radeon(?:\s*\(tm\))?\s*(?:r[2-7]\b|hd\s*[2-8]\d{3}|vega\s*[23]\b|(?:5[234]0|6[123]0)\b)|geforce\s*(?:[2-9]\d{2}m?\b|gt\s*[1-7]\d0\b|g\s*[12]\d0\b|mx\s*1[135]0\b|ion\b|go\s*\d|fx\s*\d)|\bnvs\s*\d|mali-(?:4\d\d|t[678]\d\d|g31|g51|g52)\b|powervr\s*(?:sgx|ge8)|adreno(?:\s*\(tm\))?\s*[34]\d\d\b|videocore|vivante|etnaviv|\blima\b/i;

/* GPUs dedicadas o integradas modernas de alto rendimiento: saltan el micro-benchmark (0 ms). */
const HIGH_GPU =
  /\b(?:rtx|gtx\s*(?:9[5-8]0|10[5-8]0|16[356]\d)|titan|quadro\s*rtx|radeon(?:\s*\(tm\))?\s*(?:rx\s*(?:[45]\d0|[56789]\d{3})|pro\s*(?:w|5\d{3}|vega)|(?:680|760|780|880|890)m)|apple\s*(?:m[1-9]|gpu)|arc(?:\s*\(tm\))?\s*[ab]\d{3})\b/i;

const CACHE_KEY = 'byte:fx:v1';
const REF_PIXELS = 1920 * 1080;

const BENCH_SIZE = 256;
const BENCH_PASSES = 80;
const BENCH_FAST_MS = 12;
const BENCH_MEDIAN_MS = 18;
const BENCH_SLOW_MS = 26;

const INITIAL_FRAMES = 60;
const INTERACTION_FRAMES = 45;
const SLOW_FRAME_MS = 28;
const JANK_FRAME_MS = 45;
const STALL_IGNORE_MS = 250;
const INTERACTION_COOLDOWN_MS = 3500;
const MAX_CLEAN_WINDOWS = 5;

interface CachedDecision {
  low: boolean;
  renderer: string;
  ts: number;
}

/** Clasifica una cadena UNMASKED_RENDERER_WEBGL en 'low', 'high' o 'unknown'. */
export function classifyGpuRenderer(renderer: string): GpuTier {
  const clean = renderer.trim();
  if (!clean) return 'unknown';
  if (SOFTWARE_GPU.test(clean) || WEAK_GPU.test(clean)) return 'low';
  if (HIGH_GPU.test(clean)) return 'high';
  return 'unknown';
}

function getStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    const store = (globalThis as Record<string, unknown>)[kind] as Storage | undefined;
    return store && typeof store.getItem === 'function' && typeof store.setItem === 'function' ? store : null;
  } catch {
    return null;
  }
}

function readSessionCache(renderer: string): boolean | null {
  const store = getStorage('sessionStorage');
  if (!store) return null;
  try {
    const raw = store.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedDecision>;
    if (typeof parsed.low !== 'boolean' || typeof parsed.renderer !== 'string') return null;
    if (parsed.renderer !== renderer) return null;
    return parsed.low;
  } catch {
    return null;
  }
}

function writeSessionCache(low: boolean, renderer: string): void {
  const store = getStorage('sessionStorage');
  if (!store) return;
  try {
    const entry: CachedDecision = { low, renderer, ts: Date.now() };
    store.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* modo privado o cuota llena */
  }
}

function clearStorageKey(kind: 'localStorage' | 'sessionStorage'): void {
  const store = getStorage(kind);
  if (!store || typeof store.removeItem !== 'function') return;
  try {
    store.removeItem(CACHE_KEY);
  } catch {
    /* modo privado */
  }
}

function isReloadNavigation(): boolean {
  try {
    const nav = performance?.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (nav && typeof nav.type === 'string') return nav.type === 'reload';
  } catch {
    /* entornos sin PerformanceNavigationTiming */
  }
  return false;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function currentPhysicalPixels(): number {
  if (typeof window === 'undefined') return REF_PIXELS;
  const w = Number(window.innerWidth) || 0;
  const h = Number(window.innerHeight) || 0;
  if (!w || !h) return REF_PIXELS;
  const dpr = Math.min(Math.max(Number(window.devicePixelRatio) || 1, 1), 2);
  return w * h * dpr * dpr;
}

const BENCH_VS =
  'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
const BENCH_FS =
  'precision mediump float;uniform sampler2D t;uniform float u;varying vec2 v;void main(){' +
  'vec2 o=vec2(1./256.);vec2 c=fract(v+vec2(u,u*.73));' +
  'vec4 s=texture2D(t,c)*2.;' +
  's+=texture2D(t,c+vec2(o.x,0.))+texture2D(t,c-vec2(o.x,0.));' +
  's+=texture2D(t,c+vec2(0.,o.y))+texture2D(t,c-vec2(0.,o.y));' +
  's+=texture2D(t,c+o)+texture2D(t,c-o)+texture2D(t,c+vec2(o.x,-o.y))+texture2D(t,c+vec2(-o.x,o.y));' +
  'gl_FragColor=vec4(s.rgb*.1,.35);}';

/** Micro-benchmark de fill-rate y ancho de banda de textura en WebGL.
 *  Devuelve true si la GPU es lenta, false si es capaz, o null si no se pudo ejecutar. */
export function benchmarkGpu(
  gl: WebGLRenderingContext,
  now: () => number = defaultNow,
  physicalPixels: number = currentPhysicalPixels(),
): boolean | null {
  if (
    typeof gl.createShader !== 'function' ||
    typeof gl.createProgram !== 'function' ||
    typeof gl.createBuffer !== 'function' ||
    typeof gl.createTexture !== 'function' ||
    typeof gl.drawArrays !== 'function' ||
    typeof gl.readPixels !== 'function'
  ) {
    return null;
  }

  let vs: WebGLShader | null = null;
  let fs: WebGLShader | null = null;
  let prog: WebGLProgram | null = null;
  let buf: WebGLBuffer | null = null;
  let tex: WebGLTexture | null = null;

  try {
    const canvas = gl.canvas as HTMLCanvasElement | undefined;
    if (canvas) {
      canvas.width = BENCH_SIZE;
      canvas.height = BENCH_SIZE;
    }

    vs = gl.createShader(gl.VERTEX_SHADER);
    fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;
    gl.shaderSource(vs, BENCH_VS);
    gl.compileShader(vs);
    gl.shaderSource(fs, BENCH_FS);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;

    prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    buf = gl.createBuffer();
    if (!buf) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    if (loc < 0) return null;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    tex = gl.createTexture();
    if (!tex) return null;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    const data = new Uint8Array(BENCH_SIZE * BENCH_SIZE * 4);
    let state = 0x9e3779b9;
    for (let i = 0; i < data.length; i += 4) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      data[i] = state & 255;
      data[i + 1] = (state >>> 8) & 255;
      data[i + 2] = (state >>> 16) & 255;
      data[i + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, BENCH_SIZE, BENCH_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

    const uTex = gl.getUniformLocation(prog, 't');
    const uPass = gl.getUniformLocation(prog, 'u');
    if (uTex) gl.uniform1i(uTex, 0);

    gl.viewport(0, 0, BENCH_SIZE, BENCH_SIZE);
    gl.clearColor?.(0, 0, 0, 1);
    gl.clear?.(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const pixel = new Uint8Array(4);
    // Calentamiento fuera de medición: descarta compilación JIT del driver.
    if (uPass) gl.uniform1f(uPass, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    const runBatch = (): number => {
      const start = now();
      for (let i = 0; i < BENCH_PASSES; i++) {
        if (uPass) gl.uniform1f(uPass, i / BENCH_PASSES);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return Math.max(0, now() - start);
    };

    // En pantallas 1440p/4K una iGPU dudosa necesita más margen de fill-rate que en 1080p.
    const loadFactor = Math.min(1.15, Math.max(0.65, REF_PIXELS / Math.max(physicalPixels, 1)));
    const fastLimit = BENCH_FAST_MS * loadFactor;
    const medianLimit = BENCH_MEDIAN_MS * loadFactor;
    const slowLimit = BENCH_SLOW_MS * loadFactor;

    const t1 = runBatch();
    if (t1 >= slowLimit) return true;
    if (t1 <= fastLimit) return false;

    const samples = [t1, runBatch(), runBatch()].sort((a, b) => a - b);
    return samples[1] >= medianLimit;
  } catch {
    return null;
  } finally {
    try {
      if (tex) gl.deleteTexture?.(tex);
      if (buf) gl.deleteBuffer?.(buf);
      if (prog) gl.deleteProgram?.(prog);
      if (vs) gl.deleteShader?.(vs);
      if (fs) gl.deleteShader?.(fs);
    } catch {
      /* ignorar limpieza en contextos perdidos */
    }
  }
}

function readWebglRenderer(gl: WebGLRenderingContext): string {
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '') : '';
}

function loseContext(gl: WebGLRenderingContext): void {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

/** Detecta si el navegador renderiza por software (sin aceleración por hardware). */
export function isSoftwareRenderer(): boolean {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
  try {
    const canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    const strict = (canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) ||
      canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true })) as WebGLRenderingContext | null;
    if (!strict) {
      const fallback = (canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (fallback) {
        loseContext(fallback);
        return true;
      }
      return typeof WebGLRenderingContext !== 'undefined';
    }
    const renderer = readWebglRenderer(strict);
    loseContext(strict);
    return SOFTWARE_GPU.test(renderer);
  } catch {
    return false;
  }
}

interface GpuProbeResult {
  low: boolean;
  renderer: string;
}

/** Evalúa la GPU en dos capas: 1) clasificación por renderer y caché de sesión; 2) micro-benchmark si es ambigua. */
export function probeGpu(skipBenchmark = false): GpuProbeResult {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    const cached = readSessionCache('');
    return { low: cached === true, renderer: '' };
  }

  try {
    const canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') {
      const cached = readSessionCache('');
      return { low: cached === true, renderer: '' };
    }

    const strict = (canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) ||
      canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true })) as WebGLRenderingContext | null;

    if (!strict) {
      const fallback = (canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (fallback) {
        loseContext(fallback);
        return { low: true, renderer: '' };
      }
      if (typeof WebGLRenderingContext !== 'undefined') return { low: true, renderer: '' };
      const cached = readSessionCache('');
      return { low: cached === true, renderer: '' };
    }

    const renderer = readWebglRenderer(strict);
    const tier = classifyGpuRenderer(renderer);

    if (tier === 'low') {
      loseContext(strict);
      return { low: true, renderer };
    }

    // Sesión previa ya degradada al navegar entre páginas (limpiada en F5/reload)
    const sessionCached = readSessionCache(renderer);
    if (sessionCached === true) {
      loseContext(strict);
      return { low: true, renderer };
    }

    if (tier === 'high' || sessionCached === false || skipBenchmark) {
      loseContext(strict);
      return { low: false, renderer };
    }

    const slow = benchmarkGpu(strict);
    loseContext(strict);
    if (slow === true) {
      writeSessionCache(true, renderer);
      return { low: true, renderer };
    }
    if (slow === false) {
      writeSessionCache(false, renderer);
    }
    return { low: false, renderer };
  } catch {
    return { low: false, renderer: '' };
  }
}

export function initEffects(): void {
  const html = document.documentElement;
  const syncVisibility = () => html.classList.toggle('page-hidden', document.hidden);
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('effects-paused', !entry.isIntersecting));
      },
      { rootMargin: '160px' },
    );
    document
      .querySelectorAll('.hero,.trust,#sectores,.cons-sec,#metodo,#nosotros,.cta,.privacy-main')
      .forEach((section) => observer.observe(section));
  }

  let low = false;
  let stopMonitor = () => {};
  let detectedRenderer = '';

  const enableLowEffects = (persistSession = false) => {
    if (low) return;
    low = true;
    stopMonitor();
    if (persistSession) writeSessionCache(true, detectedRenderer);
    html.classList.add('low-effects');
    document.dispatchEvent(new Event('effectschange'));
  };

  // Limpia cualquier clave heredada de localStorage y reevalúa en limpio cuando el usuario recarga (F5).
  clearStorageKey('localStorage');
  if (isReloadNavigation()) clearStorageKey('sessionStorage');

  const isReduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const isTouchOrMobile = Boolean(window.matchMedia?.('(hover: none), (max-width: 760px)').matches);

  const probe = probeGpu(isReduced || isTouchOrMobile);
  detectedRenderer = probe.renderer;
  if (probe.low) {
    enableLowEffects(false);
    return;
  }

  // En móvil/táctil touch.css ya desactiva los efectos pesados de fondo; omitir Capa 3 evita falsos
  // positivos por pantallas LTPO/30Hz, modo ahorro o decodificación de video del easter egg que congelan el sol.
  if (isReduced || isTouchOrMobile) return;

  const isAbyssVisible = () => Boolean(document.querySelector?.('.abyss.visible'));

  /* Capa 3: monitor continuo de fluidez (arranque + ventanas bajo scroll/puntero + LoAF). */
  let rafId = 0;
  let timerId = 0;
  let sampling = false;
  let targetFrames = INITIAL_FRAMES;
  let previous = 0;
  let validFrames = 0;
  let slowFrames = 0;
  let jankFrames = 0;
  let totalMs = 0;
  let badWindows = 0;
  let cleanWindows = 0;
  let lastWindowEnd = 0;
  let lastVisibleAt = defaultNow();
  let pointerSampled = false;
  let listenersArmed = false;
  let loafObserver: PerformanceObserver | null = null;
  const loafStamps: number[] = [];

  const resetWindow = () => {
    previous = 0;
    validFrames = 0;
    slowFrames = 0;
    jankFrames = 0;
    totalMs = 0;
  };

  const onVisibilityChange = () => {
    if (!document.hidden) lastVisibleAt = defaultNow();
  };

  const triggerInteractionSample = () => {
    if (low || sampling || document.hidden || isAbyssVisible()) return;
    if (defaultNow() - lastWindowEnd < INTERACTION_COOLDOWN_MS) return;
    beginWindow(INTERACTION_FRAMES);
  };

  const onScroll = () => {
    triggerInteractionSample();
  };

  const onPointerMove = (ev: Event) => {
    if ((ev as PointerEvent)?.pointerType === 'touch') return;
    if (pointerSampled || low || sampling || document.hidden) return;
    if (defaultNow() - lastWindowEnd < INTERACTION_COOLDOWN_MS) return;
    pointerSampled = true;
    window.removeEventListener?.('pointermove', onPointerMove);
    beginWindow(INTERACTION_FRAMES);
  };

  const armInteractionListeners = () => {
    if (low || listenersArmed) return;
    listenersArmed = true;
    window.addEventListener?.('scroll', onScroll, { passive: true });
    if (!isTouchOrMobile && !pointerSampled) {
      window.addEventListener?.('pointermove', onPointerMove, { passive: true });
    }
  };

  const resume = () => {
    if (low || sampling || document.hidden) return;
    sampling = true;
    rafId = requestAnimationFrame(sample);
  };

  const start = () => {
    if (low) return;
    timerId = window.setTimeout(() => {
      timerId = 0;
      beginWindow(INITIAL_FRAMES);
    }, 2000);
  };

  const cleanupMonitor = () => {
    sampling = false;
    listenersArmed = false;
    if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    rafId = 0;
    if (timerId && typeof window.clearTimeout === 'function') window.clearTimeout(timerId);
    timerId = 0;
    window.removeEventListener?.('scroll', onScroll);
    window.removeEventListener?.('pointermove', onPointerMove);
    window.removeEventListener?.('load', start);
    document.removeEventListener?.('visibilitychange', onVisibilityChange);
    document.removeEventListener?.('visibilitychange', resume);
    loafObserver?.disconnect();
    loafObserver = null;
  };
  stopMonitor = cleanupMonitor;

  const evaluateWindow = () => {
    sampling = false;
    lastWindowEnd = defaultNow();
    if (!validFrames) return;

    const slowRatio = slowFrames / validFrames;
    const jankRatio = jankFrames / validFrames;
    const avgDt = totalMs / validFrames;

    const clearlyBad = slowRatio > 0.42 || avgDt > 34 || jankRatio > 0.2;
    const moderatelyBad = slowRatio > 0.25 || jankFrames >= 5;

    if (clearlyBad) {
      enableLowEffects(true);
      return;
    }

    if (moderatelyBad) {
      badWindows++;
      if (badWindows >= 2) {
        enableLowEffects(true);
        return;
      }
    } else if (slowFrames === 0 && avgDt < 21) {
      cleanWindows++;
      if (cleanWindows >= MAX_CLEAN_WINDOWS) {
        cleanupMonitor();
        return;
      }
    }

    armInteractionListeners();
  };

  const sample = (now: number) => {
    rafId = 0;
    if (low) return;
    // Una pestaña en segundo plano o el easter egg de gatos activo no indican que el equipo sea lento.
    if (document.hidden) {
      sampling = false;
      resetWindow();
      document.addEventListener('visibilitychange', resume, { once: true });
      return;
    }
    if (isAbyssVisible()) {
      sampling = false;
      resetWindow();
      lastWindowEnd = defaultNow();
      armInteractionListeners();
      return;
    }
    if (previous) {
      const dt = now - previous;
      if (dt > 0 && dt <= STALL_IGNORE_MS) {
        validFrames++;
        totalMs += dt;
        if (dt > SLOW_FRAME_MS) slowFrames++;
        if (dt > JANK_FRAME_MS) jankFrames++;
      }
    }
    previous = now;
    if (validFrames < targetFrames) {
      rafId = requestAnimationFrame(sample);
    } else {
      evaluateWindow();
    }
  };

  const beginWindow = (framesCount: number) => {
    if (low || sampling) return;
    targetFrames = framesCount;
    resetWindow();
    sampling = true;
    rafId = requestAnimationFrame(sample);
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  // Observador pasivo de Long Animation Frames (Chromium moderno): atrapa bloqueos de pintura/composición.
  try {
    const PO = (globalThis as Record<string, unknown>).PerformanceObserver as typeof PerformanceObserver | undefined;
    if (PO && Array.isArray(PO.supportedEntryTypes) && PO.supportedEntryTypes.includes('long-animation-frame')) {
      loafObserver = new PO((list) => {
        if (low || document.hidden || isAbyssVisible()) return;
        const now = defaultNow();
        if (now - lastVisibleAt < 1000) return;
        for (const entry of list.getEntries()) {
          if (entry.duration >= 70) loafStamps.push(now);
        }
        while (loafStamps.length && now - loafStamps[0] > 5000) loafStamps.shift();
        if (loafStamps.length >= 5) enableLowEffects(true);
      });
      loafObserver.observe({ type: 'long-animation-frame', buffered: false });
    }
  } catch {
    loafObserver = null;
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener?.('load', start, { once: true });
}
