import { ChevronDown, Link2, Unlink2 } from 'lucide-react';
import { useState } from 'react';
import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls';
import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { propertyValue } from '../value-editing/values';
import { AXIS_SIDE_INDEXES, type SideAxis, useSideFieldLinking } from './side-fields-state';
import { resolveSideValueKind, SideValueInput } from './side-value-input';

type Side = 'bottom' | 'left' | 'right' | 'top';

export const SIDE_ORDER: Side[] = ['top', 'right', 'bottom', 'left'];

const SIDE_LABEL_KEYS = [
  'content.designReview.sideTop',
  'content.designReview.sideRight',
  'content.designReview.sideBottom',
  'content.designReview.sideLeft',
] as const;

const COMPACT_VALUES_CLASS_NAME = [
  'grid min-w-0 grid-cols-[repeat(4,minmax(0,1fr))] gap-0.5 rounded-[9px]',
  'border border-[var(--sniptale-color-border-soft)] p-0.5',
].join(' ');

const AXIS_GROUP_CLASS_NAME = [
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-[9px]',
  'border border-[var(--sniptale-color-border-soft)] px-2 py-1',
].join(' ');

export function createSideProperty(prefix: 'margin' | 'padding', side: Side): PageStyleProperty {
  return `${prefix}-${side}` as PageStyleProperty;
}

export function createBorderSideProperty(
  side: Side,
  role: 'color' | 'style' | 'width'
): PageStyleProperty {
  return `border-${side}-${role}` as PageStyleProperty;
}

export function createRadiusProperty(side: Side): PageStyleProperty {
  if (side === 'top') {
    return 'border-top-left-radius';
  }
  if (side === 'right') {
    return 'border-top-right-radius';
  }
  if (side === 'bottom') {
    return 'border-bottom-right-radius';
  }
  return 'border-bottom-left-radius';
}

function LinkToggle(props: {
  disabled: boolean;
  linked: boolean;
  name: 'all' | SideAxis;
  onClick: () => void;
}) {
  const title = translate(
    props.linked ? 'content.designReview.unlinkedSides' : 'content.designReview.linkedSides'
  );
  return (
    <ProductGlassIconButton
      active={props.linked}
      aria-label={title}
      aria-pressed={props.linked}
      className="h-7 w-7 shrink-0"
      data-side-link={props.name}
      disabled={props.disabled}
      onClick={props.onClick}
      title={title}
    >
      {props.linked ? (
        <Link2 aria-hidden="true" size={14} />
      ) : (
        <Unlink2 aria-hidden="true" size={14} />
      )}
    </ProductGlassIconButton>
  );
}

function SideValueControl(props: {
  compact?: boolean;
  disabled: boolean;
  index: number;
  onChange: (value: string) => void;
  property: PageStyleProperty;
  state: DesignReviewViewState;
}) {
  const label = translate(SIDE_LABEL_KEYS[props.index] ?? SIDE_LABEL_KEYS[0]);
  return (
    <div className="min-w-0" data-side-value={SIDE_ORDER[props.index]}>
      <SideValueInput
        ariaLabel={label}
        compact={props.compact === true}
        disabled={props.disabled}
        fallbackValue={props.state.defaultValues[props.property]}
        kind={resolveSideValueKind(props.property)}
        showUnit={!props.compact}
        value={propertyValue(props.state, props.property)}
        onChange={props.onChange}
      />
    </div>
  );
}

function CompactSideValues(props: {
  disabled: boolean;
  onSideChange: (index: number, value: string) => void;
  properties: PageStyleProperty[];
  state: DesignReviewViewState;
}) {
  return (
    <div className={COMPACT_VALUES_CLASS_NAME} data-ui="content.design-review.side-values-compact">
      {props.properties.map((property, index) => (
        <SideValueControl
          compact
          disabled={props.disabled}
          index={index}
          key={property}
          property={property}
          state={props.state}
          onChange={(value) => props.onSideChange(index, value)}
        />
      ))}
    </div>
  );
}

