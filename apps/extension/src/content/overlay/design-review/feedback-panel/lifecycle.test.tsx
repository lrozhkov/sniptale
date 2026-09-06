// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useFeedbackPanelLifecycle } from './lifecycle';

function LifecycleHarness(props: { onClose: () => void }) {
  const filterRootRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  useFeedbackPanelLifecycle({
    filterOpen: false,
    filterRootRef,
    filterTriggerRef,
    onClose: props.onClose,
    onFilterOpenChange: vi.fn(),
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
