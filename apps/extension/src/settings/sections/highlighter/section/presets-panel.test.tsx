// @vitest-environment jsdom

import type { SetStateAction } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../section-surface/panel-controls', () => ({
  getSettingsHoverActionsClassName: (visible: boolean) => (visible ? 'visible' : 'hidden'),
  settingsAddButtonClassName: 'add-button',
  settingsCardClassName: 'settings-card',
  settingsDangerIconButtonClassName: 'danger-button',
  settingsEmptyStateClassName: 'empty-state',
  settingsInfoIconButtonClassName: 'info-button',
  settingsListRowClassName: 'list-row',
  settingsModalFieldSurfaceClassName: 'field-surface',
  settingsNeutralBadgeClassName: 'neutral-badge',
  settingsSuccessBadgeClassName: 'success-badge',
  SettingsDragHandle: () => <div data-testid="drag-handle">drag</div>,
  SettingsRange: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="range" {...props} />
  ),
  SettingsSwitch: ({ checked, onClick }: { checked: boolean; onClick: () => void }) => (
    <button type="button" aria-pressed={checked} onClick={onClick}>
      toggle
    </button>
  ),
}));

import { HighlighterPresetsPanel } from './presets-panel';
import type { HighlighterSectionState } from './useHighlighterSection';

type HighlighterPresetsPanelProps = React.ComponentProps<typeof HighlighterPresetsPanel>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStateSetterMock<T>() {
  return vi.fn<(value: SetStateAction<T>) => void>();
}

function createPreset(overrides: Partial<BorderPreset> = {}): BorderPreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Preset',
    isSystemDefault: overrides.isSystemDefault ?? false,
    order: overrides.order ?? 0,
    width: overrides.width ?? 4,
    color: overrides.color ?? '#ff6600',
    style: overrides.style ?? 'solid',
    radius: overrides.radius ?? 8,
    padding: overrides.padding ?? { top: 1, right: 1, bottom: 1, left: 1 },
    shadow: overrides.shadow ?? 30,
    opacity: overrides.opacity ?? 80,
    customCss: overrides.customCss ?? '',
    fillColor: overrides.fillColor ?? '#00000000',
    fillOpacity: overrides.fillOpacity ?? 0,
    inheritCustomCss: overrides.inheritCustomCss ?? false,
    strokeOpacity: overrides.strokeOpacity ?? 100,
  };
}

function createSettings(overrides: Partial<HighlighterSettings> = {}): HighlighterSettings {
  return {
    borderPresets: overrides.borderPresets ?? [createPreset()],
    defaultBorderPresetId: overrides.defaultBorderPresetId ?? 'preset-1',
    defaultEffectMode: overrides.defaultEffectMode ?? 'border',
    defaultBlurSettings: overrides.defaultBlurSettings ?? {
      amount: 4,
      blurType: 'gaussian',
      showBorder: false,
    },
    defaultFocusSettings: overrides.defaultFocusSettings ?? {
      opacity: 0.6,
      showBorder: false,
    },
  };
}

function createState(settings: HighlighterSettings): HighlighterSectionState {
  return {
    draggedId: 'preset-custom',
    dragOverId: 'preset-custom',
    editingPreset: undefined,
    hoveredPresetId: 'preset-custom',
    isEditorOpen: false,
    isLoading: false,
    setDraggedId: createStateSetterMock<string | null>(),
    setDragOverId: createStateSetterMock<string | null>(),
    setEditingPreset: createStateSetterMock<BorderPreset | undefined>(),
    setHoveredPresetId: createStateSetterMock<string | null>(),
    setIsEditorOpen: createStateSetterMock<boolean>(),
    setSettings: createStateSetterMock<HighlighterSettings | null>(),
    settings,
    handleAddPreset: vi.fn<() => void>(),
    handleDeletePreset: vi.fn<(preset: BorderPreset) => Promise<void>>(),
    handleDragEnd: vi.fn<() => void>(),
    handleDragLeave: vi.fn<() => void>(),
    handleDragOver: vi.fn<(event: React.DragEvent, presetId: string) => void>(),
    handleDragStart: vi.fn<(event: React.DragEvent, presetId: string) => void>(),
    handleDrop: vi.fn<(event: React.DragEvent, targetId: string) => Promise<void>>(),
    handleEditPreset: vi.fn<(preset: BorderPreset) => void>(),
    handleSavePreset: vi.fn<(preset: BorderPreset) => Promise<void>>(),
    handleSetDefaultPreset: vi.fn<(presetId: string) => Promise<void>>(),
    handleTogglePresetEnabled: vi.fn<(presetId: string) => Promise<void>>(),
    handleUpdateBlurSettings:
      vi.fn<(blurSettings: HighlighterSettings['defaultBlurSettings']) => Promise<void>>(),
    handleUpdateFocusSettings:
      vi.fn<(focusSettings: HighlighterSettings['defaultFocusSettings']) => Promise<void>>(),
  };
}

