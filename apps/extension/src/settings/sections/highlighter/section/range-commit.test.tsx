// @vitest-environment jsdom

import type { SetStateAction } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';

const { rangePropsSpy } = vi.hoisted(() => ({
  rangePropsSpy: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../section-surface/panel-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../section-surface/panel-controls')>()),
  SettingsSwitch: ({ checked, onClick }: { checked: boolean; onClick: () => void }) => (
    <button type="button" aria-pressed={checked} onClick={onClick}>
      toggle
    </button>
  ),
}));

vi.mock('../../../section-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../section-surface')>()),
  settingsToggleRowClassName: 'toggle-row',
  SettingsRangeField: (props: {
    displayValue: React.ReactNode;
    label?: React.ReactNode;
    onChange: (event: { target: { value: string } }) => void;
    onValueCommit?: (value: number) => void;
    value: number;
  }) => {
    rangePropsSpy(props);

    return (
      <div>
        <span>{props.label}</span>
        <span data-testid="range-display">{props.displayValue}</span>
        <input
          data-testid="settings-range"
          type="range"
          value={props.value}
          onChange={(event) => props.onChange({ target: { value: event.currentTarget.value } })}
          onPointerUp={(event) => props.onValueCommit?.(Number(event.currentTarget.value))}
        />
      </div>
    );
  },
}));

import { HighlighterBlurControls } from './blur-controls';
import { HighlighterEffectsPanel } from './effects-panel';
import type { HighlighterSectionState } from './useHighlighterSection';

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

async function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

async function dragRangeValues(input: HTMLInputElement, values: string[]) {
  await act(async () => {
    for (const value of values) {
      setInputValue(input, value);
    }
  });
}

async function commitRange(input: HTMLInputElement) {
  await act(async () => {
    commitRangeValue(input);
  });
}

function findRangeAt(index: number) {
  const ranges = container?.querySelectorAll('input[data-testid="settings-range"]');
  return ranges?.item(index) as HTMLInputElement;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  rangePropsSpy.mockReset();
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

describe('highlighter range persistence commits', () => {
  it('keeps blur amount dragging local until the range value is committed', async () => {
    const settings = createSettings();
    const state = createState(settings);

    await renderElement(<HighlighterBlurControls settings={settings} state={state} />);
    await dragRangeValues(findRangeAt(0), ['7', '9']);

    expect(state.handleUpdateBlurSettings).not.toHaveBeenCalled();
    expect(container?.textContent).toContain('9');

    await commitRange(findRangeAt(0));

    expect(state.handleUpdateBlurSettings).toHaveBeenCalledTimes(1);
    expect(state.handleUpdateBlurSettings).toHaveBeenCalledWith({
      amount: 9,
      blurType: 'gaussian',
      showBorder: false,
    });
  });

  it('keeps focus opacity dragging local until the range value is committed', async () => {
    const settings = createSettings();
    const state = createState(settings);

    await renderElement(<HighlighterEffectsPanel settings={settings} state={state} />);
    await dragRangeValues(findRangeAt(1), ['65', '70']);

    expect(state.handleUpdateFocusSettings).not.toHaveBeenCalled();
    expect(container?.textContent).toContain('70');

    await commitRange(findRangeAt(1));

    expect(state.handleUpdateFocusSettings).toHaveBeenCalledTimes(1);
    expect(state.handleUpdateFocusSettings).toHaveBeenCalledWith({
      opacity: 0.7,
      showBorder: false,
    });
  });
});
