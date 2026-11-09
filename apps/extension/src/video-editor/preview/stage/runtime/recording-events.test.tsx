// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRecordingEventsProject } from './recording-events';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { prepareRecordingEventsProject } from '../../../../features/video/project/recording-events/project-window';
import { recordingEventsProjectCoversTime } from '../../../../features/video/project/recording-events/project-facts';
import { resolveVideoCompositionActions } from '../../../../features/video/composition/timeline/frame/actions';
import { decodeRecordingEventsBlock } from '../../../../features/video/project/recording-events/blocks';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import fixtureData from '../../../../features/video/project/recording-events/fixtures.json';
import { REVIEW_KEY_DEFAULT } from '../../../../features/video/project/action-feedback/key-animation';
import type { VideoProject } from '../../../../features/video/project/types';
import type { createRecordingEventsRenderer } from '../../../../workflows/video-review/recording-events';

let root: Root;
let container: HTMLDivElement;
let latest: VideoProject;
const prepare = vi.fn<ReturnType<typeof createRecordingEventsRenderer>['prepare']>();
const clear = vi.fn();
const createRenderer = () => ({ prepare, clear });
const feedback = { onFailure: vi.fn(), onRecovery: vi.fn(), retryVersion: 0 };
function Harness({
  project,
  time,
  retry = 0,
}: {
  project: VideoProject;
  time: number;
  retry?: number;
}) {
  latest = useRecordingEventsProject(
    project,
    time,
    { ...feedback, retryVersion: retry },
    createRenderer
  );
  return null;
}
function fixture(name = 'Source') {
  const base = createVideoProjectFromRecording({
    recordingId: fixtureData.recordingId,
    filename: name,
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    sourceNormalizedActionEvents: [],
    recordingSignals: [],
  });
  const events = fixtureData.descriptor;
  if (!isRecordingEventsDescriptor(events)) throw new Error('Invalid test descriptor.');
  return applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({
      ...group,
      events,
      keyStyles: [{ id: 'key-1', ...REVIEW_KEY_DEFAULT, enabled: true }],
    })),
  });
}
async function prepared(project: VideoProject, range: { start: number; end: number }) {
  const block = decodeRecordingEventsBlock(new TextEncoder().encode(fixtureData.blocks[0]!.utf8));
  if (!block) throw new Error('Invalid test block.');
  return prepareRecordingEventsProject(project, range, async () => ({
    writerGeneration: 'generation',
    records: block.records.filter(
      (record) =>
        record.kind === 'action' ||
        record.kind === 'signal' ||
        record.kind === 'keyboard-repeat-block'
    ),
  }));
}
async function render(project: VideoProject, time: number, retry = 0) {
  await act(async () => root.render(<Harness project={project} time={time} retry={retry} />));
}
beforeEach(() => {
  vi.clearAllMocks();
  prepare.mockImplementation(prepared);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('renders prepared captured keys and reuses the current window within one second', async () => {
  const project = fixture();
  await render(project, 0.1);
  expect(resolveVideoCompositionActions(latest, 0.1)).toHaveLength(1);
  expect(JSON.stringify(latest)).toBe(JSON.stringify(project));
  await render(project, 0.2);
  expect(prepare).toHaveBeenCalledOnce();
  expect(feedback.onRecovery).toHaveBeenCalledWith('recording-history');
});

it('coalesces rapid seeks into one active and the latest pending window', async () => {
  const project = fixture();
  const first = Promise.withResolvers<VideoProject>();
  prepare.mockImplementationOnce(() => first.promise);
  await render(project, 0.1);
  await render(project, 2.1);
  await render(project, 3.1);
  expect(prepare).toHaveBeenCalledOnce();
  await act(async () => first.resolve(await prepared(project, { start: 0, end: 2 })));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(prepare.mock.calls[1]?.[1]).toEqual({ start: 3, end: 5 });
  expect(recordingEventsProjectCoversTime(latest, 3.1)).toBe(true);
});

it('does not publish a completion from a previous project', async () => {
  const previous = fixture('Previous');
  const current = fixture('Current');
  const first = Promise.withResolvers<VideoProject>();
  const second = Promise.withResolvers<VideoProject>();
  prepare.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  await render(previous, 0.1);
  await render(current, 0.1);
  await act(async () => first.resolve(await prepared(previous, { start: 0, end: 2 })));
  expect(latest).toBe(current);
  await act(async () => second.resolve(await prepared(current, { start: 0, end: 2 })));
  expect(resolveVideoCompositionActions(latest, 0.1)).toHaveLength(1);
  expect(latest.name).toBe(current.name);
});

it('reports history failure separately and retries without clearing another render failure', async () => {
  const project = fixture();
  const error = new Error('History is unavailable');
  prepare.mockRejectedValueOnce(error);
  await render(project, 0.1);
  expect(latest).toBe(project);
  expect(feedback.onFailure).toHaveBeenCalledWith('recording-history', error);
  await render(project, 0.1, 1);
  expect(resolveVideoCompositionActions(latest, 0.1)).toHaveLength(1);
  expect(feedback.onRecovery.mock.calls).toEqual([['recording-history']]);
});

it('cancels the reader on unmount and ignores a late completion', async () => {
  const project = fixture();
  const first = Promise.withResolvers<VideoProject>();
  prepare.mockImplementationOnce(() => first.promise);
  await render(project, 0.1);
  await act(async () => root.render(null));
  expect(clear).toHaveBeenCalledOnce();
  await act(async () => first.resolve(await prepared(project, { start: 0, end: 2 })));
  expect(feedback.onRecovery).not.toHaveBeenCalled();
  expect(feedback.onFailure).not.toHaveBeenCalled();
});
