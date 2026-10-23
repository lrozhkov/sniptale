import { isExportReadyVideoProject } from '../validation/root';
import { resolveVideoCompositionActions } from '../../composition/timeline/frame/actions';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import {
  getVideoProjectKeyStyle,
  patchVideoProjectActionFeedback,
  getVideoProjectKeyFeedbackTargets,
  patchVideoProjectKeyFeedback,
} from './projection';
import { patchReviewKeys, REVIEW_KEY_DEFAULT } from './key-animation';
import { getVideoProjectUtilityLanes } from '../utility-lanes';

function fixture() {
  return createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'capture.webm',
    width: 1280,
    height: 720,
    duration: 5,
    mimeType: 'video/webm',
    size: 4,
    sourceNormalizedActionEvents: [
      {
        id: 'key',
        kind: 'KEY',
        time: 1,
        duration: 0.2,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: {},
      },
    ],
  });
}
it('keeps common source defaults distinct from manual and missing-group legacy keys', () => {
  const project = fixture(),
    event = project.actionEvents[0]!;
  expect(getVideoProjectKeyStyle(project, event)).toBe(REVIEW_KEY_DEFAULT);
  expect(getVideoProjectKeyStyle(project, { ...event, kind: 'CLICK' })).toBeNull();
  expect(
    getVideoProjectKeyStyle(project, { ...event, anchor: { kind: 'project', time: 1 } })
  ).toBeNull();
  expect(getVideoProjectKeyStyle({ ...project, actionFeedback: [] }, event)).toBeNull();
});
it('patches only the admitted source group and refuses invalid, missing and locked updates', () => {
  const project = fixture(),
    group = project.actionFeedback![0]!;
  const keys = patchReviewKeys([], ['key'], { enabled: true, before: 0.3 });
  project.actionFeedback!.push({ ...structuredClone(group), sourceInstanceId: 'other' });
  const before = structuredClone(project);
  const next = patchVideoProjectActionFeedback(project, group, { keyStyles: keys });
  expect(getVideoProjectKeyStyle(next, next.actionEvents[0]!)).toEqual(keys[0]);
  expect(next.actionFeedback![1]).toEqual(before.actionFeedback![1]);
  expect(next.actionEvents).toEqual(before.actionEvents);
  expect(project).toEqual(before);
  expect(
    patchVideoProjectActionFeedback(
      project,
      { ...group, sourceInstanceId: 'missing' },
      { keyStyles: keys }
    )
  ).toBe(project);
  expect(
    patchVideoProjectActionFeedback(project, group, { keyStyles: [{ ...keys[0]!, after: -1 }] })
  ).toBe(project);
  const locked = {
    ...project,
    utilityLanes: {
      ...getVideoProjectUtilityLanes(project),
      actions: { ...getVideoProjectUtilityLanes(project).actions, locked: true },
    },
  };
  expect(patchVideoProjectActionFeedback(locked, group, { keyStyles: keys })).toBe(locked);
});

it('batch edits current source styles without changing per-command timing, facts or dormant authoring', () => {
  const project = fixture(),
    event = project.actionEvents[0]!;
  const anchor = event.anchor;
  if (anchor.kind !== 'recording-source') throw new Error('Missing source anchor.');
  const group = project.actionFeedback![0]!;
  group.keyStyles = patchReviewKeys([], ['key'], {
    enabled: true,
    after: 3,
    style: { color: '#12345680' },
  });
  group.keyStyles.push(...patchReviewKeys([], ['dormant'], { style: { fontSize: 80 } }));
  const other = {
    ...structuredClone(group),
    sourceInstanceId: 'other',
    keyStyles: patchReviewKeys([], ['key'], {
      enabled: false,
      before: 0.4,
      style: { color: '#abcdef90' },
    }),
  };
  project.actionFeedback!.push(other);
  project.actionEvents.push({
    ...event,
    id: 'other-key',
    anchor: { ...anchor, sourceInstanceId: 'other' },
  });
  project.actionEvents.push({ ...event, id: 'manual', anchor: { kind: 'project', time: 1 } });
  const targets = getVideoProjectKeyFeedbackTargets(project);
  expect(targets).toHaveLength(2);
  const before = structuredClone(project);
  const next = patchVideoProjectKeyFeedback(project, targets, { style: { fontSize: 40 } });
  expect(next.actionFeedback![0]!.keyStyles!.find((style) => style.id === 'key')).toMatchObject({
    after: 3,
    style: { color: '#12345680', fontSize: 40 },
  });
  expect(next.actionFeedback![1]!.keyStyles![0]).toMatchObject({
    before: 0.4,
    style: { color: '#abcdef90', fontSize: 40 },
  });
  expect(next.actionFeedback![0]!.keyStyles!.find((item) => item.id === 'dormant')).toEqual(
    before.actionFeedback![0]!.keyStyles!.find((item) => item.id === 'dormant')
  );
  expect(next.actionEvents).toEqual(before.actionEvents);
  expect(project).toEqual(before);
});
it('refuses removed batch targets and locked edits and makes reset retry a no-op', () => {
  const project = fixture(),
    targets = getVideoProjectKeyFeedbackTargets(project);
  project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key', 'dormant'], {
    enabled: true,
  });
  const removed = { ...project, actionEvents: [] };
  expect(patchVideoProjectKeyFeedback(removed, targets, { enabled: true })).toBe(removed);
  const noGroup = { ...project, actionFeedback: [] };
  expect(patchVideoProjectKeyFeedback(noGroup, targets, { enabled: true })).toBe(noGroup);
  const locked = {
    ...project,
    utilityLanes: {
      ...getVideoProjectUtilityLanes(project),
      actions: { ...getVideoProjectUtilityLanes(project).actions, locked: true },
    },
  };
  expect(patchVideoProjectKeyFeedback(locked, targets, null)).toBe(locked);
  const reset = patchVideoProjectKeyFeedback(project, targets, null);
  expect(reset.actionFeedback![0]!.keyStyles!.map((style) => style.id)).toEqual(['dormant']);
  expect(patchVideoProjectKeyFeedback(reset, targets, null)).toBe(reset);
  expect(patchVideoProjectKeyFeedback(reset, [], { enabled: true })).toBe(reset);
});

it.each([1, 2])(
  'retains the source key caption phase inside a held-only slice at rate %s',
  (rate) => {
    const project = fixture();
    const clip = project.clips[0]!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], { enabled: true });
    project.clips = [{ ...clip, duration: 1.2 / rate, sourceDuration: 1.2, playbackRate: rate }];
    project.duration = 1.2 / rate;
    const expected = resolveVideoCompositionActions(project, 1.1 / rate);
    expect(expected).toHaveLength(1);
    const candidate = {
      ...project,
      version: 43 as const,
      duration: 2,
      clips: [
        {
          ...clip,
          startTime: 1.2,
          duration: 0.2 / rate,
          sourceDuration: 1.2,
          playbackRate: rate,
          playbackWindow: { offset: 1.2 / rate, extent: 1.4 / rate, holdAt: 1.1 / rate },
        },
      ],
    };
    const before = structuredClone(candidate);
    expect(isExportReadyVideoProject(candidate)).toBe(true);
    const held = resolveVideoCompositionActions(candidate, 1.2 + 0.1 / rate);
    expect(held).toHaveLength(1);
    expect(held[0]!.progress).toBeCloseTo(expected[0]!.progress, 12);
    expect(held[0]!.keyStyle).toEqual(expected[0]!.keyStyle);
    expect(held[0]!.clipId).toBeNull();
    expect(candidate).toEqual(before);
  }
);
