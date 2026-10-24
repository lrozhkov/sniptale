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
import { useState, type ReactNode } from 'react';
import {
  AlignHorizontalDistributeCenter,
  ArrowLeftRight,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls';
import { GradientRail } from './gradient-rail';
import { translate } from '../../platform/i18n';
import { CompactSelect } from '../compact-inspector-controls';
import { PickerNumberField } from '../color-selector/picker-number-field';
import { GradientCanvas } from './gradient-canvas';

const STOP_POSITION_ROW_CLASS_NAME = [
  'grid min-w-0 grid-cols-[minmax(0,1fr)_84px] items-center gap-1 text-[11px]',
  'leading-[14px] text-[var(--sniptale-color-text-secondary)]',
].join(' ');
const EDITOR_GRID_CLASS_NAME = [
  'grid min-w-0 grid-cols-[minmax(0,1fr)_280px] items-start gap-4 max-[680px]:grid-cols-1',
  'max-[680px]:gap-3',
].join(' ');
const ADVANCED_BUTTON_CLASS_NAME = [
  'h-7! min-h-7! w-7! rounded-[4px]! border-0! bg-transparent! p-0! shadow-none!',
  'text-[var(--sniptale-color-text-secondary)]! focus-visible:outline-1',
  'focus-visible:outline-offset-2',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]!',
].join(' ');

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
const ADVANCED_GRID_CLASS_NAME = [
  'min-w-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5',
  'border-t border-[var(--sniptale-color-border-soft)] pt-2 text-xs',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');
const COLOR_PANE_CLASS_NAME = [
  'min-w-0 max-[680px]:mx-auto max-[680px]:w-[280px] max-[680px]:max-w-full',
].join(' ');
const SELECT_CLASS_NAME = [
  'h-8! rounded-[4px]! px-2! text-xs! font-normal!',
  'focus-visible:border-[color:var(--sniptale-color-text-secondary)]!',
  'aria-expanded:border-[color:var(--sniptale-color-text-secondary)]!',
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
  unit?: string;
  disabled?: boolean;
  cyclic?: boolean;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className={props.className ?? 'w-full min-w-0'}>
      <PickerNumberField
        ariaLabel={props.label}
        {...(props.max === undefined ? {} : { max: props.max })}
        {...(props.min === undefined ? {} : { min: props.min })}
        {...(props.unit === undefined ? {} : { unit: props.unit })}
        {...(props.cyclic === undefined ? {} : { cyclic: props.cyclic })}
        value={props.value}
        disabled={props.disabled ?? false}
        onChange={(raw) => {
          if (raw.trim() === '') return;
          const value = Number(raw);
          if (!Number.isInteger(value)) return;
          if (props.cyclic) {
            props.onChange(((value % 360) + 360) % 360);
          } else if (
            (props.min === undefined || value >= props.min) &&
            (props.max === undefined || value <= props.max)
          ) {
            props.onChange(value);
          }
        }}
      />
    </div>
  );
}

