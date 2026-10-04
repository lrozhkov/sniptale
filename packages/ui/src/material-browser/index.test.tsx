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

it('preserves independent grid and strip positions across repeated and collapsed returns', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (preview: boolean) =>
    act(() =>
      root.render(
        <MaterialBrowser
          labels={{ list: 'Materials', show: 'Show materials', hide: 'Hide materials' }}
          preview={preview ? <p>Preview</p> : undefined}
        >
          <button onClick={() => render(true)}>Material</button>
        </MaterialBrowser>
      )
    );
  try {
    render(false);
    const list = host.querySelector<HTMLElement>('[data-ui="library-materials-list"]')!;
    const scrollTo = (left: number, top: number) => {
      list.scrollLeft = left;
      list.scrollTop = top;
      act(() => list.dispatchEvent(new Event('scroll')));
    };
    list.scrollTop = 300;
    act(() => list.querySelector<HTMLButtonElement>('button')!.click());
    expect([list.scrollLeft, list.scrollTop]).toEqual([0, 0]);
    scrollTo(440, 0);
    render(false);
    expect([list.scrollLeft, list.scrollTop]).toEqual([0, 300]);
    scrollTo(0, 600);
    render(true);
    expect([list.scrollLeft, list.scrollTop]).toEqual([440, 0]);
    const disclosure = host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
    act(() => disclosure.click());
    expect(list.hidden).toBe(true);
    scrollTo(0, 0);
    render(false);
    expect(list.hidden).toBe(false);
    expect([list.scrollLeft, list.scrollTop]).toEqual([0, 600]);
    render(true);
    expect(list.hidden).toBe(true);
    act(() => host.querySelector<HTMLButtonElement>('[aria-expanded]')!.click());
    expect(list.hidden).toBe(false);
    expect([list.scrollLeft, list.scrollTop]).toEqual([440, 0]);
    render(false);
    expect([list.scrollLeft, list.scrollTop]).toEqual([0, 600]);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
