import type { BorderPadding } from '../../../../features/highlighter/contracts';
import { ChevronDown, Link2, Unlink2 } from 'lucide-react';
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
        className={props.compact ? '!h-7 !w-[2.65rem] !px-1' : '!w-[6.25rem]'}
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
  return (
    <div
      className={[
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-[9px]',
        'border border-[var(--sniptale-color-border-soft)] px-2 py-1',
      ].join(' ')}
      data-padding-axis={props.axis}
    >
      <div className="grid gap-0.5">
        {AXIS_SIDES[props.axis].map((side) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" key={side}>
            <span className="truncate text-[11px] text-[var(--sniptale-color-text-secondary)]">
              {props.labels[side]}
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
  const [expanded, setExpanded] = useState(false);
  const [allLinked, setAllLinked] = useState(() => areSidesEqual(props.padding, PADDING_SIDES));
  const [axisLinked, setAxisLinked] = useState<Record<PaddingAxis, boolean>>(() => ({
    horizontal: areSidesEqual(props.padding, AXIS_SIDES.horizontal),
    vertical: areSidesEqual(props.padding, AXIS_SIDES.vertical),
  }));
  const labels = getPaddingLabels();

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
        <button
          aria-expanded={expanded}
          className={[
            'flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left',
            'text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]',
          ].join(' ')}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <span className="truncate">{translate('highlighter.editor.paddingLabel')}</span>
          <ChevronDown
            aria-hidden="true"
            className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'}
            size={13}
          />
        </button>
        {!expanded ? (
          <div
            className={[
              'grid grid-cols-4 gap-0.5 rounded-[9px] p-0.5',
              'border border-[var(--sniptale-color-border-soft)]',
            ].join(' ')}
          >
            {PADDING_SIDES.map((side) => (
              <PaddingValueField
                compact
                key={side}
                label={labels[side]}
                onChange={(value) => updateSide(side, value)}
                side={side}
                value={props.padding[side]}
              />
            ))}
          </div>
        ) : null}
        <LinkToggle linked={allLinked} name="all" onClick={toggleAll} />
      </div>
      {expanded ? (
        <div className="grid gap-1.5">
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
