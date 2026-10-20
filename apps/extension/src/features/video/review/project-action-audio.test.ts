import { getVideoProjectActionPresentation } from '../project/action-presentation';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { encodeRecordingKeyboardRhythm } from '../project/keyboard-rhythm';
import {
  buildProjectActionAudioPlan,
  buildProjectActionAudioAuditionPlan,
  projectActionFeedbackMarkers,
  evaluateProjectGestureFeedback,
} from './project-action-audio';
import { iterateReviewActionAudioCues } from './action-audio';
import { patchReviewClicks } from './advanced/click-animation';
import { parseVideoProjectActionFeedback } from '../project/action-feedback/validation';
import { projectReviewTelemetry } from './telemetry';
import { scheduleReviewClicks, evaluateReviewClicks } from './click-animation';
import { resolveVideoCompositionActions } from '../composition/timeline/frame/actions';
const cues = (
  plan: ReturnType<typeof buildProjectActionAudioPlan>,
  start = 0,
  end = plan.duration
) => [...iterateReviewActionAudioCues(plan, { start, end })].flat();
function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'rec',
    filename: 'rec.webm',
    width: 1280,
    height: 720,
    duration: 8,
    mimeType: 'video/webm',
    size: 1024,
    hasAudio: false,
    recordingSignals: [
      {
        id: 'rhythm',
        kind: 'typing',
        startTime: 1,
        endTime: 5,
        point: null,
        data: { activity: 'keyboard', captureSegment: 0 },
        keyboardRhythm: [encodeRecordingKeyboardRhythm('block', [1, 1.01, 1.02, 3, 3.1])],
      },
    ],
    sourceNormalizedActionEvents: [
      {
        id: 'drag',
        kind: 'CLICK',
        time: 1,
        duration: 0.6,
        point: { x: 0.1, y: 0.2 },
        label: '',
        data: {
          gestureId: 'drag',
          gestureType: 'drag',
          button: 0,
          downTime: 1,
          upTime: 5,
          pressDuration: 4,
          completion: 'released',
          captureSegment: 0,
        },
        preset: 'NONE',
      },
    ],
  });
  const group = project.actionFeedback![0]!;
  group.settings = [
    {
      ref: { kind: 'signal', id: 'rhythm' },
      enabled: true,
      presetId: 'typing-recorded-v2',
      volume: 0.5,
      offset: 0,
    },
    {
      ref: { kind: 'action', id: 'drag' },
      enabled: true,
      presetId: 'mouse-classic-paired-v2',
      volume: 0.5,
      offset: 0,
    },
  ];
  return project;
}

