import {
  addGradientStop,
  MAX_GRADIENT_STOPS,
  distributeGradientStops,
  removeGradientStop,
  reverseGradient,
  updateGradientStop,
  type Gradient,
  type PaintInterpolationSpace,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';
import type { ReactNode } from 'react';
import { AlignHorizontalDistributeCenter, ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
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
const SECTION_CLASS_NAME = 'min-w-0';

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
      className={[
        props.className ?? 'w-full',
        'h-7! min-w-0 rounded-[var(--sniptale-radius-sm)]!',
        'border-[color:var(--sniptale-color-border-soft)] bg-transparent',
      ].join(' ')}
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
  createId,
}: GradientControlsProps & {
  selected: Gradient['stops'][number];
  createId: PaintStopIdFactory;
  onSelectStop: (id: string) => void;
}) {
  const selectedIndex = gradient.stops.findIndex((stop) => stop.id === selected.id) + 1;
  const removeSelected = () => {
    const next = removeGradientStop(gradient, selected.id);
    onChange(next);
    const nextSelected = next.stops[0];
    if (nextSelected) onSelectStop(nextSelected.id);
  };
  return (
    <div
      className={`${SECTION_CLASS_NAME} space-y-1.5`}
      data-ui="shared.ui.paint-selector.stop-controls"
    >
      <div
        className="flex min-w-0 items-center gap-2 text-xs font-medium"
        data-ui="shared.ui.paint-selector.selected-stop"
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 rounded border border-[var(--sniptale-color-border-strong)]"
          style={{ backgroundColor: selected.color }}
        />
        <span className="min-w-0 truncate">
          {translate('highlighter.paintPicker.gradientStop')} {selectedIndex}/
          {gradient.stops.length}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          {translate('highlighter.paintPicker.position')}
          <div className="min-w-0 flex-1">
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
        <div className="flex shrink-0 items-center gap-1">
          <ProductGlassIconButton
            className="h-7! w-7!"
            aria-label={translate('highlighter.paintPicker.addStop')}
            disabled={gradient.stops.length >= MAX_GRADIENT_STOPS}
            title={translate('highlighter.paintPicker.addStop')}
            onClick={() => {
              const neighbor = gradient.stops.find((stop) => stop.position > selected.position);
              const position = neighbor
                ? (selected.position + neighbor.position) / 2
                : selected.position / 2;
              const next = addGradientStop(gradient, position, createId);
              const added = next.stops.find(
                (stop) => !gradient.stops.some((old) => old.id === stop.id)
              );
              onChange(next);
              if (added) onSelectStop(added.id);
            }}
          >
            <Plus aria-hidden="true" size={14} />
          </ProductGlassIconButton>
          <ProductGlassIconButton
            className="h-7! w-7!"
            aria-label={translate('highlighter.paintPicker.reverse')}
            onClick={() => onChange(reverseGradient(gradient))}
            title={translate('highlighter.paintPicker.reverse')}
          >
            <ArrowLeftRight aria-hidden="true" size={14} />
          </ProductGlassIconButton>
          <ProductGlassIconButton
            className="h-7! w-7!"
            aria-label={translate('highlighter.paintPicker.distribute')}
            onClick={() => onChange(distributeGradientStops(gradient))}
            title={translate('highlighter.paintPicker.distribute')}
          >
            <AlignHorizontalDistributeCenter aria-hidden="true" size={14} />
          </ProductGlassIconButton>
          <ProductGlassIconButton
            className="h-7! w-7!"
            aria-label={translate('highlighter.paintPicker.removeStop')}
            disabled={gradient.stops.length <= 2}
            onClick={removeSelected}
            title={translate('highlighter.paintPicker.removeStop')}
          >
            <Trash2 aria-hidden="true" size={14} />
          </ProductGlassIconButton>
        </div>
      </div>
    </div>
  );
}

function GradientGeometryControls({ gradient, onChange }: GradientControlsProps) {
  if (gradient.type === 'linear') {
    return (
      <div className={SECTION_CLASS_NAME}>
        <label className="grid min-w-0 grid-cols-[minmax(0,1fr)_6.25rem] items-center gap-2 text-xs">
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
    <div className={`${SECTION_CLASS_NAME} grid grid-cols-2 gap-1.5 text-xs`}>
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
    <details
      className={`${SECTION_CLASS_NAME} border-t border-[var(--sniptale-color-border-soft)] pt-1 text-xs`}
    >
      <summary className="cursor-pointer py-1 font-semibold">
        {translate('highlighter.paintPicker.advanced')}
      </summary>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
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
  colorEditor: ReactNode;
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
    <div className="min-w-0 space-y-1.5">
      <GradientPrimaryControls
        createId={props.createId}
        gradient={props.gradient}
        selected={selected}
        onChange={props.onChange}
        onSelectStop={props.onSelectStop}
      />
      <div>
        <GradientRail {...props} onSelect={props.onSelectStop} />
      </div>
      {props.colorEditor}
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
