import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { VideoProjectTrackRole } from '../../../../features/video/project/types';
import { setup } from './material.test-support';

function setupRecording(cameraDuration = 4) {
  const { store } = setup();
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'screen.webm',
    width: 1920,
    height: 1080,
    duration: 6,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    sidecarVideos: [
      {
        recordingId: 'recording-webcam',
        filename: 'camera.webm',
        width: 640,
        height: 480,
        duration: cameraDuration,
        mimeType: 'video/webm',
        size: 100,
        trackRole: VideoProjectTrackRole.CAMERA,
      },
    ],
  });
  store.setState({ project });
  return { store, project, screen: project.clips[0]!, camera: project.clips[1]! };
}

it('moves the actual recorded screen and camera together without changing their geometry', () => {
  const { store, screen, camera } = setupRecording();
  store.getState().moveClip(screen.id, 2);
  const clips = store.getState().project!.clips;
  expect(clips.map(({ startTime }) => startTime)).toEqual([2, 2]);
  expect(clips.map(({ transform }) => transform)).toEqual([screen.transform, camera.transform]);
  expect(clips[0]!.groupId).not.toBeNull();
  expect(clips[1]!.groupId).toBe(clips[0]!.groupId);
});

it('limits initial camera placement to the recording range while retaining its longer source', () => {
  const { project, camera } = setupRecording(9);
  expect(project.duration).toBe(6);
  expect(camera.duration).toBe(6);
  expect(project.assets[1]!.metadata.duration).toBe(9);
});

it('reuses a complete recording as a fresh linked montage instance', () => {
  const { store, project } = setupRecording();
  expect(store.getState().appendMaterial(project.assets[0]!.id).status).toBe('placed');
  const clips = store.getState().project!.clips;
  expect(clips.map(({ startTime }) => startTime)).toEqual([0, 0, 6, 6]);
  expect(clips[2]!.groupId).not.toBeNull();
  expect(clips[3]!.groupId).toBe(clips[2]!.groupId);
  expect(clips[2]!.groupId).not.toBe(clips[0]!.groupId);
});

it('restores composition from source membership after every montage clip is removed', () => {
  const { store, project } = setupRecording();
  store.setState({ project: { ...project, clips: [] } });
  expect(store.getState().appendMaterial(project.assets[0]!.id, { start: 2, end: 5 }).status).toBe(
    'placed'
  );
  const clips = store.getState().project!.clips;
  expect(clips).toMatchObject([
    {
      assetId: project.assets[0]!.id,
      startTime: 0,
      duration: 3,
      sourceStart: 2,
      sourceDuration: 3,
    },
    {
      assetId: project.assets[1]!.id,
      startTime: 0,
      duration: 2,
      sourceStart: 2,
      sourceDuration: 2,
    },
  ]);
  expect(clips[0]!.groupId).toBe(clips[1]!.groupId);
  expect(clips[1]!.transform.width).toBeLessThan(project.width / 2);
});

it('omits an ended companion without extending it or creating an empty camera clip', () => {
  const { store, project } = setupRecording();
  expect(store.getState().appendMaterial(project.assets[0]!.id, { start: 4, end: 6 }).status).toBe(
    'placed'
  );
  expect(store.getState().project!.clips.slice(2)).toMatchObject([
    { assetId: project.assets[0]!.id, sourceStart: 4, duration: 2 },
  ]);
});

it('rejects the entire recording placement when its camera destination is locked', () => {
  const { store, project, camera } = setupRecording();
  store.setState({
    project: {
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === camera.trackId ? { ...track, locked: true } : track
      ),
    },
  });
  const before = store.getState();
  expect(store.getState().appendMaterial(project.assets[0]!.id)).toEqual({
    status: 'rejected',
    reason: 'locked-track',
  });
  expect(store.getState()).toBe(before);
});

it('inserts a camera individually with its full source and camera controls', () => {
  const { store, project } = setupRecording(9);
  expect(store.getState().appendMaterial(project.assets[1]!.id).status).toBe('placed');
  const after = store.getState().project!;
  const camera = after.clips[2]!;
  expect(after.clips).toHaveLength(3);
  expect(camera).toMatchObject({ sourceStart: 0, duration: 9, groupId: null });
  expect(after.tracks.find((track) => track.id === camera.trackId)?.role).toBe(
    VideoProjectTrackRole.CAMERA
  );
  expect(camera.transform.width).toBeLessThan(project.width / 2);
});

