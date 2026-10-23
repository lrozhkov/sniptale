import { expect, it } from 'vitest';
import { buildReviewTimeMap } from './timeline';
import { parseHydratableVideoProject } from '../project/validation/root';
import {
  getVideoProjectClickStyle,
  getVideoProjectKeyStyle,
} from '../project/action-feedback/projection';
import { resolveVideoProjectActionOccurrences } from '../project/action-occurrences';
import { evaluateReviewClicks, scheduleReviewClicks } from './click-animation';
import {
  buildProjectActionAudioPlan,
  evaluateProjectGestureFeedback,
} from './project-action-audio';
import { buildReviewActionAudioPlan, iterateReviewActionAudioCues } from './action-audio';
import { projectReviewTelemetry } from './telemetry';
import { planReviewProjectConversion } from './project-conversion';

import { fixture, actionFixture } from './project-conversion.test-support';

it.each(['recording', 'project-asset'] as const)(
  'preserves captured actions, dormant styles and sound on the %s source through cut, speed and Native reopen',
  (kind) => {
    const { input, events, signals } = actionFixture();
    if (kind === 'project-asset')
      input.seed.assets[0]!.source = {
        kind,
        projectAssetId: 'retained',
        originRecordingId: 'recording',
      };
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const project = parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)));
    if (!project) throw new Error('Expected Native reopen');
    expect(project.actionFeedback![0]).toEqual({
      recordingId: 'recording',
      sourceInstanceId: result.timeline.sourceInstanceId,
      signals,
      settings: input.document.advancedContent.actionAudio,
      gestureStyles: input.document.advancedContent.clickAnimations,
      keyStyles: input.document.advancedContent.keyAnimations,
    });
    expect(project.actionEvents).toEqual(
      before.seed.actionEvents.map((event) => ({
        ...event,
        anchor: { ...event.anchor, sourceInstanceId: result.timeline.sourceInstanceId },
      }))
    );
    expect(project.cameraFollowDefaults).toEqual(
      input.document.advancedContent.cameraFollowDefaults
    );
    expect(getVideoProjectClickStyle(project, project.actionEvents[0]!)).toEqual(
      input.document.advancedContent.clickAnimations![0]
    );
    expect(getVideoProjectKeyStyle(project, project.actionEvents[1]!)).toEqual(
      input.document.advancedContent.keyAnimations!.find((style) => style.id === 'key')
    );
    expect(
      project.actionEvents.some(
        (event) =>
          event.anchor.kind === 'recording-source' && event.anchor.sourceEventId === 'hidden'
      )
    ).toBe(true);
    expect(
      resolveVideoProjectActionOccurrences(project).map((row) => [
        row.event.anchor.kind === 'recording-source' ? row.event.anchor.sourceEventId : '',
        row.time,
      ])
    ).toEqual([
      ['click', 1],
      ['key', 3.5],
    ]);
    const markers = projectReviewTelemetry(
      {
        actionEvents: events.map((event) => ({
          ...event,
          recordingPoint: event.point,
          point: event.point
            ? { x: event.point.x * input.source.width, y: event.point.y * input.source.height }
            : null,
        })),
        signals,
        cursorTrack: null,
      },
      input.source.duration
    ).markers;
    const segments = buildReviewTimeMap(input.source.duration, input.document.edits);
    const clickCues = scheduleReviewClicks(
      markers,
      input.document.advancedContent.clickAnimations!,
      segments
    );
    for (const time of [0, 1, 1.1, 1.3, 2, 3, 3.5, 5]) {
      expect(evaluateProjectGestureFeedback(project, time).map((row) => row.frame)).toEqual(
        evaluateReviewClicks(clickCues, time)
      );
    }
    const gallery = buildReviewActionAudioPlan({
      markers,
      settings: input.document.advancedContent.actionAudio!,
      segments: buildReviewTimeMap(input.source.duration, input.document.edits),
      applied: true,
    });
    const cues = (plan: ReturnType<typeof buildReviewActionAudioPlan>) =>
      [...iterateReviewActionAudioCues(plan, { start: 0, end: plan.duration })]
        .flat()
        .map(({ id: _id, ...cue }) => cue);
    const nativeCues = cues(buildProjectActionAudioPlan(project));
    expect(nativeCues.length).toBeGreaterThan(0);
    expect(nativeCues).toEqual(cues(gallery));
    expect(planReviewProjectConversion(input)).toEqual(result);
    expect(input).toEqual(before);
  }
);

