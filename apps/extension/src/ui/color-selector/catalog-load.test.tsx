// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ColorCatalogPanel } from './catalog-panel';
vi.mock('./catalog-data', () => {
  throw new Error('Optional chunk unavailable');
});
it('keeps CSS selection and alpha usable when the optional catalog cannot load', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(async () =>
      root.render(<ColorCatalogPanel color="#66339980" onColorChange={change} onExit={vi.fn()} />)
    );
    expect(host.querySelector('.sniptale-catalog-retry')).not.toBeNull();
    expect(host.querySelector('.sniptale-catalog-count span')?.textContent).toBe('148');
    const input = host.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'coral'
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.sniptale-catalog-tiles button')!.click()
    );
    expect(change).toHaveBeenCalledWith('#ff7f5080');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.sniptale-catalog-retry')!.click()
    );
    expect(host.querySelector('.sniptale-catalog-retry')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('does not announce the CSS fallback count as the all-colors catalog while loading', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(<ColorCatalogPanel color="#663399" onColorChange={vi.fn()} onExit={vi.fn()} />)
    );
    expect(host.querySelector('.sniptale-catalog-count span')?.textContent).not.toBe('148');
    expect(host.querySelector('.sniptale-catalog-empty strong')).toBeNull();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
