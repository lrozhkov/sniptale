import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import { getVideoProjectUtilityLanes } from '../utility-lanes';
import { patchVideoProjectActionFeedback } from './projection';
import { parseVideoProjectActionFeedback, REVIEW_CLICK_DEFAULT } from './validation';

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
