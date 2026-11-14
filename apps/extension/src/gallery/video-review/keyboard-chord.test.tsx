// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewKeyboardChord } from './keyboard-chord';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

it('selects Cmd and Win through search, keyboard navigation and removal', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const previousScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  function Fixture() {
    const [keys, setKeys] = useState(['K']);
    return (
      <ReviewKeyboardChord
        label={keys.join('+')}
        keys={keys}
        onChange={(label, next) => {
          change(label, next);
          setKeys(next);
        }}
      />
    );
  }
  const search = async (input: HTMLInputElement, text: string) =>
    act(async () => {
      input.focus();
      input.click();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const choose = async (label: string) => {
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
      option.textContent?.startsWith(label)
    );
    expect(option).toBeDefined();
    await act(async () => option!.querySelector<HTMLButtonElement>('button')!.click());
  };
  try {
    await act(async () => root.render(<Fixture />));
    const add = () =>
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.addChordKey"]')!;
    await search(add(), 'command');
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    await choose('Cmd');
    expect(change).toHaveBeenLastCalledWith('K+Cmd', ['K', 'Cmd']);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    await search(add(), 'windows');
    await choose('Win');
    expect(change).toHaveBeenLastCalledWith('K+Cmd+Win', ['K', 'Cmd', 'Win']);
    await search(add(), 'Cmd');
    expect(
      [...document.querySelectorAll('[role="option"]')].some((option) =>
        option.textContent?.startsWith('Cmd')
      )
    ).toBe(false);
    await search(add(), 'F12');
    await act(async () =>
      add().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    );
    expect(add().getAttribute('aria-activedescendant')).toBeTruthy();
    await act(async () =>
      add().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(change).toHaveBeenLastCalledWith('K+Cmd+Win+F12', ['K', 'Cmd', 'Win', 'F12']);
    await search(add(), 'no-such-key');
    expect(document.body.textContent).toContain('gallery.videoReview.noChordKeys');
    await act(async () =>
      add().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(add().getAttribute('aria-expanded')).toBe('false');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.removeChordKey"]')!
        .click()
    );
    expect(change).toHaveBeenLastCalledWith('Cmd+Win+F12', ['Cmd', 'Win', 'F12']);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (previousScroll)
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    vi.unstubAllGlobals();
  }
});
