// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   row interaction proof intentionally keeps scope and drag branches in one owner-local file */
import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../features/editor/presets/preview', () => ({
  renderBorderPresetPreview: () => <span data-testid="border-preview">border</span>,
  renderEditorPresetPreview: () => <span data-testid="editor-preview">editor</span>,
}));

vi.mock('../../../features/editor/presets/display', () => ({
  getEditorPresetDisplayName: (preset: { isSystemDefault?: boolean; name: string }) =>
    preset.isSystemDefault ? 'shared.defaults.defaultEditorPresetName' : preset.name,
  getEditorSystemPresetDisplayName: (key: string) => key,
}));

vi.mock('../../section-surface/panel-controls', () => ({
  getSettingsHoverActionsClassName: () => 'hover-actions',
  settingsAddButtonClassName: 'add-button',
  settingsCardClassName: 'settings-card',
  settingsDangerIconButtonClassName: 'danger-button',
  settingsEmptyStateClassName: 'empty-state',
  settingsInfoIconButtonClassName: 'info-button',
  settingsListRowClassName: 'settings-row',
  settingsModalFieldSurfaceClassName: 'field-surface',
  settingsNeutralBadgeClassName: 'neutral-badge',
  settingsSuccessBadgeClassName: 'success-badge',
  SettingsDragHandle: () => <span data-testid="drag-handle">drag</span>,
  SettingsRange: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="range" {...props} />
  ),
  SettingsSwitch: (props: Record<string, unknown>) => (
    <button
      type="button"
      data-testid="settings-switch"
      disabled={Boolean(props['disabled'])}
      onClick={() => (props['onClick'] as (() => void) | undefined)?.()}
    >
      {String(props['checked'])}
    </button>
  ),
}));

import type { EditorSectionState, RectanglePreset } from './types';
import { PaletteRow, PaletteScopeSwitch, PresetRow, PresetScopeSwitch } from './rows';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function createEditorPresetState(): EditorSectionState['editorPresetState'] {
  return {
    arrow: { defaultPresetId: 'arrow', presets: [] },
    blur: { defaultPresetId: 'blur', presets: [] },
    ellipse: { defaultPresetId: 'ellipse', presets: [] },
    highlighter: { defaultPresetId: 'highlighter', presets: [] },
    line: { defaultPresetId: 'line', presets: [] },
    palette: {
      sceneBackground: ['#555555'],
      shapeFill: ['#333333'],
      shapeStroke: ['#111111'],
      textBackground: ['#444444'],
      textColor: ['#666666'],
    },
    pencil: { defaultPresetId: 'pencil', presets: [] },
    sceneBackground: { defaultPresetId: 'scene', presets: [] },
    step: { defaultPresetId: 'step', presets: [] },
    text: { defaultPresetId: 'text', presets: [] },
  };
}

function createRectanglePreset(): RectanglePreset {
  return {
    color: '#ff6600',
    customCss: '',
    enabled: false,
    fillColor: '#00000000',
    fillOpacity: 0,
    id: 'border-default',
    inheritCustomCss: false,
    isSystemDefault: true,
    name: 'Border',
    opacity: 100,
    order: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    radius: 0,
    shadow: 0,
    strokeOpacity: 100,
    style: 'solid',
    width: 3,
  };
}

