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

it('submits a tag through Enter without rendering a duplicate add button', () => {
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
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected gallery tag input');
  }

  expect(container?.textContent).not.toContain('common.actions.add');

  setInputValue(input, 'alpha');
  act(() => {
    root?.render(
      <GalleryTagInput
        allTags={['alpha', 'beta']}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="Search tags"
        value="alpha"
      />
    );
  });
  const updatedInput = container?.querySelector('input');
  if (!(updatedInput instanceof HTMLInputElement)) {
    throw new Error('Expected updated gallery tag input');
  }
  act(() => {
    updatedInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onChange).toHaveBeenCalledWith('alpha');
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onSubmit).toHaveBeenCalledWith('alpha');
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

  const suggestionButtons = Array.from(container?.querySelectorAll('[role="option"]') ?? []);
  const alphaButton = suggestionButtons.find((button) => button.textContent?.includes('alpha'));

  if (!(alphaButton instanceof HTMLButtonElement)) {
    throw new Error('Expected suggestion button');
  }

  expect(container?.textContent).toContain('beta');
  expect(container?.textContent).not.toContain('gamma');
  expect(container?.textContent).not.toContain('gallery.preview.suggestionLabel');
  expect(alphaButton.parentElement?.className).toContain('max-h-48');
  expect(alphaButton.parentElement?.className).toContain('overflow-y-auto');
  expect(alphaButton.parentElement?.parentElement?.className).toContain('z-50');

  act(() => {
    alphaButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    vi.runAllTimers();
  });

  expect(onSubmit).toHaveBeenCalledWith('alpha');
});

it('offers one explicit create action for a new filtered tag', () => {
  const onSubmit = vi.fn();

  act(() => {
    root?.render(
      <GalleryTagInput
        allTags={['alpha', 'beta']}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        placeholder="Search tags"
        value="release"
      />
    );
  });

  const input = container?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected gallery tag input');
  }

  act(() => input.focus());

  const createButton = Array.from(container?.querySelectorAll('[role="option"]') ?? []).find(
    (option) => option.textContent?.includes('gallery.app.createTag')
  );
  if (!(createButton instanceof HTMLButtonElement)) {
    throw new Error('Expected create-tag option');
  }

  expect(container?.textContent?.match(/gallery\.app\.createTag/g)).toHaveLength(1);

  act(() => {
    createButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(onSubmit).toHaveBeenCalledWith('release');
});

it('keeps suggestion selection as a draft until the explicit apply action', () => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();

  const render = (value: string) => {
    act(() => {
      root?.render(
        <GalleryTagInput
          allTags={['alpha', 'beta']}
          explicitSubmit
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Enter tag"
          value={value}
        />
      );
    });
  };

  render('a');
  const input = container?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) throw new Error('Expected gallery tag input');
  act(() => input.focus());
  const alphaButton = Array.from(container?.querySelectorAll('[role="option"]') ?? []).find(
    (option) => option.textContent === 'alpha'
  );
  if (!(alphaButton instanceof HTMLButtonElement)) throw new Error('Expected alpha suggestion');

  act(() => alphaButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));

  expect(onChange).toHaveBeenCalledWith('alpha');
  expect(onSubmit).not.toHaveBeenCalled();

  render('alpha');
  const updatedInput = container?.querySelector('input');
  if (!(updatedInput instanceof HTMLInputElement)) throw new Error('Expected updated tag input');
  act(() => updatedInput.focus());
  expect(container?.querySelector('[role="listbox"]')).not.toBeNull();
  const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === 'gallery.app.apply'
  );
  if (!(applyButton instanceof HTMLButtonElement)) throw new Error('Expected apply action');
  act(() => applyButton.click());

  expect(onSubmit).toHaveBeenCalledWith('alpha');
});
