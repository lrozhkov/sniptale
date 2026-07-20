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

function renderSelector(props: Partial<React.ComponentProps<typeof CompactColorSelector>> = {}) {
  act(() => {
    root?.render(
      <CompactColorSelector
        title="Grid color"
        label="Grid color"
        value="#123456"
        recentColors={[]}
        palette={[]}
        onChange={() => undefined}
        {...props}
      />
    );
  });
}

async function clickButton(label: string) {
  await act(async () => {
    (
      Array.from(document.body.querySelectorAll('button') ?? []).find(
        (button) =>
          button.textContent?.includes(label) || button.getAttribute('aria-label') === label
      ) as HTMLButtonElement | undefined
    )?.click();
  });
}

async function changeHex(value: string) {
  const input = document.body.querySelector(
    'input[aria-label="shared.ui.colorSelectorHex"]'
  ) as HTMLInputElement | null;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  await act(async () => {
    descriptor?.set?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the picker open when interacting inside its portaled layer', async () => {
  const onPreviewReset = vi.fn();
  renderSelector({ onPreviewReset });

  await clickButton('shared.ui.colorSelectorChooseColor');
  const picker = document.body.querySelector('[data-ui="shared.ui.color-selector.picker-layer"]');
  await act(async () => {
    picker?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    picker?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(document.body.textContent).toContain('shared.ui.colorSelectorApply');
  expect(onPreviewReset).not.toHaveBeenCalled();
});

it('keeps the picker open when a Shadow DOM event path points inside the selector', async () => {
  const onPreviewReset = vi.fn();
  renderSelector({ onPreviewReset });

  await clickButton('shared.ui.colorSelectorChooseColor');
  const picker = document.body.querySelector(
    '[data-ui="shared.ui.color-selector.picker-layer"]'
  ) as HTMLDivElement | null;
  const shadowHost = document.createElement('div');
  document.body.appendChild(shadowHost);
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  const shadowButton = document.createElement('button');
  shadowRoot.appendChild(shadowButton);
  const event = new MouseEvent('mousedown', { bubbles: true, composed: true });
  Object.defineProperty(event, 'composedPath', {
    value: () => [shadowButton, shadowRoot, picker, document.body, document],
  });

  await act(async () => {
    document.dispatchEvent(event);
  });

  expect(document.body.textContent).toContain('shared.ui.colorSelectorApply');
  expect(onPreviewReset).not.toHaveBeenCalled();
  shadowHost.remove();
});

it('hides the picker and rolls back on outside click without committing the draft', async () => {
  const onChange = vi.fn();
  const onPreviewReset = vi.fn();
  renderSelector({ onChange, onPreviewReset });

  await clickButton('shared.ui.colorSelectorChooseColor');
  await changeHex('#abcdef');
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(document.body.textContent).not.toContain('shared.ui.colorSelectorApply');
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreviewReset).toHaveBeenCalledWith('#123456');
  expect(document.body.textContent).toContain('#123456'.toUpperCase());
});
