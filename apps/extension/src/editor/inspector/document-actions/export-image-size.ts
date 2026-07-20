import type React from 'react';
import { useEffect, useState } from 'react';
import type { EditorRenderedImageSize } from '../../document/model/render-options';
import { getAspectRatio, updateLockedDraft } from '../sidebar-shared';

function createSizeDraft(size: EditorRenderedImageSize): EditorRenderedImageSize {
  return {
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
  };
}

export interface EditorExportImageSizeState {
  draft: EditorRenderedImageSize;
  locked: boolean;
  setHeight: (value: number) => void;
  setLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setWidth: (value: number) => void;
}

export function useEditorExportImageSizeState(
  canvasSize: EditorRenderedImageSize
): EditorExportImageSizeState {
  const { height, width } = canvasSize;
  const [draft, setDraft] = useState(() => createSizeDraft(canvasSize));
  const [locked, setLocked] = useState(true);
  const aspectRatio = getAspectRatio(width, height);

  useEffect(() => {
    setDraft(createSizeDraft({ height, width }));
  }, [height, width]);

  return {
    draft,
    locked,
    setHeight: (value: number) =>
      setDraft((current) => updateLockedDraft(current, 'height', value, locked, aspectRatio)),
    setLocked,
    setWidth: (value: number) =>
      setDraft((current) => updateLockedDraft(current, 'width', value, locked, aspectRatio)),
  };
}
