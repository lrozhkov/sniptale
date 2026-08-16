import {
  distributeGradientStops,
  removeGradientStop,
  reverseGradient,
  updateGradientStop,
  type Gradient,
  type PaintInterpolationSpace,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';
import { AlignHorizontalDistributeCenter, ArrowLeftRight, Trash2 } from 'lucide-react';
import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls';
import { GradientRail } from './gradient-rail';
import { translate } from '../../platform/i18n';
import { CompactSelect, NumericValueField } from '../compact-inspector-controls';

const withAngle = (gradient: Gradient, angle: number): Gradient =>
  gradient.type === 'linear' ? { ...gradient, angle } : gradient;
const withCenter = (gradient: Gradient, axis: 'x' | 'y', value: number): Gradient =>
  gradient.type === 'linear'
    ? gradient
    : { ...gradient, center: { ...gradient.center, [axis]: value } };
const withRadius = (gradient: Gradient, axis: 'x' | 'y', value: number): Gradient =>
  gradient.type === 'radial'
    ? { ...gradient, radius: { ...gradient.radius, [axis]: value } }
    : gradient;
const withStartAngle = (gradient: Gradient, startAngle: number): Gradient =>
  gradient.type === 'conic' ? { ...gradient, startAngle } : gradient;
const SECTION_CLASS_NAME = [
  'rounded-[10px] border p-2.5',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_54%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_62%,transparent)]',
].join(' ');

interface GradientControlsProps {
  gradient: Gradient;
  onChange: (gradient: Gradient) => void;
}

function GradientNumericField(props: {
  className?: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <NumericValueField
      className={`${props.className ?? 'w-full'} border-[color:var(--sniptale-color-border-soft)] bg-transparent`}
      label={props.label}
      max={props.max}
      min={props.min}
      value={props.value}
      onPreviewValue={props.onChange}
      onCommitValue={props.onChange}
    />
  );
}

function GradientPrimaryControls({
  gradient,
  selected,
  onChange,
  onSelectStop,
}: GradientControlsProps & {
  selected: Gradient['stops'][number];
  onSelectStop: (id: string) => void;
}) {
  const removeSelected = () => {
    const next = removeGradientStop(gradient, selected.id);
    onChange(next);
    const nextSelected = next.stops[0];
    if (nextSelected) onSelectStop(nextSelected.id);
  };
  return (
    <div className={`${SECTION_CLASS_NAME} grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2`}>
      <label className="min-w-0 text-[11px]">
        {translate('highlighter.paintPicker.position')}
        <div className="mt-1">
          <GradientNumericField
            label={translate('highlighter.paintPicker.position')}
            min={0}
            max={100}
            value={Math.round(selected.position * 100)}
            onChange={(value) =>
              onChange(
                updateGradientStop(gradient, selected.id, {
                  position: value / 100,
                })
              )
            }
          />
        </div>
      </label>
      <div className="flex items-center gap-1">
        <ProductGlassIconButton
          aria-label={translate('highlighter.paintPicker.reverse')}
          onClick={() => onChange(reverseGradient(gradient))}
          title={translate('highlighter.paintPicker.reverse')}
        >
          <ArrowLeftRight aria-hidden="true" size={14} />
        </ProductGlassIconButton>
        <ProductGlassIconButton
          aria-label={translate('highlighter.paintPicker.distribute')}
          onClick={() => onChange(distributeGradientStops(gradient))}
          title={translate('highlighter.paintPicker.distribute')}
        >
          <AlignHorizontalDistributeCenter aria-hidden="true" size={14} />
        </ProductGlassIconButton>
        <ProductGlassIconButton
          aria-label={translate('highlighter.paintPicker.removeStop')}
          disabled={gradient.stops.length <= 2}
          onClick={removeSelected}
          title={translate('highlighter.paintPicker.removeStop')}
        >
          <Trash2 aria-hidden="true" size={14} />
        </ProductGlassIconButton>
      </div>
    </div>
  );
}

