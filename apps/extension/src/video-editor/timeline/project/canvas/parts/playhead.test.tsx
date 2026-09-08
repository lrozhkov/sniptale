// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ProjectTimelinePlayheadHandle, ProjectTimelinePlayheadLine } from './playhead';

it('keeps the cap centered on the line through the first pixels instead of jumping at six pixels', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    for (const left of [0, 3, 6, 7, 40]) {
      act(() =>
        root.render(
          <>
            <ProjectTimelinePlayheadHandle
              left={left}
              currentTime={left / 40}
              duration={10}
              onBeginScrub={vi.fn()}
              onSeekTime={vi.fn()}
              onStepToNextFrame={vi.fn()}
              onStepToPreviousFrame={vi.fn()}
            />
            <ProjectTimelinePlayheadLine left={left} height={100} />
          </>
        )
      );
      const cap = host.querySelector<HTMLElement>('[role="slider"]')!;
      const line = host.querySelector<HTMLElement>('[aria-hidden="true"]')!;
      expect(cap.style.left).toBe(line.style.left);
      expect(cap.style.transform).toBe('translateX(-50%)');
    }
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('seeks project boundaries from a focused playhead while preserving frame stepping', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const seek = vi.fn();
  const next = vi.fn();
  const previous = vi.fn();
  try {
    act(() =>
      root.render(
        <ProjectTimelinePlayheadHandle
          left={80}
          currentTime={2}
          duration={6}
          onBeginScrub={vi.fn()}
          onSeekTime={seek}
          onStepToNextFrame={next}
          onStepToPreviousFrame={previous}
        />
      )
    );
    const cap = host.querySelector<HTMLElement>('[role="slider"]')!;
    for (const key of ['Home', 'End', 'ArrowRight', 'ArrowLeft']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      act(() => cap.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
    }
    expect(seek.mock.calls).toEqual([[0], [6]]);
    expect(next).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledTimes(1);
    const unrelated = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => cap.dispatchEvent(unrelated));
    expect(unrelated.defaultPrevented).toBe(false);
    expect(seek).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
