// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { useCommittedFrameDraft } from './frame-commit';

it('applies sequential completed edits once each and rebases after authoritative undo', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const apply = vi.fn();
  let commit: ReturnType<typeof useCommittedFrameDraft>;
  let replace: (value: EditorFrameSettings) => void;
  function Harness() {
    const [frame, setDraft] = useState(DEFAULT_EDITOR_FRAME_SETTINGS);
    replace = setDraft;
    commit = useCommittedFrameDraft({ frame, setDraft, apply });
    return null;
  }
  act(() => root.render(<Harness />));
  expect(apply).not.toHaveBeenCalled();
  act(() => {
    commit((frame) => ({ ...frame, paddingTop: 80 }));
    commit((frame) => ({ ...frame, paddingBottom: 90 }));
  });
  expect(apply).toHaveBeenCalledTimes(2);
  expect(apply.mock.lastCall?.[0]).toMatchObject({ paddingTop: 80, paddingBottom: 90 });
  act(() => commit(DEFAULT_EDITOR_FRAME_SETTINGS));
  expect(apply.mock.lastCall?.[0]).toEqual(DEFAULT_EDITOR_FRAME_SETTINGS);
  act(() => replace(DEFAULT_EDITOR_FRAME_SETTINGS));
  act(() => commit((frame) => ({ ...frame, paddingRight: 50 })));
  expect(apply.mock.lastCall?.[0]).toMatchObject({
    paddingTop: 32,
    paddingBottom: 32,
    paddingRight: 50,
  });
  act(() => root.unmount());
});
