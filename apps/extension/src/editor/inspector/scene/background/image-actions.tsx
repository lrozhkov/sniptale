import type React from 'react';
import { ImageUp, Trash2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { secondaryPanelButtonClassName } from '../shared';

type EditorInspectorFrameBackgroundImageActionsProps = {
  hasImage: boolean;
  onClearBackgroundImage: () => void;
  onPickBackgroundImage: () => void;
};

export function EditorInspectorFrameBackgroundImageActions(
  props: EditorInspectorFrameBackgroundImageActionsProps
): React.ReactElement {
  const { hasImage, onClearBackgroundImage, onPickBackgroundImage } = props;

  return (
    <div className="grid grid-cols-1 gap-2">
      <button
        type="button"
        className={`${secondaryPanelButtonClassName} gap-2`}
        onClick={onPickBackgroundImage}
      >
        <ImageUp size={16} strokeWidth={2} />
        {hasImage ? translate('editor.scene.replaceImage') : translate('editor.scene.uploadImage')}
      </button>
      {hasImage ? (
        <button
          type="button"
          className={`${secondaryPanelButtonClassName} gap-2`}
          onClick={onClearBackgroundImage}
        >
          <Trash2 size={16} strokeWidth={2} />
          {translate('editor.scene.clearImage')}
        </button>
      ) : null}
    </div>
  );
}
