import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initEffects, isSoftwareRenderer } from '../src/scripts/effects.ts';

function environment(t, { reduced = false, webgl = null } = {}) {
  const originals = Object.fromEntries(
    ['document', 'window', 'requestAnimationFrame', 'WebGLRenderingContext'].map((key) => [key, globalThis[key]]),
  );
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const classes = new Set();
  const listeners = new Map();
  const queue = [];
  let changes = 0;
  let lost = 0;
  if (webgl) globalThis.WebGLRenderingContext = function WebGLRenderingContext() {};
  globalThis.document = {
    hidden: false,
    readyState: 'complete',
    documentElement: { classList: {
      add: (name) => classes.add(name),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
    } },
    querySelectorAll: () => [],
    addEventListener: (name, fn, options) => {
      listeners.set(name, [...(listeners.get(name) || []), { fn, once: options?.once }]);
    },
    dispatchEvent: () => changes++,
    ...(webgl ? {
      createElement: () => ({
        getContext: (_name, opts) => {
          const mode = opts?.failIfMajorPerformanceCaveat ? webgl.strict : webgl.fallback;
          if (!mode) return null;
          return {
            getExtension: (ext) => {
              if (ext === 'WEBGL_lose_context') return { loseContext: () => lost++ };
              if (ext === 'WEBGL_debug_renderer_info' && mode.renderer) return { UNMASKED_RENDERER_WEBGL: 0x9246 };
              return null;
            },
            getParameter: () => mode.renderer || '',
          };
        },
      }),
    } : {}),
  };
  globalThis.requestAnimationFrame = (fn) => queue.push(fn);
  globalThis.window = {
    matchMedia: () => ({ matches: reduced }),
    setTimeout: (fn) => fn(),
  };
  return {
    classes, queue,
    get changes() { return changes; },
    get lost() { return lost; },
    run(frameTime) {
      let now = 1;
      for (let i = 0; queue.length && i < 120; i++) {
        queue.shift()(now);
        now += frameTime;
      }
    },
    visibility(hidden) {
      document.hidden = hidden;
      const current = listeners.get('visibilitychange') || [];
      listeners.set('visibilitychange', current.filter((item) => !item.once));
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

test('no activa low-effects de entrada cuando hay GPU por hardware', (t) => {
  const env = environment(t, { webgl: { strict: { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)' } } });
  assert.equal(isSoftwareRenderer(), false);
  initEffects();
  assert.equal(env.classes.has('low-effects'), false);
  env.run(1000 / 60);
  assert.equal(env.classes.has('low-effects'), false);
});
