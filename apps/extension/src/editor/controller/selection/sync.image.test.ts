import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../features/editor/document/constants';

const updateSelectionImageSettingsMock = vi.hoisted(() => vi.fn());
const selectionImageSettingsMock = vi.hoisted(() => ({
  borderPresetId: undefined,
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
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: { image: selectionImageSettingsMock },
      updateSelectionImageSettings: updateSelectionImageSettingsMock,
    }),
  },
}));

vi.mock('../../objects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects')>()),
  isArrowObject: vi.fn(() => false),
}));
vi.mock('../../objects/annotation/blur/object/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object/identity')>()),
  isBlurObject: vi.fn(() => false),
}));

import { syncSelectionToolSettingsFromObject } from './sync/dispatch';

beforeEach(() => {
  Object.assign(selectionImageSettingsMock, DEFAULT_EDITOR_IMAGE_SETTINGS);
  updateSelectionImageSettingsMock.mockClear();
});

it('syncs explicit image layer metadata back into selection settings', () => {
  syncSelectionToolSettingsFromObject(
    {
      sniptaleBorderPresetId: 'image-preset',
      sniptaleImageOpacity: 0.4,
      sniptaleImageRadius: 6,
      sniptaleImageShadow: 20,
      sniptaleImageShadowAngle: 45,
      sniptaleImageShadowBlur: 9,
      sniptaleImageShadowColor: '#abcdef',
      sniptaleImageShadowDistance: 5,
      sniptaleImageStrokeOpacity: 0.5,
      sniptaleImageStrokeStyle: 'dash',
      sniptaleImageStrokeWidth: 3,
      stroke: '#123456',
    } as never,
    'source-image'
  );

  expect(updateSelectionImageSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      borderPresetId: 'image-preset',
      opacity: 0.4,
      radius: 6,
      strokeStyle: 'dash',
      strokeWidth: 3,
    })
  );
});

it('syncs background image metadata through the same image settings owner', () => {
  syncSelectionToolSettingsFromObject(
    {
      sniptaleBackgroundMode: 'image',
      sniptaleImageOpacity: 0.7,
      sniptaleImageRadius: 14,
      sniptaleType: 'background',
      stroke: '#123456',
    } as never,
    'background'
  );

  expect(updateSelectionImageSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      opacity: 0.7,
      radius: 14,
    })
  );
});

it('syncs missing image metadata from defaults instead of previous selected layer settings', () => {
  Object.assign(selectionImageSettingsMock, {
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

it('prefers explicit image border metadata over Fabric stroke fallback', () => {
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

it('does not sync non-image background layers into image settings', () => {
  syncSelectionToolSettingsFromObject(
    {
      sniptaleBackgroundMode: 'color',
      sniptaleType: 'background',
    } as never,
    'background'
  );

  expect(updateSelectionImageSettingsMock).not.toHaveBeenCalled();
});
