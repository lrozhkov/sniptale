// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../features/editor/document/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/document/public')>()),
  projectBorderPresetToEditorShapeSettings: (preset: { color: string; id: string }) => ({
    borderPresetId: preset.id,
    strokeColor: preset.color,
    strokeOpacity: 1,
    fillColor: 'transparent',
    fillOpacity: 0,
    customCss: '',
    inheritCustomCss: false,
  }),
}));

vi.mock('../../../../features/editor/presets/display', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/presets/display')>()),
  getEditorPresetDisplayName: (preset: { isSystemDefault?: boolean; name: string }) =>
    preset.isSystemDefault ? 'shared.defaults.defaultEditorPresetName' : preset.name,
}));

vi.mock('../../presets/preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../presets/preview')>()),
  renderBorderPresetPreview: () => <span data-testid="preview" />,
}));

import { useBorderPresetHeader } from './border';
import {
  getPresetSavePanelControls,
  buildPresetSavePanelState,
  getPresetBaseName,
  pickSceneBackgroundSettings,
  resolveActiveToolPresetOwner,
  usePresetMatchState,
  usePresetSaveDraft,
} from './shared';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useBorderPresetHeader> | null = null;
let latestMatchState: ReturnType<typeof usePresetMatchState<{ color: string }>> | null = null;
let latestSaveDraft: ReturnType<typeof usePresetSaveDraft> | null = null;

function Harness() {
  latestState = useBorderPresetHeader({
    applySettings: vi.fn(),
    borderPresets: [
      {
        id: 'system-default',
        name: 'shared.defaults.defaultBorderPresetName',
        order: 0,
        enabled: true,
        isSystemDefault: true,
        color: '#111111',
        width: 4,
        style: 'solid',
        radius: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        shadow: 0,
        opacity: 100,
        strokeOpacity: 100,
        fillColor: '#ffffff',
        fillOpacity: 0,
        inheritCustomCss: false,
        customCss: '',
      },
    ],
    currentSettings: { strokeColor: '#111111', strokeOpacity: 1, fillOpacity: 0 } as never,
    defaultBorderPresetId: 'system-default',
  });
  return null;
}

function SharedHarness(props: { matchingPresetId?: string; presetNames?: readonly string[] }) {
  latestMatchState = usePresetMatchState({
    currentSettings: { color: 'red' },
    matchingPresetId: props.matchingPresetId,
  });
  latestSaveDraft = usePresetSaveDraft('Preset', props.presetNames ?? ['Preset 1']);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  latestMatchState = null;
  latestSaveDraft = null;
  vi.unstubAllGlobals();
});

async function renderSharedHarness(props: Parameters<typeof SharedHarness>[0] = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<SharedHarness {...props} />);
  });
}

async function renderBorderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<Harness />);
  });
}

function createSaveDraft() {
  return {
    closeSavePanel: vi.fn(),
    overwriteTargetId: 'preset-1',
    saveMode: 'create' as const,
    saveName: 'New preset',
    setOverwriteTargetId: vi.fn(),
    setSaveMode: vi.fn(),
    setSaveName: vi.fn(),
  };
}

function expectCreatableSavePanel(saveDraft: ReturnType<typeof createSaveDraft>) {
  expect(
    buildPresetSavePanelState({
      ...getPresetSavePanelControls(saveDraft as never),
      onSave: vi.fn(),
      overwriteDisabled: false,
      overwriteOptions: [{ label: 'Preset 1', value: 'preset-1' }],
    })
  ).toEqual(expect.objectContaining({ canSave: true, mode: 'create' }));
}

function expectDisabledSavePanels(saveDraft: ReturnType<typeof createSaveDraft>) {
  expect(
    buildPresetSavePanelState({
      ...getPresetSavePanelControls({ ...saveDraft, saveName: '' } as never),
      onSave: vi.fn(),
      overwriteDisabled: false,
      overwriteOptions: [],
    })
  ).toEqual(expect.objectContaining({ canSave: false, mode: 'create' }));
  expect(
    buildPresetSavePanelState({
      ...getPresetSavePanelControls({ ...saveDraft, saveMode: 'overwrite', saveName: '' } as never),
      onSave: vi.fn(),
      overwriteDisabled: true,
      overwriteOptions: [],
    })
  ).toEqual(expect.objectContaining({ canSave: false, overwriteHint: expect.any(String) }));
}

function expectSceneBackgroundSnapshot() {
  expect(
    pickSceneBackgroundSettings({
      backgroundColor: '#ffffff',
      backgroundGradientAngle: 45,
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#000000',
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      backgroundMode: 'color',
      layoutMode: 'fit-image',
      paddingBottom: 4,
      paddingLeft: 3,
      paddingRight: 2,
      paddingTop: 1,
    })
  ).toEqual(expect.objectContaining({ paddingTop: 1, backgroundMode: 'color' }));
}

describe('useBorderPresetHeader display labels', () => {
  it('projects the generic editor system label for rectangle templates', async () => {
    await renderBorderHarness();

    expect(latestState?.templates.map((template) => template.label)).toEqual([
      'shared.defaults.defaultEditorPresetName',
    ]);
    expect(latestState?.groups?.map((group) => [group.id, group.templates.length])).toEqual([
      ['system', 1],
      ['user', 0],
    ]);
  });

  it('does not expose a preset owner for the shape library browser tool', () => {
    expect(resolveActiveToolPresetOwner('shapes-and-lines')).toBeNull();
    expect(resolveActiveToolPresetOwner('shape-library')).toBeNull();
    expect(resolveActiveToolPresetOwner('brush')).toBeNull();
    expect(resolveActiveToolPresetOwner('callout')).toBeNull();
    expect(resolveActiveToolPresetOwner('diamond')).toBe('rectangle');
    expect(resolveActiveToolPresetOwner('pencil')).toBe('pencil');
    expect(resolveActiveToolPresetOwner('arrow')).toBe('arrow');
    expect(getPresetBaseName('rectangle')).toBe('Прямоугольник');
    expect(getPresetBaseName('sceneBackground')).toBe('Фон сцены');
    expect(getPresetBaseName(null)).toBe('Пресет');
  });
});

describe('preset header shared save state', () => {
  it('builds save panel state and scene background snapshots', () => {
    const saveDraft = createSaveDraft();

    expectCreatableSavePanel(saveDraft);
    expectDisabledSavePanels(saveDraft);
    expectSceneBackgroundSnapshot();
  });
});

describe('preset header shared match state', () => {
  it('tracks clean preset matches and save draft defaults', async () => {
    await renderSharedHarness();

    act(() => {
      latestMatchState?.markClean({ color: 'red' }, 'preset-clean');
      latestSaveDraft?.openSavePanel();
    });

    expect(latestMatchState?.selectedPresetId).toBe('preset-clean');
    expect(latestMatchState?.saveDisabled).toBe(true);
    expect(latestSaveDraft?.savePanelOpen).toBe(true);
    expect(latestSaveDraft?.saveName).toBe('Preset 2');

    await act(async () => {
      root?.render(<SharedHarness matchingPresetId="preset-current" />);
    });

    expect(latestMatchState?.selectedPresetId).toBe('preset-current');
    expect(latestMatchState?.saveDisabled).toBe(true);
  });
});
