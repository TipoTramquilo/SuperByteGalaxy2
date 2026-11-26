import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABYSS_DEADZONE,
  ABYSS_THRESHOLD,
  CAT_SOURCES,
  EXPLOSION_AUTOCLOSE_DELAY_MS,
  EXPLOSION_DURATION_MS,
  EXPLOSION_FX_SRC,
  EXPLOSION_HIDE_CAT_MS,
  EXPLOSION_SFX_SRC,
  PET_DURATION_MS,
  PET_FX_SRC,
  PET_HOLD_MS,
  PET_HOLD_RELEASE_MS,
  computeAbyssProgress,
  createCatPicker,
  initAbyss,
  normalizeWheelDelta,
  pickRandomCat,
  rubberBandLift,
  stepSpring,
} from '../src/scripts/abyss.ts';

function makeClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    contains: (name) => set.has(name),
    toggle: (name, on) => (on ? set.add(name) : set.delete(name)),
  };
}

function makeEl(tag) {
  const attrs = new Map();
  const children = [];
  const listeners = new Map();
  let reads = 0;
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    classList: makeClassList(),
    style: {},
    children,
    textContent: '',
    src: '',
    played: 0,
    paused: 0,
    loaded: 0,
    get offsetHeight() {
      reads++;
      return 140;
    },
    get heightReads() {
      return reads;
    },
    setAttribute(k, v) {
      attrs.set(k, String(v));
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    removeAttribute(k) {
      attrs.delete(k);
    },
    hasAttribute(k) {
      return attrs.has(k);
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    append(...nodes) {
      children.push(...nodes);
    },
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) || []), fn]);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn));
    },
    click() {
      for (const fn of [...(listeners.get('click') || [])]) fn();
    },
    emit(type, ev = {}) {
      for (const fn of [...(listeners.get(type) || [])]) fn(ev);
    },
    play() {
      el.played++;
      return Promise.resolve();
    },
    pause() {
      el.paused++;
    },
    load() {
      el.loaded++;
    },
    remove() {
      el.removed = true;
    },
  };
  return el;
}

function setupAbyssEnv(t, { scrollY = 2200, scrollHeight = 3000, innerHeight = 800, rng } = {}) {
  const originals = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    DateNow: Date.now,
  };
  t.after(() => {
    if (originals.window === undefined) delete globalThis.window;
    else globalThis.window = originals.window;
    if (originals.document === undefined) delete globalThis.document;
    else globalThis.document = originals.document;
    if (originals.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originals.requestAnimationFrame;
    if (originals.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = originals.cancelAnimationFrame;
    Date.now = originals.DateNow;
  });

  let now = 10_000;
  let frameClock = 0;
  Date.now = () => now;

  const winListeners = new Map();
  const docListeners = new Map();
  const rafQueue = new Map();
  let nextRafId = 1;

  const main = makeEl('main');
  const foot = makeEl('footer');
  const pg = {
    querySelector: (sel) => (sel === '.foot' ? foot : sel === 'main' ? main : null),
  };
  const bodyChildren = [];
  const state = { scrollY, scrollHeight, innerHeight, hidden: false };

  globalThis.requestAnimationFrame = (fn) => {
    const id = nextRafId++;
    rafQueue.set(id, fn);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    rafQueue.delete(id);
  };

  globalThis.document = {
    get hidden() {
      return state.hidden;
    },
    documentElement: {
      get scrollHeight() {
        return state.scrollHeight;
      },
    },
    scrollingElement: {
      get scrollHeight() {
        return state.scrollHeight;
      },
    },
    body: {
      append(...nodes) {
        bodyChildren.push(...nodes);
      },
    },
    createElement: (tag) => makeEl(tag),
    querySelector: (sel) => (sel === '.pg:not(.privacy-page)' ? pg : null),
    addEventListener(type, fn) {
      docListeners.set(type, [...(docListeners.get(type) || []), fn]);
    },
    removeEventListener(type, fn) {
      docListeners.set(type, (docListeners.get(type) || []).filter((f) => f !== fn));
    },
  };

  globalThis.window = {
    get scrollY() {
      return state.scrollY;
    },
    get innerHeight() {
      return state.innerHeight;
    },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, fn) {
      winListeners.set(type, [...(winListeners.get(type) || []), fn]);
    },
    removeEventListener(type, fn) {
      winListeners.set(type, (winListeners.get(type) || []).filter((f) => f !== fn));
    },
  };

  const ctrl = initAbyss({ rng });
  const [panel] = bodyChildren;
  const inner = panel.children[0];
  const video = inner.children[0];
  const sad = inner.children[1];
  const boom = inner.children[2];
  const pet = inner.children[3];

  const emit = (type, ev) => {
    let prevented = false;
    let stopped = false;
    const payload = {
      cancelable: true,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
      stopImmediatePropagation() {
        stopped = true;
      },
      ...ev,
    };
    for (const fn of [...(winListeners.get(type) || [])]) fn(payload);
    return { prevented, stopped };
  };

  const emitDoc = (type) => {
    for (const fn of [...(docListeners.get(type) || [])]) fn();
  };

  const runFrames = (count, stepMs = 16) => {
    const lifts = [];
    let maxLift = 0;
    for (let i = 0; i < count; i++) {
      if (!rafQueue.size) break;
      const entries = [...rafQueue.entries()];
      rafQueue.clear();
      frameClock += stepMs;
      now += stepMs;
      for (const [, fn] of entries) fn(frameClock);
      const m = main.style.transform?.match(/-([\d.]+)px/);
      const val = m ? Number(m[1]) : 0;
      lifts.push(val);
      if (val > maxLift) maxLift = val;
    }
    return { maxLift, lifts };
  };

  return {
    ctrl,
    bodyChildren,
    main,
    foot,
    panel,
    inner,
    video,
    sad,
    boom,
    pet,
    state,
    emit,
    emitDoc,
    runFrames,
    advance(ms) {
      now += ms;
    },
  };
}

