import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoAsset } from './test-support';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

function createVideoEditorTestStore() {
  return createVideoEditorProjectTestStore();
}

describe('video editor store project playback-rate actions', () => {
  it('keeps orphan asset upserts inert and retimes the linked source-timed group together', () => {
    const store = createVideoEditorTestStore();
    const project = createEmptyVideoProject('Playback');
    const groupedVideoAsset = createVideoAsset('clip-rate', true);

    expect(store.getState().updateClipPlaybackRate).toBeTypeOf('function');
    store.getState().upsertAsset(createVideoAsset('orphan', false));
    expect(store.getState().project).toBeNull();

    store.getState().setProject(project);
    const videoClipId = store.getState().addAssetClip(groupedVideoAsset, project.tracks[0]!.id, 1);
    store.getState().updateClipPlaybackRate(videoClipId!, 2);
    const clipGroupId = store
      .getState()
      .project?.clips.find((clip) => clip.id === videoClipId)?.groupId;
    const linkedGroup = store
      .getState()
      .project!.clips.filter((clip) => clip.groupId === clipGroupId);

    expect(
      linkedGroup.every((clip) => ('playbackRate' in clip ? clip.playbackRate === 2 : true))
    ).toBe(true);
    expect(
      linkedGroup.every((clip) =>
        'sourceDuration' in clip && 'duration' in clip
          ? clip.duration === clip.sourceDuration / 2
          : true
      )
    ).toBe(true);
  });
});
