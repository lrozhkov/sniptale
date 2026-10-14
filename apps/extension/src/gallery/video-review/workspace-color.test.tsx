// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewWorkspaceColor } from './workspace-color';

it('cancels previews on theme changes and resets only the current saved override', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  document.body.dataset['theme'] = 'light';
  const root = createRoot(host);
  const change = vi.fn();
  let control!: ReturnType<typeof useReviewWorkspaceColor>;
  function Harness() {
    const container = useRef<HTMLDivElement>(null);
    control = useReviewWorkspaceColor(container, { light: '#abcdefff' }, change);
    return (
      <div
        ref={container}
        style={{ '--sniptale-color-surface-canvas': '#123456' } as React.CSSProperties}
      />
    );
  }
  try {
    act(() => root.render(<Harness />));
    expect(change).not.toHaveBeenCalled();
    act(() => control.preview('#334455'));
    expect(control.style['--sniptale-review-workspace-color']).toBe('#334455ff');
    act(() => control.cancel());
    expect(control.style['--sniptale-review-workspace-color']).toBe('#abcdefff');
    act(() => control.preview('#334455'));
    await act(async () => {
      document.body.dataset['theme'] = 'dark';
    });
    expect(control.style['--sniptale-review-workspace-color']).toBeUndefined();
    expect(control.value).toBe('#123456ff');
    act(() => control.reset());
    expect(change).not.toHaveBeenCalled();
    act(() => control.change('invalid'));
    expect(change).not.toHaveBeenCalled();
    act(() => control.change('#556677'));
    expect(change).toHaveBeenLastCalledWith('dark', '#556677ff');
    await act(async () => {
      document.body.dataset['theme'] = 'light';
    });
    expect(control.style['--sniptale-review-workspace-color']).toBe('#abcdefff');
    act(() => control.reset());
    expect(change).toHaveBeenLastCalledWith('light', null);
  } finally {
    act(() => root.unmount());
    host.remove();
    delete document.body.dataset['theme'];
  }
});
