import { expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../features/video/project/mutation';
import {
  encodeRecordingEventCadence,
  decodeRecordingEventCadence,
} from '../../features/video/project/recording-events/records';
import { prepareRecordingEventsProject } from '../../features/video/project/recording-events/project-window';
import type { RecordingEventWindowRecord } from '../../features/video/project/recording-events/project-facts';
import { buildProjectActionAudioPlan } from '../../features/video/review/project-action-audio';
import {
  iterateReviewActionAudioCues,
  reviewActionAudioAdmission,
} from '../../features/video/review/action-audio';
import type { VideoProject } from '../../features/video/project/types';
import {
  createRecordingProjectActionAudioSource,
  createReviewRecordingActionAudioSource,
} from './recording-action-audio';

function fixture(times: number[]) {
  const records: RecordingEventWindowRecord[] = [
    {
      kind: 'signal',
      recordSeq: 1,
      segmentId: 0,
      activeTimeUs: 61_000_000,
      signal: {
        id: 'typing',
        kind: 'typing',
        startTimeUs: times[0]!,
        endTimeUs: times.at(-1)!,
        point: null,
        data: {
          eventCount: times.length,
          activity: 'keyboard',
          privacy: 'normal',
          groupId: 'typing',
          continuationOf: null,
        },
      },
    },
  ];
  for (let offset = 0; offset < times.length; offset += 512)
    records.push({
      kind: 'keyboard-repeat-block',
      recordSeq: records.length + 1,
      segmentId: 0,
      activeTimeUs: 61_000_000,
      ownerKind: 'signal',
      ownerId: 'typing',
      phase: 'onset',
      cadence: encodeRecordingEventCadence(`block-${offset}`, times.slice(offset, offset + 512)),
    });
  const base = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 61,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    recordingSignals: [],
    sourceNormalizedActionEvents: [],
  });
  const project = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({
      ...group,
      events: {
        format: 'recording-events-v1',
        formatVersion: 1,
        algorithm: 'lossless-v1',
        encoding: 'json-utf8-v1',
        eventStreamId: 'a'.repeat(32),
        state: 'complete',
        finalized: true,
        totalBlocks: 100,
        totalRecords: 50000,
        totalBytes: 5000000,
        streamSha256: 'b'.repeat(64),
      },
      settings: [
        {
          ref: { kind: 'signal', id: 'typing' },
          enabled: true,
          presetId: 'typing-recorded-v2',
          includeRepeats: true,
          volume: 0.5,
          offset: 0,
        },
      ],
    })),
  });
  let generation = 'generation';
  const owners: {
    prepare: ReturnType<
      typeof vi.fn<
        (
          input: VideoProject,
          range: { start: number; end: number },
          signal?: AbortSignal
        ) => Promise<VideoProject>
      >
    >;
    clear: ReturnType<typeof vi.fn>;
  }[] = [];
  const createRenderer = () => {
    const owner = {
      clear: vi.fn(),
      prepare: vi.fn(
        async (
          input: VideoProject,
          range: { start: number; end: number },
          signal?: AbortSignal
        ) => {
          signal?.throwIfAborted();
          return prepareRecordingEventsProject(input, range, async (query) => ({
            writerGeneration: generation,
            records: records.filter((record) => {
              if (record.kind !== 'keyboard-repeat-block') return true;
              const times = decodeRecordingEventCadence(record.cadence)!;
              return times[0]! <= query.toTimeUs && times.at(-1)! >= query.fromTimeUs;
            }),
          }));
        }
      ),
    };
    owners.push(owner);
    return owner;
  };
  return {
    project,
    records,
    createRenderer,
    owners,
    replace() {
      generation = 'successor';
    },
  };
}
const cues = (
  plan: ReturnType<typeof buildProjectActionAudioPlan>,
  range = { start: 0, end: plan.duration }
) => [...iterateReviewActionAudioCues(plan, range)].flat();
function admission(plan: ReturnType<typeof buildProjectActionAudioPlan>) {
  const iterator = reviewActionAudioAdmission(plan);
  for (;;) {
    const next = iterator.next();
    if (next.done) return next.value;
  }
}

