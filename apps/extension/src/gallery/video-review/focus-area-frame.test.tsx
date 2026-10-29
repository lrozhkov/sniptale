// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useFocusFrameHover } from './focus-area-frame';

it('coalesces geometry hover reads after commits and cancels the pending read on unmount', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const pending = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    pending.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    pending.delete(id);
  });
  let left = 0;
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => new DOMRect(left, 0, 20, 20));
  function Fixture({ revision }: { revision: number }) {
    const hover = useFocusFrameHover();
    return (
      <div
        ref={hover.frame}
        data-hovered={hover.hovered}
        data-revision={revision}
        onPointerMove={hover.trackPointer}
      />
    );
  }
  const flush = () =>
    act(() => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(0);
    });
  try {
    act(() => root.render(<Fixture revision={0} />));
    act(() =>
      host.firstElementChild!.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 })
      )
    );
    expect(host.firstElementChild!.getAttribute('data-hovered')).toBe('true');
    flush();
    bounds.mockClear();
    left = 40;
    act(() => root.render(<Fixture revision={1} />));
    act(() => root.render(<Fixture revision={2} />));
    expect(bounds).not.toHaveBeenCalled();
    expect(pending.size).toBe(1);
    flush();
    expect(bounds).toHaveBeenCalledOnce();
    expect(host.firstElementChild!.getAttribute('data-hovered')).toBe('false');
    left = 0;
    act(() => root.render(<Fixture revision={3} />));
    flush();
    expect(host.firstElementChild!.getAttribute('data-hovered')).toBe('true');
    act(() => root.unmount());
    bounds.mockClear();
    flush();
    expect(bounds).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
