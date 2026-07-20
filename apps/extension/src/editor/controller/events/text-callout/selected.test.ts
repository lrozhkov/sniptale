import { beforeEach, expect, it, vi } from 'vitest';
import { handleSelectedTextTargetMouseDown } from './selected';

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

it('keeps selected text zones under text-tool ownership without entering edit mode', () => {
  const event = {
    alreadySelected: true,
    e: { kind: 'pointer' },
    target: { sniptaleId: 'selected-target', type: 'textbox' },
  };

  expect(
    handleSelectedTextTargetMouseDown({
      activeTool: 'text',
      canvas: createCanvas() as never,
      event: event as never,
    })
  ).toBe(true);
});

it('lets select mode and outside zones continue normal selection handling', () => {
  const event = {
    alreadySelected: true,
    e: { kind: 'pointer' },
    target: { sniptaleId: 'selected-target', type: 'textbox' },
  };

  expect(
    handleSelectedTextTargetMouseDown({
      activeTool: 'select',
      canvas: createCanvas() as never,
      event: event as never,
    })
  ).toBe(false);

  mocks.resolveTextCalloutPointerZone.mockReturnValue('outside');
  expect(
    handleSelectedTextTargetMouseDown({
      activeTool: 'text',
      canvas: createCanvas() as never,
      event: event as never,
    })
  ).toBe(false);
});

it('ignores non-text and non-selected targets before resolving pointer zones', () => {
  mocks.isTextTarget.mockReturnValue(false);
  expect(
    handleSelectedTextTargetMouseDown({
      activeTool: 'text',
      canvas: createCanvas() as never,
      event: {
        alreadySelected: true,
        e: { kind: 'pointer' },
        target: { sniptaleId: 'selected-target', type: 'rect' },
      } as never,
    })
  ).toBe(false);

  mocks.isTextTarget.mockReturnValue(true);
  expect(
    handleSelectedTextTargetMouseDown({
      activeTool: 'text',
      canvas: createCanvas() as never,
      event: {
        alreadySelected: false,
        e: { kind: 'pointer' },
        target: { sniptaleId: 'selected-target', type: 'textbox' },
      } as never,
    })
  ).toBe(false);
  expect(mocks.resolveTextCalloutPointerZone).not.toHaveBeenCalled();
});
