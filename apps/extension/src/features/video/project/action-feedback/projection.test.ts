import {
  evaluateProjectGestureFeedback,
  buildProjectActionAudioPlan,
} from '../../review/project-action-audio';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import { getVideoProjectUtilityLanes } from '../utility-lanes';
import { getVideoProjectFeedbackRuns, patchVideoProjectActionFeedback } from './projection';
import {
  parseReviewClickAnimations,
  parseVideoProjectActionFeedback,
  REVIEW_CLICK_DEFAULT,
} from './validation';

it('preserves an optical click style through persisted parsing and rejects malformed optics', () => {
  const style = { id: 'click', ...REVIEW_CLICK_DEFAULT, effect: 'magnify' as const };
  expect(parseReviewClickAnimations([style])?.[0]).not.toHaveProperty('lensOptics');
  const optical = { ...style, lensOptics: 'optical' };
  expect(parseReviewClickAnimations([optical])?.[0]).toMatchObject({ lensOptics: 'optical' });
  expect(
    parseVideoProjectActionFeedback([
      {
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        settings: [],
        signals: [],
        gestureStyles: [optical],
      },
    ])?.[0]?.gestureStyles?.[0]
  ).toMatchObject({ lensOptics: 'optical' });
  expect(parseReviewClickAnimations([{ ...style, lensOptics: 'fisheye' }])).toBeNull();
});

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'capture.webm',
    width: 1280,
    height: 720,
    duration: 5,
    mimeType: 'video/webm',
    size: 1024,
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.6,
        point: { x: 0.2, y: 0.3 },
        label: '',
        preset: 'NONE',
        data: {
          gestureType: 'click',
          gestureId: 'click',
          button: 0,
          downTime: 1,
          upTime: 1.05,
          completion: 'released',
        },
      },
    ],
  });
  const group = project.actionFeedback![0]!;
  group.settings = [
    {
      ref: { kind: 'action', id: 'click' },
      enabled: true,
      presetId: 'mouse-classic-paired-v2',
      volume: 0.5,
      offset: 0,
    },
  ];
  group.gestureStyles = [{ id: 'click', ...REVIEW_CLICK_DEFAULT, effect: 'press' }];
  group.signals = [
    {
      id: 'click',
      kind: 'typing',
      startTime: 1,
      endTime: 2,
      point: null,
      data: { activity: 'input' },
    },
  ];
  project.actionFeedback!.push({ ...structuredClone(group), sourceInstanceId: 'duplicate' });
  return {
    project,
    identity: { recordingId: group.recordingId, sourceInstanceId: group.sourceInstanceId },
  };
}

it('edits one source instance while preserving capture facts and the other occurrence', () => {
  const { project, identity } = fixture();
  const before = structuredClone(project);
  const setting = project.actionFeedback![0]!.settings[0]!;
  const next = patchVideoProjectActionFeedback(project, identity, {
    settings: [{ ...setting, volume: 0.75, upEnabled: false }],
  });
  expect(next).not.toBe(project);
  expect(project).toEqual(before);
  expect(next.actionEvents).toEqual(before.actionEvents);
  expect(next.cursorTrack).toEqual(before.cursorTrack);
  expect(next.actionFeedback![0]).toMatchObject({ settings: [{ volume: 0.75, upEnabled: false }] });
  expect(next.actionFeedback![0]!.signals).toEqual(before.actionFeedback![0]!.signals);
  expect(next.actionFeedback![0]!.gestureStyles).toEqual(before.actionFeedback![0]!.gestureStyles);
  expect(next.actionFeedback![1]).toEqual(before.actionFeedback![1]);
});

