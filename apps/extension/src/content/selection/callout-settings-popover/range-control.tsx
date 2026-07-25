import { ProductGlassRange, ProductGlassSectionLabel } from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';

export function CalloutRangeControl(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <div className="sniptale-content-popover-range-field">
      <ProductGlassSectionLabel>
        {props.label} {props.value}
        {translate('content.callout.unitPxSuffix')}
      </ProductGlassSectionLabel>
      <ProductGlassRange
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}
