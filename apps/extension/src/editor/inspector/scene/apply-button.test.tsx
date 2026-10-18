// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { FrameApplyButton } from './apply-button';

it('renders the full-width apply action without a cancel button', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onApplyFrame = vi.fn();
  act(() => root.render(<FrameApplyButton onApplyFrame={onApplyFrame} />));
  const button = container.querySelector('button');
  expect(container.querySelectorAll('button')).toHaveLength(1);
  expect(button?.className).toContain('w-full');
  act(() => button?.click());

  expect(onApplyFrame).toHaveBeenCalledOnce();
  act(() => root.unmount());
});

it('cancels a held reset with Escape and executes once when Space is released', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onApplyFrame = vi.fn();
  act(() =>
    root.render(
      <CommandPressScope value={true}>
        <FrameApplyButton onApplyFrame={onApplyFrame} />
      </CommandPressScope>
    )
  );
  const button = container.querySelector('button')!;
  button.focus();
  act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  expect(button.dataset['pressing']).toBe('true');
  expect(onApplyFrame).not.toHaveBeenCalled();
  act(() =>
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(button.dataset['pressing']).toBeUndefined();
  const canceledRelease = new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true });
  act(() => button.dispatchEvent(canceledRelease));
  expect(canceledRelease.defaultPrevented).toBe(true);
  expect(onApplyFrame).not.toHaveBeenCalled();
  act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  act(() => button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })));
  // jsdom does not generate a native click from a keyboard release.
  act(() => button.click());
  expect(onApplyFrame).toHaveBeenCalledOnce();
  act(() => root.unmount());
  container.remove();
});
