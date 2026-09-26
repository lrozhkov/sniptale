import type React from 'react';
import { translate } from '../../../../platform/i18n';

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
      {frameDraft.backgroundImageData ? (
        <img
          src={frameDraft.backgroundImageData}
          alt={translate('editor.compact.frameBackgroundModeImage')}
          className="h-28 w-full rounded-lg border border-[var(--sniptale-color-border-soft)] object-contain"
        />
      ) : null}
      <EditorInspectorFrameBackgroundImageActions
        hasImage={Boolean(frameDraft.backgroundImageData)}
        onClearBackgroundImage={onClearBackgroundImage}
        onPickBackgroundImage={onPickBackgroundImage}
      />
      {frameDraft.backgroundImageData ? (
        <EditorInspectorFrameBackgroundImageMode
          applyFramePatch={applyFramePatch}
          frameBackgroundImageFitOptions={frameBackgroundImageFitOptions}
          frameDraft={frameDraft}
        />
      ) : null}
    </div>
  );
}
