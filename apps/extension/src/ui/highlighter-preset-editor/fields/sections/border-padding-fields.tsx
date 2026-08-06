import type { BorderPadding } from '../../../../features/highlighter/contracts';
import { Link2, Unlink2 } from 'lucide-react';
import { useState } from 'react';
import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls';
import { NumericValueField } from '../../../compact-inspector-controls';
import { translate } from '../../../../platform/i18n';

type PaddingSide = keyof BorderPadding;
type PaddingAxis = 'horizontal' | 'vertical';

const PADDING_SIDES: PaddingSide[] = ['top', 'right', 'bottom', 'left'];
const AXIS_SIDES = {
  horizontal: ['left', 'right'],
  vertical: ['top', 'bottom'],
} as const satisfies Record<PaddingAxis, readonly [PaddingSide, PaddingSide]>;

function areSidesEqual(padding: BorderPadding, sides: readonly PaddingSide[]) {
  const first = sides[0];
  return first !== undefined && sides.every((side) => padding[side] === padding[first]);
}

function getPaddingLabels(): Record<PaddingSide, string> {
  return {
    top: translate('highlighter.editor.paddingTop'),
    right: translate('highlighter.editor.paddingRight'),
    bottom: translate('highlighter.editor.paddingBottom'),
    left: translate('highlighter.editor.paddingLeft'),
  };
}

function PaddingValueField(props: {
  compact?: boolean;
  label: string;
  onChange: (value: number) => void;
  side: PaddingSide;
  value: number;
}) {
  return (
    <div className="min-w-0" data-padding-side={props.side}>
      <NumericValueField
        className={props.compact ? '!h-7 !w-[4.75rem] !px-1' : '!w-full'}
        label={props.label}
        max={50}
        min={0}
        onCommitValue={props.onChange}
        onPreviewValue={props.onChange}
        value={props.value}
      />
    </div>
  );
}

function LinkToggle(props: { linked: boolean; name: 'all' | PaddingAxis; onClick: () => void }) {
  const label = translate(
    props.linked ? 'highlighter.editor.paddingSeparate' : 'highlighter.editor.paddingLinked'
  );
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

function ExpandedAxisGroup(props: {
  axis: PaddingAxis;
  labels: Record<PaddingSide, string>;
  linked: boolean;
  onLinkToggle: () => void;
  onSideChange: (side: PaddingSide, value: number) => void;
  padding: BorderPadding;
}) {
  const sides = AXIS_SIDES[props.axis];
  const visibleSides = props.linked ? [sides[0]] : sides;
  return (
    <div
      className={[
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-[9px]',
        'w-full border border-[var(--sniptale-color-border-soft)] px-2 py-1',
      ].join(' ')}
      data-padding-axis={props.axis}
    >
      <div className="grid gap-0.5">
        {visibleSides.map((side) => (
          <div
            className="grid grid-cols-[minmax(5rem,0.7fr)_minmax(0,1fr)] items-center gap-2"
            key={side}
          >
            <span className="truncate text-[11px] text-[var(--sniptale-color-text-secondary)]">
              {props.linked
                ? sides.map((linkedSide) => props.labels[linkedSide]).join(' / ')
                : props.labels[side]}
            </span>
            <PaddingValueField
              label={props.labels[side]}
              onChange={(value) => props.onSideChange(side, value)}
              side={side}
              value={props.padding[side]}
            />
          </div>
        ))}
      </div>
      <LinkToggle linked={props.linked} name={props.axis} onClick={props.onLinkToggle} />
    </div>
  );
}

export function BorderPaddingFields(props: {
  onChange: (padding: BorderPadding) => void;
  padding: BorderPadding;
}) {
  const [allLinked, setAllLinked] = useState(() => areSidesEqual(props.padding, PADDING_SIDES));
  const [axisLinked, setAxisLinked] = useState<Record<PaddingAxis, boolean>>(() => ({
    horizontal: areSidesEqual(props.padding, AXIS_SIDES.horizontal),
    vertical: areSidesEqual(props.padding, AXIS_SIDES.vertical),
  }));
  const labels = getPaddingLabels();
  const expanded = !allLinked;

  const updateSide = (side: PaddingSide, value: number) => {
    if (allLinked) {
      props.onChange({ top: value, right: value, bottom: value, left: value });
      return;
    }
    const axis: PaddingAxis = side === 'top' || side === 'bottom' ? 'vertical' : 'horizontal';
    const sides = axisLinked[axis] ? AXIS_SIDES[axis] : [side];
    props.onChange(
      sides.reduce<BorderPadding>(
        (padding, linkedSide) => ({ ...padding, [linkedSide]: value }),
        props.padding
      )
    );
  };

  const toggleAll = () => {
    if (!allLinked) {
      const value = props.padding.top;
      props.onChange({ top: value, right: value, bottom: value, left: value });
      setAxisLinked({ horizontal: true, vertical: true });
    }
    setAllLinked((current) => !current);
  };

  const toggleAxis = (axis: PaddingAxis) => {
    const linked = allLinked || axisLinked[axis];
    if (!linked) {
      const [source, target] = AXIS_SIDES[axis];
      props.onChange({ ...props.padding, [target]: props.padding[source] });
    }
    if (allLinked) setAllLinked(false);
    setAxisLinked((current) => ({ ...current, [axis]: !linked }));
  };

  return (
    <div className="grid gap-1.5" data-ui="shared.border-padding-fields">
      <div className="flex min-w-0 items-center gap-1.5">
        <div
          className={[
            'min-w-0 flex-1 text-[11px] font-semibold',
            'text-[var(--sniptale-color-text-secondary)]',
          ].join(' ')}
        >
          <span className="truncate">{translate('highlighter.editor.paddingLabel')}</span>
        </div>
        {!expanded ? (
          <div
            className={[
              'w-[4.75rem] rounded-[9px] p-0.5',
              'border border-[var(--sniptale-color-border-soft)]',
            ].join(' ')}
          >
            <PaddingValueField
              compact
              label={labels.top}
              onChange={(value) => updateSide('top', value)}
              side="top"
              value={props.padding.top}
            />
          </div>
        ) : null}
        <LinkToggle linked={allLinked} name="all" onClick={toggleAll} />
      </div>
      {expanded ? (
        <div className="grid w-full gap-1.5" data-ui="shared.border-padding-expanded">
          <ExpandedAxisGroup
            axis="vertical"
            labels={labels}
            linked={allLinked || axisLinked.vertical}
            onLinkToggle={() => toggleAxis('vertical')}
            onSideChange={updateSide}
            padding={props.padding}
          />
          <ExpandedAxisGroup
            axis="horizontal"
            labels={labels}
            linked={allLinked || axisLinked.horizontal}
            onLinkToggle={() => toggleAxis('horizontal')}
            onSideChange={updateSide}
            padding={props.padding}
          />
        </div>
      ) : null}
    </div>
  );
}
