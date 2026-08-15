// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  buildPresetOverwriteSavePanelState,
  getPresetBaseName,
  getPresetSavePanelControls,
  pickSceneBackgroundSettings,
  resolvePresetOverwriteTarget,
  usePresetMatchState,
  usePresetSaveDraft,
} from './shared';

function renderHook<T>(useValue: () => T) {
  let value: T | undefined;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    value = useValue();
    return null;
  }
  act(() => root.render(<Harness />));
  return {
    get value() {
      return value!;
    },
    root,
  };
}

it('filters overwrite candidates and composes enabled and disabled save panels', () => {
  const controls = {
    closeSavePanel: vi.fn(),
    overwriteTargetId: '',
    saveMode: 'create' as const,
    saveName: 'New preset',
    setOverwriteTargetId: vi.fn(),
    setSaveMode: vi.fn(),
    setSaveName: vi.fn(),
  };
  const presets = [
    { id: 'system', isSystemDefault: true, name: 'System' },
    { enabled: false, id: 'disabled', name: 'Disabled' },
    { id: 'user', name: 'User', origin: 'user' as const },
  ];

  expect(resolvePresetOverwriteTarget(presets, 'missing')?.id).toBe('user');
  expect(resolvePresetOverwriteTarget(presets, 'user')?.id).toBe('user');
  const enabled = buildPresetOverwriteSavePanelState({ ...controls, onSave: vi.fn(), presets });
  expect(enabled.canSave).toBe(true);
  expect(enabled.overwriteOptions).toEqual([{ label: 'User', value: 'user' }]);
  enabled.onModeChange('overwrite');
  expect(controls.setOverwriteTargetId).toHaveBeenCalledWith('user');

  const disabled = buildPresetOverwriteSavePanelState({
    ...controls,
    onSave: vi.fn(),
    presets: [],
    saveMode: 'overwrite',
    saveName: '',
  });
  expect(disabled.canSave).toBe(false);
  expect(disabled.overwriteHint).toBe('editor.compact.templateOverwriteUnavailableHint');
});

it('projects scene background fields and localized preset base names', () => {
  const settings = pickSceneBackgroundSettings({
    backgroundBlurAmount: 0,
    backgroundColor: '#000000',
    backgroundGradientAngle: 45,
    backgroundGradientColorStops: [],
    backgroundGradientFrom: '#111111',
    backgroundGradientStops: ['#111111', '#222222'],
    backgroundGradientTo: '#222222',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'gradient',
    layoutMode: 'freeform',
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 2,
    paddingTop: 1,
  });

  expect(settings).toMatchObject({ backgroundMode: 'gradient', paddingTop: 1 });
  expect(getPresetBaseName('step')).toBe('editor.tools.step');
  expect(getPresetBaseName('sceneBackground')).toBe('editor.scene.sceneBackgroundTitle');
});

it('owns save draft lifecycle and pending clean match state', () => {
  const draft = renderHook(() => usePresetSaveDraft('Preset', ['Preset 1', 'Preset 2']));
  act(() => draft.value.openSavePanel());
  expect(draft.value.savePanelOpen).toBe(true);
  expect(draft.value.saveName).toBe('Preset 3');
  const controls = getPresetSavePanelControls(draft.value);
  expect(controls.saveMode).toBe('create');
  act(() => controls.closeSavePanel());
  expect(draft.value.savePanelOpen).toBe(false);
  draft.root.unmount();

  const match = renderHook(() =>
    usePresetMatchState({ currentSettings: { color: '#fff' }, matchingPresetId: undefined })
  );
  act(() => match.value.markClean({ color: '#fff' }, 'preset-1'));
  expect(match.value.selectedPresetId).toBe('preset-1');
  expect(match.value.saveDisabled).toBe(true);
  match.root.unmount();
});
