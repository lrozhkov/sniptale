// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BorderPreset,
  HighlighterSettings,
} from '../../../../../features/highlighter/contracts';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../section-surface/panel-controls', () => ({
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
  SettingsSwitch: ({
    checked,
    disabled,
    onClick,
    title,
  }: {
    checked: boolean;
    disabled?: boolean;
    onClick: () => void;
    title?: string;
  }) => (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      toggle
    </button>
  ),
}));

import { HighlighterPresetsPanel } from './presets-panel';
import type { HighlighterPresetController } from './useHighlighterSection';

type HighlighterPresetsPanelProps = React.ComponentProps<typeof HighlighterPresetsPanel>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPreset(overrides: Partial<BorderPreset> = {}): BorderPreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Preset',
    origin: overrides.origin ?? 'user',
    ...(overrides.systemPresetKey === undefined
      ? {}
      : { systemPresetKey: overrides.systemPresetKey }),
    ...(overrides.customized === undefined ? {} : { customized: overrides.customized }),
    ...(overrides.enabled === undefined ? {} : { enabled: overrides.enabled }),
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
    systemPresetCatalogRevision: overrides.systemPresetCatalogRevision ?? 1,
    catalogCustomized: overrides.catalogCustomized ?? true,
  };
}

function createPresets(): HighlighterPresetController {
  return {
    draggedId: 'preset-custom',
    dragOverId: 'preset-custom',
    editingPreset: undefined,
    hoveredPresetId: 'preset-custom',
    isEditorOpen: false,
    handleAddPreset: vi.fn<() => void>(),
    handleCloseEditor: vi.fn<() => void>(),
    handleDeletePreset: vi.fn<(preset: BorderPreset) => Promise<void>>(),
    handleDragEnd: vi.fn<() => void>(),
    handleDragLeave: vi.fn<() => void>(),
    handleDragOver: vi.fn<(event: React.DragEvent, presetId: string) => void>(),
    handleDragStart: vi.fn<(event: React.DragEvent, presetId: string) => void>(),
    handleDrop: vi.fn<(event: React.DragEvent, targetId: string) => Promise<void>>(),
    handleEditPreset: vi.fn<(preset: BorderPreset) => void>(),
    handlePresetHoverChange: vi.fn<(presetId: string | null) => void>(),
    handleResetPreset: vi.fn<(presetId: string) => Promise<void>>(),
    handleSavePreset: vi.fn<(preset: BorderPreset) => Promise<void>>(),
    handleSetDefaultPreset: vi.fn<(presetId: string) => Promise<void>>(),
    handleTogglePresetEnabled: vi.fn<(presetId: string) => Promise<void>>(),
  };
}

function createProps(): HighlighterPresetsPanelProps {
  const defaultPreset = createPreset({
    id: 'preset-default',
    origin: 'system',
    systemPresetKey: 'system-default',
    customized: false,
    name: 'System default',
    order: 0,
  });
  const customPreset = createPreset({
    id: 'preset-custom',
    name: 'Custom',
    order: 1,
    style: 'dashed',
  });

  const settings = createSettings({
    borderPresets: [defaultPreset, customPreset],
    defaultBorderPresetId: 'preset-default',
  });

  return {
    presets: createPresets(),
    settings,
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
    expect(props.presets.handleAddPreset).toHaveBeenCalledOnce();
    expect(props.presets.handleSetDefaultPreset).toHaveBeenCalledWith('preset-custom');
    expect(props.presets.handleEditPreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preset-default', origin: 'system' })
    );
    expect(props.presets.handleDragStart).toHaveBeenCalled();
    expect(props.presets.handleDragOver).toHaveBeenCalled();
    expect(props.presets.handleDragLeave).toHaveBeenCalled();
    expect(props.presets.handleDrop).toHaveBeenCalled();
    expect(props.presets.handleDragEnd).toHaveBeenCalled();
    expect(props.presets.handlePresetHoverChange).toHaveBeenCalledWith('preset-default');
    expect(props.presets.handlePresetHoverChange).toHaveBeenCalledWith(null);
    expect(controls.disabledEditButton).toBeUndefined();
  });

  it('disables the last enabled toggle and exposes reset without system delete', async () => {
    const system = createPreset({
      id: 'system-default',
      origin: 'system',
      systemPresetKey: 'system-default',
      customized: true,
      enabled: true,
    });
    const settings = createSettings({
      borderPresets: [system],
      defaultBorderPresetId: system.id,
    });
    const presets = createPresets();
    presets.hoveredPresetId = system.id;
    await renderPanel({ presets, settings });

    const toggle = container?.querySelector<HTMLButtonElement>(
      'button[title="highlighter.section.lastEnabledPresetDisabled"]'
    );
    const reset = container?.querySelector<HTMLButtonElement>(
      'button[title="highlighter.section.resetSystemPresetTitle"]'
    );
    expect(toggle?.disabled).toBe(true);
    expect(container?.querySelector('button[title="common.actions.delete"]')).toBeNull();

    await act(async () => reset?.click());
    expect(presets.handleResetPreset).toHaveBeenCalledWith('system-default');
  });
});
