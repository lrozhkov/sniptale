import { beforeEach, expect, it, vi } from 'vitest';
import type { ImageEditorController } from '../../controller';

const fileMocks = vi.hoisted(() => ({
  assertReadable: vi.fn(),
  readDataUrl: vi.fn(async () => 'data:image/png;base64,abc'),
}));

vi.mock('../../document/file-actions/file-reader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/file-actions/file-reader')>()),
  readFileAsDataUrl: fileMocks.readDataUrl,
}));
vi.mock('../../document/file-actions/raster-intake', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/file-actions/raster-intake')>()),
  assertEditorRasterImageFileCanBeRead: fileMocks.assertReadable,
}));

import { buildSidebarBackgroundActions } from './background';
import { buildSidebarUtilityActions, createStaticSidebarOptions } from './actions.helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

it('builds static choices and applies uniform padding through the frame draft owner', () => {
  const setFrameDraft = vi.fn();
  const controller: Pick<
    ImageEditorController,
    'exportDocument' | 'renderToDataUrl' | 'withHistoryMuted'
  > = {
    exportDocument: () => {
      throw new Error('not used by this test');
    },
    renderToDataUrl: () => 'data:image/png;base64,abc',
    withHistoryMuted: <T>(callback: () => T) => callback(),
  };
  const options = createStaticSidebarOptions();
  const actions = buildSidebarUtilityActions({
    controller,
    confirmOpenStorageManager: vi.fn(),
    defaultImagePresetId: null,
    hasImage: true,
    rememberRecentColor: vi.fn(),
    savePresets: [],
    setFrameDraft,
    syncBrowserFrame: vi.fn(),
  });

  actions.setUniformPadding(7.6);
  const update = setFrameDraft.mock.calls[0]?.[0] as (state: Record<string, unknown>) => unknown;

  expect(options.browserCanvasModeOptions.length).toBeGreaterThan(0);
  expect(options.gridSizeMax).toBeGreaterThan(options.gridSizeMin);
  expect(update({ backgroundMode: 'solid' })).toEqual({
    backgroundMode: 'solid',
    paddingBottom: 8,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 8,
  });
});

it('owns background gradient, image upload, clearing, and browser synchronization', async () => {
  let frame = {
    backgroundColor: '#000000',
    backgroundGradientAngle: 0,
    backgroundGradientColorStops: [],
    backgroundGradientFrom: '#111111',
    backgroundGradientStops: [],
    backgroundGradientTo: '#222222',
    backgroundImageData: 'old',
    backgroundMode: 'solid',
  };
  const setFrameDraft = vi.fn((update: (state: typeof frame) => typeof frame) => {
    frame = update(frame);
  });
  const syncBrowserFrame = vi.fn(async () => undefined);
  const actions = buildSidebarBackgroundActions({ setFrameDraft, syncBrowserFrame } as never);

  actions.applyGradientPreset({ angle: 45, from: '#aaaaaa', to: '#bbbbbb' } as never);
  expect(frame).toMatchObject({ backgroundGradientAngle: 45, backgroundMode: 'gradient' });
  actions.clearBackgroundImage();
  expect(frame.backgroundImageData).toBeNull();
  await actions.handleBackgroundImageUpload(undefined);
  expect(fileMocks.readDataUrl).not.toHaveBeenCalled();

  const file = { name: 'background.png' } as File;
  await actions.handleBackgroundImageUpload(file);
  expect(fileMocks.assertReadable).toHaveBeenCalledWith(file);
  expect(frame).toMatchObject({
    backgroundImageData: 'data:image/png;base64,abc',
    backgroundMode: 'image',
  });

  await actions.syncBrowserFrame({ enabled: true });
  expect(syncBrowserFrame).toHaveBeenCalledWith({ enabled: true });
});
