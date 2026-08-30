import { beforeEach, expect, it } from 'vitest';
import { resolveSelectedClipId } from '../contracts/selection';
import { useVideoEditorStore, type VideoEditorState } from './store';

beforeEach(() => {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

it('keeps clip identity exclusively in the discriminated selection state', () => {
  expect(useVideoEditorStore.getState()).not.toHaveProperty('selectedClipId');

  useVideoEditorStore.getState().selectClip('clip-1');

  const state = useVideoEditorStore.getState();
  expect(state.selection).toEqual({ kind: 'clip', clipId: 'clip-1' });
  expect(resolveSelectedClipId(state.selection)).toBe('clip-1');
  expect(state).not.toHaveProperty('selectedClipId');
});

it('rejects an independent writable selectedClipId state field', () => {
  const invalidStatePatch = {
    // @ts-expect-error Clip identity is writable only through selection.
    selectedClipId: 'clip-1',
  } satisfies Partial<VideoEditorState>;

  expect(invalidStatePatch).toEqual({ selectedClipId: 'clip-1' });
});
