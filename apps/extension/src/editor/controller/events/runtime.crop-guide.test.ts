import { expect, it, vi } from 'vitest';

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

it('ignores regular objects and syncs crop-guide selections through crop bindings', () => {
  const bindings = {
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
