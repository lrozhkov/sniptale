import { expect, it, vi } from 'vitest';
import { ensureEditorObjectReachable } from './reachability';

it('keeps a drawing fully outside the exported image when it remains in the editing workspace', () => {
  const object = {
    getBoundingRect: () => ({ left: -150, top: 30, width: 60, height: 20 }),
    left: -150,
    top: 30,
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  expect(
    ensureEditorObjectReachable({} as never, { width: 100, height: 100 }, object as never)
  ).toBe(false);
  expect(object.set).not.toHaveBeenCalled();
});
