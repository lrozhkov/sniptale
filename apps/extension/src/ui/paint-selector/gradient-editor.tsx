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

const number = (value: string, fallback: number) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
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
const FIELD_CLASS_NAME = [
  'h-8 rounded-[8px] border px-2 text-xs outline-none transition',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_68%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_72%,transparent)]',
  'text-[var(--sniptale-color-text-primary)]',
  'focus:ring-2',
  'focus:border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_55%,var(--sniptale-color-border-soft))]',
  'focus:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]',
].join(' ');
const SECTION_CLASS_NAME = [
  'rounded-[10px] border p-2.5',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_54%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_62%,transparent)]',
].join(' ');

interface GradientControlsProps {
  gradient: Gradient;
  onChange: (gradient: Gradient) => void;
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
        <input
          className={`${FIELD_CLASS_NAME} mt-1 w-full`}
          type="number"
          min={0}
          max={100}
          value={Math.round(selected.position * 100)}
          onChange={(event) =>
            onChange(
              updateGradientStop(gradient, selected.id, {
                position: number(event.target.value, 0) / 100,
              })
            )
          }
        />
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
        <label className="flex items-center justify-between gap-3 text-[11px]">
          {translate('highlighter.paintPicker.angle')}
          <input
            className={`${FIELD_CLASS_NAME} w-20`}
            type="number"
            value={gradient.angle}
            onChange={(event) => onChange(withAngle(gradient, number(event.target.value, 0)))}
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
          <input
            className={`${FIELD_CLASS_NAME} mt-1 w-full`}
            type="number"
            min={0}
            max={100}
            value={Math.round(gradient.center[axis] * 100)}
            onChange={(event) =>
              onChange(withCenter(gradient, axis, number(event.target.value, 50) / 100))
            }
          />
        </label>
      ))}
      {gradient.type === 'radial'
        ? (['x', 'y'] as const).map((axis) => (
            <label key={`radius-${axis}`}>
              {translate(
                axis === 'x' ? 'highlighter.paintPicker.radiusX' : 'highlighter.paintPicker.radiusY'
              )}
              <input
                className={`${FIELD_CLASS_NAME} mt-1 w-full`}
                type="number"
                value={Math.round(gradient.radius[axis] * 100)}
                onChange={(event) =>
                  onChange(withRadius(gradient, axis, number(event.target.value, 50) / 100))
                }
              />
            </label>
          ))
        : null}
      {gradient.type === 'conic' ? (
        <label className="col-span-2">
          {translate('highlighter.paintPicker.startAngle')}
          <input
            className={`${FIELD_CLASS_NAME} mt-1 w-full`}
            type="number"
            value={gradient.startAngle}
            onChange={(event) => onChange(withStartAngle(gradient, number(event.target.value, 0)))}
          />
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
          <select
            className={`${FIELD_CLASS_NAME} mt-1 w-full`}
            value={gradient.interpolation}
            onChange={(event) =>
              onChange({
                ...gradient,
                interpolation: event.target.value as PaintInterpolationSpace,
              })
            }
          >
            <option value="srgb">{translate('highlighter.paintPicker.interpolationSrgb')}</option>
            <option value="srgb-linear">
              {translate('highlighter.paintPicker.interpolationLinearSrgb')}
            </option>
            <option value="oklab">{translate('highlighter.paintPicker.interpolationOklab')}</option>
            <option value="oklch">{translate('highlighter.paintPicker.interpolationOklch')}</option>
          </select>
        </label>
        <label>
          {translate('highlighter.paintPicker.midpoint')}
          <input
            className={`${FIELD_CLASS_NAME} mt-1 w-full`}
            type="number"
            min={1}
            max={99}
            value={Math.round(selected.midpoint * 100)}
            onChange={(event) =>
              onChange(
                updateGradientStop(gradient, selected.id, {
                  midpoint: number(event.target.value, 50) / 100,
                })
              )
            }
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={gradient.repeat.enabled}
            onChange={(event) =>
              onChange({
                ...gradient,
                repeat: { ...gradient.repeat, enabled: event.target.checked },
              })
            }
          />
          {translate('highlighter.paintPicker.repeat')}
        </label>
        <label>
          {translate('highlighter.paintPicker.span')}
          <input
            className={`${FIELD_CLASS_NAME} mt-1 w-full`}
            type="number"
            min={1}
            max={100}
            value={Math.round(gradient.repeat.span * 100)}
            onChange={(event) =>
              onChange({
                ...gradient,
                repeat: { ...gradient.repeat, span: number(event.target.value, 100) / 100 },
              })
            }
          />
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
