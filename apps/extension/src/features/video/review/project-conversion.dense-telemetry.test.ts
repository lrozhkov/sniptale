import { expect, it } from 'vitest';
import {
  parseVideoProjectActionFeedback,
  REVIEW_CLICK_DEFAULT,
} from '../project/action-feedback/validation';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { hydrateVideoProject } from '../project/hydration';
import type {
  SourceNormalizedRecordingActionEvent,
  RecordingTelemetrySignal,
} from '../project/types';
import { isExportReadyVideoProject, parseHydratableVideoProject } from '../project/validation/root';
import { isRecordingTelemetrySnapshot } from '../project/validation/recording-telemetry';
import { planReviewProjectConversion } from './project-conversion';
import { fixture } from './project-conversion.test-support';

function denseFixture(actionCount: number, signalCount: number) {
  const input = fixture();
  input.source.duration = 30000;
  const events: SourceNormalizedRecordingActionEvent[] = Array.from(
    { length: actionCount },
    (_, index) => ({
      id: `click:${index}`,
      kind: 'CLICK',
      time: index + 0.1,
      duration: 0.1,
      point: null,
      label: '',
      preset: 'NONE',
      data: {},
    })
  );
  const signals: RecordingTelemetrySignal[] = Array.from({ length: signalCount }, (_, index) => ({
    id: `idle:${index}`,
    kind: 'cursor-idle',
    startTime: index * 2,
    endTime: index * 2 + 1.5,
    point: null,
    data: { dwellMs: 1500 },
  }));
  input.seed = createVideoProjectFromRecording({
    ...input.source,
    recordingId: 'recording',
    filename: 'Original.webm',
    hasAudio: true,
    sourceNormalizedActionEvents: events,
    recordingSignals: signals,
  });
  return { input, events, signals };
}

it.each([
  [5000, 0],
  [5001, 0],
  [0, 10000],
  [0, 10001],
  [5001, 10001],
])(
  'retains all %i source actions and %i source signals through conversion and Native reopen',
  (actions, signalCount) => {
    const { input, events, signals } = denseFixture(actions, signalCount);
    expect(
      isRecordingTelemetrySnapshot({
        actionEvents: events,
        signals,
        cursorTrack: null,
        viewport: null,
      })
    ).toBe(true);
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const admitted = parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)));
    if (!admitted) throw new Error('Expected Native admission');
    const reopened = hydrateVideoProject(admitted);
    expect(isExportReadyVideoProject(reopened)).toBe(true);
    expect(reopened.actionEvents).toEqual(
      before.seed.actionEvents.map((event) => ({
        ...event,
        anchor: { ...event.anchor, sourceInstanceId: result.timeline.sourceInstanceId },
      }))
    );
    expect(reopened.actionFeedback![0]!.signals).toEqual(signals);
    expect(input).toEqual(before);
  }
);

it('refuses malformed and duplicate dense source facts without changing the source', () => {
  const { input } = denseFixture(5001, 10001);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const original = structuredClone(result.project);
  const malformedAction = structuredClone(original);
  malformedAction.actionEvents.at(-1)!.capturedDuration = -1;
  expect(parseHydratableVideoProject(malformedAction)).toBeNull();
  const duplicateAction = structuredClone(original);
  duplicateAction.actionEvents.at(-1)!.anchor = structuredClone(
    duplicateAction.actionEvents[0]!.anchor
  );
  expect(isExportReadyVideoProject(duplicateAction)).toBe(false);
  const malformedSignal = structuredClone(original);
  malformedSignal.actionFeedback![0]!.signals.at(-1)!.endTime = -1;
  expect(parseHydratableVideoProject(malformedSignal)).toBeNull();
  const duplicateSignal = structuredClone(original);
  duplicateSignal.actionFeedback![0]!.signals.at(-1)!.id =
    duplicateSignal.actionFeedback![0]!.signals[0]!.id;
  expect(parseHydratableVideoProject(duplicateSignal)).toBeNull();
  expect(result.project).toEqual(original);
});

it('retains the authored project action count limit', () => {
  const { input } = denseFixture(5001, 0);
  input.seed.actionEvents = input.seed.actionEvents.map((event, index) => ({
    ...event,
    anchor: { kind: 'project', time: index },
  }));
  expect(parseHydratableVideoProject(input.seed)).toBeNull();
  input.seed.actionEvents.pop();
  expect(parseHydratableVideoProject(input.seed)).not.toBeNull();
});

it('preserves authored feedback controls alongside dense source facts', () => {
  const { input, signals } = denseFixture(1, 10001);
  const settings = [
    {
      ref: { kind: 'action' as const, id: 'click:0' },
      enabled: true,
      presetId: 'mouse-classic-paired-v2' as const,
      volume: 0.8,
      offset: -0.2,
      downEnabled: false,
      upEnabled: true,
      includeRepeats: false,
      downGain: 0.4,
      upGain: 0.7,
    },
  ];
  const gestureStyles = [
    {
      ...REVIEW_CLICK_DEFAULT,
      id: 'click:0',
      effect: 'magnify' as const,
      gestureAppearance: 'area' as const,
      gestureArea: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      magnification: 2,
      lensShadow: 50,
      lensShape: 'rounded' as const,
    },
  ];
  input.document.advancedContent.actionAudio = settings;
  input.document.advancedContent.clickAnimations = gestureStyles;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)));
  expect(reopened?.actionFeedback?.[0]).toMatchObject({ settings, gestureStyles, signals });
});