test('helpers puros soportan los 22 gatos sin repetir seguidos y calculan el resorte elástico', () => {
  assert.equal(CAT_SOURCES.length, 22);
  const first = pickRandomCat(CAT_SOURCES, () => 0);
  const second = pickRandomCat(CAT_SOURCES, () => 0, first);
  assert.notEqual(first, second);

  // createCatPicker recorre los 22 sin repetir ninguno hasta completar la vuelta, y no repite en el empalme
  let seed = 42;
  const seededRng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const nextCat = createCatPicker(CAT_SOURCES, seededRng);
  const cycle1 = Array.from({ length: CAT_SOURCES.length }, () => nextCat());
  assert.equal(new Set(cycle1).size, CAT_SOURCES.length);
  const cycle2 = Array.from({ length: CAT_SOURCES.length }, () => nextCat());
  assert.equal(new Set(cycle2).size, CAT_SOURCES.length);
  assert.notEqual(cycle2[0], cycle1[cycle1.length - 1]);

  assert.equal(normalizeWheelDelta(100, 0), 100);
  assert.equal(normalizeWheelDelta(900, 0), 130);
  assert.equal(normalizeWheelDelta(3, 1), 96);
  assert.equal(computeAbyssProgress(0), 0);
  assert.equal(computeAbyssProgress(ABYSS_DEADZONE), 0);
  assert.ok(computeAbyssProgress(ABYSS_DEADZONE + 100) > 0);
  assert.equal(computeAbyssProgress(ABYSS_THRESHOLD), 1);
  assert.equal(rubberBandLift(0, 140), 0);

  let x2 = 120;
  let v2 = 360;
  let peak = 0;
  for (let i = 0; i < 90; i++) {
    [x2, v2] = stepSpring(x2, v2, 140, 20, 1 / 60, 0.56);
    peak = Math.max(peak, x2);
  }
  assert.ok(peak > 144 && peak < 156, `esperaba rebote leve, obtuvo pico ${peak}`);
  assert.ok(Math.abs(x2 - 140) < 0.2);
});

test('rebota al abrir y al cerrar, cachea la altura sin reflows por cuadro y pausa al ocultar pestaña', (t) => {
  const env = setupAbyssEnv(t, { rng: () => 0 });

  for (let i = 0; i < 14; i++) {
    env.emit('wheel', { deltaY: 130, deltaMode: 0 });
    env.runFrames(1);
  }
  const openRun = env.runFrames(90);
  assert.equal(env.panel.classList.contains('open'), true);
  assert.equal(env.video.src, '/img/cat-kungfu.mp4');
  assert.ok(openRun.maxLift > 141.5 && openRun.maxLift <= 158);
  assert.equal(env.main.style.transform, 'translate3d(0, -140.00px, 0)');

  // No re-lee offsetHeight en cada cuadro de rAF (solo al abrir/medir)
  const readsAfterOpen = env.panel.heightReads;
  assert.ok(readsAfterOpen <= 3, `demasiadas lecturas de layout: ${readsAfterOpen}`);

  // Ocultar la pestaña pausa el video y volver la reanuda
  const pausesBefore = env.video.paused;
  const playsBefore = env.video.played;
  env.state.hidden = true;
  env.emitDoc('visibilitychange');
  assert.equal(env.video.paused, pausesBefore + 1);
  env.state.hidden = false;
  env.emitDoc('visibilitychange');
  assert.equal(env.video.played, playsBefore + 1);

  // Cerrar con 1 giro de rueda produce un rebote sutil contra el suelo antes de asentarse en 0
  env.advance(250);
  assert.equal(env.emit('wheel', { deltaY: -40, deltaMode: 0 }).prevented, true);
  const closeRun = env.runFrames(90);
  // Debe bajar cerca de 0, rebotar hacia arriba (~4–10 px) y terminar en 0
  let hitBottom = false;
  let reboundPeak = 0;
  for (const val of closeRun.lifts) {
    if (!hitBottom && val <= 1) hitBottom = true;
    else if (hitBottom && val > reboundPeak) reboundPeak = val;
  }
  assert.ok(reboundPeak > 3 && reboundPeak < 14, `esperaba rebote leve al cerrar, pico=${reboundPeak}`);
  assert.equal(env.main.style.transform, '');
  assert.equal(env.panel.heightReads, readsAfterOpen);

  // Al volver a abrir con el mismo rng=0, no repite el gato anterior
  env.advance(250);
  for (let i = 0; i < 14; i++) {
    env.emit('wheel', { deltaY: 130, deltaMode: 0 });
    env.runFrames(1);
  }
  env.runFrames(90);
  assert.notEqual(env.video.src, '/img/cat-kungfu.mp4');

  env.ctrl.destroy();
});

