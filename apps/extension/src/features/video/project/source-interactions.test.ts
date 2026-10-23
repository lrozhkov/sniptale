import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from './factories/creation';
import { normalizeVideoProjectCursorSkin } from './cursor';
import { reconcileVideoProjectInteractionSources } from './source-interactions';
import { removeVideoProjectLibrarySources } from './library-source-removal';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 1280,
    height: 720,
    duration: 6,
    mimeType: 'video/webm',
    size: 1,
  });
  project.version = 33;
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected source');
  clip.sourceInstanceId = 'instance';
  project.cursorTrack = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [],
    sourceObservations: [
      {
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        samples: [
          {
            id: 'raw-a',
            time: 0,
            x: 0,
            y: 0,
            visible: true,
            observation: 'observed',
            recordingPoint: { x: 0, y: 0 },
            interpolation: 'LINEAR',
          },
          {
            id: 'raw-b',
            time: 6,
            x: 1280,
            y: 720,
            visible: true,
            observation: 'observed',
            recordingPoint: { x: 1, y: 1 },
            interpolation: 'LINEAR',
          },
        ],
      },
    ],
  };
  return { project, clip };
}

it('retains full cursor facts until the last placement of its source instance is removed', () => {
  const { project, clip } = fixture();
  const second = { ...clip, id: 'second', startTime: 6 };
  const before = { ...project, clips: [clip, second] };
  const remaining = { ...before, clips: [second] };
  const firstRemoval = reconcileVideoProjectInteractionSources(before, remaining);
  expect(firstRemoval.cursorTrack?.sourceObservations).toEqual(
    project.cursorTrack!.sourceObservations
  );
  const lastRemoval = reconcileVideoProjectInteractionSources(remaining, {
    ...remaining,
    clips: [],
  });
  expect(lastRemoval.cursorTrack?.sourceObservations).toEqual([]);
  expect(lastRemoval.cursorTrack?.samples).toEqual([]);
  expect(project.cursorTrack!.sourceObservations).toHaveLength(1);
});

it('removes cursor source facts with backing media while retaining manual cursor controls', () => {
  const { project } = fixture();
  project.cursorTrack!.samples = [{ id: 'manual', time: 1, x: 10, y: 20, visible: true }];
  const removed = removeVideoProjectLibrarySources(project, [project.assets[0]!.source]);
  expect(removed.cursorTrack?.sourceObservations).toEqual([]);
  expect(removed.cursorTrack?.samples).toEqual(project.cursorTrack!.samples);
  expect(removed.cursorTrack?.skin).toEqual(project.cursorTrack!.skin);
});
