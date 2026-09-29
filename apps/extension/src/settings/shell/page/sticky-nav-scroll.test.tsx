// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSettingsStickyNavScrollPadding } from './sticky-nav-scroll';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let navHeight = 61;
let notifyResize: (() => void) | null = null;

function Probe({ showNav }: { showNav: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useSettingsStickyNavScrollPadding(scrollRef);
  return (
    <div ref={scrollRef} data-ui="settings.page.content-scroll">
      {showNav ? <nav data-ui="settings.subpage-tabs" data-sticky="true" /> : null}
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  navHeight = 61;
  notifyResize = null;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, 100, navHeight)
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('tracks the top sticky nav through mount, resize, and removal', async () => {
  act(() => root.render(<Probe showNav={false} />));
  const scroll = container.querySelector<HTMLElement>('[data-ui="settings.page.content-scroll"]');
  expect(scroll?.style.scrollPaddingTop).toBe('');

  await act(async () => root.render(<Probe showNav />));
  expect(scroll?.style.scrollPaddingTop).toBe('65px');

  navHeight = 109;
  act(() => notifyResize?.());
  expect(scroll?.style.scrollPaddingTop).toBe('113px');

  await act(async () => root.render(<Probe showNav={false} />));
  expect(scroll?.style.scrollPaddingTop).toBe('');
});

it('ignores an inline nested nav and clears padding when the owner unmounts', () => {
  function InlineProbe() {
    const scrollRef = useRef<HTMLDivElement>(null);
    useSettingsStickyNavScrollPadding(scrollRef);
    return (
      <div ref={scrollRef}>
        <nav data-ui="settings.subpage-tabs" />
      </div>
    );
  }
  act(() => root.render(<InlineProbe />));
  const scroll = container.querySelector<HTMLElement>('div');
  expect(scroll?.style.scrollPaddingTop).toBe('');
  act(() => root.unmount());
  expect(scroll?.style.scrollPaddingTop).toBe('');
  root = createRoot(container);
});
