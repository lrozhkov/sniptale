import { expect, it, vi } from 'vitest';
import { REVIEW_KEY_DEFAULT } from '../action-feedback/key-animation';
import { createVideoProjectFromRecording } from '../factories/creation';
import { applyVideoProjectMutationPatch } from '../mutation';
import { encodeRecordingEventCadence } from './records';
import { prepareRecordingEventsProject, type ReadRecordingEventRange } from './project-window';
import {
  recordingEventProjectActions,
  recordingEventProjectSignals,
  recordingEventProjectCadence,
  recordingEventsProjectCoversTime,
  type RecordingEventWindowRecord,
} from './project-facts';
import type { RecordingEventsDescriptor } from './types';

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
function fixture() {
  const project = createVideoProjectFromRecording({
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
  return applyVideoProjectMutationPatch(project, {
    actionFeedback: project.actionFeedback!.map((group) => ({ ...group, events: descriptor })),
  });
}
const readEmpty = () =>
  vi.fn<ReadRecordingEventRange>(async () => ({ writerGeneration: 'generation', records: [] }));

it('keeps nullable keyboard edges, anonymous holds and direct microsecond cadence outside project JSON', async () => {
  const project = fixture();
  const group = project.actionFeedback![0]!;
  const cadence = encodeRecordingEventCadence('exact-cadence', [86_400_000_001, 86_400_000_101]);
  const records: RecordingEventWindowRecord[] = [
    {
      kind: 'action',
      recordSeq: 1,
      segmentId: 0,
      activeTimeUs: 100,
      action: {
        id: 'unknown-down',
        kind: 'KEY',
        timeUs: 100,
        durationUs: 0,
        point: null,
        label: 'Ctrl+S',
        preset: 'NONE',
        data: {
          downTimeUs: null,
          upTimeUs: 100,
          pressDurationUs: null,
          lastObservedTimeUs: 100,
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
    },
    {
      kind: 'signal',
      recordSeq: 2,
      segmentId: 0,
      activeTimeUs: 200,
      signal: {
        id: 'hold',
        kind: 'keyboard-hold',
        startTimeUs: 1,
        endTimeUs: 99,
        point: null,
        data: {
          privacy: 'normal',
          downTimeUs: 1,
          upTimeUs: null,
          pressDurationUs: null,
          lastObservedTimeUs: 99,
          repeatCount: 7,
          completion: 'lost',
        },
      },
    },
    {
      kind: 'keyboard-repeat-block',
      recordSeq: 3,
      segmentId: 0,
      activeTimeUs: 300,
      ownerKind: 'signal',
      ownerId: 'typing',
      phase: 'onset',
      cadence,
    },
  ];
  const before = JSON.stringify(project);
  const rendered = await prepareRecordingEventsProject(project, { start: 0, end: 1 }, async () => ({
    writerGeneration: 'generation',
    records,
  }));
  expect(recordingEventProjectActions(rendered)[0]?.data).toMatchObject({
    downTime: null,
    upTime: 0.0001,
    pressDuration: null,
    keyboardOnsetTime: null,
    combo: 'Ctrl+S',
    ctrlKey: true,
    altKey: null,
  });
  expect(recordingEventProjectActions(rendered)[0]?.anchor).toMatchObject({
    sourceEventId: 'unknown-down',
    sourceTime: 0.0001,
  });
  expect(recordingEventProjectSignals(rendered, group)[0]).toMatchObject({
    kind: 'typing',
    endTime: 0.000099,
    data: { keyboardHold: true, upTime: null, repeatCount: 7, completion: 'lost' },
  });
  expect(recordingEventProjectCadence(rendered, group, 'signal', 'typing')?.onsets).toEqual([
    cadence,
  ]);
  expect(recordingEventsProjectCoversTime(rendered, 0.5)).toBe(true);
  expect(recordingEventsProjectCoversTime(rendered, 2)).toBe(false);
  expect(JSON.stringify(rendered)).toBe(before);
  expect(JSON.stringify(project)).toBe(before);
});

it('queries trimmed and rated source ranges with the admitted feedback reach', async () => {
  const project = fixture();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source.');
  clip.startTime = 2;
  clip.sourceStart = 100;
  clip.sourceDuration = 20;
  clip.duration = 10;
  clip.playbackRate = 2;
  const read = readEmpty();
  await prepareRecordingEventsProject(project, { start: 2, end: 3 }, read);
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ fromTimeUs: 86_000_000, toTimeUs: 116_000_000 }),
    descriptor
  );
});

it('uses the held source frame rather than advancing capture time during a playback hold', async () => {
  const project = fixture();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source.');
  clip.startTime = 100;
  clip.sourceStart = 0;
  clip.sourceDuration = 20;
  clip.duration = 5;
  clip.playbackRate = 2;
  clip.playbackWindow = { offset: 2, extent: 7, holdAt: 1 };
  const read = readEmpty();
  await prepareRecordingEventsProject(project, { start: 100.2, end: 100.5 }, read);
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ fromTimeUs: 0, toTimeUs: 16_000_000 }),
    descriptor
  );
});

