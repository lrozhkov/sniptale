import { useRef, type Dispatch, type SetStateAction } from 'react';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { normalizeEditorFrameSettings } from '../../../features/editor/document/constants';

/** Only completed inspector edits reach the scene/history owner; previews stay in controls. */
export function useCommittedFrameDraft(args: {
  frame: EditorFrameSettings;
  setDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  apply(frame: EditorFrameSettings): void;
}): Dispatch<SetStateAction<EditorFrameSettings>> {
  const current = useRef(args.frame);
  current.current = args.frame;
  return (update) => {
    const next = normalizeEditorFrameSettings(
      typeof update === 'function' ? update(current.current) : update
    );
    args.apply(next);
    current.current = next;
    args.setDraft(next);
  };
}