it(
  'admits more than 4096 attacks in bounded scan windows with the same global gain and ' +
    'partitioned cue identities',
  async () => {
    const times = Array.from({ length: 5000 }, (_, index) => index * 12_000 + 1);
    const { project, records, createRenderer, owners } = fixture(times);
    const full = await prepareRecordingEventsProject(project, { start: 0, end: 61 }, async () => ({
      writerGeneration: 'generation',
      records,
    }));
    const reference = buildProjectActionAudioPlan(full);
    const source = createRecordingProjectActionAudioSource(project, { createRenderer });
    expect(await source.admit()).toEqual({
      ...admission(reference),
      firstCueTime: cues(reference)[0]?.start ?? null,
    });
    expect(owners[1]?.prepare.mock.calls.map(([, range]) => range.end)).toEqual([30, 60, 61]);
    expect(owners[1]?.clear).toHaveBeenCalledOnce();
    await source.admit();
    expect(owners).toHaveLength(2);
    const actual = [];
    for (const range of [
      { start: 0, end: 20 },
      { start: 20, end: 40 },
      { start: 40, end: 61 },
    ]) {
      const plan = await source.readWindow(range);
      actual.push(
        ...cues(plan, range).filter((cue) => cue.start >= range.start && cue.start < range.end)
      );
    }
    expect(actual).toHaveLength(5000);
    expect(actual).toEqual(cues(reference));
    expect(project.actionEvents).toEqual([]);
    expect(project.actionFeedback?.[0]?.signals).toEqual([]);
    source.dispose();
  },
  20000
);

it('retains active tails across scan boundaries and refuses 65 simultaneous voices explicitly', async () => {
  const times = Array.from({ length: 65 }, (_, index) => 29_999_968 + index);
  const { project, createRenderer } = fixture(times);
  const source = createRecordingProjectActionAudioSource(project, { createRenderer });
  await expect(source.admit()).rejects.toMatchObject({ reason: 'voice-limit' });
  source.dispose();
});

it('pins source generations across admission and later reads', async () => {
  const { project, createRenderer, replace } = fixture([1_000_001, 1_000_101]);
  const source = createRecordingProjectActionAudioSource(project, { createRenderer });
  await source.admit();
  replace();
  await expect(source.readWindow({ start: 1, end: 2 })).rejects.toThrow('source changed');
  source.dispose();
});

it('cancels a scan and permits a complete retry without certifying the partial prefix', async () => {
  const data = fixture([1_000_001]);
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  let block = true;
  const createRenderer = () => {
    const owner = data.createRenderer();
    const prepare = owner.prepare.getMockImplementation()!;
    owner.prepare.mockImplementation(async (...args) => {
      if (block) {
        block = false;
        entered.resolve();
        await resume.promise;
      }
      return prepare(...args);
    });
    return owner;
  };
  const source = createRecordingProjectActionAudioSource(data.project, { createRenderer });
  const abort = new AbortController();
  const pending = source.admit(abort.signal);
  const failed = expect(pending).rejects.toThrow();
  await entered.promise;
  abort.abort();
  resume.resolve();
  await failed;
  expect(data.owners[1]?.clear).toHaveBeenCalledOnce();
  await expect(source.admit()).resolves.toMatchObject({ maxVoices: 1, busGain: 1 });
  source.dispose();
  await expect(source.readWindow({ start: 1, end: 2 })).rejects.toThrow();
});

it('finds a late first real cue through bounded admission windows', async () => {
  const { project, createRenderer, owners } = fixture([45_000_001]);
  const source = createRecordingProjectActionAudioSource(project, { createRenderer });
  await expect(source.admit()).resolves.toMatchObject({ firstCueTime: 45.000001 });
  expect(owners[1]?.prepare.mock.calls.map(([, range]) => range.end)).toEqual([30, 60, 61]);
  source.dispose();
});

it('projects Quick Edit cuts and speed into the shared archive audio source without copying facts', async () => {
  const { project, createRenderer, owners } = fixture([10_000_001, 45_000_001]);
  const settings = project.actionFeedback![0]!.settings;
  const source = createReviewRecordingActionAudioSource(
    {
      project: {
        ...project,
        actionFeedback: project.actionFeedback!.map((group) => ({ ...group, settings: [] })),
      },
      source: { width: 640, height: 360, duration: 61, mimeType: 'video/webm', size: 100 },
      edits: [
        { id: 'cut', kind: 'cut', start: 0, end: 20, requestedStart: 0, requestedEnd: 20 },
        {
          id: 'speed',
          kind: 'speed',
          start: 20,
          end: 60,
          requestedStart: 20,
          requestedEnd: 60,
          rate: 2,
          audio: 'speed',
        },
      ],
      settings,
      applied: true,
    },
    { createRenderer }
  );
  expect(source).not.toBeNull();
  expect(source!.duration).toBe(21);
  expect((await source!.admit()).firstCueTime).toBeCloseTo(12.5000005, 12);
  const window = await source!.readWindow({ start: 12, end: 13 });
  expect(cues(window)).toHaveLength(1);
  expect(cues(window)[0]!.start).toBeCloseTo(12.5000005, 12);
  expect(owners[0]!.prepare.mock.calls[0]![0].actionEvents).toEqual([]);
  expect(owners[0]!.prepare.mock.calls[0]![0].actionFeedback![0]!.signals).toEqual([]);
  source!.dispose();
});
