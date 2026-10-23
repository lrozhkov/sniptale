import { expect, it } from 'vitest';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../../history';
import { createProjectWithMediaTrack } from './content.test-support';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';

const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
function fixture() {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithMediaTrack());
  return store;
}
it.each(['clip-video', 'clip-image'])(
  'edits %s source crop with history while preserving authored data',
  (id) => {
    const store = fixture();
    const before = store.getState().project!;
    const source = structuredClone(before);
    store.getState().editMediaClip(id, { kind: 'source-crop', crop });
    const after = store.getState().project!;
    expect(after.version).toBe(13);
    expect(after.clips.find((clip) => clip.id === id)).toMatchObject({ sourceCrop: crop });
    expect(after.assets).toBe(before.assets);
    expect(
      after.clips.map((clip) => {
        const copy = { ...clip };
        if ('sourceCrop' in copy) delete copy.sourceCrop;
        return copy;
      })
    ).toEqual(before.clips);
    expect(before).toEqual(source);
    const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, after);
    if (undo?.status !== 'applied') throw new Error('Expected undo');
    expect(undo.project.clips).toEqual(before.clips);
    const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
    if (redo?.status !== 'applied') throw new Error('Expected redo');
    expect(redo.project.clips).toEqual(after.clips);
    store.getState().editMediaClip(id, { kind: 'source-crop', crop: null });
    expect(store.getState().project!.version).toBe(35);
    const disabled = store.getState().project!;
    expect(disabled.clips.find((clip) => clip.id === id)).toMatchObject({
      rememberedSourceCrop: crop,
    });
    expect(disabled.clips.find((clip) => clip.id === id)).not.toHaveProperty('sourceCrop');
    store.getState().editMediaClip(id, { kind: 'source-crop', crop });
    expect(store.getState().project!.clips).toEqual(after.clips);
  }
);
it('refuses invalid, locked, missing, non-media and repeated crop commands without history', () => {
  const store = fixture();
  for (const [id, value] of [
    ['missing', crop],
    ['clip-text', crop],
    ['clip-video', { ...crop, x: -1 }],
    ['clip-video', null],
  ] as const) {
    const before = store.getState();
    store.getState().editMediaClip(id, { kind: 'source-crop', crop: value });
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().projectHistory).toBe(before.projectHistory);
  }
  store.getState().editMediaClip('clip-video', { kind: 'source-crop', crop });
  const accepted = store.getState();
  store.getState().editMediaClip('clip-video', { kind: 'source-crop', crop: { ...crop } });
  expect(store.getState().project).toBe(accepted.project);
  expect(store.getState().projectHistory).toBe(accepted.projectHistory);
  const project = accepted.project!;
  store.getState().setProject({
    ...project,
    tracks: project.tracks.map((track) => ({ ...track, locked: true })),
  });
  const locked = store.getState();
  store.getState().editMediaClip('clip-video', { kind: 'source-crop', crop: null });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
});
it('retains independent crop, layout and style edits and target crops during track application', () => {
  const store = fixture();
  store.getState().editMediaClip('clip-video', { kind: 'source-crop', crop });
  store.getState().updateClipTransform('clip-video', { x: 321 });
  store.getState().updateMediaClipShadowColor('clip-video', '#336699');
  const targetCrop = { x: 0, y: 0.25, width: 1, height: 0.5 };
  store.getState().editMediaClip('clip-image', { kind: 'source-crop', crop: targetCrop });
  expect(store.getState().project!.clips.find((clip) => clip.id === 'clip-video')).toMatchObject({
    sourceCrop: crop,
    shadowColor: '#336699',
    transform: { x: 321 },
  });
  store.getState().applyMediaClipVisualsToTrack('clip-video');
  expect(store.getState().project!.clips.find((clip) => clip.id === 'clip-image')).toMatchObject({
    sourceCrop: targetCrop,
    shadowColor: '#336699',
  });
  const beforeFit = store.getState().project!;
  store.getState().updateMediaClipFitMode('clip-video', 'FIT_LONG_SIDE', 100);
  const fitted = store.getState().project!.clips.find((clip) => clip.id === 'clip-video');
  const asset =
    beforeFit.assets.find((asset) => asset.id === 'asset-video') ?? beforeFit.assets[0]!;
  expect(fitted!.transform.width / fitted!.transform.height).toBeCloseTo(
    (asset.metadata.width * crop.width) / (asset.metadata.height * crop.height)
  );
});

it('refuses equal imported crop edits regardless of JSON property order', () => {
  const store = fixture();
  const project = store.getState().project!;
  store.getState().setProject({
    ...project,
    version: 13,
    clips: project.clips.map((clip) =>
      clip.id === 'clip-video'
        ? { ...clip, sourceCrop: { height: 0.8, width: 0.5, y: 0.1, x: 0.25 } }
        : clip
    ),
  });
  const before = store.getState();
  store.getState().editMediaClip('clip-video', { kind: 'source-crop', crop });
  expect(store.getState().project).toBe(before.project);
  expect(store.getState().projectHistory).toBe(before.projectHistory);
});
