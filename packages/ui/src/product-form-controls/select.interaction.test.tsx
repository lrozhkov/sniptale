// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ProductSelect } from '@sniptale/ui/product-form-controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(element);
  });
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

function renderLanguageSelect(props?: Partial<React.ComponentProps<typeof ProductSelect>>) {
  renderElement(
    <ProductSelect
      value="ru"
      onChange={() => undefined}
      options={[
        { value: 'ru', label: 'Русский' },
        { value: 'en', label: 'English' },
      ]}
      {...props}
    />
  );
}

function openRenderedSelect() {
  act(() => {
    container?.querySelector('button')?.click();
  });
}

function dispatchKeydown(target: Element | null | undefined, key: string) {
  act(() => {
    target?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

it('renders a custom listbox and marks the selected option', () => {
  renderLanguageSelect();

  const trigger = container?.querySelector('button');
  expect(trigger?.textContent).toContain('Русский');

  openRenderedSelect();

  const selectedOption = container?.querySelector('[aria-selected="true"]');
  expect(container?.querySelector('[role="listbox"]')).toBeTruthy();
  expect(trigger?.className).toContain('sniptale-select-open');
  expect(selectedOption?.className).toContain('sniptale-select-option-selected');
  expect(selectedOption?.textContent).toContain('Русский');
  expect(selectedOption?.querySelector('.sniptale-select-value-label-menu')).not.toBeNull();
});

it('calls onChange when a new option is chosen from the custom menu', () => {
  const onChange = vi.fn();

  renderLanguageSelect({ onChange });
  openRenderedSelect();

  const englishOption = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((option) => option.textContent?.includes('English'));

  expect(englishOption).toBeTruthy();

  act(() => {
    englishOption?.click();
  });

  expect(onChange).toHaveBeenCalledWith('en');
  expect(container?.querySelector('[role="listbox"]')).toBeNull();
});

it('applies custom menu classes to the rendered listbox', () => {
  renderLanguageSelect({
    'aria-label': 'Preset',
    menuClassName: 'w-[15rem]',
  });
  openRenderedSelect();

  expect(container?.querySelector('[role="listbox"]')?.className).toContain('w-[15rem]');
});

it('supports keyboard navigation, selection, and escape-to-trigger focus restoration', async () => {
  const onChange = vi.fn();

  renderLanguageSelect({ onChange });

  const trigger = container?.querySelector('button');
  trigger?.focus();
  dispatchKeydown(trigger, 'ArrowDown');

  const options = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  );
  expect(container?.querySelector('[role="listbox"]')).not.toBeNull();
  expect(document.activeElement?.textContent).toContain('Русский');

  dispatchKeydown(options[0], 'ArrowDown');
  expect(document.activeElement?.textContent).toContain('English');

  act(() => {
    (document.activeElement as HTMLButtonElement | null)?.click();
  });
  await flushMicrotasks();

  expect(onChange).toHaveBeenCalledWith('en');
  expect(container?.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);

  dispatchKeydown(trigger, 'ArrowDown');
  const reopenedOptions = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  );
  dispatchKeydown(reopenedOptions[1], 'Escape');
  await flushMicrotasks();

  expect(container?.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('renders the placeholder copy when the current value is missing from the options', () => {
  renderElement(
    <ProductSelect
      value=""
      onChange={() => undefined}
      placeholder="Choose language"
      options={[
        { value: 'ru', label: 'Русский' },
        { value: 'en', label: 'English' },
      ]}
    />
  );

  expect(container?.querySelector('button')?.textContent).toContain('Choose language');
});
