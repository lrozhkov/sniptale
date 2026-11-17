import { editProjectSourceInteraction } from '../project/source-interaction-authoring';
import { projectSourceInteractionActions } from '../project/source-interaction-documents';
import { resolveReviewInteractions } from './interaction-timeline';
import { patchReviewClicks } from './advanced/click-animation';
import { patchReviewKeys } from '../project/action-feedback/key-animation';
import { resolveVideoCompositionActions } from '../composition/timeline/frame/actions';
import eventsFixture from '../project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../project/recording-events/records';
import { applyVideoProjectMutationPatch } from '../project/mutation';
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

it('preserves the original event stream descriptor without materializing its facts during promotion', () => {
  if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture.');
  const input = fixture();
  const clip = input.seed.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO' || !clip.sourceInstanceId) throw new Error('Missing source.');
  input.seed = applyVideoProjectMutationPatch(input.seed, {
    actionFeedback: [
      {
        recordingId: 'recording',
        sourceInstanceId: clip.sourceInstanceId,
        settings: [],
        signals: [],
        events: eventsFixture.descriptor,
      },
    ],
  });
  const plan = planReviewProjectConversion(input);
  expect(plan.status).toBe('prepared');
  if (plan.status !== 'prepared') throw new Error('Compact event transfer was refused.');
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(plan.project)));
  expect(reopened?.actionFeedback?.[0]?.events).toEqual(eventsFixture.descriptor);
  expect(reopened?.actionFeedback?.[0]?.sourceInstanceId).toBe(plan.timeline.sourceInstanceId);
  expect(reopened?.actionEvents).toEqual([]);
  expect(reopened?.actionFeedback?.[0]?.signals).toEqual([]);
});

it('maps authored interaction source data without silently dropping it', () => {
  const input = fixture();
  input.document.advancedContent.interactionTimeline = {
    presses: [
      {
        id: 'authored',
        family: 'keyboard',
        start: 1,
        end: 2,
        label: 'Cmd+K',
        keys: ['Cmd', 'K'],
        button: 0,
        x: 0.5,
        y: 0.5,
      },
    ],
    overrides: [],
  };
  const before = structuredClone(input.document);
  const result = planReviewProjectConversion(input);
  expect(result.status).toBe('prepared');
  if (result.status !== 'prepared') throw new Error('Expected complete authoring mapping');
  expect(result.project.sourceInteractionDocuments?.[0]?.timeline).toEqual(
    input.document.advancedContent.interactionTimeline
  );
  expect(input.document).toEqual(before);
});

it('retains authored keyboard and mouse source intervals independently from captured facts', () => {
  const { input } = actionFixture();
  const timeline = {
    presses: [
      {
        id: 'authored-key',
        family: 'keyboard' as const,
        start: 1,
        end: 2,
        label: 'Cmd+K',
        keys: ['Cmd', 'K'],
        button: 0,
        x: 0.4,
        y: 0.5,
      },
      {
        id: 'authored-click',
        family: 'mouse' as const,
        start: 4,
        end: 4.2,
        label: 'Click',
        button: 0,
        x: 0.3,
        y: 0.2,
      },
    ],
    overrides: [
      { ref: { kind: 'action' as const, id: 'click' }, start: 2, end: 2.1, enabled: false },
    ],
  };
  input.document.advancedContent.interactionTimeline = timeline;
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  expect(result.status).toBe('prepared');
  if (result.status !== 'prepared') throw new Error('Authored interactions were not mapped');
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)));
  expect(reopened).not.toBeNull();
  expect(reopened).toMatchObject({ sourceInteractionDocuments: [{ timeline }] });
  expect(reopened?.actionEvents).toEqual(
    before.seed.actionEvents.map((event) => ({
      ...event,
      anchor: { ...event.anchor, sourceInstanceId: result.timeline.sourceInstanceId },
    }))
  );
  expect(input).toEqual(before);
});