it.each([
  { recordingId: '' },
  { recordingId: 'x'.repeat(257) },
  { sourceInstanceId: '' },
  { sourceInstanceId: 'x'.repeat(257) },
  { unknown: true },
  { settings: null },
  { settings: [null] },
  { settings: [{ ref: { kind: 'signal', id: 'idle:0' }, unknown: true }] },
  { gestureStyles: [null] },
  { keyStyles: [null] },
])('refuses malformed feedback group %j even when source signal count is valid', (patch) => {
  const { input } = denseFixture(0, 10001);
  const group = input.seed.actionFeedback![0]!;
  expect(parseVideoProjectActionFeedback([{ ...group, ...patch }])).toBeNull();
});

it.each([
  { downEnabled: 'yes' },
  { upEnabled: 1 },
  { includeRepeats: null },
  { downGain: -0.1 },
  { upGain: 1.1 },
  { ref: { kind: 'unknown', id: 'idle:0' } },
  { ref: { kind: 'signal', id: ' ' } },
  { ref: { kind: 'signal', id: 'x'.repeat(257) } },
  { ref: { kind: 'signal', id: 'idle:0', extra: true } },
  { presetId: null },
  { presetId: 'unknown' },
  { enabled: 'yes' },
  { volume: 2 },
  { offset: 3 },
])('refuses malformed authored sound %j alongside dense source signals', (patch) => {
  const { input } = denseFixture(0, 10001);
  const group = input.seed.actionFeedback![0]!;
  const setting = {
    ref: { kind: 'signal', id: 'idle:0' },
    enabled: true,
    presetId: 'typing-recorded-v2',
    volume: 1,
    offset: 0,
    ...patch,
  };
  expect(parseVideoProjectActionFeedback([{ ...group, settings: [setting] }])).toBeNull();
});

it.each([
  { id: '' },
  { id: 'x'.repeat(257) },
  { color: 'not-a-color' },
  { effect: 'unknown' },
  { easing: 'unknown' },
  { pulses: 1.5 },
  { radius: 201 },
  { gestureAppearance: 'unknown' },
  { gestureArea: null },
  { gestureArea: { x: 0, y: 0, width: 1, height: 1, extra: true } },
  { gestureArea: { x: 0.9, y: 0, width: 0.2, height: 1 } },
  { gestureArea: { x: 0, y: 0.9, width: 1, height: 0.2 } },
  { gestureArea: { x: 0, y: 0, width: 0, height: 1 } },
  { gestureArea: { x: 0, y: 0, width: 1, height: 0 } },
  { magnification: 4 },
  { lensShadow: 101 },
  { lensShape: 'unknown' },
])('refuses malformed authored gesture %j alongside dense source signals', (patch) => {
  const { input } = denseFixture(0, 10001);
  const group = input.seed.actionFeedback![0]!;
  const style = { ...REVIEW_CLICK_DEFAULT, id: 'click:0', ...patch };
  expect(parseVideoProjectActionFeedback([{ ...group, gestureStyles: [style] }])).toBeNull();
});

it('keeps group identity and authored collection limits independent of source signal density', () => {
  const { input } = denseFixture(0, 10001);
  const group = input.seed.actionFeedback![0]!;
  expect(parseVideoProjectActionFeedback([group, group])).toBeNull();
  expect(parseVideoProjectActionFeedback(Array.from({ length: 10001 }, () => group))).toBeNull();
  const settings = Array.from({ length: 10001 }, (_, index) => ({
    ref: { kind: 'signal', id: `idle:${index}` },
    enabled: false,
    presetId: null,
    volume: 1,
    offset: 0,
  }));
  expect(parseVideoProjectActionFeedback([{ ...group, settings }])).toBeNull();
  const gestureStyles = settings.map((setting) => ({
    ...REVIEW_CLICK_DEFAULT,
    id: setting.ref.id,
  }));
  expect(parseVideoProjectActionFeedback([{ ...group, gestureStyles }])).toBeNull();
  const half = { ...group, sourceInstanceId: 'second', signals: [] };
  expect(
    parseVideoProjectActionFeedback([
      { ...group, settings: settings.slice(0, 5001) },
      { ...half, settings: settings.slice(5001) },
    ])
  ).toBeNull();
  expect(
    parseVideoProjectActionFeedback([
      { ...group, gestureStyles: gestureStyles.slice(0, 5001) },
      { ...half, gestureStyles: gestureStyles.slice(5001) },
    ])
  ).toBeNull();
});
