import { resolveVideoProjectActionPresentations } from '../../../features/video/project/action-presentation';
import { isRecordingEventRecord } from '../../../features/video/project/recording-events/records';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import {
  attachRecordingEventGroups,
  projectRecordingEventGroup,
} from '../../../features/video/project/recording-events/project-facts';
import { resolveSelectionAfterProjectUpdate } from '../state/selection';
import {
  resolveTypingSpanSource,
  planTypingCompression,
} from '../state/clip-timeline/source-range';
import {
  recordingActionObservation,
  recordingSignalObservation,
  resolveRecordingActionOccurrences,
} from './recording-events-selection';
import type {
  RecordingEventsDescriptor,
  RecordingEventRecord,
} from '../../../features/video/project/recording-events/types';
import type { VideoEditorTypingSpanTarget } from '../../contracts/commands/timeline';
import type { VideoEditorSelection } from '../../contracts/selection';

function fixture() {
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
    totalBlocks: 10000,
    totalRecords: 1000000,
    totalBytes: 50000000,
    streamSha256: 'b'.repeat(64),
  };
  const project = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({ ...group, events: descriptor })),
  });
  const group = project.actionFeedback![0]!;
  const action: Extract<RecordingEventRecord, { kind: 'action' }> = {
    kind: 'action',
    recordSeq: 1,
    segmentId: 0,
    activeTimeUs: 1000000,
    action: {
      id: 'hold',
      kind: 'CLICK',
      timeUs: 1000000,
      durationUs: 3000000,
      point: { x: 0.25, y: 0.5 },
      label: 'Click',
      preset: 'NONE',
      data: {
        gestureId: 'hold',
        gestureType: 'hold',
        button: 0,
        downTimeUs: 1000000,
        upTimeUs: 4000000,
        pressDurationUs: 3000000,
        lastObservedTimeUs: 4000000,
        clickCount: 1,
        completion: 'released',
        semanticEndTimeUs: null,
        dragStartTimeUs: null,
        pointerCancelled: false,
        dropObserved: null,
        upPoint: { x: 0.25, y: 0.5 },
        ctrlKey: null,
        altKey: null,
        shiftKey: null,
        metaKey: null,
      },
    },
  };
  const signalRecord: Extract<RecordingEventRecord, { kind: 'signal' }> = {
    kind: 'signal',
    recordSeq: 2,
    segmentId: 0,
    activeTimeUs: 4000000,
    signal: {
      id: 'typing',
      kind: 'typing',
      startTimeUs: 2000000,
      endTimeUs: 4000000,
      point: null,
      data: {
        activity: 'keyboard',
        privacy: 'unknown',
        eventCount: 70000,
        groupId: null,
        continuationOf: null,
      },
    },
  };
  if (!isRecordingEventRecord(action) || !isRecordingEventRecord(signalRecord))
    throw new Error('Invalid source fixture.');
  const facts = projectRecordingEventGroup(group, [action, signalRecord], 'generation');
  const prepared = attachRecordingEventGroups(project, { start: 0, end: 6 }, [facts]);
  const event = facts.actions[0]!;
  const signal = facts.signals[0]!;
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  return { project, prepared, descriptor, event, signal, group, clip };
}

it('selects one cloned streamed action without adding capture facts to the authored document', () => {
  const { project, prepared, event } = fixture();
  const before = JSON.stringify(project);
  const observed = recordingActionObservation(prepared, event)!;
  expect(observed).toBeDefined();
  expect(recordingActionObservation(project, event)).toBeUndefined();
  const occurrences = resolveRecordingActionOccurrences(project, observed);
  expect(occurrences).toHaveLength(1);
  expect(occurrences[0]?.event.anchor).toEqual(event.anchor);
  event.data['upTime'] = 99;
  expect(observed.record.action.kind === 'CLICK' && observed.record.action.data.upTimeUs).toBe(
    4000000
  );
  expect(JSON.stringify(project)).toBe(before);
  expect(project.actionEvents).toEqual([]);
});

it(
  'keeps a selected observed hold across a retained tail and split lineage but rejects ' +
    'another source contract',
  () => {
    const { project, prepared, event, clip, group, descriptor } = fixture();
    const observedAction = recordingActionObservation(prepared, event)!;
    const selection: VideoEditorSelection = {
      kind: 'action-occurrence',
      eventId: event.id,
      clipId: clip.id,
      observedAction,
    };
    const tail = applyVideoProjectMutationPatch(project, {
      clips: [{ ...clip, sourceStart: 2, sourceDuration: 4, duration: 4 }],
    });
    expect(resolveSelectionAfterProjectUpdate(tail, selection)).toEqual(selection);
    const split = applyVideoProjectMutationPatch(tail, {
      clips: [{ ...tail.clips[0]!, id: 'trailing' }],
    });
    expect(
      resolveSelectionAfterProjectUpdate(split, selection, new Map([[clip.id, 'trailing']]))
    ).toEqual({ ...selection, clipId: 'trailing' });
    const changed = applyVideoProjectMutationPatch(project, {
      actionFeedback: [{ ...group, events: { ...descriptor, streamSha256: 'c'.repeat(64) } }],
    });
    expect(resolveRecordingActionOccurrences(changed, observedAction)).toEqual([]);
    expect(resolveSelectionAfterProjectUpdate(changed, selection)).toEqual({
      kind: 'history-lane',
    });
    expect(resolveSelectionAfterProjectUpdate({ ...project, clips: [] }, selection)).toEqual({
      kind: 'history-lane',
    });
  }
);

it(
  'uses the selected observed typing interval for compression while leaving the raw ' +
    'source and project arrays intact',
  () => {
    const { project, prepared, group, signal, clip } = fixture();
    const observedSignal = recordingSignalObservation(prepared, group, signal)!;
    const target: VideoEditorTypingSpanTarget = {
      recordingId: group.recordingId,
      sourceInstanceId: group.sourceInstanceId,
      signalId: signal.id,
      clipId: clip.id,
      observedSignal,
    };
    expect(resolveTypingSpanSource(project, [], target)?.signal.data['eventCount']).toBe(70000);
    const before = JSON.stringify(project);
    const result = planTypingCompression(project, [], { ...target, targetPlaybackRate: 2 });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a source interval edit.');
    expect(result.project.duration).toBe(5);
    expect(result.project.actionEvents).toEqual([]);
    expect(result.project.actionFeedback?.[0]?.signals).toEqual([]);
    expect(JSON.stringify(project)).toBe(before);
    signal.endTime = 100;
    expect(observedSignal.record.signal.endTimeUs).toBe(4000000);
    const stale = {
      ...target,
      observedSignal: { ...observedSignal, streamSha256: 'c'.repeat(64) },
    };
    expect(resolveTypingSpanSource(project, [], stale)).toBeNull();
    expect(planTypingCompression(project, [], { ...stale, targetPlaybackRate: 2 })).toEqual({
      status: 'blocked',
      reason: 'missing-source',
    });
  }
);

it('uses one selected canonical action when its prepared viewport copy is also present', () => {
  const { prepared, event } = fixture();
  const observed = recordingActionObservation(prepared, event)!;
  const selected = resolveRecordingActionOccurrences(prepared, observed)[0]!.event;
  expect(resolveVideoProjectActionPresentations(prepared, [selected])).toHaveLength(1);
});