it('queries disjoint source appearances separately and rejects a generation change across them', async () => {
  const project = fixture();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source.');
  clip.duration = 1;
  clip.sourceStart = 100;
  clip.sourceDuration = 1;
  project.clips.push({ ...clip, id: 'second', sourceStart: 1000 });
  const read = readEmpty();
  await prepareRecordingEventsProject(project, { start: 0, end: 1 }, read);
  expect(read.mock.calls.map(([range]) => [range.fromTimeUs, range.toTimeUs])).toEqual([
    [93_000_000, 108_000_000],
    [993_000_000, 1008_000_000],
  ]);
  read
    .mockResolvedValueOnce({ writerGeneration: 'first', records: [] })
    .mockResolvedValueOnce({ writerGeneration: 'successor', records: [] });
  await expect(prepareRecordingEventsProject(project, { start: 0, end: 1 }, read)).rejects.toThrow(
    'source changed'
  );
});

it(
  'invalidates copied render facts after source timing or descriptor changes but keeps ' +
    'authored key style changes',
  async () => {
    const project = fixture();
    const group = project.actionFeedback![0]!;
    const rendered = await prepareRecordingEventsProject(
      project,
      { start: 0, end: 1 },
      async () => ({
        writerGeneration: 'generation',
        records: [
          {
            kind: 'signal',
            recordSeq: 1,
            segmentId: 0,
            activeTimeUs: 1000000,
            signal: {
              id: 'idle',
              kind: 'cursor-idle',
              startTimeUs: 0,
              endTimeUs: 1000000,
              point: null,
              data: { source: 'browser-cursor' },
            },
          },
        ],
      })
    );
    expect(recordingEventProjectSignals(rendered, group)).toHaveLength(1);
    const styled = applyVideoProjectMutationPatch(rendered, {
      actionFeedback: [{ ...group, keyDefaults: { ...REVIEW_KEY_DEFAULT, enabled: true } }],
    });
    expect(recordingEventsProjectCoversTime(styled, 0.5)).toBe(true);
    expect(recordingEventProjectSignals(styled, styled.actionFeedback![0]!)).toHaveLength(1);
    const moved = applyVideoProjectMutationPatch(rendered, {
      clips: rendered.clips.map((clip) => ({ ...clip, startTime: 100 })),
    });
    expect(recordingEventsProjectCoversTime(moved, 0.5)).toBe(false);
    expect(recordingEventProjectSignals(moved, group)).toEqual([]);
    const changed = applyVideoProjectMutationPatch(rendered, {
      actionFeedback: [{ ...group, events: { ...descriptor, streamSha256: 'c'.repeat(64) } }],
    });
    expect(recordingEventsProjectCoversTime(changed, 0.5)).toBe(false);
    expect(recordingEventProjectSignals(changed, changed.actionFeedback![0]!)).toEqual([]);
  }
);

it('reads the authored action reach and rejects a cached window with obsolete reach', async () => {
  const project = fixture();
  const read = readEmpty();
  const rendered = await prepareRecordingEventsProject(project, { start: 100, end: 101 }, read);
  const changed = applyVideoProjectMutationPatch(rendered, {
    actionFeedback: rendered.actionFeedback!.map((group) => ({
      ...group,
      actionOverrides: [{ id: 'action', presentation: { duration: 20, offset: -3 } }],
    })),
  });
  expect(recordingEventsProjectCoversTime(changed, 100)).toBe(false);
  read.mockClear();
  await prepareRecordingEventsProject(changed, { start: 100, end: 101 }, read);
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ fromTimeUs: 77000000, toTimeUs: 124000000 }),
    descriptor
  );
});
