import { MAX_EDITOR_BACKGROUND_BLUR_AMOUNT } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { translate } from '../../../../platform/i18n';
import { NumericRow } from '../../../chrome/ui';

export function EditorInspectorBackgroundBlurControl(props: {
  frameDraft: EditorFrameSettings;
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
}) {
  return (
    <NumericRow
      label={translate('editor.scene.backgroundBlurAmount')}
      min={0}
      max={MAX_EDITOR_BACKGROUND_BLUR_AMOUNT}
      precision={0}
      step={1}
      unit="px"
      value={props.frameDraft.backgroundBlurAmount}
      onPreviewValue={(backgroundBlurAmount) => props.applyFramePatch({ backgroundBlurAmount })}
      onCommitValue={(backgroundBlurAmount) => props.applyFramePatch({ backgroundBlurAmount })}
      scrub={{ min: 0, max: MAX_EDITOR_BACKGROUND_BLUR_AMOUNT, step: 1 }}
    />
  );
}
