import { expect, it } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '../../../../features/browser-frame/header';
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
