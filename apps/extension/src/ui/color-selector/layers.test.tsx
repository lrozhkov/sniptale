// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { CompactColorSelector } from './index';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSelector() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <CompactColorSelector
        label="Цвет"
        title="Цвет"
        value="#f8fafc"
        palette={['#111111']}
        recentColors={['#222222']}
        onChange={() => undefined}
      />
    );
  });
}

function renderDarkSelector() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <div className="sniptale-theme-dark">
        <CompactColorSelector
          label="Цвет"
          title="Цвет"
          value="#f8fafc"
          palette={['#111111']}
          recentColors={['#222222']}
          onChange={() => undefined}
        />
      </div>
    );
  });
}

function renderSelectorInScroller() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <div data-testid="scroll-parent">
        <CompactColorSelector
          label="Цвет"
          title="Цвет"
          value="#f8fafc"
          palette={['#111111']}
          recentColors={['#222222']}
          onChange={() => undefined}
        />
      </div>
    );
  });
}

function getButton(label: string) {
  return Array.from(document.body.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

afterEach(() => {
  if (!root || !container) {
    return;
  }
  act(() => root!.unmount());
  root = null;
  container!.remove();
  container = null;
});

it('renders picker and palette content in floating layers under the trigger', () => {
  renderSelector();

  act(() => {
    getButton('shared.ui.colorSelectorChooseColor')?.click();
  });
  const pickerLayer = document.body.querySelector(
    '[data-ui="shared.ui.color-selector.picker-layer"]'
  ) as HTMLDivElement | null;
  expect(pickerLayer?.className).toContain('fixed');
  expect(pickerLayer?.dataset['floatingUiRoot']).toBe('true');
  expect(pickerLayer?.style.width).toBe('224px');
  expect(container!.querySelector('[data-ui="shared.ui.color-selector.picker"]')).toBeNull();
  expect(document.body.querySelector('[data-ui="shared.ui.color-selector.picker"]')).not.toBeNull();

  act(() => {
    getButton('shared.ui.colorSelectorChooseColor')?.click();
  });
  act(() => {
    getButton('Цвет')?.click();
  });
  const expandedLayer = document.body.querySelector(
    '[data-ui="shared.ui.color-selector.expanded-layer"]'
  ) as HTMLDivElement | null;
  expect(expandedLayer?.className).toContain('fixed');
  expect(expandedLayer?.dataset['floatingUiRoot']).toBe('true');
  expect(expandedLayer?.style.width).toBe('224px');
  expect(document.body.textContent).toContain('shared.ui.colorSelectorPalette');
});

it('keeps the picker layer scoped to a local dark theme class', () => {
  renderDarkSelector();

  act(() => {
    getButton('shared.ui.colorSelectorChooseColor')?.click();
  });

  const pickerLayer = document.body.querySelector(
    '[data-ui="shared.ui.color-selector.picker-layer"]'
  ) as HTMLDivElement | null;
  expect(pickerLayer?.getAttribute('data-theme')).toBe('dark');
});

it('keeps color layers pointer-interactive and anchored to owning scroll parents', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  renderSelectorInScroller();
  let anchorTop = 32;
  const scroller = container!.querySelector<HTMLElement>('[data-testid="scroll-parent"]')!;
  const selector = container!.querySelector<HTMLElement>('[data-ui="shared.ui.color-selector"]')!;
  selector.getBoundingClientRect = () =>
    ({
      bottom: anchorTop + 36,
      height: 36,
      left: 120,
      right: 320,
      top: anchorTop,
      width: 200,
      x: 120,
      y: anchorTop,
      toJSON: () => undefined,
    }) as DOMRect;

  act(() => {
    getButton('shared.ui.colorSelectorChooseColor')?.click();
  });
  const pickerLayer = document.body.querySelector<HTMLElement>(
    '[data-ui="shared.ui.color-selector.picker-layer"]'
  )!;
  expect(pickerLayer.style.pointerEvents).toBe('auto');
  expect(pickerLayer.style.top).toBe('76px');

  anchorTop = 110;
  act(() => {
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(pickerLayer.style.top).toBe('154px');
});
