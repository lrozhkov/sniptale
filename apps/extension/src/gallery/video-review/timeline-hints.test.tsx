// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineHints, reviewTimelineHint } from './timeline-hints';

it('updates open hints, dismisses gestures and restores native descriptions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const text = 'First line\nSecond line with complete text';
  const hint = reviewTimelineHint('Text', 2, 5, text);
  try {
    act(() =>
      root.render(
        <dialog open>
          <section data-ui="gallery.videoReview.timeline" title="Timeline">
            <ReviewTimelineHints />
            <button title="Native" aria-describedby="existing" data-review-hint={hint}>
              Text
            </button>
          </section>
        </dialog>
      )
    );
    const button = host.querySelector('button')!;
    const over = () =>
      act(() => button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
    over();
    act(() => vi.advanceTimersByTime(499));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const tooltip = host.querySelector('[role="tooltip"]')!;
    expect(tooltip.textContent).toBe(hint);
    expect(tooltip.closest('dialog')).not.toBeNull();
    expect(button.getAttribute('aria-describedby')).toContain(tooltip.id);
    expect(button.hasAttribute('title')).toBe(false);
    await act(async () => {
      button.dataset['reviewHint'] = 'Updated action';
    });
    expect(tooltip.textContent).toBe('Updated action');
    await act(async () => {
      button.dataset['reviewHint'] = hint;
    });
    act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    expect(button.getAttribute('title')).toBe('Native');
    expect(button.getAttribute('aria-describedby')).toBe('existing');
    expect(button.closest('section')?.getAttribute('title')).toBe('Timeline');
    over();
    act(() => button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    over();
    act(() => vi.advanceTimersByTime(1000));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    act(() => window.dispatchEvent(new MouseEvent('pointerup')));
    over();
    act(() => vi.advanceTimersByTime(500));
    expect(host.querySelector('[role="tooltip"]')?.textContent).toBe(hint);
    act(() => document.dispatchEvent(new Event('scroll')));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    over();
    await act(async () => {
      button.dataset['reviewHint'] = 'Changed before the delay';
    });
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    act(() => vi.advanceTimersByTime(500));
    expect(host.querySelector('[role="tooltip"]')?.textContent).toBe('Changed before the delay');
    await act(async () => {
      button.removeAttribute('data-review-hint');
    });
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    expect(button.getAttribute('aria-describedby')).toBe('existing');
    over();
    act(() => vi.advanceTimersByTime(500));
    expect(host.querySelector('[role="tooltip"]')?.textContent).toBe('Native');
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