function createPresetState(overrides: Partial<EditorSectionState> = {}): EditorSectionState {
  return {
    borderPresetState: { borderPresets: [], defaultBorderPresetId: 'border-default' },
    currentDefaultPresetId: 'preset-1',
    currentPresets: [
      {
        enabled: true,
        id: 'preset-1',
        isSystemDefault: false,
        name: 'Preset 1',
        order: 0,
        settings: {},
      },
    ],
    draggedColorIndex: null,
    draggedPresetId: null,
    dragOverColorIndex: null,
    dragOverPresetId: null,
    editorPresetState: createEditorPresetState(),
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
    paletteColors: ['#111111'],
    paletteKey: 'shapeStroke',
    presetOwner: 'pencil',
    setPaletteKey: vi.fn(),
    setPresetOwner: vi.fn(),
    ...overrides,
  } as EditorSectionState;
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('settings/editor-section rows', () => {
  it('switches managed preset and palette scopes', async () => {
    const state = createPresetState();

    await renderNode(
      <>
        <PresetScopeSwitch state={state} />
        <PaletteScopeSwitch state={state} />
      </>
    );

    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    expect(buttons[0]?.className).toContain('var(--sniptale-color-surface-hover)_82%');
    expect(buttons[0]?.className).toContain('var(--sniptale-color-accent)_24%');
    await act(async () => {
      buttons[1]?.click();
      buttons.at(-1)?.click();
    });

    expect(state.setPresetOwner).toHaveBeenCalled();
    expect(state.setPaletteKey).toHaveBeenCalled();
  });

  it('renders preset rows for editor and rectangle owners and routes their actions', async () => {
    const editorState = createPresetState({ currentDefaultPresetId: 'other-default' });
    const rectangleState = createPresetState({
      currentPresets: [createRectanglePreset()],
      currentDefaultPresetId: 'border-default',
      dragOverPresetId: 'border-default',
      presetOwner: 'rectangle',
    });

    await renderNode(
      <>
        <PresetRow preset={editorState.currentPresets[0]!} state={editorState} />
        <PresetRow preset={rectangleState.currentPresets[0]!} state={rectangleState} />
      </>
    );

    expect(container?.querySelector('[data-testid="editor-preview"]')).not.toBeNull();
    expect(container?.querySelector('[data-testid="border-preview"]')).not.toBeNull();
    expect(container?.textContent).toContain('highlighter.section.defaultBadge');
    expect(container?.textContent).toContain('highlighter.section.systemBadge');
    expect(container?.textContent).toContain('shared.defaults.defaultEditorPresetName');
    expect(container?.querySelector('.line-clamp-2')).not.toBeNull();

    const switchButtons = Array.from(
      container?.querySelectorAll<HTMLButtonElement>('[data-testid="settings-switch"]') ?? []
    );
    const titleButtons = Array.from(
      container?.querySelectorAll<HTMLButtonElement>('button[title]') ?? []
    );

    await act(async () => {
      switchButtons[0]?.click();
      const firstRow = container?.querySelectorAll('[draggable="true"]')[0] as HTMLElement;
      firstRow.dispatchEvent(new Event('dragstart', { bubbles: true }));
      firstRow.dispatchEvent(new Event('dragover', { bubbles: true }));
      firstRow.dispatchEvent(new Event('drop', { bubbles: true }));
      titleButtons
        .find(
          (button) => button.title === 'editor.compact.workspaceMakeDefault' && !button.disabled
        )
        ?.click();
      titleButtons.find((button) => button.title === 'common.actions.delete')?.click();
    });

    expect(editorState.handleTogglePresetEnabled).toHaveBeenCalledWith('preset-1', false);
    expect(editorState.handlePresetDragStart).toHaveBeenCalledWith('preset-1');
    expect(editorState.handlePresetDragOver).toHaveBeenCalledWith('preset-1');
    expect(editorState.handlePresetDrop).toHaveBeenCalledWith('preset-1');
    expect(editorState.handleMakeDefaultPreset).toHaveBeenCalledWith('preset-1');
    expect(editorState.handleDeletePreset).toHaveBeenCalledWith('preset-1');
  });

  it('renders palette rows and forwards color and drag events', async () => {
    const state = createPresetState({ dragOverColorIndex: 0 });

    await renderNode(<PaletteRow color="#112233" index={0} state={state} />);

    const row = container?.querySelector('[draggable="true"]');
    const colorInput = container?.querySelector<HTMLInputElement>('input[type="color"]');

    await act(async () => {
      row?.dispatchEvent(new Event('dragstart', { bubbles: true }));
      row?.dispatchEvent(new Event('dragover', { bubbles: true }));
      row?.dispatchEvent(new Event('drop', { bubbles: true }));
      if (colorInput) {
        setInputValue(colorInput, '#abcdef');
      }
    });

    expect(state.handlePaletteDragStart).toHaveBeenCalledWith(0);
    expect(state.handlePaletteDragOver).toHaveBeenCalledWith(0);
    expect(state.handlePaletteDrop).toHaveBeenCalledWith(0);
    expect(state.handlePaletteColorChange).toHaveBeenCalledWith(0, '#abcdef');
  });
});
