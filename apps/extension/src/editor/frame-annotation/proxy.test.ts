import { Rect } from 'fabric';
import { expect, it } from 'vitest';
import { createDefaultFrameStepBadge } from '../../features/highlighter/frame-annotation/defaults';
import {
  collectFrameAnnotationProxies,
  canMutateFrameAnnotationProxy,
  commitFrameAnnotationProxy,
  createFrameAnnotationProxy,
  normalizeFrameAnnotationProxyGeometry,
  readFrameAnnotationSnapshot,
  restoreFrameAnnotationProxyFromMetadata,
  synchronizeFrameAnnotationOrdering,
  synchronizeFrameAnnotationAutoStepBadges,
} from './proxy';

function createProxy(id: string, ordering = 0) {
  return createFrameAnnotationProxy({
    frame: { id, x: 10, y: 20, width: 100, height: 60, effectMode: 'border' },
    label: `Frame ${id}`,
    ordering,
  });
}

it('keeps the versioned snapshot as the authority and increments revision on commit', () => {
  const proxy = createProxy('frame-1');
  const snapshot = readFrameAnnotationSnapshot(proxy)!;
  commitFrameAnnotationProxy(proxy, { ...snapshot, x: 42, width: 180 });

  expect(proxy.sniptaleFrameAnnotationRevision).toBe(2);
  expect(readFrameAnnotationSnapshot(proxy)).toMatchObject({ x: 42, width: 180, version: 1 });
  expect(proxy).toMatchObject({ left: 42, width: 180, scaleX: 1 });
});

it('quantizes logical geometry to the same precision Fabric uses for history JSON', () => {
  const proxy = createProxy('frame-fractional');
  const snapshot = readFrameAnnotationSnapshot(proxy)!;
  commitFrameAnnotationProxy(proxy, {
    ...snapshot,
    x: 1.234567,
    y: 2.345678,
    width: 100.456789,
    height: 80.567891,
  });

  expect(readFrameAnnotationSnapshot(proxy)).toMatchObject({
    x: 1.2346,
    y: 2.3457,
    width: 100.4568,
    height: 80.5679,
  });
  expect(proxy.toObject()).toMatchObject({
    left: 1.2346,
    top: 2.3457,
    width: 100.4568,
    height: 80.5679,
  });
});

it('normalizes Fabric transforms back into logical geometry', () => {
  const proxy = createProxy('frame-1');
  proxy.set({ left: 24, top: 36, scaleX: 1.5, scaleY: 2 });

  expect(normalizeFrameAnnotationProxyGeometry(proxy)).toMatchObject({
    x: 24,
    y: 36,
    width: 150,
    height: 120,
  });
  expect(proxy).toMatchObject({ scaleX: 1, scaleY: 1 });
});

it('restores disposable proxy geometry from metadata and rejects malformed metadata', () => {
  const proxy = createProxy('frame-1');
  proxy.set({ left: 999, visible: false, selectable: true, evented: true });
  expect(restoreFrameAnnotationProxyFromMetadata(proxy)).toBe(true);
  expect(proxy).toMatchObject({
    left: 10,
    visible: false,
    selectable: false,
    evented: false,
    fill: 'rgba(0,0,0,0.001)',
    strokeWidth: 0,
  });

  const malformed = new Rect();
  malformed.sniptaleType = 'frame-annotation';
  malformed.sniptaleFrameAnnotationJson = JSON.stringify({ version: 2 });
  expect(restoreFrameAnnotationProxyFromMetadata(malformed)).toBe(false);
});

it('omits hidden proxies from projection/export collection and protects locked proxies', () => {
  const hidden = createProxy('hidden');
  hidden.visible = false;
  const locked = createProxy('locked');
  locked.sniptaleLocked = true;
  expect(
    collectFrameAnnotationProxies([hidden, locked]).map(({ snapshot }) => snapshot.id)
  ).toEqual(['locked']);
  expect(canMutateFrameAnnotationProxy(hidden)).toBe(false);
  expect(canMutateFrameAnnotationProxy(locked)).toBe(false);
  locked.sniptaleLocked = false;
  expect(canMutateFrameAnnotationProxy(locked)).toBe(true);
});

it('orders only frame annotations without changing existing editor object types', () => {
  const text = new Rect();
  text.sniptaleType = 'text';
  const first = createProxy('first', 9);
  const second = createProxy('second', 4);

  synchronizeFrameAnnotationOrdering([text, first, second]);

  expect(
    collectFrameAnnotationProxies([text, first, second]).map(({ snapshot }) => [
      snapshot.id,
      snapshot.ordering,
    ])
  ).toEqual([
    ['first', 0],
    ['second', 1],
  ]);
  expect(text.sniptaleType).toBe('text');
});

it('assigns automatic step values by annotation-plane ordering', () => {
  const first = createProxy('first', 0);
  const second = createProxy('second', 1);
  for (const proxy of [first, second]) {
    const snapshot = readFrameAnnotationSnapshot(proxy)!;
    commitFrameAnnotationProxy(proxy, {
      ...snapshot,
      stepBadge: { ...createDefaultFrameStepBadge(), type: 'number', value: '9', auto: true },
    });
  }

  synchronizeFrameAnnotationAutoStepBadges([first, second]);

  expect(readFrameAnnotationSnapshot(first)?.stepBadge?.value).toBe('1');
  expect(readFrameAnnotationSnapshot(second)?.stepBadge?.value).toBe('2');
});
