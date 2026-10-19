import { expect, it } from 'vitest';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../../history';
import { createProjectWithMediaTrack } from './content.test-support';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';

function fixture() {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithMediaTrack());
  return store;
}

it.each(['clip-video', 'clip-image'])(
  'edits %s radius with one history step and preserves source data',
  (id) => {
    const store = fixture();
    const before = store.getState().project!;
    store.getState().editMediaClip(id, { kind: 'window-corner-radius', radius: 24.5 });
    const after = store.getState().project!;
    expect(after.version).toBe(15);
    expect(after.assets).toBe(before.assets);
    expect(after.clips.find((clip) => clip.id === id)).toMatchObject({ windowCornerRadius: 24.5 });
    expect(
      after.clips.map((clip) => {
        const copy = { ...clip };
        if ('windowCornerRadius' in copy) delete copy.windowCornerRadius;
        return copy;
      })
    ).toEqual(before.clips);
    const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, after);
    if (undo?.status !== 'applied') throw new Error('Expected undo');
    expect(undo.project.clips).toEqual(before.clips);
    const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
    if (redo?.status !== 'applied') throw new Error('Expected redo');
    expect(redo.project.clips).toEqual(after.clips);
    store.getState().editMediaClip(id, { kind: 'window-corner-radius', radius: null });
    expect(store.getState().project!.version).toBe(15);
    expect(store.getState().project!.clips).toEqual(before.clips);
  }
);

it('refuses invalid, absent, locked and repeated radius edits without history', () => {
  const store = fixture();
  for (const [id, radius] of [
    ['missing', 24],
    ['clip-text', 24],
    ['clip-video', -1],
    ['clip-video', 4097],
    ['clip-video', NaN],
    ['clip-video', Infinity],
    ['clip-video', null],
  ] as const) {
    const before = store.getState();
    store.getState().editMediaClip(id, { kind: 'window-corner-radius', radius });
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().projectHistory).toBe(before.projectHistory);
  }
  store.getState().editMediaClip('clip-video', { kind: 'window-corner-radius', radius: 12 });
  const accepted = store.getState();
  store.getState().editMediaClip('clip-video', { kind: 'window-corner-radius', radius: 12 });
  expect(store.getState().project).toBe(accepted.project);
  expect(store.getState().projectHistory).toBe(accepted.projectHistory);
  store.getState().setProject({
    ...accepted.project!,
    tracks: accepted.project!.tracks.map((track) => ({ ...track, locked: true })),
  });
  const locked = store.getState();
  store.getState().editMediaClip('clip-video', { kind: 'window-corner-radius', radius: null });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
});

it('retains latest independent crop and style edits while applying or clearing track radius', () => {
  const store = fixture();
  const crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  store.getState().editMediaClip('clip-image', { kind: 'source-crop', crop });
  store.getState().editMediaClip('clip-video', { kind: 'window-corner-radius', radius: 31 });
  store.getState().updateClipTransform('clip-video', { x: 321 });
  store.getState().updateMediaClipShadowColor('clip-video', '#336699');
  store.getState().applyMediaClipVisualsToTrack('clip-video');
  expect(store.getState().project!.clips.find((clip) => clip.id === 'clip-image')).toMatchObject({
    sourceCrop: crop,
    windowCornerRadius: 31,
    shadowColor: '#336699',
  });
  store.getState().editMediaClip('clip-video', { kind: 'window-corner-radius', radius: null });
  store.getState().applyMediaClipVisualsToTrack('clip-video');
  const target = store.getState().project!.clips.find((clip) => clip.id === 'clip-image');
  expect(target).not.toHaveProperty('windowCornerRadius');
  expect(target).toMatchObject({ sourceCrop: crop, shadowColor: '#336699' });
});