it.each(['recording', 'imported'] as const)(
  'preserves %s authored key/click pixels and sound through cut, rate, reopen and clip movement',
  (kind) => {
    const input = fixture();
    if (kind === 'imported') {
      input.seed.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'imported-video' };
      input.seed.source = { kind: 'manual' };
      input.seed.baseRecordingId = null;
    }
    input.document.edits.push({
      id: 'rate',
      kind: 'speed',
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
      rate: 2,
      audio: 'speed',
    });
    const timeline = {
      presses: [
        {
          id: 'key',
          family: 'keyboard' as const,
          start: 1.2,
          end: 1.3,
          label: 'Cmd+K',
          keys: ['Cmd', 'K'],
          button: 0,
          x: 0.4,
          y: 0.5,
        },
        {
          id: 'click',
          family: 'mouse' as const,
          start: 5,
          end: 5.1,
          label: 'Click',
          button: 0,
          x: 0.3,
          y: 0.2,
        },
      ],
      overrides: [],
    };
    input.document.advancedContent.interactionTimeline = timeline;
    input.document.advancedContent.clickAnimations = patchReviewClicks([], ['click'], {
      effect: 'ripple',
    });
    input.document.advancedContent.keyAnimations = patchReviewKeys([], ['key'], { enabled: true });
    const settings = [
      {
        ref: { kind: 'action' as const, id: 'click' },
        enabled: true,
        presetId: 'mouse-soft-v1' as const,
        volume: 0.5,
        offset: 0,
      },
    ];
    input.document.advancedContent.actionAudio = settings;
    const result = planReviewProjectConversion(input);
    expect(result.status).toBe('prepared');
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)))!;
    expect(reopened).not.toBeNull();
    expect(reopened.actionEvents).toEqual([]);
    expect(
      resolveVideoProjectActionOccurrences(reopened).map((o) => [o.event.label, o.time])
    ).toEqual([
      ['Cmd+K', 1.2],
      ['Click', 3.5],
    ]);
    expect(
      resolveVideoCompositionActions(reopened, 1.25).some(
        (state) => state.renderKind === 'keystroke' && state.event.label === 'Cmd+K'
      )
    ).toBe(true);
    expect(
      resolveVideoCompositionActions(reopened, 3.6).some(
        (state) => state.gestureFeedback?.effect === 'ripple'
      )
    ).toBe(true);
    const cues = (plan: ReturnType<typeof buildReviewActionAudioPlan>) =>
      [...iterateReviewActionAudioCues(plan, { start: 0, end: plan.duration })]
        .flat()
        .map(({ id: _id, ...cue }) => cue);
    const gallery = buildReviewActionAudioPlan({
      markers: resolveReviewInteractions([], timeline),
      settings,
      segments: buildReviewTimeMap(input.source.duration, input.document.edits),
      applied: true,
    });
    expect(cues(gallery).length).toBeGreaterThan(0);
    expect(cues(buildProjectActionAudioPlan(reopened))).toEqual(cues(gallery));
    const clip = reopened.clips.find((clip) => clip.type === 'VIDEO' && clip.sourceStart === 4)!;
    const moved = applyVideoProjectMutationPatch(reopened, {
      duration: reopened.duration + 10,
      clips: reopened.clips.map((item) =>
        item.id === clip.id ? { ...item, startTime: item.startTime + 10 } : item
      ),
    });
    expect(
      resolveVideoProjectActionOccurrences(moved).find((o) => o.event.label === 'Click')?.time
    ).toBe(13.5);
    expect(
      resolveVideoCompositionActions(moved, 13.6).some(
        (state) => state.gestureFeedback?.effect === 'ripple'
      )
    ).toBe(true);
    expect(moved.sourceInteractionDocuments).toEqual(reopened.sourceInteractionDocuments);
    if (kind === 'imported') expect(reopened.actionFeedback).toBeUndefined();
  }
);

