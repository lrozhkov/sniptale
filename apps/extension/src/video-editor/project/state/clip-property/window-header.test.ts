import { expect, it } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { isVideoProjectClip } from '../../../../features/video/project/validation/clips';
import { parseHydratableVideoProject } from '../../../../features/video/project/validation';
import { normalizeClip } from '../../../../features/video/project/hydration/clip';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../../history';
import { createProjectWithMediaTrack } from './content.test-support';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';

it('keeps video/image header changes in project history and serialized clip admission', () => {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithMediaTrack());
  for (const id of ['clip-video', 'clip-image']) {
    const header = {
      ...DEFAULT_WINDOW_HEADER,
      title: 'Заголовок',
      url: 'https://example.org/path',
    };
    store.getState().updateMediaClipWindowHeader(id, header);
    const after = store.getState().project!;
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(after)))).toEqual(after);
    const clip = after.clips.find((item) => item.id === id)!;
    const serialized: unknown = JSON.parse(JSON.stringify(clip));
    expect(isVideoProjectClip(serialized)).toBe(true);
    if (!isVideoProjectClip(serialized)) throw new Error('Expected valid restored clip');
    expect(normalizeClip(serialized, new Map())).toMatchObject({ windowHeader: header });
    const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, after);
    if (undo?.status !== 'applied') throw new Error('Expected undo');
    expect(undo.project.clips.find((item) => item.id === id)).not.toHaveProperty('windowHeader');
    const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
    if (redo?.status !== 'applied') throw new Error('Expected redo');
    expect(redo.project.clips.find((item) => item.id === id)).toMatchObject({
      windowHeader: header,
    });
    expect(
      isVideoProjectClip({
        ...serialized,
        windowHeader: { ...header, faviconDataUrl: 'https://remote.example/icon' },
      })
    ).toBe(false);
    store.getState().updateMediaClipWindowHeader(id, undefined);
    expect(store.getState().project!.clips.find((item) => item.id === id)).not.toHaveProperty(
      'windowHeader'
    );
  }
});

it('rejects non-media/locked edits and deduplicates unchanged headers', () => {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithMediaTrack());
  store.getState().updateMediaClipWindowHeader('clip-video', DEFAULT_WINDOW_HEADER);
  const before = store.getState().project;
  const history = store.getState().projectHistory;
  store.getState().updateMediaClipWindowHeader('clip-video', { ...DEFAULT_WINDOW_HEADER });
  store.getState().updateMediaClipWindowHeader('clip-text', DEFAULT_WINDOW_HEADER);
  expect(store.getState().project).toBe(before);
  expect(store.getState().projectHistory).toBe(history);
  if (!before) throw new Error('Expected project');
  store.setState({
    project: { ...before, tracks: before.tracks.map((track) => ({ ...track, locked: true })) },
  });
  const locked = store.getState().project;
  store.getState().updateMediaClipWindowHeader('clip-video', undefined);
  expect(store.getState().project).toBe(locked);
});

it('does not attach a window header to the specialized camera track', () => {
  const store = createVideoEditorProjectTestStore();
  const project = createProjectWithMediaTrack();
  const video = project.clips.find((clip) => clip.id === 'clip-video')!;
  store.getState().setProject({
    ...project,
    tracks: project.tracks.map((track) =>
      track.id === video.trackId ? { ...track, role: 'CAMERA' } : track
    ),
  });
  const before = store.getState().project;
  store.getState().updateMediaClipWindowHeader(video.id, DEFAULT_WINDOW_HEADER);
  expect(store.getState().project).toBe(before);
});

it('retains a disabled header through root admission duplicate and Undo without affecting another clip', () => {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithMediaTrack());
  const header = { ...DEFAULT_WINDOW_HEADER, title: 'Remembered title', theme: 'dark' as const };
  store.getState().updateMediaClipWindowHeader('clip-video', header);
  const active = store.getState().project!;
  const other = active.clips.filter((clip) => clip.id !== 'clip-video');
  store.getState().updateMediaClipWindowHeader('clip-video', undefined);
  const dormant = store.getState().project!;
  expect(dormant.version).toBe(35);
  expect(dormant.clips.find((clip) => clip.id === 'clip-video')).toMatchObject({
    rememberedWindowHeader: header,
  });
  expect(dormant.clips.find((clip) => clip.id === 'clip-video')).not.toHaveProperty('windowHeader');
  expect(dormant.clips.filter((clip) => clip.id !== 'clip-video')).toEqual(other);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(dormant)))).toEqual(dormant);
  expect(parseHydratableVideoProject({ ...dormant, version: 34 })).toBeNull();
  expect(
    parseHydratableVideoProject({
      ...dormant,
      clips: dormant.clips.map((clip) =>
        clip.id === 'clip-video'
          ? {
              ...clip,
              rememberedWindowHeader: { ...header, faviconDataUrl: 'https://remote.test/icon' },
            }
          : clip
      ),
    })
  ).toBeNull();
  store.getState().setProject(JSON.parse(JSON.stringify(dormant)));
  store.getState().duplicateClip('clip-video');
  const duplicated = store.getState().project!;
  const copy = duplicated.clips.find(
    (clip) => !dormant.clips.some((old) => old.id === clip.id) && clip.type === 'VIDEO'
  )!;
  expect(copy).toMatchObject({ rememberedWindowHeader: header });
  expect(copy).not.toHaveProperty('windowHeader');
  const undone = undoVideoEditorProjectHistory(store.getState().projectHistory, duplicated);
  expect(undone?.status).toBe('applied');
  if (undone?.status === 'applied') expect(undone.project.clips).toEqual(dormant.clips);
  store.getState().updateMediaClipWindowHeader('clip-video', header);
  const enabled = store.getState().project!;
  expect(enabled.clips.find((clip) => clip.id === 'clip-video')).toMatchObject({
    windowHeader: header,
  });
  expect(enabled.clips.find((clip) => clip.id === 'clip-video')).not.toHaveProperty(
    'rememberedWindowHeader'
  );
});
