// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../../../features/editor/presets/preview', () => ({
  renderBorderPresetPreview: () => <span data-testid="border-preview">border</span>,
  renderEditorPresetPreview: () => <span data-testid="editor-preview">editor</span>,
}));

import { EditorSectionContent } from './content';

type EditorSectionState = Parameters<typeof EditorSectionContent>[0]['state'];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createEditorPresetState() {
  return {
    pencil: { defaultPresetId: 'pencil-default', presets: [] },
    highlighter: { defaultPresetId: 'highlighter-default', presets: [] },
    ellipse: { defaultPresetId: 'ellipse-default', presets: [] },
    arrow: { defaultPresetId: 'arrow-default', presets: [] },
    text: { defaultPresetId: 'text-default', presets: [] },
    step: { defaultPresetId: 'step-default', presets: [] },
    sceneBackground: { defaultPresetId: 'scene-default', presets: [] },
    palette: {
      shapeStroke: ['#111111', '#222222'],
      shapeFill: ['#333333'],
      textColor: ['#444444'],
      textBackground: ['#555555'],
      sceneBackground: ['#666666'],
    },
  };
}

function createState(overrides: Partial<EditorSectionState> = {}): EditorSectionState {
  return {
    borderPresetState: { borderPresets: [], defaultBorderPresetId: 'border-default' },
    currentDefaultPresetId: 'other-preset',
    currentPresets: [
      {
        id: 'pencil-default',
        name: 'Pencil',
        enabled: true,
        isSystemDefault: false,
        order: 0,
        settings: {},
      },
    ],
    draggedColorIndex: null,
    draggedPresetId: null,
    dragOverColorIndex: null,
    dragOverPresetId: null,
    editorPresetState: createEditorPresetState(),
    paletteColors: ['#111111', '#222222'],
    paletteKey: 'shapeStroke',
    presetOwner: 'pencil',
    setPaletteKey: vi.fn(),
    setPresetOwner: vi.fn(),
    handleDeletePreset: vi.fn(async () => undefined),
    handleMakeDefaultPreset: vi.fn(async () => undefined),
    handlePaletteColorChange: vi.fn(async () => undefined),
    handlePaletteDragEnd: vi.fn(),
    handlePaletteDragOver: vi.fn(),
    handlePaletteDragStart: vi.fn(),
    handlePaletteDrop: vi.fn(async () => undefined),
    handlePresetDragEnd: vi.fn(),
    handlePresetDragOver: vi.fn(),
    handlePresetDragStart: vi.fn(),
    handlePresetDrop: vi.fn(async () => undefined),
    handleTogglePresetEnabled: vi.fn(async () => undefined),
    ...overrides,
  } as EditorSectionState;
}

async function renderWithState(state: EditorSectionState) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<EditorSectionContent state={state} />);
  });
}

function findButton(title: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.title === title
  );
}

async function triggerPrimaryInteractions() {
  const presetButtons = Array.from(container?.querySelectorAll('button') ?? []);
  const colorInput = container?.querySelector<HTMLInputElement>('input[type="color"]');

  await act(async () => {
    presetButtons[1]?.click();
    findButton('editor.compact.workspaceMakeDefault')?.click();
    findButton('common.actions.delete')?.click();
    colorInput?.dispatchEvent(new Event('input', { bubbles: true }));
    colorInput?.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EditorSectionContent', () => {
  it('renders preset and palette managers and forwards row interactions', async () => {
    const state = createState();

    await renderWithState(state);

    expect(container?.textContent).toContain('settings.navigation.editor');
    expect(container?.textContent).toContain('settings.editor.toolPresetsTitle');
    expect(container?.textContent).toContain('settings.editor.paletteTitle');

    await triggerPrimaryInteractions();

    expect(state.setPresetOwner).toHaveBeenCalled();
    expect(state.handleMakeDefaultPreset).toHaveBeenCalledWith('pencil-default');
    expect(state.handleDeletePreset).toHaveBeenCalledWith('pencil-default');
  });

  it('renders rectangle presets with the shared border preview owner', async () => {
    await renderWithState(
      createState({
        currentDefaultPresetId: 'border-default',
        currentPresets: [
          {
            id: 'border-default',
            name: 'Border',
            enabled: true,
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
        ] as never,
        presetOwner: 'rectangle',
      })
    );

    expect(container?.querySelector('[data-testid="border-preview"]')).not.toBeNull();
  });
});
