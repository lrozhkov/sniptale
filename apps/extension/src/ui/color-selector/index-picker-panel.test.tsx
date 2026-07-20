// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompactColorSelector } from './index';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSelector() {
  if (!container) {
    throw new Error('Test container is not initialized');
  }

  act(() => {
    root?.render(
      <>
        <CompactColorSelector
          title="Grid color"
          label="Grid color"
          value="#123456"
          recentColors={['#111111']}
          palette={['#abcdef']}
          onChange={() => undefined}
        />
        <div data-ui="shared.ui.color-selector.after-content">after-content</div>
      </>
    );
  });
}

function getButton(label: string) {
  return Array.from(document.body.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

function getTextInput(label: string) {
  return Array.from(document.body.querySelectorAll('input') ?? []).find(
    (input) => input.getAttribute('aria-label') === label
  ) as HTMLInputElement | undefined;
}

function getModeCycleButton() {
  return document.body.querySelector(
    '[data-ui="shared.ui.color-selector.mode-cycle"]'
  ) as HTMLButtonElement | null;
}

function getPickerPanel() {
  return document.body.querySelector(
    '[data-ui="shared.ui.color-selector.picker"]'
  ) as HTMLDivElement | null;
}

async function clickButton(label: string) {
  await act(async () => {
    getButton(label)?.click();
  });
}

async function cycleMode(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      getModeCycleButton()?.click();
    });
  }
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
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders the picker in a portaled floating layer outside the field flow', async () => {
  renderSelector();
  await clickButton('shared.ui.colorSelectorChooseColor');

  const picker = getPickerPanel();
  const pickerWrapper = picker?.parentElement;

  expect(picker).not.toBeNull();
  expect(container?.querySelector('[data-floating-ui-root]')).toBeNull();
  expect(pickerWrapper?.dataset['ui']).toBe('shared.ui.color-selector.picker-layer');
  expect(pickerWrapper?.dataset['floatingUiRoot']).toBe('true');
  expect(pickerWrapper?.className).toContain('fixed');
  expect(container?.querySelector('[data-ui="shared.ui.color-selector.picker"]')).toBeNull();
});

it('cycles the visible field group through HEX, RGB, and HSL from the label-row overlay', async () => {
  renderSelector();
  await clickButton('shared.ui.colorSelectorChooseColor');

  expect(getModeCycleButton()?.textContent).toBe('');
  expect(getTextInput('shared.ui.colorSelectorHex')).toBeDefined();
  expect(getTextInput('shared.ui.colorSelectorRed')).toBeUndefined();
  expect(getTextInput('shared.ui.colorSelectorHue')).toBeUndefined();

  await cycleMode();

  expect(getModeCycleButton()?.textContent).toBe('');
  expect(getTextInput('shared.ui.colorSelectorHex')).toBeUndefined();
  expect(getTextInput('shared.ui.colorSelectorRed')).toBeDefined();
  expect(getTextInput('shared.ui.colorSelectorHue')).toBeUndefined();

  await cycleMode();

  expect(getTextInput('shared.ui.colorSelectorRed')).toBeUndefined();
  expect(getTextInput('shared.ui.colorSelectorHue')).toBeDefined();

  await cycleMode();

  expect(getTextInput('shared.ui.colorSelectorHex')).toBeDefined();
  expect(getTextInput('shared.ui.colorSelectorHue')).toBeUndefined();
});

it('keeps the hover-highlight target on the label row instead of a visible mode button', async () => {
  renderSelector();
  await clickButton('shared.ui.colorSelectorChooseColor');

  const modeCycleButton = getModeCycleButton();
  const labelRow = document.body.querySelector(
    '[data-ui="shared.ui.color-selector.mode-label-row"]'
  );

  expect(modeCycleButton?.textContent).toBe('');
  expect(modeCycleButton?.className).toContain('hover:bg-');
  expect(labelRow?.textContent).toContain('shared.ui.colorSelectorHex');
});

it('persists the chosen input format into the trigger display and the next picker open', async () => {
  renderSelector();
  await clickButton('shared.ui.colorSelectorChooseColor');
  await cycleMode();
  await clickButton('shared.ui.colorSelectorCancel');

  expect(document.body.textContent).toContain('RGB(18, 52, 86)');

  await clickButton('shared.ui.colorSelectorChooseColor');

  expect(getTextInput('shared.ui.colorSelectorRed')).toBeDefined();
  expect(getTextInput('shared.ui.colorSelectorHex')).toBeUndefined();
});
