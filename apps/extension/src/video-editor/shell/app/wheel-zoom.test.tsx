// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useVideoEditorWheelZoomGuard } from './wheel-zoom';

it('prevents Ctrl+wheel page zoom throughout the mounted editor', () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    useVideoEditorWheelZoomGuard();
    return <div />;
  }
  try {
    act(() => root.render(<Harness />));
    const target = container.firstElementChild!;
    const controlled = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 50,
    });
    target.dispatchEvent(controlled);
    expect(controlled.defaultPrevented).toBe(true);
    const ordinary = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 50 });
    target.dispatchEvent(ordinary);
    expect(ordinary.defaultPrevented).toBe(false);
    act(() => root.unmount());
    const unmounted = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true });
    window.dispatchEvent(unmounted);
    expect(unmounted.defaultPrevented).toBe(false);
  } finally {
    container.remove();
  }
});
