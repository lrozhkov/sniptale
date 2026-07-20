import { translate } from '../../../../platform/i18n';
import { NumericRow } from '../../../chrome/ui';
import type { TextControlsProps } from './types';

export function renderTextSizeControl(props: TextControlsProps, fontSize: number) {
  return (
    <NumericRow
      label={translate('editor.compact.fontSize')}
      value={fontSize}
      unit="px"
      min={10}
      max={48}
      onPreviewValue={(fontSize) => props.previewTextPatch({ fontSize })}
      onCommitValue={(fontSize) => {
        props.previewTextPatch({ fontSize });
        props.commitPendingSelectionSettings();
      }}
      scrub={{ min: 10, max: 48 }}
    />
  );
}