function createProps(): HighlighterPresetsPanelProps {
  const defaultPreset = createPreset({
    id: 'preset-default',
    isSystemDefault: true,
    name: 'System default',
    order: 0,
  });
  const customPreset = createPreset({
    id: 'preset-custom',
    isSystemDefault: false,
    name: 'Custom',
    order: 1,
    style: 'dashed',
  });

  const settings = createSettings({
    borderPresets: [defaultPreset, customPreset],
    defaultBorderPresetId: 'preset-default',
  });

  return {
    settings,
    state: createState(settings),
  };
}

async function renderPanel(props: HighlighterPresetsPanelProps = createProps()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterPresetsPanel {...props} />);
  });

  return props;
}

function createDragEvent(type: string) {
  return new Event(type, { bubbles: true, cancelable: true });
}

function queryPanelControls() {
  const [defaultRow, customRow] = Array.from(container?.querySelectorAll('.list-row') ?? []);
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);

  return {
    addButton: buttons.find((button) =>
      button.textContent?.includes('highlighter.section.addButton')
    ),
    customRow,
    defaultRow,
    disabledEditButton: buttons.find((button) =>
      button.getAttribute('title')?.includes('highlighter.section.systemPresetEditDisabled')
    ),
    editButton: buttons.find((button) =>
      button.getAttribute('title')?.includes('common.actions.edit')
    ),
    makeDefaultButton: buttons.find((button) =>
      button.getAttribute('title')?.includes('highlighter.section.makeDefaultTitle')
    ),
  };
}

async function triggerPanelInteractions() {
  const controls = queryPanelControls();

  await act(async () => {
    controls.addButton?.click();
    controls.makeDefaultButton?.click();
    controls.editButton?.click();
    controls.customRow?.dispatchEvent(createDragEvent('dragstart'));
    controls.customRow?.dispatchEvent(createDragEvent('dragover'));
    controls.customRow?.dispatchEvent(createDragEvent('dragleave'));
    controls.customRow?.dispatchEvent(createDragEvent('drop'));
    controls.customRow?.dispatchEvent(createDragEvent('dragend'));
    controls.defaultRow?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    controls.defaultRow?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  });

  return controls;
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
});

describe('HighlighterPresetsPanel', () => {
  it('renders preset rows, badges, and owner actions', async () => {
    const props = await renderPanel();
    const controls = await triggerPanelInteractions();

    expect(container?.textContent).toContain('highlighter.section.presetsLabel');
    expect(container?.textContent).toContain('highlighter.section.defaultBadge');
    expect(container?.textContent).toContain('highlighter.section.systemBadge');
    expect(container?.textContent).toContain('highlighter.section.countFew');
    expect(props.state.handleAddPreset).toHaveBeenCalledOnce();
    expect(props.state.handleSetDefaultPreset).toHaveBeenCalledWith('preset-custom');
    expect(props.state.handleEditPreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preset-custom' })
    );
    expect(props.state.handleDragStart).toHaveBeenCalled();
    expect(props.state.handleDragOver).toHaveBeenCalled();
    expect(props.state.handleDragLeave).toHaveBeenCalled();
    expect(props.state.handleDrop).toHaveBeenCalled();
    expect(props.state.handleDragEnd).toHaveBeenCalled();
    expect(props.state.setHoveredPresetId).toHaveBeenCalledWith('preset-default');
    expect(props.state.setHoveredPresetId).toHaveBeenCalledWith(null);
    expect(controls.disabledEditButton?.hasAttribute('disabled')).toBe(true);
  });
});
