import { test } from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkGpu, classifyGpuRenderer, initEffects, isSoftwareRenderer } from '../src/scripts/effects.ts';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      data.set(k, String(v));
    },
    removeItem: (k) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  };
}

function createMockGl({ renderer = '', batchMs = null, onDraw = null } = {}) {
  let lost = 0;
  let drawCalls = 0;
  let readCalls = 0;
  const gl = {
    canvas: { width: 0, height: 0 },
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    REPEAT: 0x2901,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    TRIANGLE_STRIP: 0x0005,
    getExtension: (ext) => {
      if (ext === 'WEBGL_lose_context') return { loseContext: () => lost++ };
      if (ext === 'WEBGL_debug_renderer_info' && renderer) return { UNMASKED_RENDERER_WEBGL: 0x9246 };
      return null;
    },
    getParameter: () => renderer || '',
  };

  if (batchMs !== null) {
    Object.assign(gl, {
      createShader: () => ({}),
      shaderSource: () => {},
      compileShader: () => {},
      getShaderParameter: () => true,
      createProgram: () => ({}),
      attachShader: () => {},
      linkProgram: () => {},
      getProgramParameter: () => true,
      useProgram: () => {},
      createBuffer: () => ({}),
      bindBuffer: () => {},
      bufferData: () => {},
      getAttribLocation: () => 0,
      enableVertexAttribArray: () => {},
      vertexAttribPointer: () => {},
      createTexture: () => ({}),
      activeTexture: () => {},
      bindTexture: () => {},
      texParameteri: () => {},
      texImage2D: () => {},
      getUniformLocation: () => ({}),
      uniform1i: () => {},
      uniform1f: () => {},
      viewport: () => {},
      enable: () => {},
      blendFunc: () => {},
      drawArrays: () => {
        drawCalls++;
        onDraw?.();
      },
      readPixels: () => {
        readCalls++;
        batchMs.onRead?.(readCalls);
      },
      deleteTexture: () => {},
      deleteBuffer: () => {},
      deleteProgram: () => {},
      deleteShader: () => {},
    });
  }

  return {
    gl,
    get lost() {
      return lost;
    },
    get drawCalls() {
      return drawCalls;
    },
    get readCalls() {
      return readCalls;
    },
  };
}

