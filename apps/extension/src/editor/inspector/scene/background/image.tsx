import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  BackgroundImagePicker,
  backgroundActionClassName,
} from '../../../../composition/background-resources/picker';
import { blobToDataUrl } from '../../../../platform/media-utils/data-url';
import type React from 'react';
import { translate } from '../../../../platform/i18n';

import type { EditorFrameSettings } from '../../../../features/editor/document/types';
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
  const { applyFramePatch, frameBackgroundImageFitOptions, frameDraft, onClearBackgroundImage } =
    props;

  return (
    <div className="space-y-2">
      {frameDraft.backgroundImageData ? (
        <img
          src={frameDraft.backgroundImageData}
          alt={translate('editor.compact.frameBackgroundModeImage')}
          className="h-28 w-full rounded-[4px] border border-[var(--sniptale-color-border-soft)] object-contain"
        />
      ) : null}
      <BackgroundImagePicker
        onSelect={async ({ file }, signal) => {
          const backgroundImageData = await blobToDataUrl(file);
          signal.throwIfAborted();
          applyFramePatch({ backgroundImageData, backgroundMode: 'image' });
        }}
      />
      {frameDraft.backgroundImageData && (
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          className={backgroundActionClassName}
          onClick={onClearBackgroundImage}
        >
          {translate('editor.scene.clearImage')}
        </ProductActionButton>
      )}
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