function ExpandedAxisGroup(props: {
  axis: SideAxis;
  disabled: boolean;
  linked: boolean;
  onLinkToggle: () => void;
  onSideChange: (index: number, value: string) => void;
  properties: PageStyleProperty[];
  state: DesignReviewViewState;
}) {
  return (
    <div className={AXIS_GROUP_CLASS_NAME} data-side-axis={props.axis}>
      <div className="grid gap-0.5">
        {AXIS_SIDE_INDEXES[props.axis].map((index) => {
          const property = props.properties[index] as PageStyleProperty;
          const label = translate(SIDE_LABEL_KEYS[index] ?? SIDE_LABEL_KEYS[0]);
          return (
            <div
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"
              key={property}
            >
              <span className="truncate text-[11px] text-[var(--sniptale-color-text-secondary)]">
                {label}
              </span>
              <SideValueControl
                disabled={props.disabled}
                index={index}
                property={property}
                state={props.state}
                onChange={(value) => props.onSideChange(index, value)}
              />
            </div>
          );
        })}
      </div>
      <LinkToggle
        disabled={props.disabled}
        linked={props.linked}
        name={props.axis}
        onClick={props.onLinkToggle}
      />
    </div>
  );
}

function SideFieldLabel(props: { expanded: boolean; label: string; modifiedCount: number }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span
        className={[
          'text-[11px] font-semibold',
          props.modifiedCount > 0
            ? 'text-[var(--sniptale-color-accent)]'
            : 'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {props.label}
      </span>
      <ChevronDown
        aria-hidden="true"
        className={props.expanded ? 'rotate-180 transition-transform' : 'transition-transform'}
        size={13}
      />
    </div>
  );
}

export function LinkedSideFields(props: {
  disabled: boolean;
  label: string;
  linked?: boolean | undefined;
  properties: PageStyleProperty[];
  state: DesignReviewViewState;
  onChange: DesignReviewActions['updateValue'];
  onChangeMany?: DesignReviewActions['updateValues'];
  onLinkedChange?: ((fieldKey: string, linked: boolean) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const linking = useSideFieldLinking(props);

  return (
    <div
      className="grid gap-1.5"
      data-ui="content.design-review.side-field"
      data-side-field-label={props.label}
    >
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
        <button
          aria-expanded={expanded}
          className="min-w-0 cursor-pointer text-left"
          disabled={props.disabled}
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          <SideFieldLabel
            expanded={expanded}
            label={props.label}
            modifiedCount={linking.model.modifiedCount}
          />
        </button>
        <div className="flex min-w-0 items-center gap-1.5">
          {!expanded ? (
            <div className="min-w-0 flex-1">
              <CompactSideValues
                disabled={props.disabled}
                properties={props.properties}
                state={props.state}
                onSideChange={linking.updateSide}
              />
            </div>
          ) : (
            <span className="min-w-0 flex-1" aria-hidden="true" />
          )}
          <LinkToggle
            disabled={props.disabled}
            linked={linking.model.linked}
            name="all"
            onClick={linking.toggleAll}
          />
        </div>
      </div>
      {expanded ? (
        <div className="ml-[calc(7rem+0.5rem)] grid gap-1.5">
          <ExpandedAxisGroup
            axis="vertical"
            disabled={props.disabled}
            linked={linking.model.linked || linking.axisLinked.vertical}
            properties={props.properties}
            state={props.state}
            onLinkToggle={() => linking.toggleAxis('vertical')}
            onSideChange={linking.updateSide}
          />
          <ExpandedAxisGroup
            axis="horizontal"
            disabled={props.disabled}
            linked={linking.model.linked || linking.axisLinked.horizontal}
            properties={props.properties}
            state={props.state}
            onLinkToggle={() => linking.toggleAxis('horizontal')}
            onSideChange={linking.updateSide}
          />
        </div>
      ) : null}
    </div>
  );
}
