import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react';
import { Bold, Italic, Strikethrough, Underline } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../../../platform/i18n';
import { FieldResetButton } from '../fields';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../../types';
import { propertyDefaultValue, propertyModified, propertyValue } from '../../value-editing/values';
import { hasTextDecorationLine, toggleTextDecorationLine } from './decoration';

function ToggleButton(props: {
  active: boolean;
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      data-active={props.active}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition',
        'border-[color:var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
        'hover:bg-[var(--sniptale-color-surface-hover)] disabled:opacity-45',
        'data-[active=true]:border-[color:var(--sniptale-color-accent)]',
        'data-[active=true]:text-[var(--sniptale-color-accent)]',
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function IconButtonRow(props: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  modified: boolean;
  onReset: () => void;
}) {
  return (
    <div className="group/section-row grid gap-1">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span
          className={[
            'text-[11px] font-semibold',
            props.modified
              ? 'text-[var(--sniptale-color-accent)]'
              : 'text-[var(--sniptale-color-text-secondary)]',
          ].join(' ')}
        >
          {props.label}
        </span>
        <FieldResetButton
          disabled={props.disabled}
          label={props.label}
          modified={props.modified}
          onReset={props.onReset}
        />
      </div>
      <div className="flex flex-wrap gap-1">{props.children}</div>
    </div>
  );
}

function resetTextModeValues(actions: PageStyleInspectorActions) {
  actions.resetValue('font-weight');
  actions.resetValue('font-style');
  actions.resetValue('text-decoration');
}

export function TextModeButtons(props: {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
}) {
  const model = useTextModeButtonModel(props.state);

  return (
    <IconButtonRow
      disabled={props.disabled}
      label={translate('content.pageStyleInspector.textStyleGroup')}
      modified={model.modified}
      onReset={() => resetTextModeValues(props.actions)}
    >
      <FontWeightButton
        actions={props.actions}
        boldActive={model.boldActive}
        defaultFontWeight={model.defaultFontWeight}
        disabled={props.disabled}
      />
      <FontStyleToggle
        actions={props.actions}
        defaultFontStyle={model.defaultFontStyle}
        disabled={props.disabled}
        fontStyle={model.fontStyle}
      />
      <DecorationButtons
        actions={props.actions}
        decoration={model.decoration}
        disabled={props.disabled}
      />
    </IconButtonRow>
  );
}

function useTextModeButtonModel(state: PageStyleInspectorViewState) {
  const fontWeight = propertyValue(state, 'font-weight');
  const fontStyle = propertyValue(state, 'font-style');
  const decoration = propertyValue(state, 'text-decoration');
  const defaultFontWeight = propertyDefaultValue(state, 'font-weight');
  const defaultFontStyle = propertyDefaultValue(state, 'font-style');
  const boldActive = fontWeight === '700' || fontWeight === 'bold';
  const modified =
    propertyModified(state, 'font-weight') ||
    propertyModified(state, 'font-style') ||
    propertyModified(state, 'text-decoration');

  return { boldActive, decoration, defaultFontStyle, defaultFontWeight, fontStyle, modified };
}

function FontWeightButton(props: {
  actions: PageStyleInspectorActions;
  boldActive: boolean;
  defaultFontWeight: string;
  disabled: boolean;
}) {
  return (
    <ToggleButton
      active={props.boldActive}
      disabled={props.disabled}
      label={translate('content.pageStyleInspector.fontWeight')}
      onClick={() =>
        props.actions.updateValue(
          'font-weight',
          props.boldActive ? props.defaultFontWeight || '400' : 'bold'
        )
      }
    >
      <Bold size={15} />
    </ToggleButton>
  );
}

function FontStyleToggle(props: {
  actions: PageStyleInspectorActions;
  defaultFontStyle: string;
  disabled: boolean;
  fontStyle: string;
}) {
  return (
    <ToggleButton
      active={props.fontStyle === 'italic'}
      disabled={props.disabled}
      label={translate('content.pageStyleInspector.fontStyle')}
      onClick={() =>
        props.actions.updateValue(
          'font-style',
          props.fontStyle === 'italic' ? props.defaultFontStyle || 'normal' : 'italic'
        )
      }
    >
      <Italic size={15} />
    </ToggleButton>
  );
}

function DecorationButtons(props: {
  actions: PageStyleInspectorActions;
  decoration: string;
  disabled: boolean;
}) {
  return (
    <>
      <DecorationButton
        decoration={props.decoration}
        disabled={props.disabled}
        label={translate('content.pageStyleInspector.optionUnderline')}
        line="underline"
        onToggle={(nextValue) => props.actions.updateValue('text-decoration', nextValue)}
      >
        <Underline size={15} />
      </DecorationButton>
      <DecorationButton
        decoration={props.decoration}
        disabled={props.disabled}
        label={translate('content.pageStyleInspector.optionLineThrough')}
        line="line-through"
        onToggle={(nextValue) => props.actions.updateValue('text-decoration', nextValue)}
      >
        <Strikethrough size={15} />
      </DecorationButton>
    </>
  );
}

function DecorationButton(props: {
  children: ReactNode;
  decoration: string;
  disabled: boolean;
  label: string;
  line: 'line-through' | 'underline';
  onToggle: (nextValue: string) => void;
}) {
  return (
    <ToggleButton
      active={hasTextDecorationLine(props.decoration, props.line)}
      disabled={props.disabled}
      label={props.label}
      onClick={() => props.onToggle(toggleTextDecorationLine(props.decoration, props.line))}
    >
      {props.children}
    </ToggleButton>
  );
}

function getTextAlignOptions() {
  return [
    {
      icon: <AlignLeft size={15} />,
      label: translate('content.pageStyleInspector.optionLeft'),
      value: 'left',
    },
    {
      icon: <AlignCenter size={15} />,
      label: translate('content.pageStyleInspector.optionCenter'),
      value: 'center',
    },
    {
      icon: <AlignRight size={15} />,
      label: translate('content.pageStyleInspector.optionRight'),
      value: 'right',
    },
    {
      icon: <AlignJustify size={15} />,
      label: translate('content.pageStyleInspector.optionJustify'),
      value: 'justify',
    },
  ] as const;
}

export function TextAlignButtons(props: {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
}) {
  const value = propertyValue(props.state, 'text-align');
  const defaultValue = propertyDefaultValue(props.state, 'text-align');
  const modified = propertyModified(props.state, 'text-align');

  return (
    <IconButtonRow
      disabled={props.disabled}
      label={translate('content.pageStyleInspector.textAlign')}
      modified={modified}
      onReset={() => props.actions.resetValue('text-align')}
    >
      {getTextAlignOptions().map((option) => (
        <ToggleButton
          key={option.value}
          active={value === option.value}
          disabled={props.disabled}
          label={option.label}
          onClick={() =>
            props.actions.updateValue(
              'text-align',
              value === option.value ? defaultValue || '' : option.value
            )
          }
        >
          {option.icon}
        </ToggleButton>
      ))}
    </IconButtonRow>
  );
}
