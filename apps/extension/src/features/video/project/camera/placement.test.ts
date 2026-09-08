import { describe, expect, it } from 'vitest';
import {
  resolveVideoProjectCameraPlacement,
  VideoProjectCameraPlacement,
  applyVideoProjectCameraLayout,
  resolveVideoProjectCameraLayout,
  VideoProjectCameraLayout,
} from './placement';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
  createVideoProjectAsset,
} from '../factories/creation';
import { createVideoClipFromAsset, createAudioClipFromAsset } from '../factories/clip';
import {
  VideoMediaFitMode,
  VideoProjectAssetType,
  VideoProjectTrackRole,
  VideoTrackKind,
  VideoClipLinkMode,
} from '../types';

describe('camera overlay placement', () => {
  it('places a landscape camera inside each canvas corner with one stable size', () => {
    const placements = Object.values(VideoProjectCameraPlacement).map((placement) =>
      resolveVideoProjectCameraPlacement({
        placement,
        projectHeight: 1080,
        projectWidth: 1920,
        sourceHeight: 360,
        sourceWidth: 640,
      })
    );

    expect(new Set(placements.map(({ height, width }) => `${width}:${height}`)).size).toBe(1);
    expect(placements).toEqual([
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    ]);
    expect(
      placements.every(
        ({ height, width, x, y }) => x >= 0 && y >= 0 && x + width <= 1920 && y + height <= 1080
      )
    ).toBe(true);
  });

  it('keeps portrait and tiny-canvas camera geometry bounded', () => {
    const placement = resolveVideoProjectCameraPlacement({
      placement: VideoProjectCameraPlacement.BOTTOM_RIGHT,
      projectHeight: 90,
      projectWidth: 160,
      sourceHeight: 1920,
      sourceWidth: 1080,
    });

    expect(placement.x).toBeGreaterThanOrEqual(0);
    expect(placement.y).toBeGreaterThanOrEqual(0);
    expect(placement.x + placement.width).toBeLessThanOrEqual(160);
    expect(placement.y + placement.height).toBeLessThanOrEqual(90);
  });
});

