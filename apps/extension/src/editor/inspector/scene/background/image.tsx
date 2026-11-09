import { BackgroundImagePicker } from '../../../../composition/background-resources/picker';
import { blobToDataUrl } from '../../../../platform/media-utils/data-url';
import type React from 'react';

import type { EditorFrameSettings } from '../../../../features/editor/document/types';

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
  const { applyFramePatch } = props;

  return (
    <div className="space-y-2">
      <BackgroundImagePicker
        onSelect={async ({ file }, signal) => {
          const backgroundImageData = await blobToDataUrl(file);
          signal.throwIfAborted();
          applyFramePatch({ backgroundImageData, backgroundMode: 'image' });
        }}
      />
    </div>
  );
}