function environment(
  t,
  { reduced = false, mobile = false, navType = 'navigate', webgl = null, local = null, session = null } = {},
) {
  const keys = [
    'document',
    'window',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'WebGLRenderingContext',
    'PerformanceObserver',
    'localStorage',
    'sessionStorage',
    'performance',
  ];
  const originals = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => {
    for (const [key, desc] of originals) {
      if (!desc) delete globalThis[key];
      else Object.defineProperty(globalThis, key, desc);
    }
  });

  const classes = new Set();
  const docListeners = new Map();
  const winListeners = new Map();
  const queue = [];
  let changes = 0;
  let lost = 0;
  let benchDraws = 0;
  let clock = 1000;
  let loafCallback = null;
  let loafDisconnected = false;

  const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  setGlobal('localStorage', local || memoryStorage());
  setGlobal('sessionStorage', session || memoryStorage());
  setGlobal('performance', {
    now: () => clock,
    getEntriesByType: (type) => (type === 'navigation' ? [{ type: navType }] : []),
  });
  class MockPerformanceObserver {
    static supportedEntryTypes = ['long-animation-frame'];
    constructor(cb) {
      loafCallback = cb;
    }
    observe() {}
    disconnect() {
      loafDisconnected = true;
    }
  }
  setGlobal('PerformanceObserver', MockPerformanceObserver);

  if (webgl) globalThis.WebGLRenderingContext = function WebGLRenderingContext() {};
  else delete globalThis.WebGLRenderingContext;

  const makeCtx = (mode) => {
    if (!mode) return null;
    let batchIdx = 0;
    const batches = Array.isArray(mode.benchMs) ? mode.benchMs : null;
    const mock = createMockGl({
      renderer: mode.renderer || '',
      batchMs: batches
        ? {
            onRead: (n) => {
              // n === 1 es el draw de calentamiento; a partir de n >= 2 son lotes medidos.
              if (n >= 2) {
                const dur = batches[Math.min(batchIdx, batches.length - 1)];
                batchIdx++;
                clock += dur;
              }
            },
          }
        : null,
      onDraw: () => {
        benchDraws++;
      },
    });
    const origGetExt = mock.gl.getExtension;
    mock.gl.getExtension = (ext) => {
      if (ext === 'WEBGL_lose_context') return { loseContext: () => lost++ };
      return origGetExt(ext);
    };
    return mock.gl;
  };

  globalThis.document = {
    hidden: false,
    readyState: 'complete',
    documentElement: {
      classList: {
        add: (name) => classes.add(name),
        toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      },
    },
    querySelectorAll: () => [],
    addEventListener: (name, fn, options) => {
      docListeners.set(name, [...(docListeners.get(name) || []), { fn, once: options?.once }]);
    },
    removeEventListener: (name, fn) => {
      docListeners.set(
        name,
        (docListeners.get(name) || []).filter((item) => item.fn !== fn),
      );
    },
    dispatchEvent: () => changes++,
    ...(webgl
      ? {
          createElement: () => ({
            getContext: (_name, opts) => {
              const mode = opts?.failIfMajorPerformanceCaveat ? webgl.strict : webgl.fallback;
              return makeCtx(mode);
            },
          }),
        }
      : {}),
  };

  globalThis.requestAnimationFrame = (fn) => {
    queue.push(fn);
    return queue.length;
  };
  globalThis.cancelAnimationFrame = () => {
    queue.length = 0;
  };

  globalThis.window = {
    innerWidth: mobile ? 390 : 1920,
    innerHeight: mobile ? 844 : 1080,
    devicePixelRatio: 1,
    matchMedia: (q = '') => ({
      matches: q.includes('reduced-motion') ? reduced : q.includes('hover: none') ? mobile : false,
    }),
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
    addEventListener: (name, fn) => {
      winListeners.set(name, [...(winListeners.get(name) || []), fn]);
    },
    removeEventListener: (name, fn) => {
      winListeners.set(
        name,
        (winListeners.get(name) || []).filter((item) => item !== fn),
      );
    },
  };

  return {
    classes,
    queue,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    get changes() {
      return changes;
    },
    get lost() {
      return lost;
    },
    get benchDraws() {
      return benchDraws;
    },
    get loafDisconnected() {
      return loafDisconnected;
    },
    emitLoaf(durations) {
      if (!loafCallback || loafDisconnected) return;
      loafCallback({ getEntries: () => durations.map((duration) => ({ duration })) });
    },
    advance(ms) {
      clock += ms;
    },
    run(frameTime, maxSteps = 120) {
      for (let i = 0; queue.length && i < maxSteps; i++) {
        const fn = queue.shift();
        fn(clock);
        clock += frameTime;
      }
    },
    runSequence(deltas) {
      for (const dt of deltas) {
        if (!queue.length) break;
        const fn = queue.shift();
        fn(clock);
        clock += dt;
      }
    },
    scroll() {
      const current = [...(winListeners.get('scroll') || [])];
      current.forEach((fn) => fn());
    },
    pointermove(pointerType = 'mouse') {
      const current = [...(winListeners.get('pointermove') || [])];
      current.forEach((fn) => fn({ pointerType }));
    },
    listenerCount(name) {
      return (winListeners.get(name) || []).length;
    },
    visibility(hidden) {
      document.hidden = hidden;
      const current = docListeners.get('visibilitychange') || [];
      docListeners.set(
        'visibilitychange',
        current.filter((item) => !item.once),
      );
      current.forEach(({ fn }) => fn());
    },
  };
}

test('mantiene los efectos a 60 fps y termina de medir', (t) => {
  const env = environment(t);
  initEffects();
  env.run(1000 / 60);
  assert.equal(env.classes.has('low-effects'), false);
  assert.equal(env.queue.length, 0);
});

test('reduce efectos cuando la caída de fluidez es sostenida', (t) => {
  const env = environment(t);
  initEffects();
  env.run(50);
  assert.equal(env.classes.has('low-effects'), true);
  assert.equal(env.changes, 1);
  assert.equal(env.queue.length, 0);
});

test('una pestaña oculta no activa el modo reducido y reanuda una muestra limpia', (t) => {
  const env = environment(t);
  initEffects();
  env.visibility(true);
  env.run(1000);
  assert.equal(env.classes.has('page-hidden'), true);
  assert.equal(env.classes.has('low-effects'), false);
  assert.equal(env.queue.length, 0);
  env.visibility(false);
  env.run(1000 / 60);
  assert.equal(env.classes.has('page-hidden'), false);
  assert.equal(env.classes.has('low-effects'), false);
});

