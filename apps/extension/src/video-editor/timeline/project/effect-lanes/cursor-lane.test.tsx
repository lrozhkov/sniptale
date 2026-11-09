// @vitest-environment jsdom
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
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

it('identifies archived cursor history without inventing motion intervals from descriptor totals', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 12,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO' || !clip.sourceInstanceId) throw new Error('Missing source.');
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [],
    sourceObservations: [
      {
        recordingId: 'recording',
        sourceInstanceId: clip.sourceInstanceId,
        samples: [],
        trajectory: {
          format: 'cursor-trajectory-v1',
          formatVersion: 1,
          algorithm: 'sed-window-v1',
          encoding: 'json-ascii-int-v1',
          trajectoryId: 'a'.repeat(32),
          state: 'complete',
          finalized: true,
          totalBlocks: 100,
          totalRecords: 6002,
          totalSamples: 6000,
          totalBytes: 1000000,
          streamSha256: 'b'.repeat(64),
        },
      },
    ],
  };
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <ProjectTimelineCursorLane
          embedded
          project={project}
          pixelsPerSecond={100}
          selectedEffectSelection={null}
          onBeginEffectInteraction={() => {}}
        />
      )
    );
    expect(container.textContent).toMatch(/История курсора в архиве|Archived cursor history/);
    expect(project.cursorTrack?.samples).toEqual([]);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
