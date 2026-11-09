import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { isExportReadyVideoProject } from '../../../features/video/project/validation/root';
import { projectRecordingEventAction } from '../../../features/video/project/recording-events/project-facts';
import type { RecordingEventRecord } from '../../../features/video/project/recording-events/types';
import {
  REVIEW_KEY_DEFAULT,
  type ReviewKeyStyle,
} from '../../../features/video/project/action-feedback/key-animation';
import { resolveRecordingActionOccurrences } from '../operations/recording-events-selection';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { undoVideoEditorProjectHistory } from '../history';

function fixture() {
  const base = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 5,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    recordingSignals: [],
    sourceNormalizedActionEvents: [],
  });
  const events = {
    format: 'recording-events-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'lossless-v1' as const,
    encoding: 'json-utf8-v1' as const,
    eventStreamId: 'a'.repeat(32),
    state: 'incomplete' as const,
    finalized: true,
    totalBlocks: 1000,
    totalRecords: 50000,
    totalBytes: 5000000,
    streamSha256: 'b'.repeat(64),
  };
  const project = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({ ...group, events })),
  });
  const group = project.actionFeedback![0]!;
  const record: Extract<RecordingEventRecord, { kind: 'action' }> = {
    kind: 'action',
    recordSeq: 1,
    segmentId: 0,
    activeTimeUs: 1000000,
    action: {
      id: 'key',
      kind: 'KEY',
      timeUs: 1000000,
      durationUs: 0,
      point: null,
      label: 'Ctrl+S',
      preset: 'NONE',
      data: {
        downTimeUs: null,
        upTimeUs: 1000000,
        pressDurationUs: null,
        lastObservedTimeUs: 1000000,
        repeatCount: 0,
        completion: 'released',
        keyboardAttackId: null,
        keyboardOnsetTimeUs: null,
        groupId: null,
        continuationOf: null,
        ctrlKey: true,
        altKey: null,
        shiftKey: false,
        metaKey: null,
      },
    },
  };
  const event = projectRecordingEventAction(group, record);

  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const observedAction = {
    recordingId: group.recordingId,
    sourceInstanceId: group.sourceInstanceId,
    eventStreamId: events.eventStreamId,
    streamSha256: events.streamSha256,
    record,
  };
  store.setState({
    selection: { kind: 'action-occurrence', eventId: event.id, clipId: clip.id, observedAction },
  });
  return { store, event, clip, observedAction };
}

it('disables and resets a selected source fact without copying history and supports undo and reopen', () => {
  const { store, event, observedAction } = fixture();
  const before = store.getState().project!;
  const original = structuredClone(observedAction.record);
  store.getState().updateActionEventDetails(event.id, { presentation: { enabled: false } });
  const changed = store.getState().project!;
  expect(changed.actionEvents).toEqual([]);
  expect(changed.actionFeedback![0]!.actionOverrides).toEqual([
    { id: 'key', presentation: { enabled: false } },
  ]);
  expect(
    resolveRecordingActionOccurrences(JSON.parse(JSON.stringify(changed)), observedAction)[0]?.event
      .presentation
  ).toEqual({ enabled: false });
  expect(isExportReadyVideoProject(changed)).toBe(true);
  expect(observedAction.record).toEqual(original);
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, changed);
  expect(undo?.status).toBe('applied');
  if (undo?.status === 'applied')
    expect(undo.project.actionFeedback).toEqual(before.actionFeedback);
  store.getState().updateActionEventDetails(event.id, { presentation: null });
  expect(store.getState().project!.actionFeedback![0]!.actionOverrides).toEqual([]);
});

it('moves a source key using the inherited caption style and refuses stale selection bindings', () => {
  const { store, event, clip, observedAction } = fixture();
  const project = store.getState().project!;
  const keyDefaults: ReviewKeyStyle = {
    ...REVIEW_KEY_DEFAULT,
    enabled: true,
    before: 0,
    after: 1,
    style: { ...REVIEW_KEY_DEFAULT.style, fontFamily: 'monospace' },
  };
  store.setState({
    project: applyVideoProjectMutationPatch(project, {
      actionFeedback: project.actionFeedback!.map((group) => ({ ...group, keyDefaults })),
    }),
  });
  store.getState().updateActionEventDetails(event.id, { clipId: clip.id, time: 1.5 });
  expect(store.getState().project!.actionFeedback![0]!.keyStyles![0]).toMatchObject({
    ...keyDefaults,
    id: 'key',
    offset: 0.5,
  });
  expect(store.getState().project!.actionEvents).toEqual([]);
  const before = store.getState().project;
  store.setState({
    selection: {
      kind: 'action-occurrence',
      eventId: event.id,
      clipId: clip.id,
      observedAction: { ...observedAction, streamSha256: 'c'.repeat(64) },
    },
  });
  store.getState().updateActionEventDetails(event.id, { presentation: { enabled: false } });
  expect(store.getState().project).toBe(before);
});
