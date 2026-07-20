import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorShapeSettings } from '../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { MAX_EDITOR_RASTER_IMAGE_FILE_BYTES } from '../../document/file-actions/raster-intake';

const { readFileAsDataUrlMock } = vi.hoisted(() => ({
  readFileAsDataUrlMock: vi.fn(),
}));

vi.mock('../sidebar-shared', async () => {
  const actual = await vi.importActual<typeof import('../sidebar-shared')>('../sidebar-shared');

  return {
    ...actual,
    readFileAsDataUrl: readFileAsDataUrlMock,
  };
});

import { buildSidebarBackgroundActions } from './background';

type PresetTarget = (patch: {
  shape: Partial<EditorShapeSettings>;
  step: Partial<EditorToolSettings['step']>;
}) => void;

beforeEach(() => {
  vi.clearAllMocks();
});

function createBackgroundActions(overrides: { preset?: PresetTarget } = {}) {
  const setFrameDraft = vi.fn();
  const syncBrowserFrame = vi.fn(async () => undefined);
  const targets: {
    preset?: PresetTarget;
    shape: (patch: Partial<EditorShapeSettings>) => void;
    step: (patch: Partial<EditorToolSettings['step']>) => void;
  } = {
    shape: vi.fn(),
    step: vi.fn(),
  };
  if (overrides.preset) {
    targets.preset = overrides.preset;
  }

  return {
    actions: buildSidebarBackgroundActions({
      borderPresets: [DEFAULT_BORDER_PRESET],
      setFrameDraft,
      syncBrowserFrame,
      targets,
    }),
    setFrameDraft,
    syncBrowserFrame,
    targets,
  };
}

