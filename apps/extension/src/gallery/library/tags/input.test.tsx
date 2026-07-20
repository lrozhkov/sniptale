// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { GalleryTagInput } from './input';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) {
    throw new Error('Expected native input setter');
  }

  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('submits tags through change, Enter, and add-button interactions', () => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();

  act(() => {
    root?.render(
      <GalleryTagInput
        allTags={['alpha', 'beta']}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="Search tags"
        value="alp"
      />
    );
  });

  const input = container?.querySelector('input');
  const addButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('common.actions.add')
  );

  if (!(input instanceof HTMLInputElement) || !(addButton instanceof HTMLButtonElement)) {
    throw new Error('Expected gallery tag input controls');
  }

  setInputValue(input, 'alpha');
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    addButton.click();
  });

  expect(onChange).toHaveBeenCalledWith('alpha');
  expect(onSubmit).toHaveBeenCalledTimes(2);
});

it('shows filtered suggestions and submits the clicked suggestion', () => {
  const onSubmit = vi.fn();

  act(() => {
    root?.render(
      <GalleryTagInput
        allTags={['alpha', 'beta', 'gamma']}
        excludeTags={['gamma']}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        placeholder="Search tags"
        value="a"
      />
    );
  });

  const input = container?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected gallery tag input');
  }

  act(() => {
    input.focus();
  });

  const suggestionButtons = Array.from(container?.querySelectorAll('button') ?? []).filter(
    (button) => button.textContent?.includes('gallery.preview.suggestionLabel')
  );
  const alphaButton = suggestionButtons.find((button) => button.textContent?.includes('alpha'));

  if (!(alphaButton instanceof HTMLButtonElement)) {
    throw new Error('Expected suggestion button');
  }

  expect(container?.textContent).toContain('beta');
  expect(container?.textContent).not.toContain('gamma');

  act(() => {
    alphaButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    vi.runAllTimers();
  });

  expect(onSubmit).toHaveBeenCalledWith('alpha');
});
