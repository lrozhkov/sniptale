import { MAX_EDITOR_BACKGROUND_BLUR_AMOUNT } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { translate } from '../../../../platform/i18n';
import { EditorInspectorRangeField } from '../shared';

export function EditorInspectorBackgroundBlurControl(props: {
  frameDraft: EditorFrameSettings;
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
}) {
  return (
    <EditorInspectorRangeField
      label={translate('editor.scene.backgroundBlurAmount')}
      min={0}
      max={MAX_EDITOR_BACKGROUND_BLUR_AMOUNT}
      step={1}
      unit="px"
      value={props.frameDraft.backgroundBlurAmount}
      onChange={(backgroundBlurAmount) => props.applyFramePatch({ backgroundBlurAmount })}
    />
  );
}
