import type React from 'react';

import { translate } from '../../../../platform/i18n';
import { ColorField } from '../../../chrome/ui';
import { EditorInspectorFrameBackgroundGradientEditor } from './gradient';
import { EditorInspectorFrameBackgroundImageEditor } from './image';
import type { EditorInspectorFrameBackgroundEditorProps } from './shared';

export function EditorInspectorFrameBackgroundFillEditor(
  props: EditorInspectorFrameBackgroundEditorProps
): React.ReactElement {
  if (props.frameDraft.backgroundMode === 'gradient') {
    return <EditorInspectorFrameBackgroundGradientEditor {...props} />;
  }

  if (props.frameDraft.backgroundMode === 'image') {
    return <EditorInspectorFrameBackgroundImageEditor {...props} />;
  }

  return (
    <ColorField
      title={translate('editor.scene.sceneBackgroundTitle')}
      label={translate('editor.scene.sceneBackgroundLabel')}
      value={props.frameDraft.backgroundColor}
      recentColors={props.recentColors}
      palette={props.frameBackgroundPalette}
      onChange={(color) => props.applyFramePatch({ backgroundColor: color })}
      onPreviewChange={(color) => props.previewFramePatch({ backgroundColor: color })}
      onPreviewReset={(color) => props.previewFramePatch({ backgroundColor: color })}
    />
  );
}
