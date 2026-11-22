import { Link2, Unlink2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ProductGlassIconButton } from './buttons';

export interface ProductGlassLinkedPaddingValue {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type PaddingSide = keyof ProductGlassLinkedPaddingValue;
type PaddingAxis = 'horizontal' | 'vertical';

const PADDING_SIDES: PaddingSide[] = ['top', 'right', 'bottom', 'left'];
const AXIS_SIDES = {
  horizontal: ['left', 'right'],
  vertical: ['top', 'bottom'],
} as const satisfies Record<PaddingAxis, readonly [PaddingSide, PaddingSide]>;

function areSidesEqual(padding: ProductGlassLinkedPaddingValue, sides: readonly PaddingSide[]) {
  const first = sides[0];
  return first !== undefined && sides.every((side) => padding[side] === padding[first]);
}

function arePaddingValuesEqual(
  left: ProductGlassLinkedPaddingValue,
  right: ProductGlassLinkedPaddingValue
) {
  return PADDING_SIDES.every((side) => left[side] === right[side]);
}

export interface ProductGlassLinkedPaddingFieldsProps {
  /** Stack labels above full-width controls in narrow inspectors. */
  fieldLayout?: 'inline' | 'stacked' | 'full-row';
  labels: Record<PaddingSide, string> & {
    padding: string;
    link: string;
    unlink: string;
  };
  onChange: (padding: ProductGlassLinkedPaddingValue) => void;
  /** Preview linked values without accepting the edit. */
  onPreviewChange?: ((padding: ProductGlassLinkedPaddingValue) => void) | undefined;
  padding: ProductGlassLinkedPaddingValue;
  renderUniformField?: (props: {
    onChange: (value: number) => void;
    onPreview?: ((value: number) => void) | undefined;
    value: number;
  }) => ReactNode;
  renderValueField: (props: {
    compact: boolean;
    label: string;
    onChange: (value: number) => void;
    onPreview?: ((value: number) => void) | undefined;
    side: PaddingSide;
    value: number;
  }) => ReactNode;
}

function LinkToggle(props: {
  linked: boolean;
  name: 'all' | PaddingAxis;
  onClick: () => void;
  labels: ProductGlassLinkedPaddingFieldsProps['labels'];
}) {
  const label = props.linked ? props.labels.unlink : props.labels.link;
  return (
    <ProductGlassIconButton
      active={props.linked}
      aria-label={label}
      aria-pressed={props.linked}
      className="h-7 w-7 shrink-0"
      data-padding-link={props.name}
      onClick={props.onClick}
      title={label}
    >
      {props.linked ? (
        <Link2 aria-hidden="true" size={14} />
      ) : (
        <Unlink2 aria-hidden="true" size={14} />
      )}
    </ProductGlassIconButton>
  );
}

function FullPaddingRow({
  label,
  hoverSide,
  field,
  action,
}: {
  label: string;
  hoverSide: PaddingSide | 'all';
  field?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sniptale-parameter-row" data-padding-hover={hoverSide} data-layout="inline">
      <span className="sniptale-parameter-name">{label}</span>
      <div className="sniptale-parameter-value grid min-w-0 grid-cols-[minmax(0,1fr)_32px] items-center gap-1.5">
        <div className="min-w-0">{field}</div>
        <div className="justify-self-end">{action}</div>
      </div>
    </div>
  );
}

function ExpandedAxisGroup(props: {
  axis: PaddingAxis;
  linked: boolean;
  onLinkToggle: () => void;
  onSideChange: (side: PaddingSide, value: number) => void;
  onSidePreview?: ((side: PaddingSide, value: number) => void) | undefined;
  padding: ProductGlassLinkedPaddingValue;
  shared: ProductGlassLinkedPaddingFieldsProps;
}) {
  const sides = AXIS_SIDES[props.axis];
  const visibleSides = props.linked ? [sides[0]] : sides;
  const fullRow = props.shared.fieldLayout === 'full-row';
  const sideLabel = (side: PaddingSide) =>
    props.linked
      ? sides.map((linkedSide) => props.shared.labels[linkedSide]).join(' / ')
      : props.shared.labels[side];
  const renderSide = (side: PaddingSide) =>
    props.shared.renderValueField({
      compact: false,
      label: fullRow ? sideLabel(side) : props.shared.labels[side],
      onChange: (value) => props.onSideChange(side, value),
      onPreview: props.onSidePreview ? (value) => props.onSidePreview?.(side, value) : undefined,
      side,
      value: props.padding[side],
    });
  const action = (
    <LinkToggle
      labels={props.shared.labels}
      linked={props.linked}
      name={props.axis}
      onClick={props.onLinkToggle}
    />
  );
  if (fullRow)
    return (
      <div className="sniptale-parameter-stack" data-padding-axis={props.axis}>
        {visibleSides.map((side, index) => (
          <FullPaddingRow
            key={side}
            label={sideLabel(side)}
            hoverSide={side}
            field={renderSide(side)}
            action={index === 0 ? action : undefined}
          />
        ))}
      </div>
    );

  return (
    <div
      className={[
        'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5',
        'rounded-[9px] border border-[var(--sniptale-color-border-soft)] px-2 py-1',
      ].join(' ')}
      data-padding-axis={props.axis}
    >
      <div className="grid gap-0.5">
        {visibleSides.map((side) => (
          <div
            className={
              props.shared.fieldLayout === 'stacked'
                ? 'grid min-w-0 grid-cols-1 gap-1'
                : 'grid grid-cols-[minmax(5rem,0.7fr)_minmax(0,1fr)] items-center gap-2'
            }
            key={side}
          >
            <span
              data-padding-hover={side}
              className="truncate text-[11px] text-[var(--sniptale-color-text-secondary)]"
            >
              {sideLabel(side)}
            </span>
            {renderSide(side)}
          </div>
        ))}
      </div>
      {action}
    </div>
  );
}

export function ProductGlassLinkedPaddingFields(props: ProductGlassLinkedPaddingFieldsProps) {
  const [allLinked, setAllLinked] = useState(() => areSidesEqual(props.padding, PADDING_SIDES));
  const [axisLinked, setAxisLinked] = useState<Record<PaddingAxis, boolean>>(() => ({
    horizontal: areSidesEqual(props.padding, AXIS_SIDES.horizontal),
    vertical: areSidesEqual(props.padding, AXIS_SIDES.vertical),
  }));
  const lastEmittedPaddingRef = useRef<ProductGlassLinkedPaddingValue | null>(null);
  const lastObservedPaddingRef = useRef<ProductGlassLinkedPaddingValue>({ ...props.padding });
  const expanded = !allLinked;

  useEffect(() => {
    if (arePaddingValuesEqual(lastObservedPaddingRef.current, props.padding)) return;
    lastObservedPaddingRef.current = { ...props.padding };
    if (
      lastEmittedPaddingRef.current &&
      arePaddingValuesEqual(lastEmittedPaddingRef.current, props.padding)
    ) {
      lastEmittedPaddingRef.current = null;
      return;
    }
    lastEmittedPaddingRef.current = null;
    setAllLinked(areSidesEqual(props.padding, PADDING_SIDES));
    setAxisLinked({
      horizontal: areSidesEqual(props.padding, AXIS_SIDES.horizontal),
      vertical: areSidesEqual(props.padding, AXIS_SIDES.vertical),
    });
  }, [props.padding]);

  const emitChange = (padding: ProductGlassLinkedPaddingValue, preview = false) => {
    lastEmittedPaddingRef.current = padding;
    if (preview) props.onPreviewChange?.(padding);
    else props.onChange(padding);
  };

  const updateSide = (side: PaddingSide, value: number, preview = false) => {
    const nextValue = Math.max(0, value);
    if (allLinked) {
      emitChange({ top: nextValue, right: nextValue, bottom: nextValue, left: nextValue }, preview);
      return;
    }
    const axis: PaddingAxis = side === 'top' || side === 'bottom' ? 'vertical' : 'horizontal';
    const sides = axisLinked[axis] ? AXIS_SIDES[axis] : [side];
    emitChange(
      sides.reduce<ProductGlassLinkedPaddingValue>(
        (padding, linkedSide) => ({ ...padding, [linkedSide]: nextValue }),
        props.padding
      ),
      preview
    );
  };

  const toggleAll = () => {
    if (!allLinked) {
      const value = props.padding.top;
      emitChange({ top: value, right: value, bottom: value, left: value });
      setAxisLinked({ horizontal: true, vertical: true });
    }
    setAllLinked((current) => !current);
  };

  const toggleAxis = (axis: PaddingAxis) => {
    const linked = allLinked || axisLinked[axis];
    if (!linked) {
      const [source, target] = AXIS_SIDES[axis];
      emitChange({ ...props.padding, [target]: props.padding[source] });
    }
    if (allLinked) setAllLinked(false);
    setAxisLinked((current) => ({ ...current, [axis]: !linked }));
  };

  const fullRow = props.fieldLayout === 'full-row';
  const uniformValue =
    !expanded && (!props.renderUniformField || fullRow)
      ? props.renderValueField({
          compact: true,
          label: props.labels.top,
          onChange: (value) => updateSide('top', value),
          onPreview: props.onPreviewChange ? (value) => updateSide('top', value, true) : undefined,
          side: 'top',
          value: props.padding.top,
        })
      : null;
  const link = (
    <LinkToggle labels={props.labels} linked={allLinked} name="all" onClick={toggleAll} />
  );
  return (
    <div
      className={fullRow ? 'sniptale-parameter-stack' : 'grid gap-1.5'}
      data-ui="shared.linked-padding-fields"
    >
      {fullRow ? (
        <FullPaddingRow
          label={props.labels.padding}
          hoverSide="all"
          field={uniformValue}
          action={link}
        />
      ) : (
        <div className="flex min-w-0 items-center gap-1.5" data-padding-hover="all">
          <div className="min-w-0 flex-1 text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
            <span className="truncate">{props.labels.padding}</span>
          </div>
          {uniformValue ? (
            <div className="w-[4.75rem] rounded-[9px] border border-[var(--sniptale-color-border-soft)] p-0.5">
              {uniformValue}
            </div>
          ) : null}
          {link}
        </div>
      )}
      {!expanded && props.renderUniformField
        ? props.renderUniformField({
            onChange: (value) => updateSide('top', value),
            onPreview: props.onPreviewChange
              ? (value) => updateSide('top', value, true)
              : undefined,
            value: props.padding.top,
          })
        : null}
      {expanded ? (
        <div
          className={fullRow ? 'sniptale-parameter-stack' : 'grid w-full gap-1.5'}
          data-ui="shared.linked-padding-expanded"
        >
          {(['vertical', 'horizontal'] as const).map((axis) => (
            <ExpandedAxisGroup
              key={axis}
              axis={axis}
              linked={allLinked || axisLinked[axis]}
              onLinkToggle={() => toggleAxis(axis)}
              onSideChange={updateSide}
              onSidePreview={
                props.onPreviewChange ? (side, value) => updateSide(side, value, true) : undefined
              }
              padding={props.padding}
              shared={props}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