test('se abre más ágil con ArrowDown en el fondo (~6 toques) y cierra con 1 ArrowUp', (t) => {
  const env = setupAbyssEnv(t, { scrollY: 400, scrollHeight: 3000, innerHeight: 800, rng: () => 0.4 });

  // Lejos del fondo no interfiere con nav.ts
  assert.equal(env.emit('keydown', { key: 'ArrowDown' }).stopped, false);
  assert.equal(env.emit('keydown', { key: 'ArrowUp' }).stopped, false);

  // En el fondo, ~6 toques de ArrowDown bastan para abrirlo
  env.state.scrollY = 2200;
  for (let i = 0; i < 6; i++) {
    const res = env.emit('keydown', { key: 'ArrowDown' });
    assert.equal(res.prevented, true);
    assert.equal(res.stopped, true);
    env.runFrames(1);
  }
  env.runFrames(90);
  assert.equal(env.panel.classList.contains('open'), true);

  // 1 solo toque de ArrowUp cierra la pestaña sin saltar de sección
  env.advance(250);
  assert.equal(env.emit('keydown', { key: 'ArrowUp' }).stopped, true);
  env.runFrames(90);
  env.advance(250);
  assert.equal(env.panel.classList.contains('open'), false);
  assert.equal(env.main.style.transform, '');
  assert.equal(env.emit('keydown', { key: 'ArrowUp' }).stopped, false);

  env.ctrl.destroy();
});

test('al hacer clic en el gato explota con sonido, revela :,( y se reinicia al cerrar', (t) => {
  const origAudio = globalThis.Audio;
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  const origFetch = globalThis.fetch;

  const audioInstances = [];
  const timers = new Map();
  let nextTimerId = 1;

  globalThis.Audio = function MockAudio(src) {
    const inst = {
      src,
      preload: '',
      volume: 1,
      currentTime: 0,
      played: 0,
      paused: 0,
      play() {
        inst.played += 1;
        return Promise.resolve();
      },
      pause() {
        inst.paused += 1;
      },
    };
    audioInstances.push(inst);
    return inst;
  };
  globalThis.setTimeout = (fn, ms) => {
    const id = nextTimerId++;
    timers.set(id, { fn, ms });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };
  globalThis.fetch = undefined;

  t.after(() => {
    globalThis.Audio = origAudio;
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearTimeout = origClearTimeout;
    globalThis.fetch = origFetch;
  });

  const env = setupAbyssEnv(t, { rng: () => 0 });
  assert.equal(env.sad.getAttribute('aria-label'), ':(');
  assert.ok(env.sad.innerHTML.includes('shape-rendering="crispEdges"'));

  // Abrir el easter egg
  for (let i = 0; i < 6; i++) {
    env.emit('keydown', { key: 'ArrowDown' });
    env.runFrames(1);
  }
  env.runFrames(90);
  assert.equal(env.panel.classList.contains('open'), true);

  // Clic en el gato -> dispara explosión y sonido
  env.video.click();
  assert.equal(env.inner.classList.contains('exploding'), true);
  assert.equal(env.boom.src, EXPLOSION_FX_SRC);
  assert.equal(audioInstances.length, 1);
  assert.equal(audioInstances[0].src, EXPLOSION_SFX_SRC);
  assert.equal(audioInstances[0].played, 1);

  // Un segundo clic mientras explota no duplica el efecto
  env.video.click();
  assert.equal(audioInstances[0].played, 1);

  // Ejecutar timer de ocultar gato (200ms) -> pausa video y muestra :,(
  const hideEntry = [...timers.entries()].find(([, v]) => v.ms === EXPLOSION_HIDE_CAT_MS);
  assert.ok(hideEntry);
  timers.delete(hideEntry[0]);
  hideEntry[1].fn();
  assert.equal(env.inner.classList.contains('exploded'), true);
  assert.equal(env.sad.getAttribute('aria-hidden'), 'false');

  // Ejecutar timer de fin de explosión -> limpia overlay, deja :( y programa autocierre a 0.8 s
  const endEntry = [...timers.entries()].find(([, v]) => v.ms === EXPLOSION_DURATION_MS);
  assert.ok(endEntry);
  timers.delete(endEntry[0]);
  endEntry[1].fn();
  assert.equal(env.inner.classList.contains('exploding'), false);
  assert.equal(env.inner.classList.contains('exploded'), true);
  assert.equal(env.boom.src, '');

  // Pasados 0.8 s se cierra sola la sección y se reinicia para el próximo gato sin cortar el audio
  const closeEntry = [...timers.entries()].find(([, v]) => v.ms === EXPLOSION_AUTOCLOSE_DELAY_MS);
  assert.ok(closeEntry);
  timers.delete(closeEntry[0]);
  closeEntry[1].fn();
  env.runFrames(90);
  assert.equal(env.panel.classList.contains('open'), false);
  assert.equal(env.inner.classList.contains('exploded'), false);
  assert.equal(env.sad.getAttribute('aria-hidden'), 'true');
  assert.equal(audioInstances[0].paused, 0);

  env.ctrl.destroy();
  assert.equal(audioInstances[0].paused, 1);
});

