import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoBlockKind,
  VideoProjectShapeType,
  VideoTrackKind,
} from '../../../features/video/project/types';
import {
  applyClipPropertyMutations,
  verifyClipPropertyMutationResults,
} from './actions.test-support';
import { createVideoAsset } from './test-support';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import type { VideoEditorProjectState } from './contracts';

function createVideoEditorTestStore() {
  return createVideoEditorProjectTestStore();
}

describe('video editor store project track and asset actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(500);
  });

  it(
    'applies track and asset structure mutations through one project update seam',
    verifyTrackAndAssetMutations
  );
  it('deletes extra tracks and resets removed clip selection through the root action surface', () => {
    const store = createVideoEditorTestStore();
    const project = createEmptyVideoProject('Delete track');

    store.getState().setProject(project);
    const audioTrackId = project.tracks[1]!.id;
    store.getState().addTrack(VideoTrackKind.OVERLAY);
    const extraOverlayTrackId = store.getState().project!.tracks.at(-1)!.id;
    const overlayClipId = store.getState().addTextOverlay(extraOverlayTrackId, 1);
    store.getState().addTrack(VideoTrackKind.AUDIO);
    store.getState().selectClip(overlayClipId!);
    store.getState().deleteTrack(extraOverlayTrackId);
    store.getState().deleteTrack(audioTrackId);

    expect(store.getState().project?.tracks.some((track) => track.id === extraOverlayTrackId)).toBe(
      false
    );
    expect(store.getState().selection).toEqual({ kind: 'scene' });
    expect(store.getState().selectedClipId).toBeNull();
  });
});

describe('video editor store project clip actions', () => {
  it(
    'applies insertion and clip property mutations through the shared project patch helpers',
    verifyClipPropertyMutations
  );
  it('rejects non-finite numeric updates at the store boundary', verifyNumericGuardPaths);
  it(
    'replaces existing assets and keeps missing-target mutations as no-ops',
    verifyStoreGuardPaths
  );
  it(
    'applies clip timeline mutations and linked-group detachment through the store action cluster',
    verifyClipTimelineMutations
  );
  it('exposes close-gap through the aggregate project action surface', verifyCloseGapAction);
});

function verifyTrackAndAssetMutations(): void {
  const store = createVideoEditorTestStore();
  const project = createEmptyVideoProject('Draft');
  const primaryTrackId = project.tracks[0]!.id;

  expectProjectActionSurface(store);
  expect(store.getState().addAnnotationOverlay()).toBeNull();
  expect(store.getState().addVideoBlock(VideoBlockKind.STEP_EXPLAINER)).toBeNull();
  store.getState().setProject(project);
  store.getState().renameProject('Edited');
  store.getState().addTrackLogicalLane(primaryTrackId);
  store.getState().addTrack(VideoTrackKind.SUBTITLE);
  const subtitleTrackId = store.getState().project!.tracks.at(-1)!.id;
  store.getState().updateSubtitleTrackStyle(subtitleTrackId, { maxWidthPercent: 75 });
  store.getState().addTrack(VideoTrackKind.AUDIO);
  store.getState().moveTrack(primaryTrackId, 'down');
  store.getState().toggleTrackVisibility(primaryTrackId);
  store.getState().toggleTrackLock(primaryTrackId);
  applyUtilityLaneMutations(store);
  store.getState().upsertAsset(createVideoAsset('clip-a', false));

  const nextProject = store.getState().project;
  expect(nextProject?.name).toBe('Edited');
  expect(nextProject?.tracks).toHaveLength(5);
  expect(nextProject?.tracks.find((track) => track.id === primaryTrackId)).toEqual(
    expect.objectContaining({
      locked: true,
      logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
      visible: false,
    })
  );
  expect(nextProject?.tracks.find((track) => track.id === subtitleTrackId)).toEqual(
    expect.objectContaining({
      subtitleStyle: expect.objectContaining({ maxWidthPercent: 75 }),
    })
  );
  expect(nextProject?.assets).toEqual([expect.objectContaining({ name: 'clip-a' })]);
  expectUtilityLaneMutationResults(nextProject);
  expect(nextProject?.updatedAt).toBe(500);
}

function expectProjectActionSurface(store: ReturnType<typeof createVideoEditorTestStore>): void {
  const actionNames = [
    'updateCursorSampleInterpolation',
    'updateCursorSampleSkinOverride',
    'clearCursorSampleSkinOverride',
    'deleteMotionRegion',
    'updateMotionRegion',
    'deleteTrack',
    'addTrackLogicalLane',
    'addAnnotationOverlay',
    'addVideoBlock',
    'addSubtitleOverlay',
    'convertTextClipToAnnotation',
    'updateMediaClipShadowIntensity',
    'updateMediaClipShadowMode',
    'updateSubtitleTrackStyle',
    'updateTransitionDuration',
    'updateTransitionEasing',
    'updateTransitionTemplate',
  ] as const;

  for (const actionName of actionNames) {
    expect(store.getState()[actionName]).toBeTypeOf('function');
  }
}

function applyUtilityLaneMutations(store: ReturnType<typeof createVideoEditorTestStore>): void {
  store.getState().toggleUtilityLaneVisibility('actions');
  store.getState().toggleUtilityLaneLock('camera');
}

function expectUtilityLaneMutationResults(
  nextProject: NonNullable<VideoEditorProjectState['project']> | null
): void {
  expect(nextProject?.utilityLanes).toEqual({
    actions: { visible: false, locked: false },
    camera: { visible: true, locked: true },
  });
}

