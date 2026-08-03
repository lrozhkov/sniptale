import { ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { forwardRef } from 'react';
import type { CSSProperties, Ref, ReactNode } from 'react';
import { useFloatingSurfaceWheelContainment } from '../floating-interactions/wheel';
import { mergeFloatingInteractionLayerStyle } from '../floating-interactions/placement';
import { mergeThemeScopedStyle, resolveThemeSafePortalTarget } from '../theme/safe-portal';
import type { AppTheme } from '../theme/types';
import {
  createProductSelectTriggerKeyDown,
  createProductSelectTriggerRef,
  getProductSelectMenuClassName,
  getProductSelectOptionClassName,
  getProductSelectShellClassName,
  getProductSelectTriggerClassName,
  joinClassNames,
} from './helpers';
import { useProductSelectController } from './controller';
import { ProductSelectMenuOption } from './select-menu-option';
import type {
  ProductSelectMenuProps,
  ProductSelectOption,
  ProductSelectProps,
  ProductSelectTriggerProps,
} from './types';

export type { ProductSelectOption, ProductSelectProps } from './types';

interface ProductSelectMenuLayerProps {
  controlSize: 'sm' | 'md';
  menuClassName: string;
  options: readonly ProductSelectOption<string>[];
  selectState: ReturnType<typeof useProductSelectController<ProductSelectOption<string>>>;
  value: string;
}

interface ProductSelectShellProps {
  ariaLabel: string | undefined;
  className: string;
  containerClassName: string;
  controlSize: 'sm' | 'md';
  dataUi: string | undefined;
  disabled: boolean;
  menuClassName: string;
  options: readonly ProductSelectOption<string>[];
  placeholder: string | undefined;
  selectState: ReturnType<typeof useProductSelectController<ProductSelectOption<string>>>;
  triggerProps: Omit<
    ProductSelectProps<string>,
    | 'containerClassName'
    | 'controlSize'
    | 'dataUi'
    | 'menuClassName'
    | 'menuPlacement'
    | 'menuScrollable'
    | 'onChange'
    | 'options'
    | 'placeholder'
    | 'value'
  >;
  triggerRef: Ref<HTMLButtonElement>;
  value: string;
}

function ProductSelectValue<T extends string = string>(props: {
  placeholder: string | undefined;
  selectedOption: ProductSelectOption<T> | undefined;
}) {
  if (!props.selectedOption) {
    return <span className="sniptale-select-placeholder">{props.placeholder ?? ''}</span>;
  }

  return (
    <span className="sniptale-select-value">
      {props.selectedOption.icon ? (
        <span className="sniptale-select-value-icon">{props.selectedOption.icon}</span>
      ) : null}
      <span className="sniptale-select-value-copy">
        <span className="sniptale-select-value-label sniptale-select-value-label-trigger">
          {props.selectedOption.label}
        </span>
        {props.selectedOption.description ? (
          <span className="sniptale-select-option-description">
            {props.selectedOption.description}
          </span>
        ) : null}
      </span>
    </span>
  );
}
function ProductSelectTrigger<T extends string = string>(props: ProductSelectTriggerProps<T>) {
  return (
    <button
      {...props.triggerProps}
      ref={props.triggerRef}
      type="button"
      aria-label={props.ariaLabel}
      aria-controls={props.ariaControls}
      aria-expanded={props.isOpen}
      aria-haspopup="listbox"
      disabled={props.disabled}
      onKeyDown={props.onKeyDown}
      onClick={props.onToggle}
      className={getProductSelectTriggerClassName({
        className: props.className,
        controlSize: props.controlSize,
        disabled: props.disabled,
        isOpen: props.isOpen,
      })}
    >
      <ProductSelectValue placeholder={props.placeholder} selectedOption={props.selectedOption} />
      <ChevronDown
        className={joinClassNames(
          'sniptale-select-chevron',
          'sniptale-select-chevron-edge',
          props.isOpen && 'sniptale-select-chevron-open'
        )}
        aria-hidden="true"
      />
    </button>
  );
}
function renderProductSelectMenuOption<T extends string = string>(
  props: ProductSelectMenuProps<T>,
  option: ProductSelectOption<T>,
  index: number
) {
  const isSelected = option.value === props.value;

  return (
    <ProductSelectMenuOption
      key={option.value}
      className={getProductSelectOptionClassName({
        controlSize: props.controlSize,
        isDisabled: Boolean(option.disabled),
        isSelected,
      })}
      isSelected={isSelected}
      label={option.label}
      onSelect={() => props.onSelect(option)}
      {...(typeof option.description === 'undefined' ? {} : { description: option.description })}
      {...(typeof option.disabled === 'undefined' ? {} : { disabled: option.disabled })}
      {...(typeof option.icon === 'undefined' ? {} : { icon: option.icon })}
      {...(() => {
        const onKeyDown = props.onOptionKeyDown(index);
        return typeof onKeyDown === 'undefined' ? {} : { onKeyDown };
      })()}
      {...(() => {
        const onMouseEnter = option.disabled
          ? undefined
          : () => {
              props.onOptionMouseEnter(index);
            };
        return typeof onMouseEnter === 'undefined' ? {} : { onMouseEnter };
      })()}
      optionRef={(node) => {
        props.optionRefs.current[index] = node;
      }}
    />
  );
}

function ProductSelectMenu<T extends string = string>(props: ProductSelectMenuProps<T>) {
  const menuRef = useFloatingSurfaceWheelContainment(props.menuRef);
  return (
    <div
      id={props.menuId}
      ref={menuRef}
      role="listbox"
      data-floating-ui-root="true"
      data-theme={props.portalTheme ?? undefined}
      style={resolveProductSelectPortalStyle(props.portalStyle, props.portalTheme)}
      className={getProductSelectMenuClassName({
        controlSize: props.controlSize,
        menuClassName: props.menuClassName,
      })}
    >
      {props.options.map((option, index) => renderProductSelectMenuOption(props, option, index))}
    </div>
  );
}

function resolveProductSelectPortalStyle(
  portalStyle: CSSProperties = {},
  portalTheme: AppTheme | null = null
) {
  const positioned = portalStyle.top !== undefined && portalStyle.left !== undefined;
  const floatingStyle = mergeFloatingInteractionLayerStyle({
    ...portalStyle,
    zIndex: undefined,
    ...(positioned ? {} : { pointerEvents: 'none', visibility: 'hidden' }),
  });
  return mergeThemeScopedStyle(portalTheme, floatingStyle);
}

function ProductSelectMenuLayer(props: ProductSelectMenuLayerProps) {
  if (!props.selectState.state.isOpen) {
    return null;
  }

  const menu = (
    <ProductSelectMenu
      controlSize={props.controlSize}
      menuClassName={props.menuClassName}
      menuId={props.selectState.state.menuId}
      menuRef={props.selectState.overlay.menuRef}
      onOptionKeyDown={props.selectState.controls.handleOptionKeyDown}
      onOptionMouseEnter={props.selectState.controls.setActiveIndex}
      onSelect={props.selectState.controls.handleSelect}
      options={props.options}
      optionRefs={props.selectState.overlay.optionRefs}
      portalStyle={props.selectState.overlay.portalStyle}
      portalTheme={props.selectState.overlay.portalTheme}
      value={props.value}
    />
  );

  if (typeof document === 'undefined') {
    return menu;
  }

  return createPortal(
    menu,
    resolveThemeSafePortalTarget(props.selectState.overlay.containerRef.current)
  );
}

function useProductSelectShellProps(
  props: ProductSelectProps<string>,
  ref: Ref<HTMLButtonElement>
): ProductSelectShellProps {
  const {
    'aria-label': ariaLabel,
    className = '',
    containerClassName = '',
    dataUi,
    disabled = false,
    menuClassName = '',
    menuPlacement = 'auto',
    menuScrollable = true,
    onChange,
    options,
    placeholder,
    controlSize = 'md',
    value,
    ...triggerProps
  } = props;
  const selectState = useProductSelectController({
    disabled,
    menuPlacement,
    onChange,
    options,
    value,
  });
  const handleTriggerKeyDown = createProductSelectTriggerKeyDown(
    triggerProps.onKeyDown,
    selectState.controls.handleTriggerKeyDown
  );
  const triggerRef = createProductSelectTriggerRef(ref, selectState.controls.setTriggerRef);

  return {
    ariaLabel,
    className,
    containerClassName,
    controlSize,
    dataUi,
    disabled,
    menuClassName: joinClassNames(
      menuClassName,
      !menuScrollable && 'sniptale-select-menu-overflow-visible'
    ),
    options,
    placeholder,
    selectState: {
      ...selectState,
      controls: {
        ...selectState.controls,
        handleTriggerKeyDown,
      },
    },
    triggerProps,
    triggerRef,
    value,
  };
}

function ProductSelectShell(props: ProductSelectShellProps) {
  return (
    <div
      ref={props.selectState.overlay.containerRef}
      data-ui={props.dataUi ?? 'shared.ui.product-select'}
      className={getProductSelectShellClassName(props.controlSize, props.containerClassName)}
    >
      <ProductSelectTrigger
        ariaLabel={props.ariaLabel}
        ariaControls={props.selectState.state.menuId}
        className={props.className}
        controlSize={props.controlSize}
        disabled={props.disabled}
        isOpen={props.selectState.state.isOpen}
        onKeyDown={props.selectState.controls.handleTriggerKeyDown}
        onToggle={props.selectState.controls.handleToggle}
        selectedOption={props.selectState.state.selectedOption}
        placeholder={props.placeholder}
        triggerProps={props.triggerProps}
        triggerRef={props.triggerRef}
      />
      <ProductSelectMenuLayer
        controlSize={props.controlSize}
        menuClassName={props.menuClassName}
        options={props.options}
        selectState={props.selectState}
        value={props.value}
      />
    </div>
  );
}

function ProductSelectInner(props: ProductSelectProps<string>, ref: Ref<HTMLButtonElement>) {
  return <ProductSelectShell {...useProductSelectShellProps(props, ref)} />;
}
const ProductSelectBase = forwardRef<HTMLButtonElement, ProductSelectProps<string>>(
  ProductSelectInner
);

export const ProductSelect = ProductSelectBase as <T extends string = string>(
  props: ProductSelectProps<T> & { ref?: Ref<HTMLButtonElement> }
) => ReactNode;
