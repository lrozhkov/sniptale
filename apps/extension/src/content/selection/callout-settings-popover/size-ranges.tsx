import { translate } from '../../../platform/i18n';
import {
  clampCalloutMaxWidth,
  MAX_CALLOUT_MAX_WIDTH,
  MIN_CALLOUT_MAX_WIDTH,
} from '../callout/width-constraints';
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
      min={MIN_CALLOUT_MAX_WIDTH}
      max={MAX_CALLOUT_MAX_WIDTH}
      step={50}
      value={props.maxWidth}
      onChange={(value) => props.onMaxWidthChange(clampCalloutMaxWidth(value))}
    />
  );
}
