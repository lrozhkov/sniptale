// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  createDefaultEditorPresetStorageState: vi.fn(),
  deleteBorderPreset: vi.fn(async () => true),
  deleteEditorPreset: vi.fn(async () => true),
  loadEditorPresetState: vi.fn(),
  loadHighlighterSettings: vi.fn(),
  saveEditorPaletteSettings: vi.fn(async () => undefined),
  setBorderPresetEnabled: vi.fn(async () => undefined),
  setDefaultBorderPreset: vi.fn(async () => undefined),
  setDefaultEditorPreset: vi.fn(async () => undefined),
  setEditorPresetEnabled: vi.fn(async () => undefined),
  subscribeToEditorPresetState: vi.fn(() => () => undefined),
  subscribeToHighlighterSettings: vi.fn(() => () => undefined),
  updateBorderPresetsOrder: vi.fn(async () => undefined),
  updateEditorPresetOrder: vi.fn(async () => undefined),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  DEFAULT_BORDER_PRESET: {
    id: 'system-default',
    name: 'Default',
    enabled: true,
    isSystemDefault: true,
    order: 0,
    width: 3,
    color: '#ff6600',
    style: 'solid',
    radius: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    shadow: 0,
    opacity: 100,
    strokeOpacity: 100,
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    customCss: '',
  },
  deleteBorderPreset: storageMocks.deleteBorderPreset,
  loadHighlighterSettings: storageMocks.loadHighlighterSettings,
  setBorderPresetEnabled: storageMocks.setBorderPresetEnabled,
  setDefaultBorderPreset: storageMocks.setDefaultBorderPreset,
  subscribeToHighlighterSettings: storageMocks.subscribeToHighlighterSettings,
  updateBorderPresetsOrder: storageMocks.updateBorderPresetsOrder,
}));

vi.mock('../../../composition/persistence/editor-presets', async (importOriginal) => ({
  ...(await importOriginal()),
  createDefaultEditorPresetStorageState: storageMocks.createDefaultEditorPresetStorageState,
  deleteEditorPreset: storageMocks.deleteEditorPreset,
  loadEditorPresetState: storageMocks.loadEditorPresetState,
  saveEditorPaletteSettings: storageMocks.saveEditorPaletteSettings,
  setDefaultEditorPreset: storageMocks.setDefaultEditorPreset,
  setEditorPresetEnabled: storageMocks.setEditorPresetEnabled,
  subscribeToEditorPresetState: storageMocks.subscribeToEditorPresetState,
  updateEditorPresetOrder: storageMocks.updateEditorPresetOrder,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: toastErrorMock,
  },
}));

import { useEditorSection } from './controller';

let container: HTMLDivElement | null = null;
let latestState: ReturnType<typeof useEditorSection> | null = null;
let root: Root | null = null;

function Harness() {
  latestState = useEditorSection();
  return null;
}

function createEditorPresetState() {
  return {
    pencil: {
      defaultPresetId: 'pencil-default',
      presets: [{ id: 'pencil-default', name: 'Pencil', enabled: true, order: 0, settings: {} }],
    },
    highlighter: {
      defaultPresetId: 'highlighter-default',
      presets: [
        { id: 'highlighter-default', name: 'Highlighter', enabled: true, order: 0, settings: {} },
      ],
    },
    ellipse: {
      defaultPresetId: 'ellipse-default',
      presets: [{ id: 'ellipse-default', name: 'Ellipse', enabled: true, order: 0, settings: {} }],
    },
    arrow: {
      defaultPresetId: 'arrow-default',
      presets: [{ id: 'arrow-default', name: 'Arrow', enabled: true, order: 0, settings: {} }],
    },
    text: {
      defaultPresetId: 'text-default',
      presets: [{ id: 'text-default', name: 'Text', enabled: true, order: 0, settings: {} }],
    },
    step: {
      defaultPresetId: 'step-default',
      presets: [{ id: 'step-default', name: 'Step', enabled: true, order: 0, settings: {} }],
    },
    sceneBackground: {
      defaultPresetId: 'scene-default',
      presets: [{ id: 'scene-default', name: 'Scene', enabled: true, order: 0, settings: {} }],
    },
    palette: {
      shapeStroke: ['#111111', '#222222'],
      shapeFill: ['#333333'],
      textColor: ['#444444'],
      textBackground: ['#555555'],
      sceneBackground: ['#666666'],
    },
  };
}

function createHighlighterSettings() {
  return {
    borderPresets: [
      {
        id: 'border-default',
        name: 'Border',
        enabled: true,
        order: 0,
        width: 3,
        color: '#ff6600',
        style: 'solid' as const,
        radius: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        shadow: 0,
        opacity: 100,
        strokeOpacity: 100,
        fillColor: '#00000000',
        fillOpacity: 0,
        inheritCustomCss: false,
        customCss: '',
      },
    ],
    defaultBorderPresetId: 'border-default',
  };
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  storageMocks.createDefaultEditorPresetStorageState.mockReturnValue(createEditorPresetState());
  storageMocks.loadEditorPresetState.mockResolvedValue(createEditorPresetState());
  storageMocks.loadHighlighterSettings.mockResolvedValue(createHighlighterSettings());
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('useEditorSection', () => {
  it('loads editor presets and switches the managed family', async () => {
    await renderHarness();

    expect(latestState?.currentDefaultPresetId).toBe('pencil-default');

    act(() => {
      latestState?.setPresetOwner('rectangle');
    });

    expect(latestState?.currentDefaultPresetId).toBe('border-default');
    expect(latestState?.currentPresets[0]?.id).toBe('border-default');
    expect(storageMocks.subscribeToEditorPresetState).toHaveBeenCalledTimes(1);
    expect(storageMocks.subscribeToHighlighterSettings).toHaveBeenCalledTimes(1);
  });
});

describe('useEditorSection action routing', () => {
  it('routes preset and palette actions through the correct storage owners', async () => {
    await renderHarness();

    await act(async () => {
      await latestState?.handleTogglePresetEnabled('pencil-default', false);
      await latestState?.handleMakeDefaultPreset('pencil-default');
      await latestState?.handleDeletePreset('pencil-default');
      latestState?.handlePresetDragStart('pencil-default');
    });

    await act(async () => {
      await latestState?.handlePresetDrop('pencil-default');
      await latestState?.handlePaletteColorChange(0, '#abcdef');
      latestState?.handlePaletteDragStart(0);
    });

    await act(async () => {
      await latestState?.handlePaletteDrop(1);
    });

    expect(storageMocks.setEditorPresetEnabled).toHaveBeenCalledWith(
      'pencil',
      'pencil-default',
      false
    );
    expect(storageMocks.setDefaultEditorPreset).toHaveBeenCalledWith('pencil', 'pencil-default');
    expect(storageMocks.deleteEditorPreset).toHaveBeenCalledWith('pencil', 'pencil-default');
    expect(storageMocks.saveEditorPaletteSettings).toHaveBeenCalledTimes(2);

    act(() => {
      latestState?.setPresetOwner('rectangle');
    });

    await act(async () => {
      await latestState?.handleTogglePresetEnabled('border-default', false);
      await latestState?.handleMakeDefaultPreset('border-default');
      await latestState?.handleDeletePreset('border-default');
    });

    expect(storageMocks.setBorderPresetEnabled).toHaveBeenCalledWith('border-default', false);
    expect(storageMocks.setDefaultBorderPreset).toHaveBeenCalledWith('border-default');
    expect(storageMocks.deleteBorderPreset).toHaveBeenCalledWith('border-default');
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