it('refuses foreign, manual and previously authored seed actions instead of rebinding them to this source', () => {
  const { input } = actionFixture();
  const invalid = [
    (seed: typeof input.seed) => {
      seed.actionEvents[0]!.anchor = { kind: 'project', time: 1 };
    },
    (seed: typeof input.seed) => {
      const anchor = seed.actionEvents[0]!.anchor;
      if (anchor.kind === 'recording-source') anchor.recordingId = 'other';
    },
    (seed: typeof input.seed) => {
      const anchor = seed.actionEvents[0]!.anchor;
      if (anchor.kind === 'recording-source') anchor.sourceInstanceId = 'other';
    },
    (seed: typeof input.seed) => {
      seed.actionFeedback![0]!.sourceInstanceId = 'other';
    },
    (seed: typeof input.seed) => {
      seed.actionFeedback![0]!.settings = input.document.advancedContent.actionAudio!;
    },
    (seed: typeof input.seed) => {
      seed.actionFeedback!.push(structuredClone(seed.actionFeedback![0]!));
    },
  ];
  for (const change of invalid) {
    const candidate = structuredClone(input);
    change(candidate.seed);
    const before = structuredClone(candidate);
    expect(planReviewProjectConversion(candidate)).toEqual({
      status: 'blocked',
      issues: [{ kind: 'invalid-seed' }],
    });
    expect(candidate).toEqual(before);
  }
  const noSource = fixture();
  noSource.seed.assets[0]!.source = { kind: 'library-asset', mediaId: 'media' };
  noSource.document.advancedContent.actionAudio = input.document.advancedContent.actionAudio!;
  expect(planReviewProjectConversion(noSource)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'interaction-source' }],
  });
});

it('retains explicit empty action settings and suppresses sound through the common master switch', () => {
  const { input } = actionFixture();
  input.document.advancedContent.actionsEnabled = false;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(buildProjectActionAudioPlan(result.project).descriptors).toEqual([]);
  expect(result.project.actionFeedback![0]!.settings).toEqual(
    input.document.advancedContent.actionAudio
  );
  input.document.advancedContent.actionAudio = [];
  input.document.advancedContent.clickAnimations = [];
  input.document.advancedContent.keyAnimations = [];
  const empty = planReviewProjectConversion(input);
  if (empty.status !== 'prepared') throw new Error(JSON.stringify(empty));
  expect(empty.project.actionFeedback![0]).toMatchObject({
    settings: [],
    gestureStyles: [],
    keyStyles: [],
  });
});

it('keeps feedback on the converted insertion when the same source is added as another ordinary clip', () => {
  const { input } = actionFixture();
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const project = structuredClone(result.project);
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  project.clips.push({
    ...structuredClone(clip),
    id: 'second-insertion',
    sourceInstanceId: 'second-instance',
    startTime: project.duration,
    groupId: null,
    linkMode: 'DETACHED',
  });
  project.duration += clip.duration;
  const restored = parseHydratableVideoProject(JSON.parse(JSON.stringify(project)));
  if (!restored) throw new Error('Expected ordinary montage reopen');
  expect(
    resolveVideoProjectActionOccurrences(restored).every((row) => row.clipId !== 'second-insertion')
  ).toBe(true);
  expect(evaluateProjectGestureFeedback(restored, result.project.duration + 1.1)).toEqual([]);
  expect(
    [
      ...iterateReviewActionAudioCues(buildProjectActionAudioPlan(restored), {
        start: result.project.duration,
        end: project.duration,
      }),
    ].flat()
  ).toEqual([]);
});

it('creates an ordinary feedback group for captured events even when the seed has no explicit group', () => {
  const { input } = actionFixture();
  delete input.seed.actionFeedback;
  delete input.document.advancedContent.actionAudio;
  delete input.document.advancedContent.clickAnimations;
  delete input.document.advancedContent.keyAnimations;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.actionFeedback).toEqual([
    {
      recordingId: 'recording',
      sourceInstanceId: result.timeline.sourceInstanceId,
      settings: [],
      signals: [],
    },
  ]);
  expect(getVideoProjectClickStyle(result.project, result.project.actionEvents[0]!)?.effect).toBe(
    'off'
  );
});
