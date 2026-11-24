import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initNoSelect, isEditable } from '../src/scripts/noselect.ts';
import { resolveNextSectionIndex } from '../src/lib/section-nav.ts';

function setupEnv(t) {
  const originals = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
  };
  t.after(() => {
    for (const [k, v] of Object.entries(originals)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  class FakeElement {
    constructor(editable = false) {
      this._editable = editable;
    }
    closest() {
      return this._editable ? this : null;
    }
  }

  const winListeners = [];
  const docListeners = [];
  globalThis.Element = FakeElement;
  globalThis.window = {
    addEventListener(type, fn, capture = false) {
      winListeners.push({ type, fn, capture: Boolean(capture) });
    },
    getSelection: () => ({ removeAllRanges() {} }),
  };
  globalThis.document = {
    addEventListener(type, fn, capture = false) {
      docListeners.push({ type, fn, capture: Boolean(capture) });
    },
  };

  initNoSelect();

  const dispatch = (type, props) => {
    let prevented = false;
    let stopped = false;
    const ev = {
      key: '',
      code: '',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: new FakeElement(false),
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
      ...props,
    };
    for (const l of winListeners) {
      if (l.type === type) l.fn(ev);
    }
    if (!stopped) {
      for (const l of docListeners) {
        if (l.type === type) l.fn(ev);
      }
    }
    return { prevented, stopped };
  };

  return { FakeElement, dispatch };
}

test('bloquea Espacio (keydown y keyup) y flechas horizontales fuera de campos editables', (t) => {
  const { dispatch } = setupEnv(t);

  for (const key of [' ', 'ArrowLeft', 'ArrowRight']) {
    const res = dispatch('keydown', { key, code: key === ' ' ? 'Space' : key });
    assert.equal(res.prevented, true, `debe bloquear keydown para ${JSON.stringify(key)}`);
    assert.equal(res.stopped, true, `debe detener propagación para ${JSON.stringify(key)}`);
  }

  const spaceUp = dispatch('keyup', { key: ' ', code: 'Space' });
  assert.equal(spaceUp.prevented, true);
  assert.equal(spaceUp.stopped, true);
});

test('bloquea flechas verticales como respaldo cuando no hay navegación de secciones', (t) => {
  const { dispatch } = setupEnv(t);

  for (const key of ['ArrowUp', 'ArrowDown']) {
    const res = dispatch('keydown', { key });
    assert.equal(res.prevented, true);
    assert.equal(res.stopped, true);
  }
});

test('permite Espacio y flechas dentro de campos editables y atajos Alt+Flecha del navegador', (t) => {
  const { FakeElement, dispatch } = setupEnv(t);
  const input = new FakeElement(true);

  assert.equal(isEditable(input), true);
  assert.equal(isEditable(new FakeElement(false)), false);

  for (const key of [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    const res = dispatch('keydown', { key, target: input });
    assert.equal(res.prevented, false);
  }

  const altBack = dispatch('keydown', { key: 'ArrowLeft', altKey: true });
  assert.equal(altBack.prevented, false);
});

test('resolveNextSectionIndex navega exactamente entre categorías en bordes, puntos exactos e intermedios', () => {
  const stops = [0, 1080, 1980, 2850, 3650, 4400];

  // En el tope (inicio)
  assert.equal(resolveNextSectionIndex(0, stops, 1), 1);
  assert.equal(resolveNextSectionIndex(0, stops, -1), 0);

  // En el fondo (contacto)
  assert.equal(resolveNextSectionIndex(4400, stops, 1), 5);
  assert.equal(resolveNextSectionIndex(4400, stops, -1), 4);

  // Dentro de la tolerancia de una sección (±80px)
  assert.equal(resolveNextSectionIndex(1050, stops, 1), 2);
  assert.equal(resolveNextSectionIndex(1050, stops, -1), 0);

  // En zona intermedia (ej. banda de clientes entre inicio=0 y sectores=1080)
  assert.equal(resolveNextSectionIndex(600, stops, 1), 1);
  assert.equal(resolveNextSectionIndex(600, stops, -1), 0);

  // Pulsaciones consecutivas rápidas con pendingTarget
  assert.equal(resolveNextSectionIndex(120, stops, 1, 1), 2);
  assert.equal(resolveNextSectionIndex(120, stops, -1, 1), 0);
  assert.equal(resolveNextSectionIndex(4000, stops, 1, 5), 5);
  assert.equal(resolveNextSectionIndex(20, stops, -1, 0), 0);

  // Lista vacía o de un solo elemento
  assert.equal(resolveNextSectionIndex(0, [], 1), 0);
  assert.equal(resolveNextSectionIndex(0, [0], 1), 0);
});
