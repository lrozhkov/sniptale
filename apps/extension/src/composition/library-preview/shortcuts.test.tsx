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
        <input type="checkbox" role="switch" aria-checked={false} />
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
    expect(dispatch(host.querySelector('[role=switch]')!).defaultPrevented).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
    expect(dispatch(host.querySelector('button')!).defaultPrevented).toBe(true);
    expect(toggle).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('captures all Gallery targets once, keeps focus and releases ownership on deactivation', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const first = vi.fn();
  const next = vi.fn();
  function Content(props: { enabled: boolean; toggle(): void }) {
    usePlaybackSpaceShortcut(props.toggle, props.enabled, 'all-targets');
    return (
      <>
        <button>Action</button>
        <details>
          <summary>Settings</summary>
        </details>
        <input aria-label="Name" />
        <textarea aria-label="Text" />
        <input type="checkbox" role="switch" aria-checked={false} />
        <input type="range" />
        <select aria-label="Speed">
          <option>Normal</option>
        </select>
        <div contentEditable tabIndex={0} aria-label="Editable" />
      </>
    );
  }
  const press = (element: HTMLElement, repeat = false) => {
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      repeat,
      bubbles: true,
      cancelable: true,
    });
    act(() => element.dispatchEvent(event));
    return event;
  };
  try {
    act(() => root.render(<Content enabled toggle={first} />));
    const controls = host.querySelectorAll<HTMLElement>(
      'button, summary, input, textarea, select, [contenteditable]'
    );
    for (const target of controls) {
      target.focus();
      const native = vi.fn();
      target.addEventListener('keydown', native);
      expect(press(target).defaultPrevented).toBe(true);
      expect(press(target, true).defaultPrevented).toBe(true);
      expect(native).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(target);
    }
    expect(first).toHaveBeenCalledTimes(controls.length);
    act(() => root.render(<Content enabled toggle={next} />));
    press(host.querySelector('button')!);
    expect(next).toHaveBeenCalledOnce();
    act(() => root.render(<Content enabled={false} toggle={next} />));
    expect(press(host.querySelector('button')!).defaultPrevented).toBe(false);
    expect(next).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute('data-video-editor-focus')).toBe(false);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
