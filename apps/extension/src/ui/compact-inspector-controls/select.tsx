import React, { forwardRef, useId } from 'react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { CompactSelectMenu } from './select-menu';
import { CompactSelectTrigger } from './select-trigger';
import { useCompactSelectController } from '@sniptale/ui/compact-inspector-controls/select-controller';
import { cx } from './shared';
import type { CompactSelectOption } from '@sniptale/ui/compact-inspector-controls/select-types';
export type { CompactSelectOption } from '@sniptale/ui/compact-inspector-controls/select-types';

export interface CompactSelectProps<T extends string = string> extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onChange' | 'value'
> {
  containerClassName?: string;
  controlSize?: 'sm' | 'md';
  dataUi?: string;
  menuAnchorRef?: React.RefObject<HTMLElement | null>;
  menuClassName?: string;
  onChange: (value: T) => void;
  onOpenChange?: (open: boolean) => void;
  options: readonly CompactSelectOption<T>[];
  placeholder?: string;
  value: T | '';
}

function CompactSelectInner<T extends string>(
  props: CompactSelectProps<T>,
  ref: Ref<HTMLButtonElement>
) {
  const menuId = useId();
  const select = useCompactSelectController({
    disabled: props.disabled,
    menuAnchorRef: props.menuAnchorRef,
    onChange: props.onChange,
    onOpenChange: props.onOpenChange,
    options: props.options,
    ref,
    triggerOnKeyDown: props.onKeyDown,
    value: props.value,
  });

  return <CompactSelectBody menuId={menuId} props={props} select={select} />;
}

function CompactSelectBody<T extends string>({
  menuId,
  props,
  select,
}: {
  menuId: string;
  props: CompactSelectProps<T>;
  select: ReturnType<typeof useCompactSelectController<T>>;
}) {
  return (
    <div
      ref={select.refs.containerRef}
      data-ui={props.dataUi ?? 'shared.ui.compact-select'}
      className={cx('relative w-full', props.containerClassName)}
    >
      <CompactSelectTriggerView menuId={menuId} props={props} select={select} />
      <CompactSelectMenuView menuId={menuId} props={props} select={select} />
    </div>
  );
}

function CompactSelectTriggerView<T extends string>({
  menuId,
  props,
  select,
}: {
  menuId: string;
  props: CompactSelectProps<T>;
  select: ReturnType<typeof useCompactSelectController<T>>;
}) {
  const {
    containerClassName: _containerClassName,
    controlSize: _controlSize,
    dataUi: _dataUi,
    menuAnchorRef: _menuAnchorRef,
    menuClassName: _menuClassName,
    onChange: _onChange,
    onOpenChange: _onOpenChange,
    options: _options,
    placeholder: _placeholder,
    value: _value,
    ...triggerProps
  } = props;

  return (
    <CompactSelectTrigger
      {...triggerProps}
      aria-label={props['aria-label']}
      disabled={props.disabled}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          if (select.state.open) {
            select.actions.closeAndFocusTrigger();
          } else {
            select.actions.openMenu();
          }
        }
      }}
      onKeyDown={select.keyboard.handleTriggerKeyDown}
      className={props.className}
      menuId={menuId}
      open={select.state.open}
      placeholder={props.placeholder}
      selectedOption={select.state.selectedOption}
      triggerRef={select.refs.setTriggerRefs}
    />
  );
}

function CompactSelectMenuView<T extends string>({
  menuId,
  props,
  select,
}: {
  menuId: string;
  props: CompactSelectProps<T>;
  select: ReturnType<typeof useCompactSelectController<T>>;
}) {
  if (!select.state.open || !select.placement.portalTarget) {
    return null;
  }

  return (
    <CompactSelectMenu
      menuId={menuId}
      menuRef={select.refs.menuRef}
      options={props.options}
      optionRefs={select.refs.optionRefs}
      value={props.value}
      onSelect={select.actions.selectOption}
      onOptionKeyDown={select.keyboard.handleOptionKeyDown}
      portalTarget={select.placement.portalTarget}
      style={select.placement.menuStyle}
      theme={select.placement.portalTheme}
      {...(props.menuClassName === undefined ? {} : { menuClassName: props.menuClassName })}
    />
  );
}

const CompactSelectBase = forwardRef(CompactSelectInner);

export const CompactSelect = CompactSelectBase as <T extends string = string>(
  props: CompactSelectProps<T> & { ref?: Ref<HTMLButtonElement> }
) => ReactNode;
