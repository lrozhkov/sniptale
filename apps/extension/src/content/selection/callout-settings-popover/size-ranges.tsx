import { translate } from '../../../platform/i18n';
import { CalloutRangeControl } from './range-control';

export function CalloutFontSizeRange(props: {
  fontSize: number;
  onFontSizeChange: (value: number) => void;
}) {
  return (
    <CalloutRangeControl
      label={translate('content.callout.fontSizeLabelPrefix')}
      min={10}
      max={36}
      step={1}
      value={props.fontSize}
      values={['10', '18', '36']}
      onChange={(value) => props.onFontSizeChange(Math.max(10, Math.min(36, value)))}
    />
  );
}

export function CalloutMaxWidthRange(props: {
  maxWidth: number;
  onMaxWidthChange: (value: number) => void;
}) {
  return (
    <CalloutRangeControl
      label={translate('content.callout.maxWidthLabelPrefix')}
      min={100}
      max={500}
      step={50}
      value={props.maxWidth}
      values={['100', '300', '500']}
      onChange={(value) => props.onMaxWidthChange(Math.max(100, Math.min(500, value)))}
    />
  );
}