test('respeta movimiento reducido sin iniciar mediciones', (t) => {
  const env = environment(t, { reduced: true });
  initEffects();
  assert.equal(env.queue.length, 0);
});

test('activa low-effects de inmediato sin aceleración por hardware (failIfMajorPerformanceCaveat)', (t) => {
  const env = environment(t, { webgl: { strict: null, fallback: { renderer: 'Google SwiftShader' } } });
  initEffects();
  assert.equal(env.classes.has('low-effects'), true);
  assert.equal(env.changes, 1);
  assert.equal(env.queue.length, 0);
  assert.equal(env.lost, 1);
});

test('activa low-effects si el renderer WebGL es por software (SwiftShader / llvmpipe)', (t) => {
  const env = environment(t, { webgl: { strict: { renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' } } });
  assert.equal(isSoftwareRenderer(), true);
  initEffects();
  assert.equal(env.classes.has('low-effects'), true);
  assert.equal(env.queue.length, 0);
});

test('no activa low-effects de entrada cuando hay GPU por hardware potente y salta el benchmark', (t) => {
  const env = environment(t, {
    webgl: { strict: { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)', benchMs: [40] } },
  });
  assert.equal(isSoftwareRenderer(), false);
  initEffects();
  assert.equal(env.classes.has('low-effects'), false);
  assert.equal(env.benchDraws, 0);
  env.run(1000 / 60);
  assert.equal(env.classes.has('low-effects'), false);
});

test('classifyGpuRenderer distingue integradas débiles, dedicadas potentes y cadenas ambiguas', () => {
  const lowCases = [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))',
    'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11)',
    'ANGLE (Intel, Intel(R) HD Graphics Direct3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 600 Direct3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11)',
    'ANGLE (AMD, AMD Radeon(TM) R3 Graphics Direct3D11)',
    'ANGLE (AMD, AMD Radeon(TM) R5 Graphics Direct3D11)',
    'ANGLE (AMD, AMD Radeon (TM) R5 M330 Direct3D11)',
    'ANGLE (AMD, AMD Radeon(TM) Vega 3 Graphics Direct3D11)',
    'ANGLE (AMD, AMD Radeon HD 7480D Direct3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GT 710 Direct3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce 920M Direct3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce MX130 Direct3D11)',
    'VMware SVGA 3D',
  ];
  for (const r of lowCases) assert.equal(classifyGpuRenderer(r), 'low', `esperaba low para ${r}`);

  const highCases = [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11)',
    'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11)',
    'ANGLE (AMD, AMD Radeon (TM) RX 580 Series Direct3D11)',
    'ANGLE (AMD, AMD Radeon(TM) 780M Graphics Direct3D11)',
    'Apple GPU',
    'Apple M2 Pro',
    'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)',
    'ANGLE (Intel, Intel(R) Arc (TM) B580 Graphics Direct3D11)',
  ];
  for (const r of highCases) assert.equal(classifyGpuRenderer(r), 'high', `esperaba high para ${r}`);

  const unknownCases = [
    '',
    'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11)',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)',
    'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11)',
    'Mozilla',
  ];
  for (const r of unknownCases) assert.equal(classifyGpuRenderer(r), 'unknown', `esperaba unknown para ${r}`);
});

test('capa 1: activa low-effects de inmediato en APU/iGPU débil conocida sin esperar FPS ni benchmark', (t) => {
  const env = environment(t, {
    webgl: { strict: { renderer: 'ANGLE (AMD, AMD Radeon(TM) Vega 3 Graphics Direct3D11)', benchMs: [2] } },
  });
  initEffects();
  assert.equal(env.classes.has('low-effects'), true);
  assert.equal(env.benchDraws, 0);
  assert.equal(env.queue.length, 0);
  assert.equal(env.lost, 1);
});

test('capa 2: micro-benchmark detecta APU lenta con nombre genérico, cachea en sesión y reevalúa al recargar (F5)', (t) => {
  const local = memoryStorage();
  const session = memoryStorage();
  const renderer = 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)';

  const env1 = environment(t, {
    local,
    session,
    webgl: { strict: { renderer, benchMs: [32] } },
  });
  initEffects();
  assert.equal(env1.classes.has('low-effects'), true);
  assert.ok(env1.benchDraws > 0);
  assert.equal(env1.queue.length, 0);
  // No escribe en localStorage para no dejar bloqueada la PC entre visitas.
  assert.equal(local.getItem('byte:fx:v1'), null);

  // Al navegar a otra página dentro de la misma sesión, reutiliza sessionStorage sin repetir benchmark.
  const envNav = environment(t, {
    local,
    session,
    navType: 'navigate',
    webgl: { strict: { renderer, benchMs: [2] } },
  });
  initEffects();
  assert.equal(envNav.classes.has('low-effects'), true);
  assert.equal(envNav.benchDraws, 0);

  // Al recargar manualmente (F5), limpia sessionStorage y vuelve a evaluar en limpio.
  const envReload = environment(t, {
    local,
    session,
    navType: 'reload',
    webgl: { strict: { renderer, benchMs: [4] } },
  });
  initEffects();
  assert.equal(envReload.classes.has('low-effects'), false);
  assert.ok(envReload.benchDraws > 0);
});

