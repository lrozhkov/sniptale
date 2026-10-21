// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useSettingsCollectionScrollLayout } from './scroll-layout';

afterEach(() => vi.unstubAllGlobals());

it('sizes the list to its remaining viewport and releases its observers', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let refresh!: ResizeObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        refresh = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let top = 180;
  function Surface() {
    const list = useRef<HTMLDivElement>(null);
    useSettingsCollectionScrollLayout(list);
    return (
      <div
        data-ui="settings.page.content-scroll"
        ref={(element) => {
          if (element) element.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;
        }}
      >
        <div
          ref={(element) => {
            list.current = element;
            if (element) element.getBoundingClientRect = () => ({ top }) as DOMRect;
          }}
        >
          Rows
        </div>
      </div>
    );
  }
  act(() => root.render(<Surface />));
  const list = host.querySelector<HTMLElement>('[data-ui] > div')!;
  expect(list.style.maxHeight).toBe('312px');
  top = 250;
  act(() => refresh([], {} as ResizeObserver));
  expect(list.style.maxHeight).toBe('242px');
  top = 520;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(list.style.maxHeight).toBe('56px');
  act(() => root.unmount());
  expect(disconnect).toHaveBeenCalledExactlyOnceWith();
  expect(list.style.maxHeight).toBe('');
  host.remove();
});

it('starts observing a list that appears after its loading state', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Surface({ visible }: { visible: boolean }) {
    const list = useRef<HTMLDivElement>(null);
    useSettingsCollectionScrollLayout(list, visible);
    return (
      <div
        data-ui="settings.page.content-scroll"
        ref={(element) => {
          if (element) element.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;
        }}
      >
        {visible ? (
          <div
            ref={(element) => {
              list.current = element;
              if (element) element.getBoundingClientRect = () => ({ top: 180 }) as DOMRect;
            }}
          >
            Loaded rows
          </div>
        ) : null}
      </div>
    );
  }
  try {
    act(() => root.render(<Surface visible={false} />));
    act(() => root.render(<Surface visible />));
    expect(host.querySelector<HTMLElement>('[data-ui] > div')?.style.maxHeight).toBe('312px');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
