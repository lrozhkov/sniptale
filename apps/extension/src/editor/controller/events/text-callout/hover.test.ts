import { beforeEach, expect, it, vi } from 'vitest';
import { updateTextCalloutHoverCursor } from './hover';

const mocks = vi.hoisted(() => ({
  isTextTarget: vi.fn(() => true),
  resolveTextCalloutPointerZone: vi.fn(() => 'content'),
}));

vi.mock('../text-target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../text-target')>()),
  isTextTarget: mocks.isTextTarget,
}));

vi.mock('../../../objects/annotation/text/zones', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/text/zones')>()),
  resolveTextCalloutPointerZone: mocks.resolveTextCalloutPointerZone,
}));

function createCanvas() {
  const activeObject = { sniptaleId: 'selected-target' };
  return {
    getActiveObject: vi.fn(() => activeObject),
    getActiveObjects: vi.fn(() => [activeObject]),
    getScenePoint: vi.fn(() => ({ x: 18, y: 24 })),
    getViewportPoint: vi.fn(() => ({ x: 48, y: 36 })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isTextTarget.mockReturnValue(true);
  mocks.resolveTextCalloutPointerZone.mockReturnValue('content');
});

it('sets text hover cursor only for selected text content zones', () => {
  const canvas = createCanvas();
  const target = { hoverCursor: 'move', sniptaleId: 'selected-target', type: 'textbox' };

  updateTextCalloutHoverCursor(canvas as never, {
    e: { kind: 'pointer' } as never,
    target: target as never,
  });
  expect(target.hoverCursor).toBe('text');

  mocks.resolveTextCalloutPointerZone.mockReturnValue('surface');
  updateTextCalloutHoverCursor(canvas as never, {
    e: { kind: 'pointer' } as never,
    target: target as never,
  });
  expect(target.hoverCursor).toBeNull();
});

it('clears or skips hover cursor updates for non-selected and non-text targets', () => {
  const canvas = createCanvas();
  const target = { hoverCursor: 'text', sniptaleId: 'other-target', type: 'textbox' };

  updateTextCalloutHoverCursor(canvas as never, {
    e: { kind: 'pointer' } as never,
    target: target as never,
  });
  expect(target.hoverCursor).toBeNull();

  mocks.isTextTarget.mockReturnValue(false);
  updateTextCalloutHoverCursor(canvas as never, {
    e: { kind: 'pointer' } as never,
    target: target as never,
  });
  expect(mocks.resolveTextCalloutPointerZone).not.toHaveBeenCalled();
});
