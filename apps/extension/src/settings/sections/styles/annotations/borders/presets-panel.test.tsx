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
  settingsAddButtonClassName: 'add-button',
  settingsCardClassName: 'settings-card',
  settingsDangerIconButtonClassName: 'danger-button',
  settingsEmptyStateClassName: 'empty-state',
  settingsInfoIconButtonClassName: 'info-button',
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
    editingPreset: undefined,
    isEditorOpen: false,
    handleAddPreset: vi.fn<() => void>(),
    handleCloseEditor: vi.fn<() => void>(),
    handleDeletePreset: vi.fn<(preset: BorderPreset) => Promise<void>>(),
    handleMoveBefore: vi.fn<(presetId: string, beforePresetId: string | null) => Promise<void>>(),
    handleEditPreset: vi.fn<(preset: BorderPreset) => void>(),
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

function queryPanelControls() {
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);

  return {
    addButton: buttons.find((button) =>
      button.textContent?.includes('highlighter.section.addButton')
    ),
    disabledEditButton: buttons.find((button) =>
      button.getAttribute('title')?.includes('highlighter.section.systemPresetEditDisabled')
    ),
    editButton: buttons.find(
      (button) => button.getAttribute('aria-label') === 'settings.collection.actions.edit'
    ),
    makeDefaultButton: buttons.find(
      (button) => button.textContent === 'settings.collection.actions.setDefault'
    ),
    moveUpButton: buttons.filter(
      (button) => button.textContent === 'settings.collection.actions.moveUp'
    )[1],
  };
}

async function triggerPanelInteractions() {
  const controls = queryPanelControls();

  await act(async () => {
    controls.addButton?.click();
    controls.makeDefaultButton?.click();
    controls.editButton?.click();
    controls.moveUpButton?.click();
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
    expect(container?.textContent).toContain('settings.collection.defaultBadge');
    expect(container?.textContent).toContain('highlighter.section.systemBadge');
    expect(container?.textContent).toContain('highlighter.section.countFew');
    expect(props.presets.handleAddPreset).toHaveBeenCalledOnce();
    expect(props.presets.handleSetDefaultPreset).toHaveBeenCalledWith('preset-custom');
    expect(props.presets.handleEditPreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preset-default', origin: 'system' })
    );
    expect(props.presets.handleMoveBefore).toHaveBeenCalledWith('preset-custom', 'preset-default');
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
    await renderPanel({ presets, settings });

    const toggle = container?.querySelector<HTMLButtonElement>(
      'button[title="highlighter.section.lastEnabledPresetDisabled"]'
    );
    const reset = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (button) => button.textContent === 'settings.collection.actions.reset'
    );
    expect(toggle?.disabled).toBe(true);
    expect(container?.textContent).not.toContain('settings.collection.actions.delete');

    await act(async () => reset?.click());
    expect(presets.handleResetPreset).toHaveBeenCalledWith('system-default');
  });
});