function verifyStoreGuardPaths(): void {
  const store = createVideoEditorTestStore();
  const project = createEmptyVideoProject('Draft');
  const originalAsset = createVideoAsset('clip-a', false);

  store.getState().setProject(project);
  store.getState().upsertAsset(originalAsset);
  store.getState().upsertAsset({
    ...originalAsset,
    name: 'clip-a-updated',
  });
  store.getState().updateClipMuted('missing', true);
  store.getState().deleteClip('missing');

  expect(store.getState().project?.assets).toEqual([
    expect.objectContaining({ name: 'clip-a-updated' }),
  ]);
}

function verifyClipTimelineMutations(): void {
  const store = createVideoEditorTestStore();
  const project = createEmptyVideoProject('Draft');
  const groupedVideoAsset = createVideoAsset('clip-c', true);

  store.getState().setProject(project);
  const videoClipId = store.getState().addAssetClip(groupedVideoAsset, project.tracks[0]!.id, 1);
  const textClipId = store.getState().addTextOverlay(project.tracks[2]!.id, 4);
  expect(videoClipId).toBeTruthy();
  expect(textClipId).toBeTruthy();

  store.getState().detachClipGroup(videoClipId!);
  store.getState().duplicateClip(textClipId!);
  expect(
    store.getState().project!.clips.filter((clip) => clip.trackId === project.tracks[2]!.id).length
  ).toBeGreaterThan(1);
  store.getState().moveClip(textClipId!, 5);
  store.getState().trimClipStart(textClipId!, 5.2);
  store.getState().trimClipEnd(textClipId!, 6.1);
  store.getState().splitClipAt(textClipId!, 5.6);
  store.getState().deleteClip(textClipId!);

  const nextProject = store.getState().project!;
  const groupedClips = nextProject.clips.filter((clip) => clip.groupId !== null);

  expect(groupedClips.every((clip) => clip.linkMode === 'DETACHED')).toBe(true);
  expect(nextProject.clips.some((clip) => clip.id === textClipId)).toBe(false);
  expect(
    nextProject.clips.filter((clip) => clip.trackId === project.tracks[2]!.id).length
  ).toBeGreaterThan(0);
  expect(nextProject.updatedAt).toBe(500);
}

function verifyCloseGapAction(): void {
  const store = createVideoEditorTestStore();
  const project = createEmptyVideoProject('Close gap action');
  const primaryTrackId = project.tracks[0]!.id;

  store.getState().setProject(project);
  const firstClipId = store
    .getState()
    .addAssetClip(createVideoAsset('gap-a', false), primaryTrackId, 0);
  const secondClipId = store
    .getState()
    .addAssetClip(createVideoAsset('gap-b', false), primaryTrackId, 8);
  const firstClip = store.getState().project!.clips.find((clip) => clip.id === firstClipId)!;
  const gapStart = firstClip.startTime + firstClip.duration;

  store.getState().closeTrackGap(primaryTrackId, gapStart, 8);

  expect(store.getState().project!.clips.find((clip) => clip.id === secondClipId)?.startTime).toBe(
    gapStart
  );
}

function verifyClipPropertyMutations(): void {
  const store = createVideoEditorTestStore();
  const project = createEmptyVideoProject('Draft');
  const [primaryTrack, , overlayTrack] = project.tracks;
  const groupedVideoAsset = createVideoAsset('clip-b', true);

  store.getState().setProject(project);
  const videoClipId = store.getState().addAssetClip(groupedVideoAsset, primaryTrack!.id, 1);
  const annotationClipId = store.getState().addAnnotationOverlay(overlayTrack!.id, 1.5);
  const textClipId = store.getState().addTextOverlay(overlayTrack!.id, 2);
  const shapeClipId = store
    .getState()
    .addShapeOverlay(VideoProjectShapeType.RECTANGLE, overlayTrack!.id, 3);

  expect(videoClipId).toBeTruthy();
  expect(annotationClipId).toBeTruthy();
  expect(textClipId).toBeTruthy();
  expect(shapeClipId).toBeTruthy();

  applyClipPropertyMutations(store, videoClipId!, annotationClipId!, textClipId!, shapeClipId!);
  verifyClipPropertyMutationResults(
    store.getState().project!,
    videoClipId!,
    annotationClipId!,
    textClipId!,
    shapeClipId!
  );
}

function verifyNumericGuardPaths(): void {
  const store = createVideoEditorTestStore();
  const project = createEmptyVideoProject('Numeric guards');
  const [primaryTrack, , overlayTrack] = project.tracks;

  store.getState().setProject(project);
  const videoClipId = store
    .getState()
    .addAssetClip(createVideoAsset('clip-guard', true), primaryTrack!.id, 1);
  const textClipId = store.getState().addTextOverlay(overlayTrack!.id, 2);
  const shapeClipId = store
    .getState()
    .addShapeOverlay(VideoProjectShapeType.RECTANGLE, overlayTrack!.id, 3);

  store.getState().updateClipTransform(videoClipId!, { x: Number.NaN, width: Number.NaN });
  store.getState().updateClipVolume(videoClipId!, Number.NaN);
  store.getState().updateTextClipStyle(textClipId!, { fontSize: Number.NaN });
  store.getState().updateShapeClipStyle(shapeClipId!, { borderRadius: Number.NaN });

  const guardedProject = store.getState().project!;
  const videoClip = guardedProject.clips.find((clip) => clip.id === videoClipId)!;
  const textClip = guardedProject.clips.find((clip) => clip.id === textClipId)!;
  const shapeClip = guardedProject.clips.find((clip) => clip.id === shapeClipId)!;

  expect(videoClip.transform.x).toBe(0);
  expect(videoClip.transform.width).toBe(1920);
  expect(videoClip.volume).toBe(1);
  expect(textClip.type === 'TEXT' && textClip.style.fontSize).toBe(40);
  expect(shapeClip.type === 'SHAPE' && shapeClip.style.borderRadius).toBe(18);
}
