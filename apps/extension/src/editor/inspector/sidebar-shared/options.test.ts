import { beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      local: storageMocks,
    },
  })
);

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  clampGridSize,
  getArrowModeOptions,
  getArrowVariantOptions,
  getArrowHeadOptions,
  getBlurTypeOptions,
  getBrowserCanvasModeOptions,
  getBrowserContentModeOptions,
  getBrushShapeCorrectionOptions,
  getFontOptions,
  getFrameBackgroundModeOptions,
  getFrameBackgroundImageFitOptions,
  getFrameGradientPresets,
  getFrameLayoutModeOptions,
  getStepAlphabetOptions,
  getStepTypeOptions,
  getTextAlignOptions,
  getTextCalloutFormatOptions,
  getTextLayoutModeOptions,
  getTextVerticalAlignOptions,
  loadRecentColors,
  pushRecentColor,
} from './options';
import { readFileAsDataUrl } from './file-reader';

beforeEach(() => {
  vi.clearAllMocks();
});

it('loads and stores normalized recent colors', async () => {
  storageMocks.get.mockResolvedValue({
    sniptale_editor_recent_colors: ['#ABCDEF', 'bad', 42, ' #123456 '],
  });

  await expect(loadRecentColors()).resolves.toEqual(['#abcdef', '#123456']);

  storageMocks.get.mockResolvedValue({
    sniptale_editor_recent_colors: ['#abcdef', '#123456'],
  });

  await expect(pushRecentColor('#654321', 2)).resolves.toEqual(['#654321', '#abcdef']);
  expect(storageMocks.set).toHaveBeenCalledWith({
    sniptale_editor_recent_colors: ['#654321', '#abcdef'],
  });
});

it('falls back to stored colors when a pushed color is invalid', async () => {
  storageMocks.get.mockResolvedValue({
    sniptale_editor_recent_colors: ['#abcdef'],
  });

  await expect(pushRecentColor('oops')).resolves.toEqual(['#abcdef']);
  expect(storageMocks.set).not.toHaveBeenCalled();
});

it('reads files as data urls and surfaces reader errors', async () => {
  class SuccessFileReader {
    error: DOMException | null = null;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    result: string | null = 'data:text/plain;base64,Zm9v';

    readAsDataURL() {
      this.onload?.();
    }
  }

  vi.stubGlobal('FileReader', SuccessFileReader);
  await expect(readFileAsDataUrl(new File(['foo'], 'demo.txt'))).resolves.toBe(
    'data:text/plain;base64,Zm9v'
  );

  class ErrorFileReader {
    error = new DOMException('failed');
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    result: string | null = null;

    readAsDataURL() {
      this.onerror?.();
    }
  }

  vi.stubGlobal('FileReader', ErrorFileReader);
  await expect(readFileAsDataUrl(new File(['foo'], 'demo.txt'))).rejects.toBeInstanceOf(
    DOMException
  );
  vi.unstubAllGlobals();
});

it('returns localized option labels and bounded grid sizes', () => {
  expect(clampGridSize(1)).toBe(8);
  expect(clampGridSize(999)).toBe(160);
  expect(clampGridSize(22.7)).toBe(23);

  expect(getFrameBackgroundImageFitOptions()).toEqual([
    { value: 'cover', label: 'editor.compact.frameBackgroundImageFitCover' },
    { value: 'contain', label: 'editor.compact.frameBackgroundImageFitContain' },
    { value: 'stretch', label: 'editor.compact.frameBackgroundImageFitStretch' },
    { value: 'tile', label: 'editor.compact.frameBackgroundImageFitTile' },
    { value: 'fit-width', label: 'editor.compact.frameBackgroundImageFitWidth' },
    { value: 'fit-height', label: 'editor.compact.frameBackgroundImageFitHeight' },
  ]);
  expect(getFrameGradientPresets().every((preset) => preset.label.startsWith('editor.'))).toBe(
    true
  );
  expect(getArrowHeadOptions()).toEqual([
    { value: 'none', label: 'editor.compact.arrowHeadNone' },
    { value: 'arrow', label: 'editor.compact.arrowHeadArrow' },
    { value: 'triangle', label: 'editor.compact.arrowHeadTriangle' },
    { value: 'triangle-outline', label: 'editor.compact.arrowHeadTriangleOutline' },
    { value: 'bar', label: 'editor.compact.arrowHeadBar' },
    { value: 'circle', label: 'editor.compact.arrowHeadCircle' },
    { value: 'circle-outline', label: 'editor.compact.arrowHeadCircleOutline' },
    { value: 'diamond', label: 'editor.compact.arrowHeadDiamond' },
    { value: 'diamond-outline', label: 'editor.compact.arrowHeadDiamondOutline' },
    { value: 'block', label: 'editor.compact.arrowHeadBlock' },
  ]);
  expect(getTextLayoutModeOptions()).toEqual([
    { value: 'auto', label: 'editor.compact.layoutModeAuto' },
    { value: 'fixed-width', label: 'editor.compact.layoutModeFixedWidth' },
  ]);
  expect(getTextAlignOptions()).toEqual([
    { value: 'left', label: 'editor.compact.textAlignLeft' },
    { value: 'center', label: 'editor.compact.textAlignCenter' },
    { value: 'right', label: 'editor.compact.textAlignRight' },
  ]);
  expect(getTextVerticalAlignOptions()).toEqual([
    { value: 'top', label: 'editor.compact.verticalAlignTop' },
    { value: 'center', label: 'editor.compact.verticalAlignCenter' },
    { value: 'bottom', label: 'editor.compact.verticalAlignBottom' },
  ]);
});

it('covers the remaining select-option helpers with deterministic labels', () => {
  expect(getArrowModeOptions().map((option) => option.value)).toEqual(['straight', 'curve']);
  expect(getArrowVariantOptions().map((option) => option.value)).toEqual(['standard', 'tapered']);
  expect(getArrowHeadOptions().map((option) => option.value)).toEqual([
    'none',
    'arrow',
    'triangle',
    'triangle-outline',
    'bar',
    'circle',
    'circle-outline',
    'diamond',
    'diamond-outline',
    'block',
  ]);
  expect(getBlurTypeOptions().map((option) => option.value)).toEqual([
    'gaussian',
    'distortion',
    'pixelate',
    'solid',
  ]);
  expect(getTextCalloutFormatOptions()).toHaveLength(6);
  expect(getFontOptions().map((option) => option.value)).toEqual(['sans', 'serif', 'mono']);
  expect(getBrushShapeCorrectionOptions()).toHaveLength(3);
  expect(getStepTypeOptions().map((option) => option.value)).toEqual([
    'number',
    'letter',
    'manual',
  ]);
  expect(getStepAlphabetOptions().map((option) => option.value)).toEqual(['cyrillic', 'latin']);
  expect(getBrowserCanvasModeOptions().map((option) => option.value)).toEqual([
    'resize',
    'keep-size',
  ]);
  expect(getBrowserContentModeOptions().map((option) => option.value)).toEqual([
    'push-down',
    'fit-content',
  ]);
  expect(getFrameBackgroundModeOptions().map((option) => option.value)).toEqual([
    'color',
    'gradient',
    'image',
  ]);
  expect(getFrameLayoutModeOptions().map((option) => option.value)).toEqual([
    'expand-canvas',
    'fit-image',
  ]);
});