it('keeps action and signal sound identities separate when their opaque IDs coincide', () => {
  const { project, identity } = fixture();
  const setting = project.actionFeedback![0]!.settings[0]!;
  const next = patchVideoProjectActionFeedback(project, identity, {
    settings: [
      setting,
      {
        ...setting,
        ref: { kind: 'signal', id: 'click' },
        presetId: 'typing-natural-v1',
        volume: 0.25,
      },
    ],
  });
  expect(next.actionFeedback![0]!.settings).toMatchObject([
    { ref: { kind: 'action', id: 'click' }, volume: 0.5 },
    { ref: { kind: 'signal', id: 'click' }, volume: 0.25 },
  ]);
});

it('refuses an invalid authored batch without changing any part of the document', () => {
  const { project, identity } = fixture();
  const before = structuredClone(project);
  const setting = project.actionFeedback![0]!.settings[0]!;
  expect(
    patchVideoProjectActionFeedback(project, identity, {
      settings: [{ ...setting, volume: Number.NaN }],
    })
  ).toBe(project);
  expect(
    patchVideoProjectActionFeedback(project, identity, {
      settings: [setting, setting],
    })
  ).toBe(project);
  expect(project).toEqual(before);
});

it('keeps locked or absent source identities as exact no-ops', () => {
  const { project, identity } = fixture();
  expect(
    patchVideoProjectActionFeedback(
      project,
      { ...identity, sourceInstanceId: 'missing' },
      {
        settings: [],
      }
    )
  ).toBe(project);
  const lanes = getVideoProjectUtilityLanes(project);
  project.utilityLanes = { ...lanes, actions: { ...lanes.actions, locked: true } };
  const before = structuredClone(project);
  expect(patchVideoProjectActionFeedback(project, identity, { settings: [] })).toBe(project);
  expect(project).toEqual(before);
});

it('rejects duplicate source groups and returns independent snapshots on admission', () => {
  const { project } = fixture();
  const groups = project.actionFeedback!;
  expect(parseVideoProjectActionFeedback([...groups, groups[0]])).toBeNull();
  const restored = parseVideoProjectActionFeedback(JSON.parse(JSON.stringify(groups)))!;
  restored[0]!.signals[0]!.data['activity'] = 'keyboard';
  restored[0]!.settings[0]!.volume = 0.1;
  expect(groups[0]!.signals[0]!.data['activity']).toBe('input');
  expect(groups[0]!.settings[0]!.volume).toBe(0.5);
});

it('keeps the text-capable project schema when editing captured feedback', () => {
  const { project } = fixture();
  project.version = 5;
  project.textDocuments = [];
  const group = project.actionFeedback![0]!;
  const changed = patchVideoProjectActionFeedback(project, group, { settings: [] });
  expect(changed.version).toBe(5);
  expect(changed.textDocuments).toEqual([]);
});

it('joins continuous feedback across tracks and separates source gaps and identities', () => {
  const { project, identity } = fixture();
  const first = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (first.type !== 'VIDEO') throw new Error('Expected a video clip');
  const track = { ...project.tracks[0]!, id: 'other-track', visible: true };
  project.tracks.push(track);
  project.clips = [
    {
      ...first,
      id: 'a',
      startTime: 0,
      duration: 0.5,
      sourceStart: 0,
      sourceDuration: 1,
      playbackRate: 2,
    },
    {
      ...first,
      id: 'b',
      trackId: track.id,
      startTime: 0.5,
      duration: 1,
      sourceStart: 1,
      sourceDuration: 1,
      playbackRate: 1,
    },
    { ...first, id: 'gap', startTime: 1.5, duration: 1, sourceStart: 3, sourceDuration: 1 },
    { ...first, id: 'independent', startTime: 0, sourceInstanceId: 'duplicate' },
  ];
  expect(
    getVideoProjectFeedbackRuns(project, identity).map((run) => ({
      ids: run.clips.map((clip) => clip.id),
      segments: run.segments,
    }))
  ).toEqual([
    {
      ids: ['a', 'b'],
      segments: [
        { sourceStart: 0, sourceEnd: 1, resultStart: 0, resultEnd: 0.5, kind: 'speed', rate: 2 },
        { sourceStart: 1, sourceEnd: 2, resultStart: 0.5, resultEnd: 1.5, kind: 'keep', rate: 1 },
      ],
    },
    {
      ids: ['gap'],
      segments: [
        { sourceStart: 3, sourceEnd: 4, resultStart: 1.5, resultEnd: 2.5, kind: 'keep', rate: 1 },
      ],
    },
  ]);
  track.visible = false;
  expect(
    getVideoProjectFeedbackRuns(project, identity).flatMap((run) =>
      run.clips.map((clip) => clip.id)
    )
  ).toEqual(['a', 'gap']);
});

