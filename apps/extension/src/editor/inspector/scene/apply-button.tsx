import { translate } from '../../../platform/i18n';
import { FileActionRow } from '../../chrome/ui';

export function FrameApplyButton(props: { onApplyFrame: () => void }) {
  return (
    <FileActionRow onClick={props.onApplyFrame}>
      {translate('editor.scene.applyButton')}
    </FileActionRow>
  );
}
