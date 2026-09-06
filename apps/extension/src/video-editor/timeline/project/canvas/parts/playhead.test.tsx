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
