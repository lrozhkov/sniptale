// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlighterSectionContentProps } from './types';

const { borderPresetEditorPropsSpy, calloutPropsSpy, effectsPanelPropsSpy, presetsPanelPropsSpy } =
  vi.hoisted(() => ({
    borderPresetEditorPropsSpy: vi.fn(),
    calloutPropsSpy: vi.fn(),
    effectsPanelPropsSpy: vi.fn(),
    presetsPanelPropsSpy: vi.fn(),
  }));

vi.mock('../callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../callout-presets')>()),
  CalloutPresetCatalogSettings: (props: unknown) => {
    calloutPropsSpy(props);
    return <div data-testid="callout-presets">callouts</div>;
  },
}));

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('./effects-panel', () => ({
  HighlighterEffectsPanel: (props: unknown) => {
    effectsPanelPropsSpy(props);
    return <div data-testid="effects-panel">effects</div>;
  },
}));

vi.mock('./presets-panel', () => ({
  HighlighterPresetsPanel: (props: unknown) => {
    presetsPanelPropsSpy(props);
    return <div data-testid="presets-panel">presets</div>;
  },
}));

vi.mock('../../../../ui/highlighter-preset-editor', () => ({
  BorderPresetEditor: (props: unknown) => {
    borderPresetEditorPropsSpy(props);
    return <div data-testid="border-preset-editor">editor</div>;
  },
}));

import { HighlighterSectionContent } from './content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderComponent(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

function createPreset() {
  return {
    id: 'preset-1',
    name: 'Glow',
    order: 0,
    width: 4,
    color: '#ff6600',
    style: 'solid' as const,
    radius: 6,
    padding: { top: 2, right: 3, bottom: 4, left: 5 },
    shadow: 30,
    opacity: 80,
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    strokeOpacity: 100,
  };
}

function createProps() {
  const preset = createPreset();
  const presets: HighlighterSectionContentProps['presets'] = {
    draggedId: null,
    dragOverId: null,
    editingPreset: preset,
    hoveredPresetId: null,
    handleAddPreset: vi.fn(),
    handleCloseEditor: vi.fn(),
    handleDeletePreset: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragStart: vi.fn(),
    handleDrop: vi.fn(),
    handleEditPreset: vi.fn(),
    handlePresetHoverChange: vi.fn(),
    handleResetPreset: vi.fn(),
    handleSavePreset: vi.fn(),
    handleSetDefaultPreset: vi.fn(),
    handleTogglePresetEnabled: vi.fn(),
    isEditorOpen: true,
  };
  const calloutPresets: HighlighterSectionContentProps['calloutPresets'] = {
    actions: {
      add: vi.fn(),
      closeEditor: vi.fn(),
      delete: vi.fn(),
      dragEnd: vi.fn(),
      dragLeave: vi.fn(),
      dragOver: vi.fn(),
      dragStart: vi.fn(),
      drop: vi.fn(),
      edit: vi.fn(),
      hover: vi.fn(),
      reset: vi.fn(),
      save: vi.fn(),
      setDefault: vi.fn(),
      toggle: vi.fn(),
    },
    catalog: null,
    draggedId: null,
    dragOverId: null,
    editor: { isOpen: false },
    error: false,
    hoveredId: null,
    isLoading: false,
    isSaving: false,
  };
  const settings: HighlighterSectionContentProps['settings'] = {
    borderPresets: [preset],
    defaultBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
    defaultBorderPresetId: preset.id,
    defaultEffectMode: 'border',
    defaultFocusSettings: { opacity: 0.5, showBorder: false },
    systemPresetCatalogRevision: 1,
  };

  return {
    preset,
    props: {
      calloutPresets,
      effects: {
        handleUpdateBlurSettings: vi.fn(),
        handleUpdateFocusSettings: vi.fn(),
      },
      presets,
      settings,
    } satisfies HighlighterSectionContentProps,
    presets,
  };
}

function verifyRenderedState({ preset, presets, props }: ReturnType<typeof createProps>) {
  expect(container?.textContent).toContain('settings.navigation.highlighter');
  expect(container?.textContent).toContain('highlighter.section.subtitle');
  expect(presetsPanelPropsSpy).toHaveBeenCalledWith({
    presets: props.presets,
    settings: props.settings,
  });
  expect(effectsPanelPropsSpy).toHaveBeenCalledWith({
    effects: props.effects,
    settings: props.settings,
  });
  expect(calloutPropsSpy).toHaveBeenCalledWith({ controller: props.calloutPresets });
  expect(borderPresetEditorPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      isOpen: true,
      onSave: presets.handleSavePreset,
      preset,
    })
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  borderPresetEditorPropsSpy.mockReset();
  calloutPropsSpy.mockReset();
  effectsPanelPropsSpy.mockReset();
  presetsPanelPropsSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('HighlighterSectionContent', () => {
  it('renders section copy, delegates panels, and closes the editor through state', async () => {
    const rendered = createProps();

    await renderComponent(<HighlighterSectionContent {...rendered.props} />);

    verifyRenderedState(rendered);

    const borderProps = borderPresetEditorPropsSpy.mock.calls[0]?.[0] as {
      onClose: () => void;
    };
    borderProps.onClose();

    expect(rendered.presets.handleCloseEditor).toHaveBeenCalledOnce();
  });

  it('omits the preset prop when the editor is open for a new preset', async () => {
    const rendered = createProps();
    const props = {
      ...rendered.props,
      presets: {
        ...rendered.presets,
        editingPreset: undefined,
      },
    } as unknown as Parameters<typeof HighlighterSectionContent>[0];

    await renderComponent(<HighlighterSectionContent {...props} />);

    expect(borderPresetEditorPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        onSave: rendered.presets.handleSavePreset,
      })
    );
    expect(borderPresetEditorPropsSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty('preset');
  });
});
