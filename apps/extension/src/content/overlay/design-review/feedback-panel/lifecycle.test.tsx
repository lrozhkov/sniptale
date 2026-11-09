// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useFeedbackPanelLifecycle } from './lifecycle';

function LifecycleHarness(props: {
  onClose: () => void;
  filterOpen?: boolean;
  searchOpen?: boolean;
  onSearchClose?: () => void;
  onFilterOpenChange?: (open: boolean) => void;
}) {
  const filterRootRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  useFeedbackPanelLifecycle({
    filterOpen: props.filterOpen ?? false,
    searchOpen: props.searchOpen ?? false,
    onSearchClose: props.onSearchClose ?? vi.fn(),
    filterRootRef,
    filterTriggerRef,
    onClose: props.onClose,
    onFilterOpenChange: props.onFilterOpenChange ?? vi.fn(),
    open: true,
  });
  return <input aria-label="feedback search" />;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('owns Escape at window capture before a hostile document guard', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  const hostGuard = vi.fn((event: KeyboardEvent) => event.stopImmediatePropagation());
  document.addEventListener('keydown', hostGuard, { capture: true });
  act(() => root.render(<LifecycleHarness onClose={onClose} />));
  const input = host.querySelector('input');

  act(() =>
    input?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
    )
  );

  expect(onClose).toHaveBeenCalledOnce();
  expect(hostGuard).not.toHaveBeenCalled();
  document.removeEventListener('keydown', hostGuard, { capture: true });
  act(() => root.unmount());
});

it('dismisses the filter before search and search before the panel', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  const onSearchClose = vi.fn();
  const onFilterOpenChange = vi.fn();
  const render = (filterOpen: boolean, searchOpen: boolean) =>
    root.render(
      <LifecycleHarness
        onClose={onClose}
        onSearchClose={onSearchClose}
        onFilterOpenChange={onFilterOpenChange}
        filterOpen={filterOpen}
        searchOpen={searchOpen}
      />
    );
  const escape = () =>
    host
      .querySelector('input')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
      );
  act(() => render(true, true));
  act(escape);
  expect(onFilterOpenChange).toHaveBeenCalledWith(false);
  expect(onSearchClose).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  act(() => render(false, true));
  act(escape);
  expect(onSearchClose).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  act(() => render(false, false));
  act(escape);
  expect(onClose).toHaveBeenCalledOnce();
  act(() => root.unmount());
});