function GradientGeometryControls({ gradient, onChange }: GradientControlsProps) {
  if (gradient.type === 'linear') {
    return (
      <div className={SECTION_CLASS_NAME}>
        <label className="grid min-w-0 grid-cols-[minmax(0,1fr)_6.25rem] items-center gap-3 text-[11px]">
          {translate('highlighter.paintPicker.angle')}
          <GradientNumericField
            className="!w-[6.25rem] min-w-0"
            label={translate('highlighter.paintPicker.angle')}
            value={gradient.angle}
            onChange={(value) => onChange(withAngle(gradient, value))}
          />
        </label>
      </div>
    );
  }

  return (
    <div className={[`${SECTION_CLASS_NAME} grid grid-cols-2 gap-2 text-[11px]`].join(' ')}>
      {(['x', 'y'] as const).map((axis) => (
        <label key={axis}>
          {translate(
            axis === 'x' ? 'highlighter.paintPicker.centerX' : 'highlighter.paintPicker.centerY'
          )}
          <div className="mt-1">
            <GradientNumericField
              label={translate(
                axis === 'x' ? 'highlighter.paintPicker.centerX' : 'highlighter.paintPicker.centerY'
              )}
              min={0}
              max={100}
              value={Math.round(gradient.center[axis] * 100)}
              onChange={(value) => onChange(withCenter(gradient, axis, value / 100))}
            />
          </div>
        </label>
      ))}
      {gradient.type === 'radial'
        ? (['x', 'y'] as const).map((axis) => (
            <label key={`radius-${axis}`}>
              {translate(
                axis === 'x' ? 'highlighter.paintPicker.radiusX' : 'highlighter.paintPicker.radiusY'
              )}
              <div className="mt-1">
                <GradientNumericField
                  label={translate(
                    axis === 'x'
                      ? 'highlighter.paintPicker.radiusX'
                      : 'highlighter.paintPicker.radiusY'
                  )}
                  value={Math.round(gradient.radius[axis] * 100)}
                  onChange={(value) => onChange(withRadius(gradient, axis, value / 100))}
                />
              </div>
            </label>
          ))
        : null}
      {gradient.type === 'conic' ? (
        <label className="col-span-2">
          {translate('highlighter.paintPicker.startAngle')}
          <div className="mt-1">
            <GradientNumericField
              label={translate('highlighter.paintPicker.startAngle')}
              value={gradient.startAngle}
              onChange={(value) => onChange(withStartAngle(gradient, value))}
            />
          </div>
        </label>
      ) : null}
    </div>
  );
}

function GradientAdvancedControls({
  gradient,
  selected,
  onChange,
}: GradientControlsProps & { selected: Gradient['stops'][number] }) {
  return (
    <details className={`${SECTION_CLASS_NAME} text-xs`}>
      <summary className="cursor-pointer font-semibold">
        {translate('highlighter.paintPicker.advanced')}
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label>
          {translate('highlighter.paintPicker.interpolation')}
          <CompactSelect
            aria-label={translate('highlighter.paintPicker.interpolation')}
            className="mt-1 h-8"
            value={gradient.interpolation}
            options={[
              { value: 'srgb', label: translate('highlighter.paintPicker.interpolationSrgb') },
              {
                value: 'srgb-linear',
                label: translate('highlighter.paintPicker.interpolationLinearSrgb'),
              },
              { value: 'oklab', label: translate('highlighter.paintPicker.interpolationOklab') },
              { value: 'oklch', label: translate('highlighter.paintPicker.interpolationOklch') },
            ]}
            onChange={(interpolation) =>
              onChange({
                ...gradient,
                interpolation: interpolation as PaintInterpolationSpace,
              })
            }
          />
        </label>
        <label>
          {translate('highlighter.paintPicker.midpoint')}
          <div className="mt-1">
            <GradientNumericField
              label={translate('highlighter.paintPicker.midpoint')}
              min={1}
              max={99}
              value={Math.round(selected.midpoint * 100)}
              onChange={(value) =>
                onChange(updateGradientStop(gradient, selected.id, { midpoint: value / 100 }))
              }
            />
          </div>
        </label>
        <label>
          {translate('highlighter.paintPicker.repeat')}
          <CompactSelect
            aria-label={translate('highlighter.paintPicker.repeat')}
            className="mt-1 h-8"
            value={gradient.repeat.enabled ? 'enabled' : 'disabled'}
            options={[
              {
                value: 'disabled',
                label: translate('highlighter.paintPicker.repeatDisabled'),
              },
              { value: 'enabled', label: translate('highlighter.paintPicker.repeatEnabled') },
            ]}
            onChange={(value) =>
              onChange({
                ...gradient,
                repeat: { ...gradient.repeat, enabled: value === 'enabled' },
              })
            }
          />
        </label>
        <label>
          {translate('highlighter.paintPicker.span')}
          <div className="mt-1">
            <GradientNumericField
              label={translate('highlighter.paintPicker.span')}
              min={1}
              max={100}
              value={Math.round(gradient.repeat.span * 100)}
              onChange={(value) =>
                onChange({
                  ...gradient,
                  repeat: { ...gradient.repeat, span: value / 100 },
                })
              }
            />
          </div>
        </label>
      </div>
    </details>
  );
}

export function GradientEditor(props: {
  createId: PaintStopIdFactory;
  gradient: Gradient;
  selectedStopId: string | null;
  onChange: (gradient: Gradient) => void;
  onSelectStop: (id: string) => void;
  showAdvancedControls?: boolean;
}) {
  const selected =
    props.gradient.stops.find((stop) => stop.id === props.selectedStopId) ??
    props.gradient.stops[0]!;
  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold">
            {translate('highlighter.paintPicker.gradientStops')}
          </span>
          <span className="text-[var(--sniptale-color-text-muted)]">
            {translate('highlighter.paintPicker.addStopHint')}
          </span>
        </div>
        <GradientRail {...props} onSelect={props.onSelectStop} />
      </div>
      <GradientPrimaryControls
        gradient={props.gradient}
        selected={selected}
        onChange={props.onChange}
        onSelectStop={props.onSelectStop}
      />
      <GradientGeometryControls gradient={props.gradient} onChange={props.onChange} />
      {props.showAdvancedControls !== false ? (
        <GradientAdvancedControls
          gradient={props.gradient}
          selected={selected}
          onChange={props.onChange}
        />
      ) : null}
    </div>
  );
}
