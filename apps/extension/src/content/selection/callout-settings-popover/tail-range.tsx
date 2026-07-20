import { translate } from '../../../platform/i18n';
import { CalloutRangeControl } from './range-control';

export function CalloutTailSizeRange(props: {
  onTailSizeChange: (value: number) => void;
  tailSize: number;
}) {
  return (
    <CalloutRangeControl
      label={translate('content.callout.tailSizeLabelPrefix')}
      min={4}
      max={20}
      step={1}
      value={props.tailSize}
      values={['4', '12', '20']}
      onChange={(value) => props.onTailSizeChange(Math.max(4, Math.min(20, value)))}
    />
  );
}