test('capa 2: micro-benchmark permite modo completo cuando una GPU ambigua rinde rápido', (t) => {
  const env = environment(t, {
    webgl: { strict: { renderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11)', benchMs: [4] } },
  });
  initEffects();
  assert.equal(env.classes.has('low-effects'), false);
  assert.ok(env.benchDraws > 0);
  env.run(1000 / 60);
  assert.equal(env.classes.has('low-effects'), false);
});

test('capa 2: en zona intermedia usa la mediana de 3 lotes para evitar falsos positivos', () => {
  let now = 0;
  const times = [15, 19, 20];
  let idx = 0;
  const slowMock = createMockGl({
    batchMs: {
      onRead: (n) => {
        if (n >= 2) now += times[idx++];
      },
    },
  });
  assert.equal(benchmarkGpu(slowMock.gl, () => now, 1920 * 1080), true);
  assert.equal(slowMock.readCalls, 4); // 1 calentamiento + 3 lotes

  now = 0;
  idx = 0;
  const okTimes = [15, 14, 16];
  const okMock = createMockGl({
    batchMs: {
      onRead: (n) => {
        if (n >= 2) now += okTimes[idx++];
      },
    },
  });
  assert.equal(benchmarkGpu(okMock.gl, () => now, 1920 * 1080), false);
  assert.equal(okMock.readCalls, 4);
});

test('capa 2 y 3: en dispositivos táctiles/móviles omite benchmark y monitor continuo para no congelar el sol por falsos positivos', (t) => {
  const env = environment(t, {
    mobile: true,
    webgl: { strict: { renderer: 'ANGLE (ARM, Mali-G68)', benchMs: [40] } },
  });
  initEffects();
  assert.equal(env.benchDraws, 0);
  assert.equal(env.queue.length, 0);
  assert.equal(env.listenerCount('scroll'), 0);
  assert.equal(env.classes.has('low-effects'), false);

  // Aun así, Capa 1 sigue activando low-effects si la GPU móvil es débil conocida
  const weakEnv = environment(t, {
    mobile: true,
    webgl: { strict: { renderer: 'ANGLE (ARM, Mali-G52)' } },
  });
  initEffects();
  assert.equal(weakEnv.classes.has('low-effects'), true);
});

test('capa 3: ignora picos de FPS y LoAF mientras el easter egg .abyss está visible', (t) => {
  const env = environment(t);
  let abyssOpen = true;
  document.querySelector = (sel) => (sel === '.abyss.visible' && abyssOpen ? {} : null);

  initEffects();
  env.advance(1500);
  env.emitLoaf([95, 110, 88, 92, 120]);
  env.run(50);
  assert.equal(env.classes.has('low-effects'), false);

  // Al cerrar el easter egg, el monitor vuelve a operar con normalidad
  abyssOpen = false;
  env.advance(4000);
  env.scroll();
  env.run(50);
  assert.equal(env.classes.has('low-effects'), true);
});

test('capa 3: detecta caídas de FPS que solo aparecen al hacer scroll tras pasar el arranque en reposo', (t) => {
  const session = memoryStorage();
  const renderer = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)';
  const env = environment(t, {
    session,
    webgl: { strict: { renderer } },
  });
  initEffects();

  // Arranque en reposo fluido a 60 fps
  env.run(1000 / 60);
  assert.equal(env.classes.has('low-effects'), false);

  // Tras enfriamiento, el usuario hace scroll y la GPU cae a ~26 fps (38 ms/cuadro)
  env.advance(4000);
  env.scroll();
  assert.ok(env.queue.length > 0);
  env.run(38);
  assert.equal(env.classes.has('low-effects'), true);

  // Al navegar a otra página de la misma sesión arranca directamente en low-effects
  const envNav = environment(t, {
    session,
    navType: 'navigate',
    webgl: { strict: { renderer } },
  });
  initEffects();
  assert.equal(envNav.classes.has('low-effects'), true);
  assert.equal(envNav.queue.length, 0);

  // Al recargar (F5, p. ej. tras desactivar throttling), limpia la sesión y vuelve a modo completo
  const envReload = environment(t, {
    session,
    navType: 'reload',
    webgl: { strict: { renderer } },
  });
  initEffects();
  assert.equal(envReload.classes.has('low-effects'), false);
  envReload.run(1000 / 60);
  assert.equal(envReload.classes.has('low-effects'), false);
});

