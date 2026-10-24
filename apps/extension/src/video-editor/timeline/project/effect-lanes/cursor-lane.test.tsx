// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import * as history from '../../../../features/video/review/cursor-history';
import * as meta from './meta';
import { ProjectTimelineCursorLane } from './cursor-lane';

it('reuses cursor derivation on playback renders and refreshes after project replacement', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const runs = vi.spyOn(history, 'buildHistoryCursorRuns');
  const targets = vi.spyOn(meta, 'buildCursorSegmentMeta');
  const container = document.createElement('div');
  const root = createRoot(container);
  const project = createEmptyVideoProject();
  const render = (value = project, pixelsPerSecond = 100) =>
    act(() =>
      root.render(
        <ProjectTimelineCursorLane
          project={value}
          pixelsPerSecond={pixelsPerSecond}
          selectedEffectSelection={null}
          onBeginEffectInteraction={() => {}}
        />
      )
    );
  try {
    render();
    for (let frame = 0; frame < 60; frame++) render(project, 100 + frame);
    expect(runs).toHaveBeenCalledTimes(1);
    expect(targets).toHaveBeenCalledTimes(1);
    render({ ...project, duration: 10 });
    expect(runs).toHaveBeenCalledTimes(2);
    expect(targets).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toBe('');
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
