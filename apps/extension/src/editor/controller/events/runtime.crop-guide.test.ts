import { afterEach, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';

const mocks = vi.hoisted(() => ({
  applyCropGuideSelection: vi.fn(),
  createCropSelectionFromRect: vi.fn(() => ({ height: 20, left: 1, top: 2, width: 10 })),
  isEditorCropGuide: vi.fn(),
  normalizeEditorCropSelection: vi.fn((selection) => ({ ...selection, normalized: true })),
}));

vi.mock('../tools/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/crop')>()),
  applyCropGuideSelection: mocks.applyCropGuideSelection,
  createCropSelectionFromRect: mocks.createCropSelectionFromRect,
  isEditorCropGuide: mocks.isEditorCropGuide,
  normalizeEditorCropSelection: mocks.normalizeEditorCropSelection,
}));

import { syncCropGuideInteraction } from './runtime.crop-guide';

afterEach(() => useEditorStore.getState().setCanvasCropMode('crop'));

it('ignores regular objects and syncs crop-guide selections through crop bindings', () => {
  const bindings = {
    getCanvas: vi.fn(() => ({ getZoom: () => 1 })),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 200 })),
    setCropState: vi.fn(),
  };
  const target = { id: 'crop-guide' };

  mocks.isEditorCropGuide.mockReturnValueOnce(false);
  expect(syncCropGuideInteraction(bindings as never, target as never)).toBe(false);

  mocks.isEditorCropGuide.mockReturnValueOnce(true);
  expect(syncCropGuideInteraction(bindings as never, target as never)).toBe(true);

  expect(mocks.createCropSelectionFromRect).toHaveBeenCalledWith(target);
  expect(mocks.normalizeEditorCropSelection).toHaveBeenCalledWith(
    { height: 20, left: 1, top: 2, width: 10 },
    { height: 100, width: 200 }
  );
  expect(mocks.applyCropGuideSelection).toHaveBeenCalledWith(
    target,
    expect.objectContaining({ normalized: true }),
    'selection'
  );
  expect(bindings.setCropState).toHaveBeenCalledWith(
    target,
    expect.objectContaining({ normalized: true })
  );
});

it('keeps the guide size when movement reaches the right or bottom edge', () => {
  const bindings = {
    getCanvas: vi.fn(() => ({ getZoom: () => 1 })),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 200 })),
    setCropState: vi.fn(),
  };
  const target = { id: 'crop-guide' };
  mocks.isEditorCropGuide.mockReturnValueOnce(true);
  mocks.createCropSelectionFromRect.mockReturnValueOnce({
    left: 180,
    top: 90,
    width: 80,
    height: 50,
  });

  expect(syncCropGuideInteraction(bindings as never, target as never, 'move')).toBe(true);
  expect(mocks.applyCropGuideSelection).toHaveBeenCalledWith(
    target,
    { left: 120, top: 50, width: 80, height: 50 },
    'selection'
  );
});

it('keeps a free guide reachable at the workspace edge while moving or resizing', () => {
  useEditorStore.getState().setCanvasCropMode('expand');
  const bindings = {
    getCanvas: vi.fn(() => null),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 200 })),
    setCropState: vi.fn(),
  };
  const target = { id: 'crop-guide' };
  mocks.isEditorCropGuide.mockReturnValue(true);
  mocks.createCropSelectionFromRect.mockReturnValue({
    left: 2200,
    top: 2100,
    width: 80,
    height: 50,
  });

  expect(syncCropGuideInteraction(bindings as never, target as never, 'move')).toBe(true);
  expect(mocks.applyCropGuideSelection).toHaveBeenLastCalledWith(
    target,
    { left: 2148, top: 2078, width: 80, height: 50 },
    'selection'
  );

  expect(syncCropGuideInteraction(bindings as never, target as never, 'scale')).toBe(true);
  expect(mocks.applyCropGuideSelection).toHaveBeenLastCalledWith(
    target,
    { left: 2200, top: 2100, width: 28, height: 28 },
    'selection'
  );
});
