import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../features/video/project/mutation';
import {
  projectRecordingEventGroup,
  attachRecordingEventGroups,
} from '../../features/video/project/recording-events/project-facts';
import { recordingSignalObservation } from '../project/operations/recording-events-selection';
import type { RecordingEventsDescriptor } from '../../features/video/project/recording-events/types';
import type { VideoEditorTypingSpanTarget } from '../contracts/commands/timeline';
import { beforeEach, expect, it } from 'vitest';
import { resolveSelectedClipId } from '../contracts/selection';
import { useVideoEditorStore, type VideoEditorState } from './store';

beforeEach(() => {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

it('keeps clip identity exclusively in the discriminated selection state', () => {
  expect(useVideoEditorStore.getState()).not.toHaveProperty('selectedClipId');

  useVideoEditorStore.getState().selectClip('clip-1');

  const state = useVideoEditorStore.getState();
  expect(state.selection).toEqual({ kind: 'clip', clipId: 'clip-1' });
  expect(resolveSelectedClipId(state.selection)).toBe('clip-1');
  expect(state).not.toHaveProperty('selectedClipId');
});

it('rejects an independent writable selectedClipId state field', () => {
  const invalidStatePatch = {
    // @ts-expect-error Clip identity is writable only through selection.
    selectedClipId: 'clip-1',
  } satisfies Partial<VideoEditorState>;

  expect(invalidStatePatch).toEqual({ selectedClipId: 'clip-1' });
});

it('selects an observed typing interval and preserves selection when the source is stale', () => {
  const base = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 6,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    recordingSignals: [],
    sourceNormalizedActionEvents: [],
  });
  const descriptor: RecordingEventsDescriptor = {
    format: 'recording-events-v1',
    formatVersion: 1,
    algorithm: 'lossless-v1',
    encoding: 'json-utf8-v1',
    eventStreamId: 'a'.repeat(32),
    state: 'complete',
    finalized: true,
    totalBlocks: 1,
    totalRecords: 3,
    totalBytes: 1000,
    streamSha256: 'b'.repeat(64),
  };
  const project = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({ ...group, events: descriptor })),
  });
  const group = project.actionFeedback![0]!;
  const facts = projectRecordingEventGroup(
    group,
    [
      {
        kind: 'signal',
        recordSeq: 1,
        segmentId: 0,
        activeTimeUs: 4_000_000,
        signal: {
          id: 'typing',
          kind: 'typing',
          startTimeUs: 2_000_000,
          endTimeUs: 4_000_000,
          point: null,
          data: {
            activity: 'keyboard',
            privacy: 'unknown',
            eventCount: 70000,
            groupId: null,
            continuationOf: null,
          },
        },
      },
    ],
    'generation'
  );
  const prepared = attachRecordingEventGroups(project, { start: 0, end: 6 }, [facts]);
  const observedSignal = recordingSignalObservation(prepared, group, facts.signals[0]!)!;
  const target: VideoEditorTypingSpanTarget = {
    recordingId: group.recordingId,
    sourceInstanceId: group.sourceInstanceId,
    signalId: 'typing',
    clipId: project.clips[0]!.id,
    observedSignal,
  };
  const empty = useVideoEditorStore.getState();
  empty.selectHistorySpan(target);
  expect(useVideoEditorStore.getState().selection).toEqual(empty.selection);
  useVideoEditorStore.setState({ project, selectedTrackId: 'track', placementMode: null });
  useVideoEditorStore.getState().selectHistorySpan(target);
  const selected = useVideoEditorStore.getState().selection;
  expect(selected).toEqual({ kind: 'history-span', ...target });
  expect(selected).not.toBe(target);
  expect(useVideoEditorStore.getState().selectedTrackId).toBeNull();
  const stale = { ...target, observedSignal: { ...observedSignal, streamSha256: 'c'.repeat(64) } };
  useVideoEditorStore.getState().selectHistorySpan(stale);
  expect(useVideoEditorStore.getState().selection).toEqual(selected);
  expect(project.actionFeedback![0]!.signals).toEqual([]);
});
