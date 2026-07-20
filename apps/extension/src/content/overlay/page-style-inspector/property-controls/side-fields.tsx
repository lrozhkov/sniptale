import { Link, Unlink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { propertyModified, propertyValue } from '../value-editing/values';
import { resolveSideValueKind, SideValueInput } from './side-value-input';

type Side = 'bottom' | 'left' | 'right' | 'top';

export const SIDE_ORDER: Side[] = ['top', 'right', 'bottom', 'left'];

const SIDE_LABEL_KEYS = [
  'content.pageStyleInspector.sideTop',
  'content.pageStyleInspector.sideRight',
  'content.pageStyleInspector.sideBottom',
  'content.pageStyleInspector.sideLeft',
] as const;

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

export function createSideFieldKey(properties: readonly PageStyleProperty[]): string {
  return properties.join('|');
}

function SideToggleButton(props: {
  children: ReactNode;
  disabled: boolean;
  linked: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      title={props.title}
      aria-label={props.title}
      className={[
        props.linked ? '' : 'mt-5',
        'inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition',
        'border-[color:var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
        'hover:border-[color:var(--sniptale-color-accent)] hover:text-[var(--sniptale-color-accent)]',
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function LinkedSideValue(props: {
  ariaLabel: string;
  disabled: boolean;
  firstDefault?: string | undefined;
  firstValue: string;
  onChangeLinked: (value: string) => void;
  onUnlink: () => void;
  properties: PageStyleProperty[];
  title: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-2">
      <SideValueInput
        ariaLabel={props.ariaLabel}
        disabled={props.disabled}
        fallbackValue={props.firstDefault}
        kind={resolveSideValueKind(props.properties[0] as PageStyleProperty)}
        value={props.firstValue}
        onChange={props.onChangeLinked}
      />
      <SideToggleButton
        disabled={props.disabled}
        linked={true}
        title={props.title}
        onClick={props.onUnlink}
      >
        <Link size={14} />
      </SideToggleButton>
    </div>
  );
}

function UnlinkedSideValues(props: {
  disabled: boolean;
  onChange: PageStyleInspectorActions['updateValue'];
  onLink: () => void;
  properties: PageStyleProperty[];
  state: PageStyleInspectorViewState;
  title: string;
}) {
  const valueKind = resolveSideValueKind(props.properties[0] as PageStyleProperty);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_32px] items-start gap-2">
      <div data-ui="content.page-style-inspector.side-values" className="grid grid-cols-4 gap-2">
        {props.properties.map((property, index) => (
          <SideValueLabel
            key={property}
            disabled={props.disabled}
            kind={valueKind}
            property={property}
            index={index}
            state={props.state}
            onChange={props.onChange}
          />
        ))}
      </div>
      <SideToggleButton
        disabled={props.disabled}
        linked={false}
        title={props.title}
        onClick={props.onLink}
      >
        <Unlink size={14} />
      </SideToggleButton>
    </div>
  );
}

function SideValueLabel(props: {
  disabled: boolean;
  index: number;
  kind: ReturnType<typeof resolveSideValueKind>;
  onChange: PageStyleInspectorActions['updateValue'];
  property: PageStyleProperty;
  state: PageStyleInspectorViewState;
}) {
  const label = translate(SIDE_LABEL_KEYS[props.index] ?? SIDE_LABEL_KEYS[0]);

  return (
    <label className="grid gap-1">
      <span className="text-center text-[10px] font-semibold text-[var(--sniptale-color-text-dim)]">
        {label}
      </span>
      <SideValueInput
        ariaLabel={label}
        disabled={props.disabled}
        fallbackValue={props.state.defaultValues[props.property]}
        kind={props.kind}
        showUnit={false}
        value={propertyValue(props.state, props.property)}
        onChange={(value) => props.onChange(props.property, value)}
      />
    </label>
  );
}

function SideFieldLabel(props: { label: string; modifiedCount: number }) {
  return (
    <div className="flex items-center gap-2">
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
    </div>
  );
}

function updateLinkedSides(props: {
  onChange: PageStyleInspectorActions['updateValue'];
  onChangeMany?: PageStyleInspectorActions['updateValues'];
  properties: PageStyleProperty[];
  value: string;
}) {
  if (props.onChangeMany) {
    props.onChangeMany(props.properties.map((property) => ({ property, value: props.value })));
    return;
  }
  for (const property of props.properties) {
    props.onChange(property, props.value);
  }
}

export function LinkedSideFields(props: {
  disabled: boolean;
  label: string;
  linked?: boolean | undefined;
  properties: PageStyleProperty[];
  state: PageStyleInspectorViewState;
  onChange: PageStyleInspectorActions['updateValue'];
  onChangeMany?: PageStyleInspectorActions['updateValues'];
  onLinkedChange?: ((fieldKey: string, linked: boolean) => void) | undefined;
}) {
  const model = createSideFieldModel(props);
  const toggleTitle = translate(
    model.linked
      ? 'content.pageStyleInspector.unlinkedSides'
      : 'content.pageStyleInspector.linkedSides'
  );

  return (
    <div
      className="grid gap-2"
      data-ui="content.page-style-inspector.side-field"
      data-side-field-label={props.label}
    >
      <SideFieldLabel label={props.label} modifiedCount={model.modifiedCount} />
      <SideFieldInputs model={model} props={props} toggleTitle={toggleTitle} />
    </div>
  );
}

function SideFieldInputs(args: {
  model: ReturnType<typeof createSideFieldModel>;
  props: {
    disabled: boolean;
    label: string;
    properties: PageStyleProperty[];
    state: PageStyleInspectorViewState;
    onChange: PageStyleInspectorActions['updateValue'];
    onChangeMany?: PageStyleInspectorActions['updateValues'];
    onLinkedChange?: ((fieldKey: string, linked: boolean) => void) | undefined;
  };
  toggleTitle: string;
}) {
  if (args.model.linked) {
    return (
      <LinkedSideValue
        disabled={args.props.disabled}
        firstDefault={args.model.firstDefault}
        firstValue={args.model.firstValue}
        ariaLabel={args.props.label}
        properties={args.props.properties}
        title={args.toggleTitle}
        onChangeLinked={(value) => updateLinkedSides({ ...args.props, value })}
        onUnlink={() => args.props.onLinkedChange?.(args.model.fieldKey, false)}
      />
    );
  }

  return (
    <UnlinkedSideValues
      disabled={args.props.disabled}
      properties={args.props.properties}
      state={args.props.state}
      title={args.toggleTitle}
      onChange={args.props.onChange}
      onLink={() => args.props.onLinkedChange?.(args.model.fieldKey, true)}
    />
  );
}

function createSideFieldModel(props: {
  linked?: boolean | undefined;
  properties: PageStyleProperty[];
  state: PageStyleInspectorViewState;
}) {
  const fieldKey = createSideFieldKey(props.properties);
  return {
    fieldKey,
    firstDefault: props.state.defaultValues[props.properties[0] as PageStyleProperty],
    firstValue: propertyValue(props.state, props.properties[0] as PageStyleProperty),
    linked: props.linked ?? props.state.sideFieldLinks?.[fieldKey] ?? false,
    modifiedCount: props.properties.filter((property) => propertyModified(props.state, property))
      .length,
  };
}