it('retains result keys, clicks and overrides inside a freeze after conversion and reopen', () => {
  const input = fixture();
  input.document.advancedContent.actionsEnabled = true;
  input.ui.tracks = { ...input.ui.tracks, keyboard: true, mouse: true };
  input.document.advancedContent.clickAnimations = patchReviewClicks([], ['held-mouse'], {
    effect: 'ripple',
    before: 0,
    after: 1,
  });
  input.document.advancedContent.keyAnimations = patchReviewKeys([], ['held-keyboard'], {
    enabled: true,
  });
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  input.document.advancedContent.interactionTimeline = {
    presses: ['keyboard', 'mouse'].map((family, index) => ({
      id: `held-${family}`,
      family: family as 'keyboard' | 'mouse',
      start: 2.25 + index * 0.5,
      end: 2.5 + index * 0.5,
      timeDomain: 'result' as const,
      label: family === 'keyboard' ? 'K' : 'Click',
      button: 0,
      x: 0.3,
      y: 0.4,
    })),
    overrides: [
      {
        ref: { kind: 'action', id: 'held-mouse' },
        start: 3,
        end: 3.5,
        timeDomain: 'result',
        enabled: true,
      },
    ],
  };
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const project = parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)))!;
  const occurrences = resolveVideoProjectActionOccurrences(project);
  expect(occurrences.map((row) => [row.event.label, row.time, row.event.capturedDuration])).toEqual(
    [
      ['K', 2.25, 0.25],
      ['Click', 3, 0.5],
    ]
  );
  expect(
    occurrences.every(
      (row) => row.clipId === result.timeline.videoClips.find((clip) => clip.startTime === 2)?.id
    )
  ).toBe(true);
  const click = occurrences.find((row) => row.event.kind === 'CLICK')!;
  const before = resolveVideoCompositionActions(project, 3.1).find(
    (row) => row.event.id === click.eventId
  )!;
  const after = resolveVideoCompositionActions(project, 3.3).find(
    (row) => row.event.id === click.eventId
  )!;
  expect(before).toBeDefined();
  expect(after.gestureFeedback!.radius).toBeGreaterThan(before.gestureFeedback!.radius);
  const edited = editProjectSourceInteraction(project, click.eventId, {
    clipId: click.clipId,
    time: 3.25,
  })!;
  expect(
    resolveVideoProjectActionOccurrences(edited).find((row) => row.eventId === click.eventId)?.time
  ).toBeCloseTo(3.25);
  expect(
    projectSourceInteractionActions(project, project.actionEvents).find(
      (event) => event.id === click.eventId
    )?.capturedDuration
  ).toBe(0.5);
});

it('projects a captured action override into held result time without changing its source fact', () => {
  const { input } = actionFixture();
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  input.document.advancedContent.interactionTimeline = {
    presses: [],
    overrides: [
      {
        ref: { kind: 'action', id: 'key' },
        start: 2.25,
        end: 2.75,
        enabled: true,
        timeDomain: 'result',
        sourceRange: { start: 5, end: 5.2 },
      },
    ],
  };
  const facts = structuredClone(input.seed.actionEvents);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const project = parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)))!;
  const occurrence = resolveVideoProjectActionOccurrences(project).find(
    (row) => row.event.anchor.kind !== 'project' && row.event.anchor.sourceEventId === 'key'
  )!;
  expect(occurrence.time).toBe(2.25);
  expect(occurrence.event.capturedDuration).toBe(0.5);
  expect(project.clips.find((clip) => clip.id === occurrence.clipId)?.startTime).toBe(2);
  expect(input.seed.actionEvents).toEqual(facts);
  expect(
    project.actionEvents.find(
      (event) => event.anchor.kind !== 'project' && event.anchor.sourceEventId === 'key'
    )?.anchor
  ).toMatchObject({ sourceTime: 5 });
});

it('retains a detached result press through conversion without a redundant parent clock flag', () => {
  const input = fixture();
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  input.document.advancedContent.interactionTimeline = {
    presses: [],
    overrides: [
      {
        ref: { kind: 'action', id: 'detached' },
        start: 2.25,
        end: 2.75,
        enabled: true,
        source: {
          id: 'detached',
          family: 'keyboard',
          start: 2.25,
          end: 2.75,
          timeDomain: 'result',
          label: 'K',
          button: 0,
          x: 0.5,
          y: 0.5,
        },
      },
    ],
  };
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const project = parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)))!;
  expect(project.version).toBe(56);
  expect(resolveVideoProjectActionOccurrences(project).map((row) => row.time)).toEqual([2.25]);
});
