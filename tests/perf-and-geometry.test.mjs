import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { finePointer, pad2, perFrame, reducedMotion } from '../src/scripts/env.ts';
import { consGeometry, farField, orbitNodes, segments } from '../src/lib/geometry.ts';

test('env cachea MediaQueryList sin reasignar en cada cuadro y respeta cambios de matchMedia', (t) => {
  const originalWindow = globalThis.window;
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  let calls = 0;
  const state = { reduced: false, fine: true };
  globalThis.window = {
    matchMedia(q) {
      calls++;
      return {
        get matches() {
          return q.includes('reduced-motion') ? state.reduced : state.fine;
        },
      };
    },
  };

  assert.equal(reducedMotion(), false);
  assert.equal(reducedMotion(), false);
  assert.equal(finePointer(), true);
  assert.equal(finePointer(), true);
  assert.equal(calls, 2);

  state.reduced = true;
  assert.equal(reducedMotion(), true);
  assert.equal(calls, 2);
});

test('perFrame agrupa múltiples llamadas dentro de un mismo cuadro de animación', (t) => {
  const originalRaf = globalThis.requestAnimationFrame;
  t.after(() => {
    if (originalRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRaf;
  });

  const queue = [];
  globalThis.requestAnimationFrame = (fn) => {
    queue.push(fn);
    return queue.length;
  };

  let runs = 0;
  const tick = perFrame(() => runs++);
  tick();
  tick();
  tick();
  assert.equal(queue.length, 1);
  assert.equal(runs, 0);

  queue.shift()();
  assert.equal(runs, 1);

  tick();
  assert.equal(queue.length, 1);
  queue.shift()();
  assert.equal(runs, 2);
});

test('pad2 y geometría producen valores deterministas y válidos', () => {
  assert.equal(pad2(1), '01');
  assert.equal(pad2(12), '12');

  const nodes = orbitNodes(5);
  assert.equal(nodes.length, 5);
  nodes.forEach((n) => {
    assert.ok(n.pos.left.endsWith('%'));
    assert.ok(n.spoke.transform.startsWith('rotate('));
  });

  const g = consGeometry(1440, 4);
  const segs = segments(g, 1);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].on, true);
  assert.equal(segs[1].on, true);
  assert.equal(segs[2].on, false);

  const far = farField(g);
  assert.ok(far.width > 1440);
  assert.ok(far.lines.length > 0);
  assert.ok(far.dots.length > 0);
});

test('stars.json mantiene estructura válida y sin destellos vacíos', () => {
  const raw = readFileSync(fileURLToPath(new URL('../src/data/stars.json', import.meta.url)), 'utf8');
  const data = JSON.parse(raw);
  const keys = ['hero', 'clientes', 'sectores', 'productos', 'metodo', 'nosotros', 'contacto'];
  for (const k of keys) {
    assert.ok(data[k], `falta sección ${k} en stars.json`);
    const flat = data[k].shines.flat();
    assert.ok(flat.length >= 3, `${k} debe tener al menos 3 shines`);
    for (const s of flat) {
      assert.match(s.x, /^\d+\.\d+%$/);
      assert.match(s.y, /^\d+\.\d+%$/);
      assert.match(s.gd, /^\d+\.\d+s$/);
      assert.match(s.gdl, /^-?\d+\.\d+s$/);
    }
  }
});
