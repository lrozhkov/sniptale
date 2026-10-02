// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MaterialBrowser } from './index';

it('discloses cards without unmounting the preview and returns to the full grid when selection clears', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const choose = vi.fn();
  const render = (selected: boolean) =>
    act(() =>
      root.render(
        <MaterialBrowser
          navigation={<nav>Categories</nav>}
          search={<input aria-label="Search" />}
          labels={{ list: 'Materials', show: 'Show materials', hide: 'Hide materials' }}
          preview={selected ? <video aria-label="Selected preview" /> : undefined}
        >
          <button onClick={choose}>Material</button>
        </MaterialBrowser>
      )
    );
  try {
    render(false);
    expect(host.querySelector('[data-layout="grid"]')).not.toBeNull();
    expect(host.querySelector('[aria-expanded]')).toBeNull();
    render(true);
    const preview = host.querySelector('video');
    const disclosure = host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
    const list = host.querySelector<HTMLElement>('[data-ui="library-materials-list"]')!;
    expect(disclosure.getAttribute('aria-controls')).toBe(list.id);
    expect(list.dataset['layout']).toBe('strip');
    list.scrollLeft = 440;
    list.scrollTop = 12;
    act(() => disclosure.click());
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
    expect(list.querySelector('button')).toBeNull();
    expect(host.querySelector('video')).toBe(preview);
    expect(choose).not.toHaveBeenCalled();
    list.scrollLeft = 0;
    list.scrollTop = 0;
    act(() => disclosure.click());
    expect(list.hidden).toBe(false);
    expect(list.scrollLeft).toBe(440);
    expect(list.scrollTop).toBe(12);
    act(() => list.querySelector('button')!.click());
    expect(choose).toHaveBeenCalledTimes(1);
    render(false);
    expect(list.dataset['layout']).toBe('grid');
    expect(list.hidden).toBe(false);
    expect(host.querySelector('video')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
