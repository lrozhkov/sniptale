import { expect, it, vi } from 'vitest';
import { ensureEditorObjectReachable, ensureEditorObjectsReachable } from './reachability';

it('keeps a drawing fully outside the exported image when it remains in the editing workspace', () => {
  const object = {
    getBoundingRect: () => ({ left: -1200, top: 30, width: 60, height: 20 }),
    left: -1200,
    top: 30,
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  expect(
    ensureEditorObjectReachable({} as never, { width: 100, height: 100 }, object as never)
  ).toBe(false);
  expect(object.set).not.toHaveBeenCalled();
});

it('keeps part of a drawing reachable when it moves beyond the workspace edge', () => {
  const object = {
    left: -3000,
    top: 30,
    getBoundingRect() {
      return { left: this.left, top: this.top, width: 60, height: 20 };
    },
    set(next: { left: number; top: number }) {
      this.left = next.left;
      this.top = next.top;
    },
    setCoords: vi.fn(),
  };

  expect(
    ensureEditorObjectReachable({} as never, { width: 100, height: 100 }, object as never)
  ).toBe(true);
  expect(object.left).toBe(-2084);
  expect(object.setCoords).toHaveBeenCalledOnce();
});

it('does not move objects when no image surface is available', () => {
  const object = { getBoundingRect: vi.fn() };
  expect(ensureEditorObjectReachable(null, { width: 100, height: 100 }, object as never)).toBe(
    false
  );
  expect(ensureEditorObjectReachable({} as never, { width: 0, height: 100 }, object as never)).toBe(
    false
  );
  expect(object.getBoundingRect).not.toHaveBeenCalled();
});

it('keeps a portion of a wide drawing within the editing surface', () => {
  const object = {
    left: -8000,
    top: 0,
    getBoundingRect: () => ({ left: -8000, top: 0, width: 5000, height: 20 }),
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  expect(
    ensureEditorObjectReachable({} as never, { width: 100, height: 100 }, object as never)
  ).toBe(true);
  expect(object.set).toHaveBeenCalledWith({ left: -6148, top: 0 });
});

it('recovers editable layers without treating crop guides as drawings', () => {
  const drawing = {
    left: 3000,
    top: 30,
    getBoundingRect: () => ({ left: 3000, top: 30, width: 60, height: 20 }),
    set: vi.fn(),
    setCoords: vi.fn(),
  };
  const cropGuide = { sniptaleRole: 'crop-guide', getBoundingRect: vi.fn() };
  const canvas = { getObjects: () => [drawing, cropGuide] };

  expect(ensureEditorObjectsReachable(canvas as never, { width: 100, height: 100 })).toBe(true);
  expect(drawing.set).toHaveBeenCalledOnce();
  expect(cropGuide.getBoundingRect).not.toHaveBeenCalled();
});