test('el evento abyss:pet y mantener presionado acarician al gato sin explotarlo al soltar', (t) => {
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  const origAudio = globalThis.Audio;
  const origFetch = globalThis.fetch;

  const timers = new Map();
  let nextTimerId = 1;
  globalThis.setTimeout = (fn, ms) => {
    const id = nextTimerId++;
    timers.set(id, { fn, ms });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };
  globalThis.Audio = undefined;
  globalThis.fetch = undefined;

  t.after(() => {
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearTimeout = origClearTimeout;
    globalThis.Audio = origAudio;
    globalThis.fetch = origFetch;
  });

  const env = setupAbyssEnv(t, { rng: () => 0 });

  // Cerrado no acaricia
  env.emitDoc('abyss:pet');
  assert.equal(env.inner.classList.contains('petting'), false);

  // Abrir el easter egg
  for (let i = 0; i < 6; i++) {
    env.emit('keydown', { key: 'ArrowDown' });
    env.runFrames(1);
  }
  env.runFrames(90);
  assert.equal(env.panel.classList.contains('open'), true);

  // Disparar caricia por menú contextual -> activa la manito
  env.emitDoc('abyss:pet');
  assert.equal(env.inner.classList.contains('petting'), true);
  assert.equal(env.pet.children[0].src, PET_FX_SRC);

  // Al cumplirse PET_DURATION_MS se detiene la animación
  const petEntry = [...timers.entries()].find(([, v]) => v.ms === PET_DURATION_MS);
  assert.ok(petEntry);
  timers.delete(petEntry[0]);
  petEntry[1].fn();
  assert.equal(env.inner.classList.contains('petting'), false);

  // Mantener presionado (móvil / escritorio) acaricia y al soltar NO explota
  env.video.emit('pointerdown', { button: 0, clientX: 50, clientY: 50 });
  const holdEntry = [...timers.entries()].find(([, v]) => v.ms === PET_HOLD_MS);
  assert.ok(holdEntry);
  timers.delete(holdEntry[0]);
  holdEntry[1].fn();
  assert.equal(env.inner.classList.contains('petting'), true);

  env.video.emit('pointerup');
  // El click sintético tras soltar queda suprimido (no explota)
  env.video.click();
  assert.equal(env.inner.classList.contains('exploding'), false);

  const releaseEntry = [...timers.entries()].find(([, v]) => v.ms === PET_HOLD_RELEASE_MS);
  assert.ok(releaseEntry);
  timers.delete(releaseEntry[0]);
  releaseEntry[1].fn();
  assert.equal(env.inner.classList.contains('petting'), false);

  // Un clic rápido posterior sí explota al gato y cancela cualquier caricia activa
  env.emitDoc('abyss:pet');
  assert.equal(env.inner.classList.contains('petting'), true);
  env.video.click();
  assert.equal(env.inner.classList.contains('petting'), false);
  assert.equal(env.inner.classList.contains('exploding'), true);

  env.ctrl.destroy();
});
