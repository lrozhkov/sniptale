// @vitest-environment jsdom

import React from 'react';
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
const RECENT_COLORS = [
  '#111111',
  '#222222',
  '#333333',
  '#444444',
  '#555555',
  '#666666',
  '#777777',
  '#888888',
  '#999999',
  '#aaaaaa',
  '#bbbbbb',
];
const PALETTE = [
  '#abcdef',
  '#fedcba',
  '#135790',
  '#2468ac',
  '#0f766e',
  '#f97316',
  '#2563eb',
  '#e11d48',
  '#18181b',
  '#fafafa',
  '#14b8a6',
];

function renderSelector(props: Partial<React.ComponentProps<typeof CompactColorSelector>> = {}) {
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
          recentColors={RECENT_COLORS}
          palette={PALETTE}
          onChange={() => undefined}
          {...props}
        />
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

async function changeInput(label: string, value: string) {
  const input = getTextInput(label);
  if (!input) {
    throw new Error(`${label} input not found`);
  }

  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  await act(async () => {
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function clickButton(label: string) {
  await act(async () => {
    getButton(label)?.click();
  });
}

async function openPicker() {
  await clickButton('shared.ui.colorSelectorChooseColor');
}

async function openPalette() {
  await clickButton('Grid color');
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

it('renders the compact trigger with the current hex value and ten swatches per section', async () => {
  renderSelector();

  expect(container?.textContent).not.toContain('Grid color');
  expect(container?.textContent).toContain('#123456'.toUpperCase());
  expect(container?.textContent).not.toContain('shared.ui.colorSelectorTransparent');

  await openPalette();

  expect(document.body.textContent).toContain('shared.ui.colorSelectorRecentColors');
  expect(document.body.textContent).toContain('shared.ui.colorSelectorPalette');

  const swatches = Array.from(document.body.querySelectorAll('button[title]') ?? []).filter(
    (button) => button.getAttribute('title')?.startsWith('Grid color: #')
  );
  const swatchRows = document.body.querySelectorAll('div.grid-cols-10') ?? [];

  expect(swatches).toHaveLength(20);
  expect(swatchRows).toHaveLength(2);
});

it('places the floating palette above content inspector overlays', async () => {
  renderSelector();

  await openPalette();

  const layer = document.body.querySelector('[data-ui="shared.ui.color-selector.expanded-layer"]');
  expect(layer?.className).toContain('z-[2147483647]');
});

it('omits empty recent and palette sections from the expanded body', async () => {
  renderSelector({ palette: [], recentColors: [] });

  await openPalette();

  expect(document.body.textContent).not.toContain('shared.ui.colorSelectorRecentColors');
  expect(document.body.textContent).not.toContain('shared.ui.colorSelectorPalette');
});

it('commits swatch picks immediately from the expanded recent and palette rows', async () => {
  const onChange = vi.fn();
  renderSelector({ onChange });

  await openPalette();
  await act(async () => {
    (
      Array.from(document.body.querySelectorAll('button[title]') ?? []).find(
        (button) => button.getAttribute('title') === 'Grid color: #111111'
      ) as HTMLButtonElement | undefined
    )?.click();
  });

  expect(onChange).toHaveBeenCalledWith('#111111');
});

it('keeps picker edits preview-only until apply, then commits once', async () => {
  const onChange = vi.fn();
  const onPreviewChange = vi.fn();
  renderSelector({ onChange, onPreviewChange });

  await openPicker();
  await changeInput('shared.ui.colorSelectorHex', '#c83456');

  expect(onPreviewChange).toHaveBeenCalledWith('#c83456');
  expect(onChange).not.toHaveBeenCalled();

  await clickButton('shared.ui.colorSelectorApply');

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('#c83456');
});

it('rolls preview back to the committed value when the picker closes without apply', async () => {
  const onPreviewChange = vi.fn();
  const onPreviewReset = vi.fn();
  renderSelector({ onPreviewChange, onPreviewReset });

  await openPicker();
  await changeInput('shared.ui.colorSelectorHex', '#abcdef');
  await clickButton('shared.ui.colorSelectorCancel');

  expect(onPreviewChange).toHaveBeenCalledWith('#abcdef');
  expect(onPreviewReset).toHaveBeenCalledWith('#123456');
  expect(document.body.textContent).toContain('#123456'.toUpperCase());
  expect(document.body.textContent).not.toContain('#ABCDEF');
});

it('renders the translated transparent value in the picker trigger', () => {
  renderSelector({ value: 'transparent' });

  expect(container?.textContent).toContain('shared.ui.colorSelectorTransparent');
});

it('previews transparent from the picker toolbar and commits it only on apply', async () => {
  const onChange = vi.fn();
  const onPreviewChange = vi.fn();
  renderSelector({ onChange, onPreviewChange });

  await openPicker();
  await clickButton('shared.ui.colorSelectorTransparent');

  expect(onPreviewChange).toHaveBeenCalledWith('transparent');
  expect(onChange).not.toHaveBeenCalled();
  expect(getButton('shared.ui.colorSelectorApply')).toBeDefined();

  await clickButton('shared.ui.colorSelectorApply');

  expect(onChange).toHaveBeenCalledWith('transparent');
});

it('opens the picker from the color trigger and the palette after the picker is closed', async () => {
  renderSelector();

  await openPicker();
  expect(getButton('shared.ui.colorSelectorApply')).toBeDefined();

  await clickButton('shared.ui.colorSelectorCancel');
  await openPalette();
  expect(document.body.textContent).toContain('shared.ui.colorSelectorPalette');
  expect(getButton('shared.ui.colorSelectorApply')).toBeUndefined();
});

it('closes the expanded recent-colors palette on outside click', async () => {
  renderSelector();

  await openPalette();
  expect(document.body.textContent).toContain('shared.ui.colorSelectorRecentColors');

  await act(async () => {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(document.body.textContent).not.toContain('shared.ui.colorSelectorRecentColors');
});

it('hides the picker and rolls back when the color trigger is clicked again', async () => {
  const onChange = vi.fn();
  const onPreviewReset = vi.fn();
  renderSelector({ onChange, onPreviewReset });
  await openPicker();
  await changeInput('shared.ui.colorSelectorHex', '#abcdef');
  await openPicker();

  expect(getButton('shared.ui.colorSelectorApply')).toBeUndefined();
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreviewReset).toHaveBeenCalledWith('#123456');
});

it('keeps the picker open on escape without committing the draft', async () => {
  const onChange = vi.fn();
  const onPreviewChange = vi.fn();
  const onPreviewReset = vi.fn();
  renderSelector({ onChange, onPreviewChange, onPreviewReset });

  await openPicker();
  await changeInput('shared.ui.colorSelectorHex', '#abcdef');

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  expect(getButton('shared.ui.colorSelectorApply')).toBeDefined();
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreviewReset).not.toHaveBeenCalled();
});
