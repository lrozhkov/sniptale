import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from './factories/creation';
import { patchReviewKeys } from './action-feedback/key-animation';
import {
  getVideoProjectActionPresentation,
  resolveVideoProjectActionPresentations,
} from './action-presentation';

function fixture() {
  return createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
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
it('uses the Gallery disabled default for a recorded command instead of a legacy explicit enable', () => {
  const project = fixture();
  project.actionEvents[0]!.presentation = { enabled: true, duration: 4, offset: 1 };
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: false,
    duration: expect.closeTo(1.2, 10),
    offset: 0,
  });
});
it('projects complete caption settings in result seconds without requiring a capture point', () => {
  const project = fixture();
  const group = {
    ...project.actionFeedback![0]!,
    keyStyles: patchReviewKeys([], ['key'], {
      enabled: true,
      before: 0.2,
      after: 2,
      offset: -0.1,
      style: { fontSize: 36, position: 'top-right' },
    }),
  };
  project.actionFeedback = [group];
  project.actionEvents[0]!.presentation = { duration: 4, offset: 1 };
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: true,
    start: expect.closeTo(0.7, 10),
    end: expect.closeTo(2.9, 10),
    duration: expect.closeTo(2.2, 10),
    offset: -0.1,
    point: null,
    keyStyle: { fontSize: 36, position: 'top-right' },
  });
});

it('maps a before phase and result duration across continuous cuts, speed and track changes', () => {
  const project = fixture();
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  clip.startTime = 0;
  clip.duration = 1;
  clip.sourceStart = 0.5;
  clip.sourceDuration = 2;
  clip.playbackRate = 2;
  const otherTrack = { ...project.tracks[0]!, id: 'other-track' };
  project.tracks.push(otherTrack);
  project.clips.push({
    ...clip,
    id: 'tail',
    trackId: otherTrack.id,
    startTime: 1,
    duration: 2.5,
    sourceStart: 2.5,
    sourceDuration: 2.5,
    playbackRate: 1,
  });
  project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], {
    enabled: true,
    before: 0.4,
    after: 2,
    offset: 0.1,
  });
  const facts = structuredClone(project.actionEvents);
  const row = resolveVideoProjectActionPresentations(project)[0]!;
  expect(row).toMatchObject({
    start: 0,
    end: expect.closeTo(2.35, 10),
    animationStart: 0,
    duration: expect.closeTo(2.35, 10),
    point: null,
    occurrence: { time: 0.25, playbackRun: { clipIds: [clip.id, 'tail'] } },
  });
  expect(row.renderIntervals).toEqual([
    { clipId: clip.id, start: 0, end: 1 },
    { clipId: 'tail', start: 1, end: expect.closeTo(2.35, 10) },
  ]);
  expect(project.actionEvents).toEqual(facts);
  otherTrack.visible = false;
  expect(resolveVideoProjectActionPresentations(project)[0]!.end).toBe(1);
  otherTrack.visible = true;
  const tail = project.clips.find((item) => item.id === 'tail')!;
  if (tail.type !== 'VIDEO') throw new Error('Missing video tail.');
  tail.sourceStart = 2.6;
  expect(resolveVideoProjectActionPresentations(project)[0]!.end).toBe(1);
});
it('retains source admission and dormant legacy values without requiring global legacy keystrokes', () => {
  const project = fixture(),
    event = project.actionEvents[0]!;
  const settings = patchReviewKeys([], ['key'], { enabled: true });
  project.actionFeedback![0]!.keyStyles = settings;
  event.presentation = {
    enabled: true,
    duration: 4,
    offset: 1,
    keyStyle: { ...settings[0]!.style, fontSize: 80 },
  };
  const before = structuredClone(project);
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: true,
    keyStyle: { fontSize: 24 },
    offset: 0,
  });
  expect(project).toEqual(before);
  event.presentation.enabled = false;
  expect(resolveVideoProjectActionPresentations(project)[0]!.reason).toBe('event-disabled');
  event.presentation.enabled = true;
  event.label = '';
  expect(resolveVideoProjectActionPresentations(project)[0]!.reason).toBe('unsupported');
  event.label = 'Ctrl+K';
  project.actionPresentation = { ...getVideoProjectActionPresentation(project), enabled: false };
  expect(resolveVideoProjectActionPresentations(project)[0]!.reason).toBe('track-disabled');
});
it('preserves missing-group and project-time legacy keyboard behavior', () => {
  const project = fixture(),
    event = project.actionEvents[0]!;
  event.presentation = { enabled: true, duration: 4, offset: 1 };
  project.actionFeedback = [];
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: true,
    duration: 4,
    offset: 1,
  });
  event.anchor = { kind: 'project', time: 1 };
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: true,
    duration: 4,
    offset: 1,
  });
});
