// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ColorSelectorTrigger } from './trigger';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderTrigger(props: Partial<React.ComponentProps<typeof ColorSelectorTrigger>> = {}) {
  if (!container) {
    throw new Error('missing container');
  }

  act(() => {
    root?.render(
      <ColorSelectorTrigger
        expanded={false}
        formatMode="hex"
        label="Grid color"
        title="Grid color"
        value="#123456"
        onOpenPicker={() => undefined}
        onToggleExpanded={() => undefined}
        {...props}
      />
    );
  });
}

function getButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders swatch-plus-hex trigger chrome with muted chevron styling', () => {
  renderTrigger();

  const pickerButton = getButton('shared.ui.colorSelectorChooseColor');
  const trigger = container?.querySelector(
    '[data-ui="shared.ui.color-selector.trigger"]'
  ) as HTMLElement | null;
  const paletteButton = getButton('Grid color');

  expect(trigger?.className).toContain('focus-within:border-[var(--sniptale-field-border-active)]');
  expect(trigger?.className).toContain('overflow-hidden');
  expect(trigger?.style.getPropertyValue('--sniptale-field-height')).toBe('40px');
  expect(trigger?.style.getPropertyValue('--sniptale-field-bg-active')).toContain(
    'color-mix(in srgb'
  );
  expect(pickerButton?.textContent).toContain('#123456'.toUpperCase());
  expect(paletteButton?.getAttribute('aria-label')).toBe('Grid color');
  expect(pickerButton?.className).toContain('focus-visible:outline-none');
  expect(pickerButton?.className).toContain('justify-end');
  expect(paletteButton?.className).toContain('focus-visible:outline-none');
  expect(paletteButton?.className).toContain('justify-center');
  expect(pickerButton?.getAttribute('data-ui')).toBe('shared.ui.color-selector.picker-trigger');
  expect(paletteButton?.getAttribute('data-ui')).toBe('shared.ui.color-selector.palette-trigger');
  expect(paletteButton?.textContent).toBe('');
  expect(paletteButton?.querySelector('svg')?.className.baseVal).toContain('opacity-75');
});

it('marks the trigger chrome active while a palette or picker layer is open', () => {
  renderTrigger({ active: true });

  expect(
    container?.querySelector('[data-ui="shared.ui.color-selector.trigger"]')?.className
  ).toContain('border-[var(--sniptale-field-border-active)]');
});

it('renders the translated transparent label when the trigger value is transparent', () => {
  renderTrigger({ value: 'transparent' });

  expect(getButton('shared.ui.colorSelectorChooseColor')?.textContent).toContain(
    'shared.ui.colorSelectorTransparent'
  );
  expect(
    getButton('shared.ui.colorSelectorChooseColor')?.querySelector('span:last-child')?.className
  ).toContain('italic');
});

it('renders rgb and hsl values without forcing hex uppercase styling', () => {
  renderTrigger({ formatMode: 'rgb', value: '#abcdef' });
  expect(getButton('shared.ui.colorSelectorChooseColor')?.textContent).toContain(
    'RGB(171, 205, 239)'
  );

  renderTrigger({ formatMode: 'hsl', value: '#abcdef' });
  expect(getButton('shared.ui.colorSelectorChooseColor')?.textContent).toContain(
    'HSL(210, 68%, 80%)'
  );

  renderTrigger({ formatMode: 'rgb', value: 'not-a-color' });
  expect(getButton('shared.ui.colorSelectorChooseColor')?.textContent).toContain(
    'RGB(249, 115, 22)'
  );

  renderTrigger({ expanded: true, formatMode: 'hsl', value: 'also-bad' });
  expect(getButton('shared.ui.colorSelectorChooseColor')?.textContent).toContain(
    'HSL(25, 95%, 53%)'
  );
  expect(
    container?.querySelector('[data-ui="shared.ui.color-selector.trigger"]')?.className
  ).toContain('focus-within:bg-[var(--sniptale-field-bg-active)]');

  renderTrigger({ formatMode: 'hex', value: 'not-a-color' });
  expect(getButton('shared.ui.colorSelectorChooseColor')?.textContent).toContain('#F97316');
});

it('routes picker and palette clicks through their dedicated trigger zones', async () => {
  const onOpenPicker = vi.fn();
  const onToggleExpanded = vi.fn();
  renderTrigger({ onOpenPicker, onToggleExpanded });

  const pickerButton = getButton('shared.ui.colorSelectorChooseColor');
  const paletteButton = getButton('Grid color');

  await act(async () => {
    pickerButton?.click();
    paletteButton?.click();
  });

  expect(onOpenPicker).toHaveBeenCalledOnce();
  expect(onToggleExpanded).toHaveBeenCalledOnce();
});

it('keeps the dedicated chevron trigger clickable', async () => {
  const onToggleExpanded = vi.fn();
  renderTrigger({ onToggleExpanded });

  const paletteButton = getButton('Grid color');

  await act(async () => {
    paletteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(onToggleExpanded).toHaveBeenCalledOnce();
});
