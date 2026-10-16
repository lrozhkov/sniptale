// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { GalleryTagInput } from './input';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView'
);

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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
    DOMRect.fromRect({ x: 100, y: 100, width: 335, height: 32 })
  );
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
  vi.restoreAllMocks();
  if (originalScrollIntoView)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

it('portals suggestions outside clipped content into their owning modal and repositions them', () => {
  const dialog = document.createElement('dialog');
  dialog.open = true;
  dialog.dataset.theme = 'dark';
  document.body.append(dialog);
  dialog.append(container!);
  container!.style.overflowY = 'auto';
  vi.stubGlobal('innerHeight', 560);
  vi.stubGlobal('innerWidth', 1280);
  let top = 480;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
    DOMRect.fromRect({ x: 900, y: top, width: 335, height: 32 })
  );
  act(() =>
    root?.render(
      <GalleryTagInput
        allTags={['alpha', 'beta']}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Search tags"
        value="a"
      />
    )
  );
  const input = container!.querySelector('input')!;
  act(() => input.focus());
  const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(list.parentElement).toBe(dialog);
  expect(container!.contains(list)).toBe(false);
  expect(list.dataset.theme).toBe('dark');
  expect(list.dataset.floatingUiOwnedBy).toBe(
    input.closest('[data-floating-ui-owner-id]')?.getAttribute('data-floating-ui-owner-id')
  );
  expect(list.style.position).toBe('fixed');
  expect(list.style.top).toBe('475px');
  expect(list.style.transform).toBe('translateY(-100%)');
  expect(Number.parseFloat(list.style.maxHeight)).toBeLessThanOrEqual(208);
  top = 300;
  act(() => container!.dispatchEvent(new Event('scroll')));
  expect(list.style.top).toBe('337px');
  expect(list.style.transform).toBe('');
  top = 320;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(list.style.top).toBe('357px');
  top = 600;
  act(() => container!.dispatchEvent(new Event('scroll')));
  expect(dialog.querySelector('[role="listbox"]')).toBeNull();
  expect(input.value).toBe('a');
  act(() => root?.unmount());
  root = null;
  expect(dialog.querySelector('[role="listbox"]')).toBeNull();
  dialog.remove();
});

it('keeps keyboard options visible and consumes Escape without closing the owning preview', () => {
  const onSubmit = vi.fn();
  const escaped = vi.fn();
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  act(() =>
    root?.render(
      <div onKeyDown={escaped}>
        <GalleryTagInput
          allTags={['alpha', 'beta']}
          onChange={vi.fn()}
          onSubmit={onSubmit}
          placeholder="Search tags"
          value="a"
        />
      </div>
    )
  );
  const input = container!.querySelector('input')!;
  act(() => input.focus());
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' })));
  const active = document.querySelector('[role="option"][aria-selected="true"]');
  expect(active?.textContent).toContain('gallery.app.createTag');
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  expect(document.activeElement).toBe(input);
  escaped.mockClear();
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(escaped).not.toHaveBeenCalled();
  expect(input.value).toBe('a');
  expect(document.activeElement).toBe(input);
  expect(onSubmit).not.toHaveBeenCalled();
});

it('contains menu wheel input and exposes complete option titles', () => {
  const wheelOutside = vi.fn();
  container!.addEventListener('wheel', wheelOutside);
  act(() =>
    root?.render(
      <GalleryTagInput
        allTags={['a long existing tag']}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Search tags"
        value="a"
      />
    )
  );
  act(() => container!.querySelector('input')!.focus());
  const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
  const options = [...list.querySelectorAll('[role="option"]')];
  expect(options[0]?.getAttribute('title')).toBe('a long existing tag');
  expect(options[1]?.getAttribute('title')).toBe(options[1]?.textContent);
  const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });
  options[0]!.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  expect(wheelOutside).not.toHaveBeenCalled();
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

  const suggestionButtons = Array.from(document.querySelectorAll('[role="option"]'));
  const alphaButton = suggestionButtons.find((button) => button.textContent?.includes('alpha'));

  if (!(alphaButton instanceof HTMLButtonElement)) {
    throw new Error('Expected suggestion button');
  }

  expect(document.querySelector('[role="listbox"]')?.textContent).toContain('beta');
  expect(container?.textContent).not.toContain('gamma');
  expect(container?.textContent).not.toContain('gallery.preview.suggestionLabel');
  expect(alphaButton.parentElement).toBe(document.querySelector('[role="listbox"]'));
  expect(container?.contains(alphaButton)).toBe(false);

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

  const createButton = Array.from(document.querySelectorAll('[role="option"]')).find((option) =>
    option.textContent?.includes('gallery.app.createTag')
  );
  if (!(createButton instanceof HTMLButtonElement)) {
    throw new Error('Expected create-tag option');
  }

  expect(
    document.querySelector('[role="listbox"]')?.textContent?.match(/gallery\.app\.createTag/g)
  ).toHaveLength(1);

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
  const alphaButton = Array.from(document.querySelectorAll('[role="option"]')).find(
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
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === 'gallery.app.apply'
  );
  if (!(applyButton instanceof HTMLButtonElement)) throw new Error('Expected apply action');
  act(() => applyButton.click());

  expect(onSubmit).toHaveBeenCalledWith('alpha');
});

it('clears the tag draft without applying it and restores combobox focus', () => {
  const onSubmit = vi.fn();
  function Draft() {
    const [value, setValue] = useState('alpha');
    return (
      <GalleryTagInput
        allTags={['alpha', 'beta']}
        explicitSubmit
        onChange={setValue}
        onSubmit={onSubmit}
        placeholder="Enter tag"
        value={value}
      />
    );
  }
  act(() => root?.render(<Draft />));
  const input = container?.querySelector('input');
  const clear = container?.querySelector('.sniptale-field-clear');
  expect(clear).toBeInstanceOf(HTMLButtonElement);
  act(() => (clear as HTMLButtonElement).click());
  expect(input?.value).toBe('');
  expect(input?.getAttribute('aria-label')).toBe('Enter tag');
  expect(document.activeElement).toBe(input);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(container?.querySelector('.sniptale-field-clear')).toBeNull();
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  expect(container?.textContent).not.toContain('gallery.app.apply');
  setInputValue(input!, 'beta');
  const apply = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === 'gallery.app.apply'
  );
  act(() => apply?.click());
  expect(onSubmit).toHaveBeenCalledWith('beta');
});
