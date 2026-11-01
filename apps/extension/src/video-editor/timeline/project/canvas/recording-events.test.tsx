// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTimelineRecordingEvents } from './recording-events';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import fixtureData from '../../../../features/video/project/recording-events/fixtures.json';
import type { VideoProject } from '../../../../features/video/project/types';
import type { createRecordingEventsRenderer } from '../../../../workflows/video-review/recording-events';

let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useTimelineRecordingEvents>;
const prepare = vi.fn<ReturnType<typeof createRecordingEventsRenderer>['prepare']>();
const clear = vi.fn();
const createRenderer = () => ({ prepare, clear });
function fixture() {
  const base = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 5000,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    sourceNormalizedActionEvents: [],
    recordingSignals: [],
  });
  const events = fixtureData.descriptor;
  if (!isRecordingEventsDescriptor(events)) throw new Error('Invalid test descriptor.');
  return applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({ ...group, events })),
  });
}
function Harness({ project, start, end }: { project: VideoProject; start: number; end: number }) {
  latest = useTimelineRecordingEvents(
    project,
    { startTime: start, endTime: end },
    60,
    createRenderer
  );
  return null;
}
async function render(project: VideoProject, start = 100, end = 110) {
  await act(async () => root.render(<Harness project={project} start={start} end={end} />));
}
beforeEach(() => {
  vi.clearAllMocks();
  prepare.mockImplementation(async (project) => ({ ...project }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
it('reads the real viewport with pixel overscan and keeps capture data outside project arrays', async () => {
  const project = fixture();
  await render(project);
  expect(prepare).toHaveBeenCalledWith(project, { start: 98, end: 112 });
  expect(latest.status).toBe('ready');
  expect(latest.project).not.toBe(project);
  expect(JSON.stringify(latest.project)).toBe(JSON.stringify(project));
  await render(project);
  expect(prepare).toHaveBeenCalledOnce();
});
it('keeps one active read and replaces intermediate scroll requests', async () => {
  const project = fixture();
  let resolve!: (project: VideoProject) => void;
  prepare.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await render(project, 0, 10);
  await render(project, 50, 60);
  await render(project, 4500, 4510);
  expect(prepare).toHaveBeenCalledOnce();
  expect(latest.status).toBe('loading');
  expect(latest.project).toBe(project);
  await act(async () => resolve({ ...project, name: 'obsolete' }));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(prepare).toHaveBeenLastCalledWith(project, { start: 4498, end: 4512 });
  expect(latest.status).toBe('ready');
  expect(latest.project.name).toBe(project.name);
});
it('reports a local read failure and retries without modifying the source project', async () => {
  const project = fixture();
  prepare.mockRejectedValueOnce(new Error('Storage unavailable.'));
  await render(project);
  expect(latest.status).toBe('failed');
  expect(latest.project).toBe(project);
  await act(async () => latest.retry());
  expect(latest.status).toBe('ready');
  expect(prepare).toHaveBeenCalledTimes(2);
});
it('rejects a delayed result from another project and clears the owner on unmount', async () => {
  const first = fixture();
  const second = { ...fixture(), id: 'second' };
  let resolve!: (project: VideoProject) => void;
  prepare.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await render(first);
  await render(second);
  await act(async () => resolve(first));
  expect(latest.project.id).toBe('second');
  await act(async () => root.unmount());
  expect(clear).toHaveBeenCalledOnce();
  root = createRoot(container);
});
it('does not open a history reader for legacy projects', async () => {
  const project = fixture();
  const legacy = { ...project, actionFeedback: [] };
  await render(legacy);
  expect(prepare).not.toHaveBeenCalled();
  expect(latest.status).toBe('ready');
  expect(latest.project).toBe(legacy);
});
