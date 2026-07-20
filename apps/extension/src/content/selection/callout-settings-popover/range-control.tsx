import {
  ProductGlassRange,
  ProductGlassRangeMeta,
  ProductGlassSectionLabel,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';

export function CalloutRangeControl(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
  values: [string, string, string];
}) {
  return (
    <div>
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
      <ProductGlassRangeMeta>
        <span>{props.values[0]}</span>
        <span>{props.values[1]}</span>
        <span>{props.values[2]}</span>
      </ProductGlassRangeMeta>
    </div>
  );
}
