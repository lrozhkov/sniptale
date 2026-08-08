// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BorderPreset,
  HighlighterSettings,
} from '../../../../../features/highlighter/contracts';

const { rangePropsSpy } = vi.hoisted(() => ({
  rangePropsSpy: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../section-surface/panel-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../section-surface/panel-controls')>()),
  SettingsSwitch: ({ checked, onClick }: { checked: boolean; onClick: () => void }) => (
    <button type="button" aria-pressed={checked} onClick={onClick}>
      toggle
    </button>
  ),
}));

vi.mock('../../../../section-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../section-surface')>()),
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
import type { HighlighterEffectActions } from './useHighlighterSection';

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
    width: overrides.width ?? 4,
    color: overrides.color ?? '#ff6600',
    style: overrides.style ?? 'solid',
    radius: overrides.radius ?? 8,
    padding: overrides.padding ?? { top: 1, right: 1, bottom: 1, left: 1 },
    shadow: overrides.shadow ?? 30,
    customCss: overrides.customCss ?? '',
    fillColor: overrides.fillColor ?? '#00000000',
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
    const effects = createEffects();

    await renderElement(<HighlighterBlurControls effects={effects} settings={settings} />);
    await dragRangeValues(findRangeAt(0), ['7', '9']);

    expect(effects.handleUpdateBlurSettings).not.toHaveBeenCalled();
    expect(container?.textContent).toContain('9');

    await commitRange(findRangeAt(0));

    expect(effects.handleUpdateBlurSettings).toHaveBeenCalledTimes(1);
    expect(effects.handleUpdateBlurSettings).toHaveBeenCalledWith({
      amount: 9,
      blurType: 'gaussian',
      showBorder: false,
    });
  });

  it('keeps focus opacity dragging local until the range value is committed', async () => {
    const settings = createSettings();
    const effects = createEffects();

    await renderElement(<HighlighterEffectsPanel effects={effects} settings={settings} />);
    await dragRangeValues(findRangeAt(1), ['65', '70']);

    expect(effects.handleUpdateFocusSettings).not.toHaveBeenCalled();
    expect(container?.textContent).toContain('70');

    await commitRange(findRangeAt(1));

    expect(effects.handleUpdateFocusSettings).toHaveBeenCalledTimes(1);
    expect(effects.handleUpdateFocusSettings).toHaveBeenCalledWith({
      opacity: 0.7,
      showBorder: false,
    });
  });
});