it('keeps the real down attack but emits no release or click ripple from an incomplete short press prefix', () => {
  const project = fixture();
  const event = project.actionEvents[0]!;
  const data = {
    gestureId: 'drag',
    gestureType: 'click',
    completion: 'lost',
    button: 0,
    downTime: 1,
    lastObservedTime: 1,
    captureSegment: 0,
  };
  event.data = data;
  event.capturedDuration = 0;
  const group = project.actionFeedback![0]!;
  group.signals = [];
  group.settings = group.settings.filter((setting) => setting.ref.kind === 'action');
  group.gestureStyles = patchReviewClicks([], ['drag'], { effect: 'ripple' });
  const marker = projectReviewTelemetry(
    {
      actionEvents: [
        {
          id: 'drag',
          kind: 'CLICK',
          time: 1,
          duration: 0,
          point: { x: 0.1, y: 0.2 },
          recordingPoint: { x: 0.1, y: 0.2 },
          label: '',
          data,
          preset: 'CLICK_PRESS',
        },
      ],
      signals: [],
      cursorTrack: null,
    },
    8
  ).markers;
  const segments = [
    { sourceStart: 0, sourceEnd: 8, resultStart: 0, resultEnd: 8, kind: 'keep' as const, rate: 1 },
  ];
  expect(
    evaluateReviewClicks(scheduleReviewClicks(marker, group.gestureStyles, segments), 1.01)
  ).toEqual([]);
  expect(evaluateProjectGestureFeedback(project, 1.01)).toEqual([]);
  expect(resolveVideoCompositionActions(project, 1.01)).toEqual([]);
  expect(
    cues(buildProjectActionAudioPlan(project)).map((cue) => [cue.sampleId, cue.start])
  ).toEqual([['mouse-click-v1', 1]]);
});
it('projects every surviving source attack independently across cut, Speed and window partitions', () => {
  const project = fixture(),
    video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  project.clips = [
    {
      ...video,
      id: video.id,
      sourceStart: 2,
      sourceDuration: 4,
      startTime: 0,
      duration: 2,
      playbackRate: 2,
    },
  ];
  project.duration = 2;
  const plan = buildProjectActionAudioPlan(project),
    whole = cues(plan);
  expect(whole.map((cue) => [cue.sampleId, cue.start])).toEqual([
    [expect.stringMatching(/^key-/), 0.5],
    [expect.stringMatching(/^key-/), 0.55],
    ['mouse-click-03-v1', 1.5],
  ]);
  expect(whole.every((cue) => cue.rate === 1)).toBe(true);
  const partitioned = [...cues(plan, 0, 0.53), ...cues(plan, 0.53, 2)];
  expect([...new Map(partitioned.map((cue) => [cue.id, cue])).values()]).toEqual(whole);
});
it('keeps sample choices across split and duplicate with independent instance identity', () => {
  const project = fixture(),
    base = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const original = cues(buildProjectActionAudioPlan(project));
  project.clips = [
    { ...base, sourceDuration: 4, duration: 4 },
    { ...base, id: 'trailing', sourceStart: 4, sourceDuration: 4, startTime: 4, duration: 4 },
  ];
  expect(
    cues(buildProjectActionAudioPlan(project)).map((cue) => [cue.sampleId, cue.start])
  ).toEqual(original.map((cue) => [cue.sampleId, cue.start]));
  const group = project.actionFeedback![0]!;
  project.actionFeedback!.push({ ...structuredClone(group), sourceInstanceId: 'duplicate' });
  project.actionEvents.push(
    ...project.actionEvents.flatMap((event) =>
      event.anchor.kind === 'recording-source'
        ? [
            {
              ...event,
              id: `${event.id}-copy`,
              anchor: { ...event.anchor, sourceInstanceId: 'duplicate' },
            },
          ]
        : []
    )
  );
  project.clips.push({ ...base, id: 'duplicate', sourceInstanceId: 'duplicate', startTime: 8 });
  project.duration = 16;
  const duplicated = cues(buildProjectActionAudioPlan(project));
  expect(new Set(duplicated.map((cue) => cue.id)).size).toBe(duplicated.length);
  const copies = duplicated.slice(original.length);
  expect(copies.map((cue) => cue.sampleId)).toEqual(original.map((cue) => cue.sampleId));
  copies.forEach((cue, index) => expect(cue.start - 8).toBeCloseTo(original[index]!.start, 12));
});
it('keeps halo on verified actual coordinates and ends at observed release without a drag ripple', () => {
  const project = fixture(),
    base = project.clips.find((clip) => clip.type === 'VIDEO')!;
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
    samples: [1, 3, 5].map((time, index) => ({
      id: `p${index}`,
      time,
      x: 100,
      y: 100,
      visible: true,
      captureSegment: 0,
      recordingPoint: { x: 0.1 + index * 0.2, y: 0.2 },
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'rec',
        sourceClipId: base.id,
        sourceTime: time,
      },
    })),
  };
  const group = project.actionFeedback![0]!;
  group.gestureStyles = patchReviewClicks([], ['drag'], {
    effect: 'ripple',
    gestureAppearance: 'path',
  });
  const frames = evaluateProjectGestureFeedback(project, 2);
  expect(frames).toHaveLength(1);
  expect(frames[0]!.frame).toMatchObject({ effect: 'press', point: { x: 0.2, y: 0.2 } });
  expect(frames[0]!.frame.path!.length).toBeGreaterThan(0);
  expect(evaluateProjectGestureFeedback(project, 5)).toEqual([]);
  group.gestureStyles = patchReviewClicks(
    group.gestureStyles,
    ['drag'],
    { gestureAppearance: 'area' },
    projectActionFeedbackMarkers(project, group)
  );
  expect(evaluateProjectGestureFeedback({ ...project }, 2)[0]!.frame.area).toEqual({
    x: 0.1,
    y: 0.2,
    width: 0.4,
    height: 0.01,
  });
});
it('roundtrips settings and rejects malformed rhythm or precise protected input rather than playing it', () => {
  const project = fixture();
  const parsed = parseVideoProjectActionFeedback(
    JSON.parse(JSON.stringify(project.actionFeedback))
  );
  expect(parsed).toEqual(parseVideoProjectActionFeedback(project.actionFeedback));
  expect(parsed![0]!.signals).not.toBe(project.actionFeedback![0]!.signals);
  const group = project.actionFeedback![0]!;
  group.settings[1]!.downEnabled = false;
  group.settings[1]!.upGain = 0.25;
  expect(
    cues(buildProjectActionAudioPlan(project)).filter((cue) => cue.sampleId.startsWith('mouse'))
  ).toMatchObject([{ sampleId: 'mouse-click-03-v1', volume: 0.125 }]);
  group.signals[0]!.keyboardRhythm![0]!.count = 4097;
  expect(parseVideoProjectActionFeedback(project.actionFeedback)).toBeNull();
});

