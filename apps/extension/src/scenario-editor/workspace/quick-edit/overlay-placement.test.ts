import { beforeEach, expect, it, vi } from 'vitest';

const mockUuid = '00000000-0000-0000-0000-000000000001';

vi.stubGlobal('crypto', { randomUUID: vi.fn(() => mockUuid) });

import { createOverlayAtPoint } from './overlay-placement';

function createStep() {
  return {
    imageTransform: { scale: 1, x: 0, y: 0 },
    overlays: [],
    page: {
      viewport: { height: 600, width: 800 },
    },
  } as never;
}

beforeEach(() => {
  vi.mocked(crypto.randomUUID).mockReturnValue(mockUuid);
});

it('places point, arrow, and rectangle overlays at the requested stage point', () => {
  const step = createStep();
  const point = { x: 120, y: 90 };

  expect(createOverlayAtPoint(step, 'text', point)).toEqual(
    expect.objectContaining({
      id: mockUuid,
      kind: 'text',
      point,
    })
  );
  expect(createOverlayAtPoint(step, 'arrow', point)).toEqual(
    expect.objectContaining({
      id: mockUuid,
      kind: 'arrow',
      start: point,
      end: point,
    })
  );
  expect(createOverlayAtPoint(step, 'rectangle', point)).toEqual(
    expect.objectContaining({
      id: mockUuid,
      kind: 'rectangle',
      rect: expect.objectContaining({
        x: point.x - 112,
        y: point.y - 60,
      }),
    })
  );
});