function GradientPrimaryControls({
  gradient,
  selected,
  onChange,
  onSelectStop,
  createId,
  advancedButton,
  nameField,
  rail,
}: GradientControlsProps & {
  selected: Gradient['stops'][number];
  createId: PaintStopIdFactory;
  onSelectStop: (id: string) => void;
  advancedButton?: ReactNode;
  nameField?: ReactNode;
  rail: ReactNode;
}) {
  const selectedIndex = gradient.stops.findIndex((stop) => stop.id === selected.id) + 1;
  const removeSelected = () => {
    const next = removeGradientStop(gradient, selected.id);
    onChange(next);
    const nextSelected = next.stops[Math.max(0, selectedIndex - 2)];
    if (nextSelected) onSelectStop(nextSelected.id);
  };
  const buttonClass = [
    'h-7! min-h-7! w-6! rounded-[4px]! p-0! border-0! shadow-none! bg-transparent!',
    'text-[var(--sniptale-color-text-secondary)]! focus-visible:outline-1',
    'focus-visible:outline-offset-2',
    'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
    'hover:bg-[var(--sniptale-color-surface-hover)]!',
  ].join(' ');
  return (
    <div className="relative mt-2 min-w-0" data-ui="shared.ui.paint-selector.stop-controls">
      <div
        className="flex h-7 min-w-0 items-center justify-end gap-1"
        style={{ paddingRight: advancedButton ? 30 : 0 }}
        data-ui="shared.ui.paint-selector.stop-toolbar"
      >
        {nameField && (
          <div className="min-w-0 flex-1 [&_input]:h-7! [&_input]:min-w-0 [&_input]:w-full">
            {nameField}
          </div>
        )}
        <div className="flex shrink-0 items-center">
          <ProductGlassIconButton
            className={buttonClass}
            aria-label={translate('highlighter.paintPicker.addStop')}
            title={translate('highlighter.paintPicker.addStop')}
            disabled={gradient.stops.length >= MAX_GRADIENT_STOPS}
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
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
          </ProductGlassIconButton>
          <ProductGlassIconButton
            className={buttonClass}
            aria-label={translate('highlighter.paintPicker.reverse')}
            title={translate('highlighter.paintPicker.reverse')}
            onClick={() => onChange(reverseGradient(gradient))}
          >
            <ArrowLeftRight aria-hidden="true" size={16} strokeWidth={1.75} />
          </ProductGlassIconButton>
          <ProductGlassIconButton
            className={buttonClass}
            aria-label={translate('highlighter.paintPicker.distribute')}
            title={translate('highlighter.paintPicker.distribute')}
            onClick={() => onChange(distributeGradientStops(gradient))}
          >
            <AlignHorizontalDistributeCenter aria-hidden="true" size={16} strokeWidth={1.75} />
          </ProductGlassIconButton>
          <ProductGlassIconButton
            className={buttonClass}
            aria-label={translate('highlighter.paintPicker.removeStop')}
            title={translate('highlighter.paintPicker.removeStop')}
            disabled={gradient.stops.length <= 2}
            onClick={removeSelected}
          >
            <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
          </ProductGlassIconButton>
        </div>
      </div>
      {advancedButton && <div className="absolute right-0 top-0">{advancedButton}</div>}
      {rail}
      <div
        data-ui="shared.ui.paint-selector.selected-stop"
        className="mb-2 grid min-w-0 grid-cols-[minmax(0,1fr)_132px] items-center gap-2"
      >
        <CompactSelect
          aria-label={`${translate('highlighter.paintPicker.gradientStop')} ${selectedIndex}/${gradient.stops.length}`}
          value={selected.id}
          options={gradient.stops.map((stop, index) => ({
            value: stop.id,
            label: translate('highlighter.paintPicker.pointCount')
              .replace('{index}', String(index + 1))
              .replace('{total}', String(gradient.stops.length)),
            icon: (
              <span
                aria-hidden="true"
                className="block h-3 w-3 rounded-[2px] shadow-[inset_0_0_0_1px_#7776]"
                style={{ backgroundColor: stop.color }}
              />
            ),
          }))}
          onChange={onSelectStop}
          className={SELECT_CLASS_NAME}
        />
        <label className={STOP_POSITION_ROW_CLASS_NAME}>
          {translate('highlighter.paintPicker.position')}
          <GradientNumericField
            label={translate('highlighter.paintPicker.position')}
            unit="%"
            min={0}
            max={100}
            value={Math.round(selected.position * 100)}
            onChange={(value) =>
              onChange(updateGradientStop(gradient, selected.id, { position: value / 100 }))
            }
          />
        </label>
      </div>
    </div>
  );
}

function GradientGeometryControls({ gradient, onChange }: GradientControlsProps) {
  const rowClass = [
    'grid min-h-8 min-w-0 grid-cols-[minmax(0,1fr)_84px] items-center gap-1 text-[11px]',
    'leading-[14px] text-[var(--sniptale-color-text-secondary)]',
  ].join(' ');
  const angleField = (start: boolean) => (
    <label className={rowClass}>
      {translate(start ? 'highlighter.paintPicker.startAngle' : 'highlighter.paintPicker.angle')}
      <GradientNumericField
        label={translate(
          start ? 'highlighter.paintPicker.startAngle' : 'highlighter.paintPicker.angle'
        )}
        min={0}
        max={359}
        cyclic
        unit="°"
        value={
          gradient.type === 'linear'
            ? gradient.angle
            : gradient.type === 'conic'
              ? gradient.startAngle
              : 0
        }
        onChange={(value) =>
          onChange(start ? withStartAngle(gradient, value) : withAngle(gradient, value))
        }
      />
    </label>
  );
  return (
    <div
      className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1.5"
      data-ui="shared.ui.paint-selector.geometry"
    >
      {gradient.type === 'linear' ? (
        angleField(false)
      ) : (
        <>
          {gradient.type === 'conic' && (
            <div className="col-span-2 w-[calc((100%-12px)/2)]">{angleField(true)}</div>
          )}
          {(['x', 'y'] as const).map((axis) => (
            <label key={axis} className={rowClass}>
              {translate(
                axis === 'x' ? 'highlighter.paintPicker.centerX' : 'highlighter.paintPicker.centerY'
              )}
              <GradientNumericField
                label={translate(
                  axis === 'x'
                    ? 'highlighter.paintPicker.centerX'
                    : 'highlighter.paintPicker.centerY'
                )}
                unit="%"
                min={0}
                max={100}
                value={Math.round(gradient.center[axis] * 100)}
                onChange={(value) => onChange(withCenter(gradient, axis, value / 100))}
              />
            </label>
          ))}
          {gradient.type === 'radial' &&
            (['x', 'y'] as const).map((axis) => (
              <label key={axis} className={rowClass}>
                {translate(
                  axis === 'x'
                    ? 'highlighter.paintPicker.radiusX'
                    : 'highlighter.paintPicker.radiusY'
                )}
                <GradientNumericField
                  label={translate(
                    axis === 'x'
                      ? 'highlighter.paintPicker.radiusX'
                      : 'highlighter.paintPicker.radiusY'
                  )}
                  unit="%"
                  min={1}
                  max={100}
                  value={Math.round(gradient.radius[axis] * 100)}
                  onChange={(value) => onChange(withRadius(gradient, axis, value / 100))}
                />
              </label>
            ))}
        </>
      )}
    </div>
  );
}

