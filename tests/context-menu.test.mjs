import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPosition,
  formatLinkBadge,
  inspectContext,
  shouldUseNativeMenu,
  truncate,
} from '../src/scripts/context-menu.ts';

test('deja pasar el menú nativo cuando se presiona Shift + clic derecho o se solicita pase único', () => {
  assert.equal(shouldUseNativeMenu({ shiftKey: true }, null, true), true);
  assert.equal(shouldUseNativeMenu({ pointerType: 'mouse' }, null, true, true), true);
});

test('deja pasar el menú nativo en dispositivos táctiles o sin puntero fino', () => {
  assert.equal(shouldUseNativeMenu({ pointerType: 'touch' }, null, true), true);
  assert.equal(shouldUseNativeMenu({ pointerType: 'mouse' }, null, false), true);
});

test('deja pasar el menú nativo en campos editables (inputs, textarea, contenteditable)', () => {
  const inputTarget = {
    isContentEditable: false,
    closest: (selector) => (selector.includes('input') ? {} : null),
  };
  const editableTarget = {
    isContentEditable: true,
    closest: () => null,
  };
  const plainTarget = {
    isContentEditable: false,
    closest: () => null,
  };
  assert.equal(shouldUseNativeMenu({ pointerType: 'mouse' }, inputTarget, true), true);
  assert.equal(shouldUseNativeMenu({ pointerType: 'mouse' }, editableTarget, true), true);
  assert.equal(shouldUseNativeMenu({ pointerType: 'mouse' }, plainTarget, true), false);
});

test('mantiene el menú dentro del viewport y lo voltea cerca de los bordes', () => {
  assert.deepEqual(clampPosition(100, 120, 276, 320, 1280, 800), {
    left: 100,
    top: 120,
    ox: '0%',
    oy: '0%',
  });
  assert.deepEqual(clampPosition(1200, 750, 276, 320, 1280, 800), {
    left: 924,
    top: 430,
    ox: '100%',
    oy: '100%',
  });
  assert.deepEqual(clampPosition(4, 2, 276, 320, 1280, 800), {
    left: 12,
    top: 12,
    ox: '0%',
    oy: '0%',
  });
});

test('clasifica enlaces web, correo, teléfono y anclas internas', () => {
  const web = formatLinkBadge('https://www.instagram.com/byte.xyz', 'https://www.instagram.com/byte.xyz');
  assert.equal(web.kind, 'url');
  assert.equal(web.badge, 'instagram.com/byte.xyz');

  const mail = formatLinkBadge('mailto:proyectos@byteservices.net', 'mailto:proyectos@byteservices.net');
  assert.equal(mail.kind, 'mail');
  assert.equal(mail.value, 'proyectos@byteservices.net');

  const tel = formatLinkBadge('tel:+584227707654', 'tel:+584227707654');
  assert.equal(tel.kind, 'tel');
  assert.equal(tel.value, '+584227707654');

  const hash = formatLinkBadge('https://byteservices.xyz/#metodo', '#metodo');
  assert.equal(hash.kind, 'hash');
  assert.equal(hash.badge, 'Sección #metodo');
});

test('inspecciona contexto de selección, enlace, imagen y botón con data-copy', () => {
  const anchor = {
    href: 'https://wa.me/584227707654',
    getAttribute: (name) => (name === 'href' ? 'https://wa.me/584227707654' : null),
  };
  const img = {
    src: 'https://byteservices.xyz/img/logotipo-blanco.svg',
    getAttribute: (name) => (name === 'alt' ? 'Byte' : null),
  };
  const copyEl = {
    dataset: { copy: 'proyectos@byteservices.net' },
  };
  const target = {
    closest: (selector) => {
      if (selector === 'a[href]') return anchor;
      if (selector === 'img[src]') return img;
      if (selector === '[data-copy]') return copyEl;
      return null;
    },
  };

  const info = inspectContext(target, '  Ingeniería   digital  ', 300, true);
  assert.equal(info.selection, 'Ingeniería   digital');
  assert.equal(info.link?.kind, 'url');
  assert.equal(info.image?.badge, 'Byte');
  assert.equal(info.copyData?.value, 'proyectos@byteservices.net');
  assert.equal(info.copyData?.label, 'Copiar correo');
  assert.equal(info.cat, false);
  assert.equal(info.scrolled, true);
  assert.equal(info.isHome, true);

  const catTarget = {
    closest: (selector) => (selector === '.abyss-cat' ? {} : null),
  };
  const catInfo = inspectContext(catTarget, '', 0, true);
  assert.equal(catInfo.cat, true);
});

test('acorta cadenas largas colapsando espacios', () => {
  assert.equal(truncate('  hola   mundo  ', 20), 'hola mundo');
  assert.equal(truncate('Ingeniería digital de nueva generación', 12), 'Ingeniería…');
});
