import type React from 'react';

import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { EditorInspectorFrameBackgroundImageActions } from './image-actions';
import { EditorInspectorFrameBackgroundImageMode } from './image-mode';

type EditorInspectorFrameBackgroundImageEditorProps = {
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  frameBackgroundImageFitOptions: Array<{
    value: EditorFrameSettings['backgroundImageFit'];
    label: string;
  }>;
  frameDraft: EditorFrameSettings;
  onClearBackgroundImage: () => void;
  onPickBackgroundImage: () => void;
};

export function EditorInspectorFrameBackgroundImageEditor(
  props: EditorInspectorFrameBackgroundImageEditorProps
): React.ReactElement {
  const {
    applyFramePatch,
    frameBackgroundImageFitOptions,
    frameDraft,
    onClearBackgroundImage,
    onPickBackgroundImage,
  } = props;

  return (
    <div className="space-y-3">
      <EditorInspectorFrameBackgroundImageActions
        hasImage={Boolean(frameDraft.backgroundImageData)}
        onClearBackgroundImage={onClearBackgroundImage}
        onPickBackgroundImage={onPickBackgroundImage}
      />
      <EditorInspectorFrameBackgroundImageMode
        applyFramePatch={applyFramePatch}
        frameBackgroundImageFitOptions={frameBackgroundImageFitOptions}
        frameDraft={frameDraft}
      />
    </div>
  );
}