function GradientAdvancedControls({
  gradient,
  selected,
  onChange,
}: GradientControlsProps & { selected: Gradient['stops'][number] }) {
  return (
    <div className={ADVANCED_GRID_CLASS_NAME}>
      <label className="grid min-w-0 grid-rows-[16px_32px] gap-[3px]">
        {translate('highlighter.paintPicker.interpolation')}
        <CompactSelect<PaintInterpolationSpace>
          aria-label={translate('highlighter.paintPicker.interpolation')}
          className={SELECT_CLASS_NAME}
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
              interpolation,
            })
          }
        />
      </label>
      <label className="grid min-w-0 grid-rows-[16px_32px] gap-[3px]">
        {translate('highlighter.paintPicker.midpoint')}
        <div className="min-w-0">
          <GradientNumericField
            label={translate('highlighter.paintPicker.midpoint')}
            unit="%"
            min={1}
            max={99}
            disabled={selected.id === gradient.stops.at(-1)?.id}
            value={Math.round(selected.midpoint * 100)}
            onChange={(value) =>
              onChange(updateGradientStop(gradient, selected.id, { midpoint: value / 100 }))
            }
          />
        </div>
      </label>
      <label className="grid min-w-0 grid-rows-[16px_32px] gap-[3px]">
        {translate('highlighter.paintPicker.repeat')}
        <CompactSelect
          aria-label={translate('highlighter.paintPicker.repeat')}
          className={SELECT_CLASS_NAME}
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
      <label className="grid min-w-0 grid-rows-[16px_32px] gap-[3px]">
        {translate('highlighter.paintPicker.span')}
        <div className="min-w-0">
          <GradientNumericField
            label={translate('highlighter.paintPicker.span')}
            unit="%"
            min={1}
            max={100}
            disabled={!gradient.repeat.enabled}
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
  );
}

export function GradientEditor(props: {
  colorEditor: ReactNode;
  nameField?: ReactNode;
  typeControls?: ReactNode;
  colorHeading?: ReactNode;
  compact?: boolean;
  createId: PaintStopIdFactory;
  gradient: Gradient;
  selectedStopId: string | null;
  onChange: (gradient: Gradient) => void;
  onSelectStop: (id: string) => void;
  showAdvancedControls?: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const selected =
    props.gradient.stops.find((stop) => stop.id === props.selectedStopId) ??
    props.gradient.stops[0]!;
  return (
    <div
      className={EDITOR_GRID_CLASS_NAME}
      data-ui="shared.ui.paint-selector.gradient-editor"
      data-compact={props.compact || undefined}
    >
      <div className="min-w-0">
        {props.typeControls && <div className="mb-2 empty:hidden">{props.typeControls}</div>}
        <GradientCanvas
          gradient={props.gradient}
          onChange={props.onChange}
          compact={props.compact ?? false}
        />
        <GradientPrimaryControls
          createId={props.createId}
          gradient={props.gradient}
          selected={selected}
          onChange={props.onChange}
          onSelectStop={props.onSelectStop}
          rail={<GradientRail {...props} onSelect={props.onSelectStop} />}
          nameField={props.nameField}
          advancedButton={
            props.showAdvancedControls !== false ? (
              <ProductGlassIconButton
                className={ADVANCED_BUTTON_CLASS_NAME}
                aria-label={translate('highlighter.paintPicker.advanced')}
                title={translate('highlighter.paintPicker.advanced')}
                aria-expanded={advanced}
                onClick={() => setAdvanced(!advanced)}
              >
                <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={1.75} />
              </ProductGlassIconButton>
            ) : null
          }
        />
        <GradientGeometryControls gradient={props.gradient} onChange={props.onChange} />
        {props.showAdvancedControls !== false && advanced && (
          <GradientAdvancedControls
            gradient={props.gradient}
            selected={selected}
            onChange={props.onChange}
          />
        )}
      </div>
      <div className={[COLOR_PANE_CLASS_NAME, props.compact ? 'pb-3' : ''].join(' ')}>
        <p className="m-0 mb-1.5 text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
          {props.colorHeading ??
            translate('highlighter.paintPicker.pointColor').replace(
              '{index}',
              String(props.gradient.stops.findIndex((stop) => stop.id === selected.id) + 1)
            )}
        </p>
        {props.colorEditor}
      </div>
    </div>
  );
}
