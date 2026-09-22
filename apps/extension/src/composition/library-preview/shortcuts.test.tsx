// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePlaybackSpaceShortcut } from './shortcuts';

it('leaves native disclosure activation to summary and retains transport Space elsewhere', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const toggle = vi.fn();
  function Content() {
    usePlaybackSpaceShortcut(toggle);
    return (
      <>
        <details>
          <summary>Settings</summary>Fields
        </details>
        <button>Action</button>
      </>
    );
  }
  try {
    act(() => root.render(<Content />));
    const dispatch = (target: Element) => {
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        target.dispatchEvent(event);
      });
      return event;
    };
    expect(dispatch(host.querySelector('summary')!).defaultPrevented).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
    expect(dispatch(host.querySelector('button')!).defaultPrevented).toBe(true);
    expect(toggle).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