it('keeps an earlier camera Out point when trimming the later screen Out point', () => {
  const { store, screen, camera } = setupRecording();
  store.getState().trimClipEnd(screen.id, 5);
  expect(store.getState().project!.clips).toMatchObject([
    { id: screen.id, duration: 5 },
    { id: camera.id, duration: 4 },
  ]);
});

it('trims matching recording Out points together and preserves a later camera In point', () => {
  const { store, project, screen, camera } = setupRecording(6);
  store.getState().trimClipEnd(screen.id, 5);
  expect(store.getState().project!.clips.map((clip) => clip.duration)).toEqual([5, 5]);
  store.setState({
    project: {
      ...project,
      clips: project.clips.map((clip) =>
        clip.id === camera.id
          ? { ...clip, startTime: 1, duration: 5, sourceStart: 1, sourceDuration: 5 }
          : clip
      ),
    },
  });
  store.getState().trimClipStart(screen.id, 0.5);
  expect(store.getState().project!.clips).toMatchObject([
    { startTime: 0.5, duration: 5.5, sourceStart: 0.5 },
    { startTime: 1, duration: 5, sourceStart: 1 },
  ]);
});

it('reuses a multi-source recording with distinct screen, camera and microphone destinations', async () => {
  const { createVideoProjectFromMultiSourceRecording } =
    await import('../../../../features/video/project/factories/multi-source-recording');
  const { resolveVideoCompositionFrame } =
    await import('../../../../features/video/composition/timeline/frame');
  const { store } = setup();
  const input = (recordingId: string, duration: number) => ({
    recordingId,
    duration,
    filename: `${recordingId}.webm`,
    width: 1280,
    height: 720,
    mimeType: 'video/webm',
    size: 100,
  });
  const project = createVideoProjectFromMultiSourceRecording({
    name: 'Capture',
    videos: [input('screen', 6), input('window', 5)],
    webcamVideo: input('camera', 9),
    microphoneAudio: input('mic', 4),
  });
  store.setState({ project });
  expect(store.getState().overlayMaterial(project.assets[0]!.id, { start: 2, end: 5 }).status).toBe(
    'placed'
  );
  const after = store.getState().project!;
  const added = after.clips.slice(4);
  expect(added).toMatchObject([
    { startTime: 3, sourceStart: 2, duration: 3, muted: true },
    { startTime: 3, sourceStart: 2, duration: 3, muted: true },
    { startTime: 3, sourceStart: 2, duration: 3, muted: true },
    { startTime: 3, sourceStart: 2, duration: 2, muted: false },
  ]);
  expect(new Set(added.map((clip) => clip.trackId)).size).toBe(4);
  expect(new Set(added.map((clip) => clip.groupId)).size).toBe(1);
  expect(added[0]!.groupId).not.toBe(project.clips[0]!.groupId);
  const frame = resolveVideoCompositionFrame(after, 4);
  const screenLayer = frame.visualLayers.find((layer) => layer.clipId === added[0]!.id)!;
  const cameraLayer = frame.visualLayers.find((layer) => layer.clipId === added[2]!.id)!;
  expect(cameraLayer.zIndex).toBeGreaterThan(screenLayer.zIndex);
});

it.each(['trimClipStart', 'trimClipEnd'] as const)(
  'refuses %s on a locked recording group',
  (command) => {
    const { store, project, screen, camera } = setupRecording(6);
    store.setState({
      project: {
        ...project,
        tracks: project.tracks.map((track) =>
          track.id === camera.trackId ? { ...track, locked: true } : track
        ),
      },
    });
    const before = store.getState();
    store.getState()[command](screen.id, command === 'trimClipStart' ? 1 : 5);
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().projectHistory).toBe(before.projectHistory);
  }
);

it('fits a reused screen recording to the destination scene while placing camera separately', () => {
  const { store, project } = setupRecording();
  store.setState({ project: { ...project, width: 320, height: 180 } });
  store.getState().appendMaterial(project.assets[0]!.id);
  const [screen, camera] = store.getState().project!.clips.slice(2);
  expect(screen!.transform).toMatchObject({ x: 0, y: 0, width: 320, height: 180 });
  expect(camera!.transform.width).toBeLessThan(160);
});
