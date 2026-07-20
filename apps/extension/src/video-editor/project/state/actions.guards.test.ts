import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import {
  VideoProjectAssetType,
  VideoProjectShapeType,
} from '../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

function createVideoEditorTestStore() {
  return createVideoEditorProjectTestStore();
}

function createVideoAsset(name: string, hasAudio = true) {
  return createVideoProjectAsset(
    name,
    VideoProjectAssetType.VIDEO,
    {
      kind: 'project-asset',
      projectAssetId: `${name}-asset`,
    },
    {
      width: 1920,
      height: 1080,
      duration: 6,
      mimeType: 'video/mp4',
      size: 100,
      hasAudio,
      audioPeaks: hasAudio ? [0.1, 0.2, 0.4, 0.2] : null,
    }
  );
}

describe('video editor store project action guards', () => {
  it('keeps non-finite style patches and locked timeline deletions as guarded no-ops', () => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(500);
    const store = createVideoEditorTestStore();
    const project = createEmptyVideoProject('Strict guards');
    const [primaryTrack, , overlayTrack] = project.tracks;

    store.getState().setProject(project);
    const videoClipId = store
      .getState()
      .addAssetClip(createVideoAsset('clip-guard-shared', true), primaryTrack!.id, 1);
    const textClipId = store
      .getState()
      .addShapeOverlay(VideoProjectShapeType.RECTANGLE, overlayTrack!.id, 2);

    store.getState().updateShapeClipStyle(textClipId!, {
      borderRadius: Number.NaN,
      strokeWidth: Number.NaN,
    });

    const lockedProject = {
      ...store.getState().project!,
      tracks: store
        .getState()
        .project!.tracks.map((track) =>
          track.id === primaryTrack!.id ? { ...track, locked: true } : track
        ),
    };
    store.getState().setProject(lockedProject);
    store.getState().deleteClip(videoClipId!);

    expect(store.getState().project?.clips.some((clip) => clip.id === videoClipId)).toBe(true);
    expect(store.getState().project?.clips.find((clip) => clip.id === textClipId)).toEqual(
      expect.objectContaining({
        style: expect.not.objectContaining({
          borderRadius: Number.NaN,
          strokeWidth: Number.NaN,
        }),
      })
    );
  });
});
