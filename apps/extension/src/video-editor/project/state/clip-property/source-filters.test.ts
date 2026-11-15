import { expect, it } from 'vitest';
import { createSourceImageFilter } from '../../../../features/image-filters/contract';
import { parseHydratableVideoProject } from '../../../../features/video/project/validation';
import { normalizeClip } from '../../../../features/video/project/hydration/clip';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../../history';
import { createProjectWithMediaTrack } from './content.test-support';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';
it('keeps source filters in the existing project history and restores them through reopen', () => {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithMediaTrack());
  const stack = {
    version: 1 as const,
    filters: [
      createSourceImageFilter('color', 'color'),
      createSourceImageFilter('bloom', 'bloom'),
      ...(['monochrome', 'sepia', 'sharpen', 'pixelate', 'vignette', 'grain'] as const).map(
        (kind) => createSourceImageFilter(kind, kind)
      ),
      { ...createSourceImageFilter('blur', 'blur'), enabled: false },
    ],
  };
  const before = structuredClone(stack);
  store.getState().editMediaClip('clip-video', { kind: 'source-filters', stack });
  const after = store.getState().project!;
  expect(after.version).toBe(52);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(after)))).toEqual(after);
  const clip = after.clips.find((item) => item.id === 'clip-video')!;
  expect(normalizeClip(clip, new Map())).toHaveProperty('sourceFilters', stack);
  expect('sourceFilters' in clip && clip.sourceFilters).not.toBe(stack);
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, after);
  if (undo?.status !== 'applied') throw new Error('Expected Undo');
  expect(undo.project.clips.find((item) => item.id === clip.id)).not.toHaveProperty(
    'sourceFilters'
  );
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected Redo');
  expect(redo.project.clips.find((item) => item.id === clip.id)).toHaveProperty(
    'sourceFilters',
    stack
  );
  store.getState().editMediaClip('clip-video', { kind: 'source-filters', stack: null });
  expect(store.getState().project!.clips.find((item) => item.id === clip.id)).not.toHaveProperty(
    'sourceFilters'
  );
  expect(store.getState().project!.version).toBe(52);
  expect(stack).toEqual(before);
});
it('refuses unavailable source filter edits without changing project history', () => {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithMediaTrack());
  const stack = { version: 1 as const, filters: [createSourceImageFilter('blur', 'blur')] };
  const invalid = structuredClone(stack);
  Object.defineProperty(invalid, 'version', { value: 2 });
  const before = store.getState().project,
    history = store.getState().projectHistory;
  for (const id of ['clip-image', 'clip-text', 'missing'])
    store.getState().editMediaClip(id, { kind: 'source-filters', stack });
  store.getState().editMediaClip('clip-video', { kind: 'source-filters', stack: invalid });
  expect(store.getState().project).toBe(before);
  expect(store.getState().projectHistory).toBe(history);
  if (!before) throw new Error('Expected project');
  store.setState({
    project: { ...before, tracks: before.tracks.map((track) => ({ ...track, locked: true })) },
  });
  const locked = store.getState().project;
  store.getState().editMediaClip('clip-video', { kind: 'source-filters', stack });
  expect(store.getState().project).toBe(locked);
  expect(store.getState().projectHistory).toBe(history);
});
