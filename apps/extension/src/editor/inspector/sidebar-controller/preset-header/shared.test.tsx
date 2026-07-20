// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../../features/editor/document/constants';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  buildPresetOverwriteSavePanelState,
  buildPresetSavePanelState,
  getPresetBaseName,
  getPresetSavePanelControls,
  pickSceneBackgroundSettings,
  resolveActiveToolPresetOwner,
  resolvePresetOverwriteTarget,
  usePresetMatchState,
  usePresetSaveDraft,
} from './shared';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPanelControls() {
  return {
    closeSavePanel: vi.fn(),
    overwriteTargetId: '',
    saveMode: 'create' as const,
    saveName: '  ',
    setOverwriteTargetId: vi.fn(),
    setSaveMode: vi.fn(),
    setSaveName: vi.fn(),
  };
}

function createSceneSettings() {
  return {
    backgroundColor: '#ffffff',
    backgroundGradientAngle: 90,
    backgroundGradientColorStops: [
      { color: '#ffffff', offset: 0 },
      { color: '#000000', offset: 1 },
    ],
    backgroundGradientFrom: '#ffffff',
    backgroundGradientStops: ['#ffffff', '#000000'],
    backgroundGradientTo: '#000000',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'gradient',
    layoutMode: 'fit-image',
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 2,
    sourceImage: {
      ...DEFAULT_EDITOR_IMAGE_SETTINGS,
      opacity: 0.5,
      radius: 8,
      shadow: 20,
      strokeColor: '#123456',
      strokeOpacity: 0.7,
      strokeStyle: 'dash',
      strokeWidth: 2,
    },
    paddingTop: 1,
  };
}

function expectPresetOwnerNames() {
  expect(getPresetBaseName('pencil')).toBe('editor.tools.pencil');
  expect(getPresetBaseName('rectangle')).toBe('editor.tools.rectangle');
  expect(getPresetBaseName('sceneBackground')).toBe('editor.scene.sceneBackgroundTitle');
  expect(getPresetBaseName(null)).toBe('editor.compact.shapePresetFallback');
  expect(resolveActiveToolPresetOwner('diamond')).toBe('rectangle');
  expect(resolveActiveToolPresetOwner('brush')).toBeNull();
  expect(resolveActiveToolPresetOwner('crop')).toBeNull();
}

function expectSceneSettingsSnapshot() {
  expect(pickSceneBackgroundSettings(createSceneSettings() as never)).toEqual(
    expect.objectContaining({
      backgroundGradientColorStops: [
        { color: '#ffffff', offset: 0 },
        { color: '#000000', offset: 1 },
      ],
      backgroundGradientStops: ['#ffffff', '#000000'],
      sourceImage: expect.objectContaining({ opacity: 0.5, radius: 8 }),
    })
  );
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('preset header shared helpers', () => {
  it('builds create and overwrite save panel state', () => {
    const controls = createPanelControls();

    expect(
      buildPresetSavePanelState({
        ...controls,
        onSave: vi.fn(),
        overwriteDisabled: true,
        overwriteOptions: [],
      })
    ).toEqual(expect.objectContaining({ canSave: false, overwriteDisabled: true }));

    expect(
      buildPresetSavePanelState({
        ...controls,
        overwriteTargetId: 'preset-1',
        saveMode: 'overwrite',
        onSave: vi.fn(),
        overwriteDisabled: false,
        overwriteOptions: [{ label: 'Preset', value: 'preset-1' }],
      })
    ).toEqual(expect.objectContaining({ canSave: true, overwriteTargetId: 'preset-1' }));
  });

  it('filters overwrite targets and initializes missing overwrite ids', () => {
    const setOverwriteTargetId = vi.fn();
    const presets = [
      { id: 'system', isSystemDefault: true, name: 'System' },
      { id: 'disabled', enabled: false, name: 'Disabled' },
      { id: 'preset-1', name: 'Preset 1' },
    ];
    const state = buildPresetOverwriteSavePanelState({
      closeSavePanel: vi.fn(),
      onSave: vi.fn(),
      overwriteTargetId: '',
      presets,
      saveMode: 'create',
      saveName: 'Preset',
      setOverwriteTargetId,
      setSaveMode: vi.fn(),
      setSaveName: vi.fn(),
    });

    expect(resolvePresetOverwriteTarget(presets, 'missing')?.id).toBe('preset-1');
    expect(state.overwriteOptions).toEqual([{ label: 'Preset 1', value: 'preset-1' }]);
    state.onModeChange('overwrite');
    expect(setOverwriteTargetId).toHaveBeenCalledWith('preset-1');
  });
});

describe('preset header shared mapping helpers', () => {
  it('maps preset owner names, scene settings, and inactive tools', () => {
    expectPresetOwnerNames();
    expectSceneSettingsSnapshot();
  });
});

describe('preset header shared hook state', () => {
  it('tracks save draft and pending preset matches through hook state', async () => {
    let saveDraft: ReturnType<typeof usePresetSaveDraft> | null = null;
    let matchState: ReturnType<typeof usePresetMatchState<{ color: string }>> | null = null;
    const Harness = (props: { color: string; match?: string }) => {
      saveDraft = usePresetSaveDraft('Template', ['Template 1']);
      matchState = usePresetMatchState({
        currentSettings: { color: props.color },
        matchingPresetId: props.match,
      });
      return null;
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<Harness color="#111111" />));
    act(() => saveDraft?.openSavePanel());
    act(() => matchState?.markClean({ color: '#111111' }, 'preset-1'));

    expect(getPresetSavePanelControls(saveDraft as never).saveName).toBe('Template 2');
    expect((matchState as { selectedPresetId?: string } | null)?.selectedPresetId).toBe('preset-1');

    await act(async () => root?.render(<Harness color="#222222" match="preset-2" />));
    expect((matchState as { selectedPresetId?: string } | null)?.selectedPresetId).toBe('preset-2');
    expect((matchState as { saveDisabled?: boolean } | null)?.saveDisabled).toBe(true);
  });
});
