import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      local: {
        get: mocks.storageGet,
        set: mocks.storageSet,
      },
    },
  })
);

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  AspectToggle,
  clampGridSize,
  DimensionInput,
  getArrowHeadOptions,
  getArrowModeOptions,
  getArrowVariantOptions,
  getBrowserCanvasModeOptions,
  getBrowserContentModeOptions,
  getFontOptions,
  getFrameBackgroundImageFitOptions,
  getFrameBackgroundModeOptions,
  getFrameGradientPresets,
  getFrameLayoutModeOptions,
  getStepAlphabetOptions,
  getStepTypeOptions,
  getTextCalloutFormatOptions,
  loadRecentColors,
  pushRecentColor,
  toNumber,
} from './';

it('re-exports the canonical sidebar-shared surface', () => {
  expect(AspectToggle).toBeDefined();
  expect(DimensionInput).toBeDefined();
  expect(typeof toNumber).toBe('function');
  expect(getFrameGradientPresets()).toHaveLength(6);
  expect(getTextCalloutFormatOptions().map((option) => option.value)).toEqual([
    'plain',
    'panel',
    'bubble',
    'pointer',
    'flag',
    'arrow-bubble',
  ]);
});

it('builds the editor option catalogs with translated labels', () => {
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
  expect(getFontOptions().map((option) => option.value)).toEqual(['sans', 'serif', 'mono']);
  expect(getStepTypeOptions().map((option) => option.value)).toEqual([
    'number',
    'letter',
    'manual',
  ]);
  expect(getStepAlphabetOptions().map((option) => option.value)).toEqual(['cyrillic', 'latin']);
});

it('builds browser, frame, and workspace option catalogs', () => {
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
  expect(getFrameBackgroundImageFitOptions().map((option) => option.value)).toEqual([
    'cover',
    'contain',
    'stretch',
    'tile',
    'fit-width',
    'fit-height',
  ]);
});

it('normalizes recent colors and clamps grid size', async () => {
  mocks.storageGet.mockResolvedValueOnce({
    sniptale_editor_recent_colors: ['#ABCDEF', '#bad', 42, '#123456'],
  });
  mocks.storageGet.mockResolvedValueOnce({ sniptale_editor_recent_colors: ['#123456'] });
  mocks.storageGet.mockResolvedValueOnce({ sniptale_editor_recent_colors: ['#123456'] });

  await expect(loadRecentColors()).resolves.toEqual(['#abcdef', '#123456']);
  await expect(pushRecentColor('not-a-color')).resolves.toEqual(['#123456']);
  await expect(pushRecentColor('#ABCDEF', 2)).resolves.toEqual(['#abcdef', '#123456']);
  expect(mocks.storageSet).toHaveBeenCalledWith({
    sniptale_editor_recent_colors: ['#abcdef', '#123456'],
  });
  expect(clampGridSize(4)).toBe(8);
  expect(clampGridSize(200)).toBe(160);
  expect(clampGridSize(24.4)).toBe(24);
});
