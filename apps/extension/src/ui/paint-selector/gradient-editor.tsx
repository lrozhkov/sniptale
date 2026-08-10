import {
  distributeGradientStops,
  reverseGradient,
  updateGradientStop,
  type Gradient,
  type PaintInterpolationSpace,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';
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
const FIELD_CLASS_NAME =
  'h-8 rounded-[7px] border border-[var(--sniptale-color-border-soft)] bg-transparent px-2 text-xs';

interface GradientControlsProps {
  gradient: Gradient;
  onChange: (gradient: Gradient) => void;
}

function GradientPrimaryControls({
  gradient,
  selected,
  onChange,
}: GradientControlsProps & { selected: Gradient['stops'][number] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="text-[11px]">
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
      <button
        type="button"
        className={`${FIELD_CLASS_NAME} mt-4`}
        onClick={() => onChange(reverseGradient(gradient))}
      >
        {translate('highlighter.paintPicker.reverse')}
      </button>
      <button
        type="button"
        className={`${FIELD_CLASS_NAME} mt-4`}
        onClick={() => onChange(distributeGradientStops(gradient))}
      >
        {translate('highlighter.paintPicker.distribute')}
      </button>
    </div>
  );
}

function GradientGeometryControls({ gradient, onChange }: GradientControlsProps) {
  if (gradient.type === 'linear') {
    return (
      <label className="block text-[11px]">
        {translate('highlighter.paintPicker.angle')}
        <input
          className={`${FIELD_CLASS_NAME} ml-2 w-20`}
          type="number"
          value={gradient.angle}
          onChange={(event) => onChange(withAngle(gradient, number(event.target.value, 0)))}
        />
      </label>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 text-[11px]">
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
    </div>
  );
}

function GradientTypeAdvancedFields({ gradient, onChange }: GradientControlsProps) {
  if (gradient.type === 'radial') {
    return (
      <>
        {(['x', 'y'] as const).map((axis) => (
          <label key={axis}>
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
        ))}
      </>
    );
  }

  return gradient.type === 'conic' ? (
    <label>
      {translate('highlighter.paintPicker.startAngle')}
      <input
        className={`${FIELD_CLASS_NAME} mt-1 w-full`}
        type="number"
        value={gradient.startAngle}
        onChange={(event) => onChange(withStartAngle(gradient, number(event.target.value, 0)))}
      />
    </label>
  ) : null;
}

function GradientAdvancedControls({
  gradient,
  selected,
  onChange,
}: GradientControlsProps & { selected: Gradient['stops'][number] }) {
  return (
    <details className="rounded-[9px] border border-[var(--sniptale-color-border-soft)] p-2 text-xs">
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
        <GradientTypeAdvancedFields gradient={gradient} onChange={onChange} />
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
}) {
  const selected =
    props.gradient.stops.find((stop) => stop.id === props.selectedStopId) ??
    props.gradient.stops[0]!;
  return (
    <div className="min-w-0 space-y-3">
      <GradientRail {...props} onSelect={props.onSelectStop} />
      <GradientPrimaryControls
        gradient={props.gradient}
        selected={selected}
        onChange={props.onChange}
      />
      <GradientGeometryControls gradient={props.gradient} onChange={props.onChange} />
      <GradientAdvancedControls
        gradient={props.gradient}
        selected={selected}
        onChange={props.onChange}
      />
    </div>
  );
}
