// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorField, SelectInput, ToggleField } from './controls';
import { OptionButtonsField } from './option-buttons';
import { SliderField } from './sliders';

vi.mock('../../../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../platform/i18n')>();
  return {
    ...actual,
    translate: (key: string) => key,
    useAppLocale: () => 'en',
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('workspace-sidebar/selection/shared/controls', () => {
  registerColorPreviewTest();
  registerSelectInputTest();
  registerToggleTest();
  registerSliderAndSegmentedTest();
  registerSliderDisplayMappingTest();
  registerSliderCommitDedupeTest();
  registerWideSegmentedLabelsTest();
});

function registerColorPreviewTest() {
  it('renders disabled color controls as non-interactive previews instead of focusable selectors', () => {
    act(() => {
      root?.render(
        <ColorField
          disabled
          label="Accent"
          onChange={vi.fn()}
          onRememberRecentColor={undefined}
          recentColors={[]}
          value="#123456"
        />
      );
    });

    expect(container?.querySelector('button')).toBeNull();
    expect(container?.textContent).toContain('#123456'.toUpperCase());
  });
}

function registerSliderCommitDedupeTest() {
  it('does not duplicate slider commits when preview and commit use the same video handler', () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState(125);
      return (
        <SliderField
          label="Scale"
          value={value}
          min={10}
          max={300}
          step={1}
          onChange={(nextValue) => {
            setValue(nextValue);
            onChange(nextValue);
          }}
        />
      );
    }

    act(() => {
      root?.render(<Harness />);
    });

    const range = container?.querySelector<HTMLInputElement>('input[type="range"]');
    if (!range) {
      throw new Error('range input missing');
    }

    act(() => {
      assignInputValue(range, '160');
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(160);
  });
}

function assignInputValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
}

function registerSelectInputTest() {
  it('routes select controls through the shared compact inspector select', () => {
    act(() => {
      root?.render(
        <SelectInput
          value="contain"
          onChange={vi.fn()}
          options={[{ value: 'contain', label: 'Contain' }]}
        />
      );
    });

    expect(container?.querySelector('[data-ui="shared.ui.compact-select"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="shared.ui.glass-select"]')).toBeNull();
  });

  it('renders labeled selects as shared compact inspector rows', () => {
    act(() => {
      root?.render(
        <SelectInput
          label="Fit"
          value="contain"
          onChange={vi.fn()}
          options={[{ value: 'contain', label: 'Contain' }]}
          disabled
        />
      );
    });

    const row = container?.querySelector('[data-ui="shared.ui.compact-inspector.select-field"]');
    const trigger = row?.querySelector<HTMLButtonElement>('button');

    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('Fit');
    expect(trigger?.disabled).toBe(true);
    expect(container?.querySelector('[data-ui="video-editor.selection.compact-field"]')).toBeNull();
  });
}

function registerToggleTest() {
  it('renders canonical toggle controls through the shared compact option row', () => {
    act(() => {
      root?.render(<ToggleField checked label="Visible" onChange={vi.fn()} />);
    });

    const option = container?.querySelector('[data-ui="shared.ui.compact-inspector.option-row"]');
    expect(option?.getAttribute('aria-pressed')).toBe('true');
    expect(container?.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container?.textContent).toContain('Visible');
  });
}

function registerSliderAndSegmentedTest() {
  it('renders canonical sliders and segmented options for bounded inspector values', () => {
    act(() => {
      root?.render(
        <>
          <SliderField
            label="Scale"
            value={125}
            min={10}
            max={300}
            step={1}
            onChange={vi.fn()}
            formatValue={(value) => `${Math.round(value)}%`}
          />
          <OptionButtonsField
            label="Placement"
            value="BOTTOM"
            onChange={vi.fn()}
            options={[
              { label: 'Bottom', value: 'BOTTOM' },
              { label: 'Top', value: 'TOP', disabled: true },
            ]}
          />
        </>
      );
    });

    const range = container?.querySelector('input[type="range"]');
    const numericInput = container?.querySelector<HTMLInputElement>(
      '[data-ui="shared.ui.compact-inspector.numeric-row"] input[type="text"]'
    );
    const segmented = container?.querySelector(
      '[data-ui="shared.ui.compact-inspector.segmented-row"]'
    );
    const buttons = segmented?.querySelectorAll<HTMLButtonElement>('button') ?? [];

    expect(range?.getAttribute('min')).toBe('10');
    expect(numericInput?.value).toBe('125');
    expect(container?.textContent).toContain('%');
    expect(segmented).not.toBeNull();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.disabled).toBe(true);
  });
}

function registerSliderDisplayMappingTest() {
  it('maps formatted domain values through shared numeric rows without showing raw decimals', () => {
    const onChange = vi.fn();

    act(() => {
      root?.render(
        <SliderField
          label="Opacity"
          value={0.45}
          min={0}
          max={1}
          step={0.01}
          onChange={onChange}
          formatValue={(value) => `${Math.round(value * 100)}%`}
        />
      );
    });

    const range = container?.querySelector<HTMLInputElement>('input[type="range"]');
    const numericInput = container?.querySelector<HTMLInputElement>('input[type="text"]');

    expect(range?.getAttribute('min')).toBe('0');
    expect(range?.getAttribute('max')).toBe('100');
    expect(numericInput?.value).toBe('45');

    act(() => {
      assignInputValue(range!, '55');
      range?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(0.55);
  });
}

function registerWideSegmentedLabelsTest() {
  it('keeps four-option segmented controls on readable two-column rows', () => {
    act(() => {
      root?.render(
        <OptionButtonsField
          label="Animation"
          value="NONE"
          onChange={vi.fn()}
          options={[
            { label: 'None', value: 'NONE' },
            { label: 'Cinematic drift', value: 'ROTATE' },
            { label: 'Light shift', value: 'BREATHE' },
            { label: 'Audio', value: 'AUDIO' },
          ]}
        />
      );
    });

    const segmentedRow = container?.querySelector(
      '[data-ui="shared.ui.compact-inspector.segmented-row"]'
    );
    expect(segmentedRow?.className).toContain('grid-cols-2');
    expect(segmentedRow?.className).not.toContain('grid-cols-4');
    expect(container?.querySelector('button')?.className).toContain('!whitespace-normal');
  });
}