it('retains feedback mapping after source media becomes a project asset', () => {
  const { project, identity } = fixture();
  project.assets[0]!.source = {
    kind: 'project-asset',
    projectAssetId: 'owned-source',
    originRecordingId: identity.recordingId,
  };
  expect(getVideoProjectFeedbackRuns(project, identity)).toHaveLength(1);
  expect(getVideoProjectFeedbackRuns(project, { ...identity, recordingId: 'different' })).toEqual(
    []
  );
});

it('retains a Gallery gesture phase across split windows without repeating its sound', () => {
  const { project } = fixture();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  project.actionFeedback = project.actionFeedback!.slice(0, 1);
  project.clips = [{ ...clip, duration: 1.2, sourceDuration: 1.2 }];
  project.duration = 1.2;
  const expected = evaluateProjectGestureFeedback(project, 1.1).map((item) => item.frame);
  expect(expected).toHaveLength(1);
  const audio = buildProjectActionAudioPlan(project);
  const candidate = {
    ...project,
    version: 43 as const,
    duration: 1.4,
    clips: [
      {
        ...clip,
        id: 'left',
        duration: 0.8,
        sourceDuration: 1.2,
        playbackWindow: { offset: 0, extent: 1.4, holdAt: 1.1 },
      },
      {
        ...clip,
        id: 'right',
        startTime: 0.8,
        duration: 0.6,
        sourceDuration: 1.2,
        playbackWindow: { offset: 0.8, extent: 1.4, holdAt: 1.1 },
      },
    ],
  };
  const before = structuredClone(candidate);
  expect(evaluateProjectGestureFeedback(candidate, 1.3).map((item) => item.frame)).toEqual(
    expected
  );
  const withoutIdentity = (plan: ReturnType<typeof buildProjectActionAudioPlan>) =>
    plan.descriptors.map(({ id: _id, ...descriptor }) => descriptor);
  expect(withoutIdentity(buildProjectActionAudioPlan(candidate))).toEqual(withoutIdentity(audio));
  const heldOnly = {
    ...candidate,
    clips: [
      {
        ...candidate.clips[1]!,
        startTime: 1.2,
        duration: 0.2,
        playbackWindow: { offset: 1.2, extent: 1.4, holdAt: 1.1 },
      },
    ],
  };
  expect(evaluateProjectGestureFeedback(heldOnly, 1.3).map((item) => item.frame)).toEqual(expected);
  expect(buildProjectActionAudioPlan(heldOnly).descriptors).toEqual([]);
  expect(candidate).toEqual(before);
});

it('admits bounded lens edge width without injecting it into legacy click styles', () => {
  const legacy = { id: 'edge', ...REVIEW_CLICK_DEFAULT, effect: 'magnify' };
  expect(parseReviewClickAnimations([legacy])?.[0]).not.toHaveProperty('lensEdgeWidth');
  for (const lensEdgeWidth of [1, 8, 30])
    expect(parseReviewClickAnimations([{ ...legacy, lensEdgeWidth }])?.[0]).toMatchObject({
      lensEdgeWidth,
    });
  for (const lensEdgeWidth of [0, 31, NaN, Infinity, '8', null])
    expect(parseReviewClickAnimations([{ ...legacy, lensEdgeWidth }])).toBeNull();
});