// Camera layout changes use existing clip fields consumed by both renderers.
describe('camera interval layout presets', () => {
  it('changes only the selected interval while preserving source timing and linked media', () => {
    const { project, camera, following, screen, audio } = createCameraIntervals();
    const next = applyVideoProjectCameraLayout(
      project,
      camera.id,
      VideoProjectCameraLayout.FULLFRAME
    );
    const changed = next.clips.find((clip) => clip.id === camera.id);
    expect(changed).toEqual({
      ...camera,
      fitMode: VideoMediaFitMode.COVER,
      fitScalePercent: 100,
      transform: {
        x: 0,
        y: 0,
        width: project.width,
        height: project.height,
        opacity: 1,
        rotation: 0,
      },
    });
    expect(next.clips.find((clip) => clip.id === following.id)).toBe(following);
    expect(next.clips.find((clip) => clip.id === screen.id)).toBe(screen);
    expect(next.clips.find((clip) => clip.id === audio.id)).toBe(audio);
    expect(next.assets).toBe(project.assets);
    expect(next.actionEvents).toBe(project.actionEvents);
    expect(project.clips.find((clip) => clip.id === camera.id)).toBe(camera);
  });

  it('hides without deleting or muting, then restores a portrait overlay at the chosen corner', () => {
    const { project, camera } = createCameraIntervals();
    const hidden = applyVideoProjectCameraLayout(
      project,
      camera.id,
      VideoProjectCameraLayout.HIDDEN
    );
    const hiddenClip = hidden.clips.find((clip) => clip.id === camera.id);
    expect(hiddenClip).toEqual({ ...camera, transform: { ...camera.transform, opacity: 0 } });
    expect(applyVideoProjectCameraLayout(hidden, camera.id, VideoProjectCameraLayout.HIDDEN)).toBe(
      hidden
    );
    const restored = applyVideoProjectCameraLayout(
      hidden,
      camera.id,
      VideoProjectCameraLayout.OVERLAY,
      VideoProjectCameraPlacement.TOP_LEFT
    );
    const restoredClip = restored.clips.find((clip) => clip.id === camera.id);
    expect(restoredClip?.transform).toEqual({
      ...resolveVideoProjectCameraPlacement({
        placement: VideoProjectCameraPlacement.TOP_LEFT,
        projectWidth: project.width,
        projectHeight: project.height,
        sourceWidth: 720,
        sourceHeight: 1280,
      }),
      opacity: 1,
      rotation: 0,
    });
    expect(restoredClip).toMatchObject({
      sourceStart: 4,
      duration: 3,
      playbackRate: 2,
      muted: false,
      volume: 0.7,
    });
  });

  it('derives hidden/fullframe/overlay after a canvas transform or reload without another persisted mode', () => {
    const { project, camera } = createCameraIntervals();
    expect(
      resolveVideoProjectCameraLayout(project, {
        ...camera,
        transform: { ...camera.transform, opacity: 0 },
      })
    ).toBe(VideoProjectCameraLayout.HIDDEN);
    const full = {
      ...camera,
      fitMode: VideoMediaFitMode.COVER,
      transform: {
        x: 0,
        y: 0,
        width: project.width,
        height: project.height,
        opacity: 1,
        rotation: 0,
      },
    };
    expect(resolveVideoProjectCameraLayout(project, full)).toBe(VideoProjectCameraLayout.FULLFRAME);
    expect(
      resolveVideoProjectCameraLayout(project, { ...full, transform: { ...full.transform, x: 80 } })
    ).toBe(VideoProjectCameraLayout.OVERLAY);
  });

  it('rejects a missing, ordinary or locked camera target', () => {
    const { project, camera, screen } = createCameraIntervals();
    expect(applyVideoProjectCameraLayout(project, 'missing', VideoProjectCameraLayout.HIDDEN)).toBe(
      project
    );
    expect(applyVideoProjectCameraLayout(project, screen.id, VideoProjectCameraLayout.HIDDEN)).toBe(
      project
    );
    const locked = {
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === camera.trackId ? { ...track, locked: true } : track
      ),
    };
    expect(
      applyVideoProjectCameraLayout(locked, camera.id, VideoProjectCameraLayout.FULLFRAME)
    ).toBe(locked);
  });
});

function createCameraIntervals() {
  const project = createEmptyVideoProject('Camera intervals');
  const cameraTrack = {
    ...createVideoProjectTrack('Camera', 1, VideoTrackKind.PRIMARY),
    role: VideoProjectTrackRole.CAMERA,
  };
  const screenTrack = createVideoProjectTrack('Screen', 0, VideoTrackKind.PRIMARY);
  const asset = createVideoProjectAsset(
    'Camera',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'camera-source' },
    {
      width: 720,
      height: 1280,
      duration: 20,
      mimeType: 'video/mp4',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const base = createVideoClipFromAsset(cameraTrack.id, asset, project.width, project.height, 2);
  if (base.type !== 'VIDEO') throw new Error('Expected camera video fixture');
  const camera = {
    ...base,
    duration: 3,
    sourceStart: 4,
    playbackRate: 2,
    muted: false,
    volume: 0.7,
    groupId: 'linked-material',
    linkMode: VideoClipLinkMode.LINKED,
  };
  const following = { ...camera, id: 'following', startTime: 5, sourceStart: 10 };
  const screen = { ...camera, id: 'screen', trackId: screenTrack.id };
  const audioTrack = createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO);
  const audio = createAudioClipFromAsset(audioTrack.id, asset, 2, { groupId: 'linked-material' });
  project.tracks = [screenTrack, cameraTrack, audioTrack];
  project.assets = [asset];
  project.clips = [screen, camera, following, audio];
  return { project, camera, following, screen, audio };
}
