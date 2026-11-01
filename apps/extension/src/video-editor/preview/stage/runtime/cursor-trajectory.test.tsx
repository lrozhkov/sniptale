// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCursorTrajectoryProject } from './cursor-trajectory';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { prepareCursorTrajectoryProject } from '../../../../features/video/project/cursor-trajectory/project-window';
import { resolveObservedCursorPosition } from '../../../../features/video/composition/timeline/frame/cursor';
import type { VideoProject } from '../../../../features/video/project/types';
import type { CursorTrajectoryRecord } from '../../../../features/video/project/cursor-trajectory/types';

let root: Root;
let container: HTMLDivElement;
let latest: VideoProject;
const prepare = vi.fn<(project: VideoProject, time: number) => Promise<VideoProject>>();
const clear = vi.fn();
const createRenderer = () => ({ prepare, clear });
function Harness({ project, time }: { project: VideoProject; time: number }) {
  latest = useCursorTrajectoryProject(project, time, createRenderer);
  return null;
}
function fixture(name = 'Source') {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'capture.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips[0];
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source.');
  project.name = name;
  clip.sourceInstanceId = 'instance';
  project.cursorTrack = {
    captureMode: 'separate',
    samples: [],
    skin: normalizeVideoProjectCursorSkin(undefined),
    sourceObservations: [
      {
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        samples: [],
        trajectory: {
          format: 'cursor-trajectory-v1',
          formatVersion: 1,
          algorithm: 'sed-window-v1',
          encoding: 'json-ascii-int-v1',
          trajectoryId: 'a'.repeat(32),
          state: 'complete',
          finalized: true,
          totalBlocks: 1,
          totalRecords: 3,
          totalSamples: 2,
          totalBytes: 1000,
          streamSha256: 'b'.repeat(64),
        },
      },
    ],
  };
  return project;
}
async function prepared(project: VideoProject, time: number) {
  const records: CursorTrajectoryRecord[] = [
    {
      kind: 'segment',
      segmentId: 0,
      activeTimeUs: 0,
      reason: 'start',
      width: 100,
      height: 100,
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    },
  ];
  for (const [i, x] of [10, 90].entries())
    records.push({
      kind: 'sample',
      segmentId: 0,
      observationSeq: i,
      activeTimeUs: i * 2000000,
      xQ8: x * 256,
      yQ8: 20 * 256,
      visible: true,
      observed: true,
      event: 'move',
      button: 'none',
      relatedObservationSeq: null,
      anchors: [],
    });
  return prepareCursorTrajectoryProject(project, time, async () => ({
    fromTimeUs: 0,
    toTimeUs: 2000001,
    records,
    initialSegment: null,
  }));
}
async function render(project: VideoProject, time: number) {
  await act(async () => root.render(<Harness project={project} time={time} />));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  prepare.mockReset();
  clear.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('accepts a delayed window that covers the advanced playhead without starving playback', async () => {
  const project = fixture();
  const first = Promise.withResolvers<VideoProject>();
  const second = Promise.withResolvers<VideoProject>();
  prepare.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await render(project, 1);
  await render(project, 1.25);
  expect(prepare).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve(await prepared(project, 1)));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(resolveObservedCursorPosition(latest, 1.25)?.recordingPoint?.x).toBe(0.6);
  await act(async () => second.resolve(await prepared(project, 1.25)));
});

it('does not publish a late old-project result over the current source', async () => {
  const old = fixture('Old');
  const current = fixture('Current');
  const first = Promise.withResolvers<VideoProject>();
  const second = Promise.withResolvers<VideoProject>();
  prepare.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await render(old, 1);
  await render(current, 1);
  await act(async () => first.resolve(await prepared(old, 1)));
  expect(latest).toBe(current);
  expect(prepare).toHaveBeenLastCalledWith(current, 1);
  await act(async () => second.resolve(await prepared(current, 1)));
  expect(latest.name).toBe('Current');
  expect(resolveObservedCursorPosition(latest, 1)?.recordingPoint?.x).toBe(0.5);
});

it('does not publish an old window after seeking outside its coverage', async () => {
  const project = fixture();
  const first = Promise.withResolvers<VideoProject>();
  const second = Promise.withResolvers<VideoProject>();
  prepare.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await render(project, 1);
  await render(project, 3);
  await act(async () => first.resolve(await prepared(project, 1)));
  expect(latest).toBe(project);
  expect(resolveObservedCursorPosition(latest, 3)).toBeNull();
  await act(async () => second.resolve(project));
});

it('clears the reader on unmount and ignores its pending result', async () => {
  const project = fixture();
  const gate = Promise.withResolvers<VideoProject>();
  prepare.mockReturnValueOnce(gate.promise);
  await render(project, 1);
  await act(async () => root.render(null));
  expect(clear).toHaveBeenCalledOnce();
  const last = latest;
  await act(async () => gate.resolve(await prepared(project, 1)));
  expect(latest).toBe(last);
});

it('keeps video and compact references when a cursor read fails', async () => {
  const project = fixture();
  const before = structuredClone(project);
  prepare.mockRejectedValueOnce(new Error('Refused'));
  await render(project, 1);
  expect(latest).toBe(project);
  expect(project).toEqual(before);
});
