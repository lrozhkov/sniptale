// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type {
  BorderPreset,
  HighlighterSettings,
} from '../../../../../features/highlighter/contracts';
const { blurControlsPropsSpy } = vi.hoisted(() => ({
  blurControlsPropsSpy: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./blur-controls', () => ({
  HighlighterBlurControls: (props: unknown) => {
    blurControlsPropsSpy(props);
    return <div data-testid="blur-controls">blur</div>;
  },
}));

vi.mock('../../../../section-surface/panel-controls', () => ({
  settingsAddButtonClassName: 'add-button',
  settingsCardClassName: 'settings-card',
  settingsDangerIconButtonClassName: 'danger-button',
  settingsEmptyStateClassName: 'empty-state',
  settingsInfoIconButtonClassName: 'info-button',
  settingsModalFieldSurfaceClassName: 'field-surface',
  settingsModalClassName: 'settings-modal',
  settingsNeutralBadgeClassName: 'neutral-badge',
  settingsSuccessBadgeClassName: 'success-badge',
  SettingsDragHandle: () => <div data-testid="drag-handle">drag</div>,
  SettingsControlRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SettingsRange: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="range" {...props} />
  ),
  SettingsSwitch: ({ checked, onClick }: { checked: boolean; onClick: () => void }) => (
    <button type="button" aria-pressed={checked} onClick={onClick}>
      toggle
    </button>
  ),
}));

vi.mock('../../../../section-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../section-surface')>()),
  settingsToggleRowClassName: 'toggle-row',
  SettingsRangeField: ({
    label,
    onChange,
    onValueCommit,
    value,
  }: {
    label?: React.ReactNode;
    onChange: (event: { target: { value: string } }) => void;
    onValueCommit?: (value: number) => void;
    value: number;
  }) => (
    <div>
      <span>{label}</span>
      <input
        data-testid="focus-range"
        type="range"
        value={value}
        onChange={(event) => onChange({ target: { value: event.currentTarget.value } })}
        onPointerUp={(event) => onValueCommit?.(Number(event.currentTarget.value))}
      />
    </div>
  ),
}));

import { HighlighterEffectsPanel } from './effects-panel';
import type { HighlighterEffectActions } from './useHighlighterSection';

type HighlighterEffectsPanelProps = React.ComponentProps<typeof HighlighterEffectsPanel>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function commitRangeValue(input: HTMLInputElement) {
  input.dispatchEvent(new Event('pointerup', { bubbles: true }));
}

function createPreset(overrides: Partial<BorderPreset> = {}): BorderPreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Preset',
    order: overrides.order ?? 0,
    tagIds: overrides.tagIds ?? [],
    width: overrides.width ?? 4,
    color: overrides.color ?? '#ff6600',
    style: overrides.style ?? 'solid',
    radius: overrides.radius ?? 8,
    padding: overrides.padding ?? { top: 1, right: 1, bottom: 1, left: 1 },
    shadow: overrides.shadow ?? 30,
    customCss: overrides.customCss ?? '',
    fillPaint: overrides.fillPaint ?? { kind: 'solid', color: '#00000000' },
    inheritCustomCss: overrides.inheritCustomCss ?? false,
  };
}

function createSettings(overrides: Partial<HighlighterSettings> = {}): HighlighterSettings {
  return {
    borderPresets: overrides.borderPresets ?? [createPreset()],
    defaultBorderPresetId: overrides.defaultBorderPresetId ?? 'preset-1',
    defaultEffectMode: overrides.defaultEffectMode ?? 'border',
    systemPresetCatalogRevision: overrides.systemPresetCatalogRevision ?? 1,
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

function createEffects(): HighlighterEffectActions {
  return {
    handleUpdateBlurSettings:
      vi.fn<(blurSettings: HighlighterSettings['defaultBlurSettings']) => Promise<void>>(),
    handleUpdateFocusSettings:
      vi.fn<(focusSettings: HighlighterSettings['defaultFocusSettings']) => Promise<void>>(),
  };
}

function createProps(): HighlighterEffectsPanelProps {
  const settings = createSettings();

  return {
    effects: createEffects(),
    settings,
  };
}

async function renderPanel(props: HighlighterEffectsPanelProps = createProps()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterEffectsPanel {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  blurControlsPropsSpy.mockReset();
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

it('renders blur and focus panels and wires focus settings updates', async () => {
  const props = await renderPanel();
  const range = container?.querySelector('input[data-testid="focus-range"]') as HTMLInputElement;
  const toggle = container?.querySelector('button[aria-pressed="false"]') as HTMLButtonElement;

  expect(container?.textContent).toContain('highlighter.section.blurTitle');
  expect(container?.textContent).toContain('highlighter.section.focusTitle');
  expect(blurControlsPropsSpy).toHaveBeenCalledWith(props);

  await act(async () => {
    setInputValue(range, '70');
    commitRangeValue(range);
    toggle?.click();
  });

  expect(props.effects.handleUpdateFocusSettings).toHaveBeenCalledWith({
    opacity: 0.7,
    showBorder: false,
  });
  expect(props.effects.handleUpdateFocusSettings).toHaveBeenCalledWith({
    opacity: 0.6,
    showBorder: true,
  });
});

it('falls back to an unchecked focus-border toggle when showBorder is omitted', async () => {
  const settings = createSettings({
    defaultFocusSettings: {
      opacity: 0.4,
    },
  });
  const props = await renderPanel({
    effects: createEffects(),
    settings,
  });
  const toggle = container?.querySelector('button[aria-pressed="false"]') as HTMLButtonElement;

  await act(async () => {
    toggle?.click();
  });

  expect(props.effects.handleUpdateFocusSettings).toHaveBeenCalledWith({
    opacity: 0.4,
    showBorder: true,
  });
});

it('commits gaussian focus blur independently from dimming', async () => {
  const settings = createSettings({
    defaultFocusSettings: { blurAmount: 5, opacity: 0.3, showBorder: false },
  });
  const props = await renderPanel({ effects: createEffects(), settings });
  const ranges = container?.querySelectorAll<HTMLInputElement>('input[data-testid="focus-range"]');
  const blurRange = ranges?.[1];

  expect(ranges).toHaveLength(2);
  expect(container?.textContent).toContain('highlighter.section.focusBlurLabel');

  await act(async () => {
    if (!blurRange) return;
    setInputValue(blurRange, '13');
    commitRangeValue(blurRange);
  });

  expect(props.effects.handleUpdateFocusSettings).toHaveBeenCalledWith({
    blurAmount: 13,
    opacity: 0.3,
    showBorder: false,
  });
});
