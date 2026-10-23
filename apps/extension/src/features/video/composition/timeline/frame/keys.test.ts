import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../../project/factories/creation';
import { patchReviewKeys } from '../../../project/action-feedback/key-animation';
import { resolveVideoCompositionActions } from './actions';
import { resolveVideoCompositionFrame } from './index';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 1280,
    height: 720,
    duration: 5,
    mimeType: 'video/webm',
    size: 4,
    sourceNormalizedActionEvents: [
      {
        id: 'old',
        kind: 'KEY',
        time: 1,
        duration: 0.2,
        point: null,
        label: 'Ctrl+C',
        preset: 'NONE',
        data: {},
      },
      {
        id: 'new',
        kind: 'KEY',
        time: 2,
        duration: 0.2,
        point: null,
        label: 'Ctrl+V',
        preset: 'NONE',
        data: {},
      },
    ],
  });
  project.actionFeedback![0]!.keyStyles = [
    ...patchReviewKeys([], ['old'], { enabled: true, after: 4, style: { entrance: 'none' } }),
    ...patchReviewKeys([], ['new'], { enabled: true, after: 0.5, style: { entrance: 'none' } }),
  ];
  return project;
}
it('places source captions once in the output viewport, outside source crop and media layers', () => {
  const project = fixture();
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  clip.sourceCrop = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
  clip.transform = { ...clip.transform, x: 100, y: 100, width: 400, height: 200 };
  const frame = resolveVideoCompositionFrame(project, 1.5);
  expect(frame.actions).toHaveLength(1);
  expect(frame.actions[0]).toMatchObject({
    clipId: null,
    keyStyleViewportWidth: 1920,
    renderKind: 'keystroke',
    point: null,
    event: { label: 'Ctrl+C' },
    occurrence: { clipId: clip.id },
  });
  expect(
    frame.visualLayers.flatMap((layer) => (layer.kind === 'video' ? (layer.actions ?? []) : []))
  ).toEqual([]);
});
it('replaces the earlier caption at one placement and never revives it after the newer cue expires', () => {
  const project = fixture();
  expect(resolveVideoCompositionActions(project, 0.9)).toEqual([]);
  expect(resolveVideoCompositionActions(project, 1.5).map((state) => state.event.label)).toEqual([
    'Ctrl+C',
  ]);
  expect(resolveVideoCompositionActions(project, 2.25).map((state) => state.event.label)).toEqual([
    'Ctrl+V',
  ]);
  expect(resolveVideoCompositionActions(project, 2.75)).toEqual([]);
});
it('keeps different placements and independent source instances distinct', () => {
  const project = fixture();
  const group = project.actionFeedback![0]!,
    original = project.actionEvents[0]!;
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const second = {
    ...structuredClone(group),
    sourceInstanceId: 'other',
    keyStyles: patchReviewKeys([], ['old'], {
      enabled: true,
      style: { position: 'top-right', color: '#12345680' },
    }),
  };
  project.actionFeedback!.push(second);
  project.clips.push({ ...clip, id: 'second-clip', sourceInstanceId: 'other' });
  if (original.anchor.kind !== 'recording-source') throw new Error('Missing source anchor.');
  project.actionEvents.push({
    ...original,
    id: 'other-key',
    anchor: { ...original.anchor, sourceInstanceId: 'other' },
  });
  const states = resolveVideoCompositionActions(project, 1.5);
  expect(states).toHaveLength(2);
  expect(states.map((state) => state.keyStyle?.position).sort()).toEqual([
    'bottom-center',
    'top-right',
  ]);
  expect(states.find((state) => state.event.id === 'other-key')?.keyStyle?.color).toBe('#12345680');
  expect(group.keyStyles![0]!.style.color).toBe('#ffffff');
});
it.each([
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'top-left',
  'top-center',
  'top-right',
] as const)('retains %s viewport placement without a capture point', (position) => {
  const project = fixture();
  project.actionFeedback![0]!.keyStyles![0]!.style.position = position;
  const state = resolveVideoCompositionActions(project, 1.5)[0]!;
  expect(state).toMatchObject({ point: null, clipId: null, keyStyle: { position } });
});
