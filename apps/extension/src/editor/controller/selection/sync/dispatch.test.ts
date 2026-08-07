import type { FabricObject } from 'fabric';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rich: vi.fn(),
  image: vi.fn(),
  arrow: vi.fn(),
  line: vi.fn(),
  step: vi.fn(),
  text: vi.fn(),
  blur: vi.fn(),
  brush: vi.fn(),
  shape: vi.fn(),
}));
vi.mock('../rich-shape-sync', () => ({ syncRichShapeSelectionSettings: mocks.rich }));
vi.mock('../sync-image', () => ({ syncImageSelectionSettings: mocks.image }));
vi.mock('../sync-linear', () => ({
  syncArrowSelectionSettings: mocks.arrow,
  syncLineSelectionSettings: mocks.line,
}));
vi.mock('../sync-step', () => ({ syncStepSelectionSettings: mocks.step }));
vi.mock('../sync-text/dispatch', () => ({ syncTextSelectionSettings: mocks.text }));
vi.mock('./blur', () => ({ syncBlurSelectionSettings: mocks.blur }));
vi.mock('./brush', () => ({ syncBrushSelectionSettings: mocks.brush }));
vi.mock('./shape', () => ({ syncShapeSelectionSettings: mocks.shape }));

import { syncSelectionToolSettingsFromObject } from './dispatch';

it('routes every legacy selection type while leaving frame annotations shared-owned', () => {
  const object = {} as FabricObject;
  for (const type of [
    'transparent-base',
    'browser-frame',
    'frame-annotation',
    'source-image',
    'background',
    'image',
    'pencil',
    'highlighter',
    'rectangle',
    'ellipse',
    'diamond',
    'blur',
    'text',
    'meta-stamp',
    'step',
    'arrow',
    'line',
    'rich-shape',
  ] as const) {
    syncSelectionToolSettingsFromObject(object, type);
  }
  expect(mocks.image).toHaveBeenCalledTimes(3);
  expect(mocks.brush).toHaveBeenCalledTimes(2);
  expect(mocks.shape).toHaveBeenCalledTimes(3);
  expect(mocks.blur).toHaveBeenCalledOnce();
  expect(mocks.text).toHaveBeenCalledTimes(2);
  expect(mocks.step).toHaveBeenCalledOnce();
  expect(mocks.arrow).toHaveBeenCalledOnce();
  expect(mocks.line).toHaveBeenCalledOnce();
  expect(mocks.rich).toHaveBeenCalledOnce();
});