it('honours explicit action presentation disable while preserving saved factual sound settings', () => {
  const project = fixture();
  const settings = structuredClone(project.actionFeedback);
  project.actionPresentation = { ...getVideoProjectActionPresentation(project), enabled: false };
  expect(cues(buildProjectActionAudioPlan(project))).toEqual([]);
  expect(evaluateProjectGestureFeedback(project, 2)).toEqual([]);
  expect(project.actionFeedback).toEqual(settings);
  project.actionPresentation.enabled = true;
  expect(cues(buildProjectActionAudioPlan(project)).length).toBeGreaterThan(0);
});

it('projects held-command observed repeats only after explicit author enable', () => {
  const project = fixture(),
    event = project.actionEvents[0]!;
  event.kind = 'KEY';
  event.data = {
    keyboardOnsetTime: 1,
    keyboardAttackId: 'command-down',
    downTime: 1,
    upTime: 2,
    completion: 'released',
  };
  event.keyboardRepeats = [encodeRecordingKeyboardRhythm('command-repeats', [1.1, 1.2])];
  const setting = project.actionFeedback![0]!.settings.find(
    (setting) => setting.ref.kind === 'action'
  )!;
  setting.presetId = 'keyboard-recorded-v2';
  expect(
    cues(buildProjectActionAudioPlan(project)).filter((cue) => cue.ref.kind === 'action')
  ).toHaveLength(1);
  setting.includeRepeats = true;
  const attacks = cues(buildProjectActionAudioPlan(project)).filter(
    (cue) => cue.ref.kind === 'action'
  );
  expect(attacks).toHaveLength(3);
  attacks.forEach((cue, index) => expect(cue.start).toBeCloseTo(1 + index * 0.1, 12));
});

it('hides actual pointer feedback during observation gaps and resumes without a cross-surface path bridge', () => {
  const project = fixture(),
    base = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const observations = [
    { time: 1, x: 0.1, segment: 0, visible: true },
    { time: 2, x: 0.2, segment: 0, visible: true },
    { time: 2.1, x: 0.2, segment: 1, visible: false },
    { time: 3, x: 0.8, segment: 1, visible: true },
    { time: 5, x: 0.9, segment: 1, visible: true },
  ];
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
    samples: observations.map((sample, index) => ({
      id: `gap:${index}`,
      time: sample.time,
      x: sample.x * 1280,
      y: 144,
      visible: sample.visible,
      captureSegment: sample.segment,
      recordingPoint: sample.visible ? { x: sample.x, y: 0.2 } : null,
      observation: sample.visible ? 'observed' : 'outside',
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'rec',
        sourceClipId: base.id,
        sourceTime: sample.time,
      },
    })),
  };
  project.actionFeedback![0]!.gestureStyles = patchReviewClicks([], ['drag'], {
    effect: 'press',
    gestureAppearance: 'path',
  });
  expect(evaluateProjectGestureFeedback(project, 2.5)).toEqual([]);
  const resumed = evaluateProjectGestureFeedback(project, 3.5)[0]!.frame;
  expect(resumed.point.x).toBeCloseTo(0.825, 12);
  expect(resumed.path?.every((point) => point.x >= 0.8)).toBe(true);
});

it('bounds source traversal to preparation and replans gesture appearance on a new project revision', () => {
  const project = fixture();
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  const samples = Array.from({ length: 10000 }, (_, index) => ({
    id: `long:${index}`,
    time: 1 + index / 2500,
    x: 128,
    y: 144,
    visible: true,
    captureSegment: 0,
    observation: 'observed' as const,
    recordingPoint: { x: 0.1, y: 0.2 },
    sourceAnchor: {
      kind: 'recording-source' as const,
      recordingId: 'rec',
      sourceClipId: clip.id,
      sourceTime: 1 + index / 2500,
    },
  }));
  const facts = structuredClone(samples);
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
    samples,
  };
  let reads = 0;
  Object.defineProperty(project.cursorTrack, 'samples', {
    get() {
      reads++;
      return samples;
    },
  });
  const first = evaluateProjectGestureFeedback(project, 2);
  expect(first).toHaveLength(1);
  const preparationReads = reads;
  expect(preparationReads).toBeGreaterThan(0);
  expect(evaluateProjectGestureFeedback(project, 4)).toHaveLength(1);
  expect(evaluateProjectGestureFeedback(project, 2)).toEqual(first);
  expect(reads).toBe(preparationReads);
  const updated = {
    ...project,
    actionFeedback: project.actionFeedback!.map((group) => ({
      ...group,
      gestureStyles: patchReviewClicks([], ['drag'], { effect: 'press', color: '#22cc88' }),
    })),
  };
  expect(evaluateProjectGestureFeedback(updated, 2)[0]!.frame.color).toBe('#22cc88ff');
  expect(reads).toBeGreaterThan(preparationReads);
  expect(evaluateProjectGestureFeedback(project, 2)).toEqual(first);
  expect(samples).toEqual(facts);
});