function createSizedImageFile(size: number, name = 'background.png', type = 'image/png'): File {
  const file = new File(['image'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function registerPresetTargetFallbackTests() {
  it('applies presets and gradient/background mutations through explicit frame draft updates', async () => {
    const { actions, setFrameDraft, targets } = createBackgroundActions();

    actions.applyPreset(DEFAULT_BORDER_PRESET.id);
    actions.applyPreset('missing-preset');
    actions.applyGradientPreset({
      angle: 45,
      from: '#111111',
      id: 'gradient',
      label: 'Gradient',
      to: '#222222',
    });
    actions.clearBackgroundImage();

    expect(targets.shape).toHaveBeenCalledWith({
      borderPresetId: DEFAULT_BORDER_PRESET.id,
      customCss: '',
      fillColor: DEFAULT_BORDER_PRESET.fillColor,
      fillOpacity: DEFAULT_BORDER_PRESET.fillOpacity / 100,
      inheritCustomCss: false,
      opacity: DEFAULT_BORDER_PRESET.strokeOpacity / 100,
      radius: DEFAULT_BORDER_PRESET.radius,
      shadow: DEFAULT_BORDER_PRESET.shadow,
      shadowAngle: 90,
      shadowBlur: 12,
      shadowColor: DEFAULT_BORDER_PRESET.color,
      shadowDistance: 4,
      strokeColor: DEFAULT_BORDER_PRESET.color,
      strokeOpacity: DEFAULT_BORDER_PRESET.strokeOpacity / 100,
      strokeStyle: DEFAULT_BORDER_PRESET.style,
      strokeWidth: DEFAULT_BORDER_PRESET.width,
    });
    expect(targets.step).toHaveBeenCalledWith({ color: DEFAULT_BORDER_PRESET.color });
    expect(targets.shape).toHaveBeenCalledTimes(1);
    expect(targets.step).toHaveBeenCalledTimes(1);
    expect(setFrameDraft).toHaveBeenCalledTimes(2);
    expect(setFrameDraft.mock.calls[0]?.[0]({ backgroundGradientStops: [] })).toMatchObject({
      backgroundGradientAngle: 45,
      backgroundGradientStops: ['#111111', '#222222'],
      backgroundMode: 'gradient',
    });
  });
}

function registerPortablePresetProjectionTest() {
  it('maps portable preset visuals through the shared editor projector', () => {
    const preset = {
      ...DEFAULT_BORDER_PRESET,
      color: '#f97316',
      fillColor: '#22c55e',
      fillOpacity: 35,
      id: 'preset-shared',
      opacity: 42,
      radius: 12,
      strokeOpacity: 70,
      style: 'dashed' as const,
      width: 6,
    };
    const setFrameDraft = vi.fn();
    const syncBrowserFrame = vi.fn(async () => undefined);
    const targets = {
      shape: vi.fn(),
      step: vi.fn(),
    };
    const actions = buildSidebarBackgroundActions({
      borderPresets: [preset],
      setFrameDraft,
      syncBrowserFrame,
      targets,
    });

    actions.applyPreset(preset.id);

    expect(targets.shape).toHaveBeenCalledWith({
      borderPresetId: 'preset-shared',
      customCss: '',
      fillColor: '#22c55e',
      fillOpacity: 0.35,
      inheritCustomCss: false,
      opacity: 0.7,
      radius: 12,
      shadow: preset.shadow,
      shadowAngle: 90,
      shadowBlur: 12,
      shadowColor: '#f97316',
      shadowDistance: 4,
      strokeColor: '#f97316',
      strokeOpacity: 0.7,
      strokeStyle: 'dashed',
      strokeWidth: 6,
    });
    expect(targets.step).toHaveBeenCalledWith({ color: '#f97316' });
  });
}

function registerCombinedPresetTargetTests() {
  it('routes presets through the combined target when the owner supplies one', () => {
    const preset = vi.fn<PresetTarget>();
    const { actions, targets } = createBackgroundActions({ preset });

    actions.applyPreset(DEFAULT_BORDER_PRESET.id);

    expect(preset).toHaveBeenCalledWith({
      shape: {
        borderPresetId: DEFAULT_BORDER_PRESET.id,
        customCss: '',
        fillColor: DEFAULT_BORDER_PRESET.fillColor,
        fillOpacity: DEFAULT_BORDER_PRESET.fillOpacity / 100,
        inheritCustomCss: false,
        opacity: DEFAULT_BORDER_PRESET.strokeOpacity / 100,
        radius: DEFAULT_BORDER_PRESET.radius,
        shadow: DEFAULT_BORDER_PRESET.shadow,
        shadowAngle: 90,
        shadowBlur: 12,
        shadowColor: DEFAULT_BORDER_PRESET.color,
        shadowDistance: 4,
        strokeColor: DEFAULT_BORDER_PRESET.color,
        strokeOpacity: DEFAULT_BORDER_PRESET.strokeOpacity / 100,
        strokeStyle: DEFAULT_BORDER_PRESET.style,
        strokeWidth: DEFAULT_BORDER_PRESET.width,
      },
      step: { color: DEFAULT_BORDER_PRESET.color },
    });
    expect(targets.shape).not.toHaveBeenCalled();
    expect(targets.step).not.toHaveBeenCalled();
  });
}

function registerBackgroundImageActionTests() {
  it('guards missing uploads and proxies uploaded images and browser sync to the owner seam', async () => {
    const { actions, setFrameDraft, syncBrowserFrame } = createBackgroundActions();
    const file = new File(['image'], 'background.png', { type: 'image/png' });
    readFileAsDataUrlMock.mockResolvedValue('data:image/png;base64,background');

    await actions.handleBackgroundImageUpload(undefined);
    await actions.handleBackgroundImageUpload(file);
    actions.syncBrowserFrame({ enabled: true });

    expect(readFileAsDataUrlMock).toHaveBeenCalledTimes(1);
    expect(readFileAsDataUrlMock).toHaveBeenCalledWith(file);
    expect(setFrameDraft).toHaveBeenCalledTimes(1);
    expect(syncBrowserFrame).toHaveBeenCalledWith({ enabled: true });
  });

  it('rejects oversized background image uploads before read or frame mutation', async () => {
    const { actions, setFrameDraft } = createBackgroundActions();

    await expect(
      actions.handleBackgroundImageUpload(
        createSizedImageFile(MAX_EDITOR_RASTER_IMAGE_FILE_BYTES + 1)
      )
    ).rejects.toThrow('Invalid editor raster image file');

    expect(readFileAsDataUrlMock).not.toHaveBeenCalled();
    expect(setFrameDraft).not.toHaveBeenCalled();
  });

  it('rejects SVG background image uploads before read or frame mutation', async () => {
    const { actions, setFrameDraft } = createBackgroundActions();

    await expect(
      actions.handleBackgroundImageUpload(
        createSizedImageFile(128, 'background.svg', 'image/svg+xml;charset=utf-8')
      )
    ).rejects.toThrow('Invalid editor raster image file');

    expect(readFileAsDataUrlMock).not.toHaveBeenCalled();
    expect(setFrameDraft).not.toHaveBeenCalled();
  });
}

describe('buildSidebarBackgroundActions', () => {
  registerPresetTargetFallbackTests();
  registerPortablePresetProjectionTest();
  registerCombinedPresetTargetTests();
  registerBackgroundImageActionTests();
});
