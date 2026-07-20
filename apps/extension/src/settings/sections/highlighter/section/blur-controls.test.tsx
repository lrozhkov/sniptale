// @vitest-environment jsdom

import type { SetStateAction } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../section-surface/panel-controls', async (importOriginal) => ({
  ...(await importOriginal()),
  SettingsSwitch: ({ checked, onClick }: { checked: boolean; onClick: () => void }) => (
    <button type="button" aria-pressed={checked} onClick={onClick}>
      toggle
    </button>
  ),
}));

vi.mock('../../../section-surface', async (importOriginal) => ({
  ...(await importOriginal()),
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
        data-testid="settings-range"
        type="range"
        value={value}
        onChange={(event) => onChange({ target: { value: event.currentTarget.value } })}
        onPointerUp={(event) => onValueCommit?.(Number(event.currentTarget.value))}
      />
    </div>
  ),
}));

import { HighlighterBlurControls } from './blur-controls';
import type { HighlighterSectionState } from './useHighlighterSection';

type HighlighterBlurControlsProps = React.ComponentProps<typeof HighlighterBlurControls>;

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
    draggedId: null,
    dragOverId: null,
    editingPreset: undefined,
    hoveredPresetId: null,
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

function createProps(): HighlighterBlurControlsProps {
  const settings = createSettings();

  return {
    settings,
    state: createState(settings),
  };
}

async function renderControls(props: HighlighterBlurControlsProps = createProps()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterBlurControls {...props} />);
  });

  return props;
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

describe('HighlighterBlurControls', () => {
  it('updates blur amount, blur type, and border visibility', async () => {
    const props = await renderControls();
    const range = container?.querySelector(
      'input[data-testid="settings-range"]'
    ) as HTMLInputElement;
    const toggle = container?.querySelector('button[aria-pressed="false"]') as HTMLButtonElement;
    const distortionButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent?.includes('highlighter.section.blurTypeDistortion')
    );

    expect(container?.textContent).toContain('highlighter.section.blurAmountLabel');
    expect(container?.textContent).toContain('highlighter.section.blurTypeLabel');

    await act(async () => {
      setInputValue(range, '9');
      commitRangeValue(range);
      distortionButton?.click();
      toggle?.click();
    });

    expect(props.state.handleUpdateBlurSettings).toHaveBeenCalledWith({
      amount: 9,
      blurType: 'gaussian',
      showBorder: false,
    });
    expect(props.state.handleUpdateBlurSettings).toHaveBeenCalledWith({
      amount: 4,
      blurType: 'distortion',
      showBorder: false,
    });
    expect(props.state.handleUpdateBlurSettings).toHaveBeenCalledWith({
      amount: 4,
      blurType: 'gaussian',
      showBorder: true,
    });
  });
});