it('honours per-event Off for saved authored gesture styles and restores them on a new On revision', () => {
  const project = fixture();
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
    samples: [1, 5].map((time) => ({
      id: `observed:${time}`,
      time,
      x: 128,
      y: 144,
      visible: true,
      observation: 'observed',
      captureSegment: 0,
      recordingPoint: { x: 0.1, y: 0.2 },
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'rec',
        sourceClipId: clip.id,
        sourceTime: time,
      },
    })),
  };
  project.actionFeedback![0]!.gestureStyles = patchReviewClicks([], ['drag'], {
    effect: 'press',
    gestureAppearance: 'area',
    gestureArea: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  });
  const styles = structuredClone(project.actionFeedback![0]!.gestureStyles);
  expect(evaluateProjectGestureFeedback(project, 2)).toHaveLength(1);
  const off = {
    ...project,
    actionEvents: project.actionEvents.map((event) => ({
      ...event,
      presentation: { ...event.presentation, enabled: false },
    })),
  };
  expect(evaluateProjectGestureFeedback(off, 2)).toEqual([]);
  expect(resolveVideoCompositionActions(off, 2)).toEqual([]);
  expect(off.actionFeedback![0]!.gestureStyles).toEqual(styles);
  const on = {
    ...off,
    actionEvents: off.actionEvents.map((event) => ({
      ...event,
      presentation: { ...event.presentation, enabled: true },
    })),
  };
  expect(evaluateProjectGestureFeedback(on, 2)).toEqual(evaluateProjectGestureFeedback(project, 2));
  expect(resolveVideoCompositionActions(on, 2)).toHaveLength(1);
  expect(on.actionFeedback![0]!.gestureStyles).toEqual(styles);
});

it('auditions only the selected instance and typed identity through cut and Speed without authoring', () => {
  const project = fixture();
  const base = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const group = project.actionFeedback![0]!;
  const copy = { ...structuredClone(group), sourceInstanceId: 'copy' };
  project.actionFeedback!.push(copy);
  project.actionEvents.push(
    ...project.actionEvents.flatMap((event) =>
      event.anchor.kind === 'recording-source'
        ? [
            {
              ...event,
              id: `${event.id}:copy`,
              anchor: { ...event.anchor, sourceInstanceId: 'copy' },
            },
          ]
        : []
    )
  );
  project.clips.push({
    ...base,
    id: 'copy-clip',
    sourceInstanceId: 'copy',
    sourceStart: 2,
    sourceDuration: 4,
    startTime: 10,
    duration: 2,
    playbackRate: 2,
  });
  project.duration = 12;
  project.actionPresentation = { ...getVideoProjectActionPresentation(project), enabled: false };
  const before = structuredClone(project);
  const target = { ref: { kind: 'action' as const, id: 'drag' }, family: 'mouse' as const };
  const style = { ...group.settings[1]!, offset: 0.2 };
  const audition = cues(buildProjectActionAudioAuditionPlan(project, copy, target, style));
  expect(audition).toHaveLength(1);
  expect(audition[0]!.start).toBeCloseTo(11.7, 12);
  expect(audition[0]!.rate).toBe(1);
  expect(audition[0]!.volume).toBeCloseTo(style.volume, 12);
  expect(
    buildProjectActionAudioAuditionPlan(
      project,
      { ...copy, sourceInstanceId: 'removed' },
      target,
      style
    ).descriptors
  ).toEqual([]);
  const protectedProject = structuredClone(project);
  protectedProject.actionFeedback![1]!.signals[0]!.data['privacy'] = 'protected';
  expect(
    buildProjectActionAudioAuditionPlan(
      protectedProject,
      copy,
      { ref: { kind: 'signal', id: 'rhythm' }, family: 'typing' },
      group.settings[0]!
    ).descriptors
  ).toEqual([]);
  expect(project).toEqual(before);
});
