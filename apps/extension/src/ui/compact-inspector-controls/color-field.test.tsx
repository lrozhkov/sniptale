// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';

import { ColorField } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderColorField() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ColorField
        label="Цвет обводки"
        title="Цвет обводки"
        value="#f8fafc"
        onChange={() => undefined}
      />
    );
  });
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

it('renders the compact color row as one left label and one right value field', () => {
  renderColorField();

  const field = container!.querySelector('[data-ui="shared.ui.compact-inspector.color-field"]');
  const selectorRoot = container!.querySelector('[data-ui="shared.ui.color-selector"]');
  const trigger = container!.querySelector('[data-ui="shared.ui.color-selector.trigger"]');
  const pickerTrigger = container!.querySelector(
    '[data-ui="shared.ui.color-selector.picker-trigger"]'
  );
  const paletteTrigger = container!.querySelector(
    '[data-ui="shared.ui.color-selector.palette-trigger"]'
  );

  expect(field?.textContent).toBe('Цвет обводки#F8FAFC');
  expect(field?.className).toContain('items-center');
  expect(selectorRoot?.className).toContain('ml-auto');
  expect(selectorRoot?.className).toContain('!w-[8.75rem]');
  expect(selectorRoot?.className).toContain('min-w-0');
  expect(selectorRoot?.className).toContain('max-w-[58%]');
  expect(selectorRoot?.className).toContain('shrink-0');
  expect(selectorRoot?.className).toContain("[&_[data-ui='shared.ui.color-selector.trigger']]:h-8");
  expect(trigger?.className).toContain('gap-2');
  expect(selectorRoot?.className).toContain(
    "[&_[data-ui='shared.ui.color-selector.trigger']]:px-0"
  );
  expect(selectorRoot?.className).toContain(
    "[&_[data-ui='shared.ui.color-selector.trigger']]:bg-transparent"
  );
  expect(container!.querySelectorAll('[data-ui="shared.ui.color-selector.trigger"]')).toHaveLength(
    1
  );
  expect(pickerTrigger?.className).toContain('justify-end');
  expect(paletteTrigger?.className).toContain('w-5');
});
