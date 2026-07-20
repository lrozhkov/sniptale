import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../features/editor/document/constants';
import { applySelectionToolSettingsToObjects } from './apply/dispatch';
import { syncSelectionToolSettingsFromObject } from './sync/dispatch';

const updateSelectionImageSettingsMock = vi.hoisted(() => vi.fn());
const storeStateMock = vi.hoisted(() => ({
  includeImageUpdater: true,
  selectionImageSettings: {
    borderPresetId: null,
    opacity: 1,
    radius: 0,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#475569',
    shadowDistance: 4,
    strokeColor: '#475569',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 0,
  },
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: { image: storeStateMock.selectionImageSettings },
      updateSelectionImageSettings: storeStateMock.includeImageUpdater
        ? updateSelectionImageSettingsMock
        : undefined,
    }),
  },
}));

beforeEach(() => {
  Object.assign(storeStateMock.selectionImageSettings, DEFAULT_EDITOR_IMAGE_SETTINGS);
  storeStateMock.includeImageUpdater = true;
  updateSelectionImageSettingsMock.mockClear();
});

function createImageStyleObject(sniptaleType: string, sniptaleBackgroundMode?: string) {
  return {
    height: 120,
    sniptaleBackgroundMode,
    sniptaleType,
    set: vi.fn(),
    setCoords: vi.fn(),
    width: 160,
  };
}

it('applies image settings only to image-style raster objects', () => {
  const image = createImageStyleObject('image');
  const sourceImage = createImageStyleObject('source-image');
  const backgroundImage = createImageStyleObject('background', 'image');
  const colorBackground = createImageStyleObject('background', 'color');
  const rectangle = { sniptaleType: 'rectangle', set: vi.fn(), setCoords: vi.fn() };

  applySelectionToolSettingsToObjects(
    [image, sourceImage, backgroundImage, colorBackground, rectangle] as never,
    'image',
    {
      image: {
        ...DEFAULT_EDITOR_IMAGE_SETTINGS,
        opacity: 0.6,
        radius: 12,
        strokeColor: '#123456',
        strokeOpacity: 0.8,
        strokeWidth: 3,
      },
    } as never
  );

  expect(image.set).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.6 }));
  expect(sourceImage.set).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.6 }));
  expect(backgroundImage.set).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.6 }));
  expect(colorBackground.set).not.toHaveBeenCalled();
  expect(rectangle.set).not.toHaveBeenCalled();
});

it.each(['background', 'source-image'] as const)(
  'routes %s selections through image style settings without touching vector objects',
  (selectedType) => {
    const image = {
      height: 120,
      sniptaleBackgroundMode: selectedType === 'background' ? 'image' : undefined,
      sniptaleType: selectedType,
      set: vi.fn(),
      setCoords: vi.fn(),
      width: 160,
    };
    const rectangle = { sniptaleType: 'rectangle', set: vi.fn(), setCoords: vi.fn() };

    applySelectionToolSettingsToObjects([image, rectangle] as never, selectedType, {
      image: {
        ...DEFAULT_EDITOR_IMAGE_SETTINGS,
        opacity: 0.35,
      },
    } as never);

    expect(image.set).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.35 }));
    expect(rectangle.set).not.toHaveBeenCalled();
  }
);

it('keeps non-image backgrounds as no-op selection targets', () => {
  const background = {
    sniptaleBackgroundMode: 'color',
    sniptaleType: 'background',
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  applySelectionToolSettingsToObjects([background] as never, 'background', {
    image: {
      ...DEFAULT_EDITOR_IMAGE_SETTINGS,
      opacity: 0.35,
    },
  } as never);

  expect(background.set).not.toHaveBeenCalled();
});

it('syncs missing image metadata from defaults instead of previous selected layer settings', () => {
  Object.assign(storeStateMock.selectionImageSettings, {
    opacity: 0.22,
    radius: 33,
    shadow: 80,
    strokeColor: '#ff0000',
    strokeWidth: 9,
  });

  syncSelectionToolSettingsFromObject({ sniptaleType: 'image' } as never, 'image');

  expect(updateSelectionImageSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      opacity: DEFAULT_EDITOR_IMAGE_SETTINGS.opacity,
      radius: DEFAULT_EDITOR_IMAGE_SETTINGS.radius,
      shadow: DEFAULT_EDITOR_IMAGE_SETTINGS.shadow,
      strokeColor: DEFAULT_EDITOR_IMAGE_SETTINGS.strokeColor,
      strokeWidth: DEFAULT_EDITOR_IMAGE_SETTINGS.strokeWidth,
    })
  );
});

it('syncs explicit image border metadata without using Fabric stroke fallback', () => {
  syncSelectionToolSettingsFromObject(
    {
      sniptaleImageStrokeColor: '#abcdef',
      sniptaleImageStrokeOpacity: 0.25,
      sniptaleImageStrokeWidth: 5,
      sniptaleType: 'image',
      stroke: '#000000',
    } as never,
    'image'
  );

  expect(updateSelectionImageSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      strokeColor: '#abcdef',
      strokeOpacity: 0.25,
      strokeWidth: 5,
    })
  );
});

it('skips image sync when the selection store does not expose an image updater', () => {
  storeStateMock.includeImageUpdater = false;

  syncSelectionToolSettingsFromObject({ sniptaleType: 'image' } as never, 'image');

  expect(updateSelectionImageSettingsMock).not.toHaveBeenCalled();
});
