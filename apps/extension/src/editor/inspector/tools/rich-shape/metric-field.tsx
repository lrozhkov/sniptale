import { translate } from '../../../../platform/i18n';
import { RangeField } from './fields';

type RichShapeMetric =
  | 'blur'
  | 'distance'
  | 'fillWeight'
  | 'hachureAngle'
  | 'hachureGap'
  | 'shadowAngle';

const RICH_SHAPE_METRIC_CONFIG = {
  blur: {
    labelKey: 'editor.compact.richShapeBlur',
    max: 64,
    min: 0,
    step: 1,
    unit: 'rounded-pixels',
  },
  distance: {
    labelKey: 'editor.compact.richShapeDistance',
    max: 64,
    min: 0,
    step: 1,
    unit: 'rounded-pixels',
  },
  fillWeight: {
    labelKey: 'editor.compact.richShapeFillWeight',
    max: 8,
    min: 0.1,
    step: 0.1,
    unit: 'decimal-pixels',
  },
  hachureAngle: {
    labelKey: 'editor.compact.richShapeHachureAngle',
    max: 180,
    min: -180,
    step: 1,
    unit: 'degrees',
  },
  hachureGap: {
    labelKey: 'editor.compact.richShapeHachureGap',
    max: 48,
    min: 0,
    step: 1,
    unit: 'rounded-pixels',
  },
  shadowAngle: {
    labelKey: 'editor.compact.richShapeGradientAngle',
    max: 360,
    min: 0,
    step: 1,
    unit: 'degrees',
  },
} as const;

export function RichShapeMetricField(props: {
  metric: RichShapeMetric;
  onChange: (value: number) => void;
  value: number;
}) {
  const config = resolveMetricConfig(props.metric, props.value);
  return <RangeField {...config} value={props.value} onChange={props.onChange} />;
}

function resolveMetricConfig(metric: RichShapeMetric, value: number) {
  const config = RICH_SHAPE_METRIC_CONFIG[metric];
  return {
    label: translate(config.labelKey),
    max: config.max,
    min: config.min,
    step: config.step,
    valueLabel: formatMetricValue(value, config.unit),
  };
}

function formatMetricValue(
  value: number,
  unit: (typeof RICH_SHAPE_METRIC_CONFIG)[RichShapeMetric]['unit']
): string {
  switch (unit) {
    case 'degrees':
      return `${Math.round(value)}°`;
    case 'rounded-pixels':
      return `${Math.round(value)}px`;
    case 'decimal-pixels':
      return `${value.toFixed(1)}px`;
  }
}