test('capa 3: un bloqueo aislado > 250 ms (cambio de ventana) no dispara low-effects', (t) => {
  const env = environment(t);
  initEffects();
  const deltas = [500, ...Array.from({ length: 62 }, () => 16.6)];
  env.runSequence(deltas);
  assert.equal(env.classes.has('low-effects'), false);
});

test('capa 2: la caché de sesión se invalida si cambia el renderer WebGL y limpia claves heredadas de localStorage', (t) => {
  const local = memoryStorage();
  const session = memoryStorage();
  local.setItem('byte:fx:v1', JSON.stringify({ low: true, renderer: 'old', ts: Date.now() }));

  const env1 = environment(t, {
    local,
    session,
    webgl: { strict: { renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)', benchMs: [32] } },
  });
  initEffects();
  assert.equal(env1.classes.has('low-effects'), true);
  assert.equal(local.getItem('byte:fx:v1'), null);

  // Al cambiar de GPU a otra ambigua más rápida, ignora la caché vieja y vuelve a medir.
  const env2 = environment(t, {
    local,
    session,
    webgl: { strict: { renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', benchMs: [4] } },
  });
  initEffects();
  assert.equal(env2.classes.has('low-effects'), false);
  assert.ok(env2.benchDraws > 0);
});

test('capa 3: dos ventanas moderadamente lentas activan low-effects', (t) => {
  const env = environment(t);
  initEffects();

  // Ventana 1: ~30% de cuadros a 31 ms (~32 fps) -> moderadamente lenta (1/2)
  const modWindow = (n) =>
    Array.from({ length: n + 2 }, (_, i) => (i % 3 === 0 ? 31 : 16.6));
  env.runSequence(modWindow(60));
  assert.equal(env.classes.has('low-effects'), false);

  // Ventana 2 tras scroll: de nuevo ~30% lentos -> activa low-effects (2/2)
  env.advance(4000);
  env.scroll();
  env.runSequence(modWindow(45));
  assert.equal(env.classes.has('low-effects'), true);
});

test('capa 3: ráfaga de Long Animation Frames (>= 70 ms) activa low-effects y desconecta el observer', (t) => {
  const env = environment(t);
  initEffects();
  env.advance(1500);
  env.emitLoaf([85, 92, 74, 80, 110]);
  assert.equal(env.classes.has('low-effects'), true);
  assert.equal(env.loafDisconnected, true);
});

test('capa 3: tras 5 ventanas fluidas se apaga definitivamente con 0 listeners y un toque táctil no consume pointermove', (t) => {
  const env = environment(t);
  initEffects();

  // Ventana 1 (inicial)
  env.run(1000 / 60);
  assert.equal(env.listenerCount('scroll'), 1);
  assert.equal(env.listenerCount('pointermove'), 1);

  // Un evento touch en portátil táctil no consume la muestra de mouse
  env.advance(4000);
  env.pointermove('touch');
  assert.equal(env.queue.length, 0);
  assert.equal(env.listenerCount('pointermove'), 1);

  // Ventana 2 (primer movimiento de mouse -> quita listener pointermove)
  env.pointermove('mouse');
  assert.equal(env.listenerCount('pointermove'), 0);
  env.run(1000 / 60);

  // Ventanas 3, 4 y 5 (scroll fluido -> tras la 5.ª limpia se apaga por completo)
  for (let i = 0; i < 3; i++) {
    env.advance(4000);
    env.scroll();
    env.run(1000 / 60);
  }

  assert.equal(env.classes.has('low-effects'), false);
  assert.equal(env.listenerCount('scroll'), 0);
  assert.equal(env.listenerCount('pointermove'), 0);
  assert.equal(env.loafDisconnected, true);
});
