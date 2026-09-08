// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { usePreviewCanvasInteractionFocus } from './interaction-focus';

it('activates on the stage, preserves inspector editing and releases to the timeline', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const stage = useRef<HTMLDivElement | null>(null);
    const active = usePreviewCanvasInteractionFocus(stage);
    return (
      <>
        <div ref={stage} tabIndex={0} data-active={active}>
          <span>Video</span>
        </div>
        <div data-ui="video-editor.timeline.surface">
          <button>Clip</button>
        </div>
        <input aria-label="Inspector" />
      </>
    );
  }
  try {
    act(() => root.render(<Harness />));
    const stage = host.querySelector<HTMLDivElement>('[data-active]')!;
    const clip = host.querySelector('button')!;
    const inspector = host.querySelector('input')!;
    const pointer = (node: Element) =>
      act(() => node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(stage.dataset['active']).toBe('false');
    pointer(clip);
    expect(stage.dataset['active']).toBe('false');
    pointer(stage.firstElementChild!);
    expect(stage.dataset['active']).toBe('true');
    expect(document.activeElement).toBe(stage);
    pointer(inspector);
    act(() => inspector.focus());
    expect(stage.dataset['active']).toBe('true');
    pointer(clip);
    expect(stage.dataset['active']).toBe('false');
    act(() => stage.focus());
    expect(stage.dataset['active']).toBe('true');
    act(() => clip.focus());
    expect(stage.dataset['active']).toBe('false');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
