import type { CSSProperties, MutableRefObject } from 'react';
import { useRef, useState } from 'react';
import { translate } from '../../platform/i18n';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import {
  getGlassSelectMenuSurfaceClassName,
  getGlassSelectTriggerClassName,
} from '@sniptale/ui/glass-select/styles';
import type { GlassSelectOption, GlassSelectProps } from '@sniptale/ui/glass-select/types';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';

export interface GlassSelectController<T extends string = string> {
  isOpen: boolean;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  placeholder: string;
  portalTheme: ReturnType<typeof useResolvedPortalTheme>;
  isPopupFlat: boolean;
  selectedOption: GlassSelectOption<T> | undefined;
  menuPosition: 'bottom' | 'top';
  portalStyle: CSSProperties;
  menuSizeClasses: string;
  triggerClassName: string;
  menuSurfaceClassName: string;
  handleToggle: () => void;
  handleSelect: (option: GlassSelectOption<T>) => void;
}

function getGlassSelectPresentation<T extends string>({
  value,
  options,
  size,
  disabled,
  isOpen,
  variant,
}: {
  value: T | '';
  options: GlassSelectOption<T>[];
  size: 'sm' | 'md';
  disabled: boolean;
  isOpen: boolean;
  variant: 'default' | 'popup-flat';
}) {
  const isPopupFlat = variant === 'popup-flat';
  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 pr-8 text-xs' : 'px-4 py-2.5 pr-10 text-sm';

  return {
    isPopupFlat,
    selectedOption: options.find((option) => option.value === value),
    menuSizeClasses: size === 'sm' ? 'py-1' : 'py-1.5',
    triggerClassName: getGlassSelectTriggerClassName({
      disabled,
      isOpen,
      isPopupFlat,
      sizeClasses,
    }),
    menuSurfaceClassName: getGlassSelectMenuSurfaceClassName(isPopupFlat),
  };
}

function createGlassSelectHandlers<T extends string>(
  disabled: boolean,
  onChange: (value: T) => void,
  setIsOpen: (value: boolean | ((current: boolean) => boolean)) => void
) {
  return {
    handleToggle: () => {
      if (!disabled) {
        setIsOpen((state) => !state);
      }
    },
    handleSelect: (option: GlassSelectOption<T>) => {
      if (!option.disabled) {
        onChange(option.value);
        setIsOpen(false);
      }
    },
  };
}

export function useGlassSelectController<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = translate('shared.ui.selectPlaceholder'),
  disabled = false,
  size = 'md',
  portal = false,
  variant = 'default',
}: Pick<
  GlassSelectProps<T>,
  'value' | 'onChange' | 'options' | 'placeholder' | 'disabled' | 'size' | 'portal' | 'variant'
>): GlassSelectController<T> {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalTheme = useResolvedPortalTheme(containerRef.current);
  const { menuPosition, portalStyle } = useGlassSelectOverlay({
    portal,
    isOpen,
    setIsOpen,
    containerRef,
    menuRef,
  });
  const presentation = getGlassSelectPresentation({
    value,
    options,
    size,
    disabled,
    isOpen,
    variant,
  });
  const handlers = createGlassSelectHandlers(disabled, onChange, setIsOpen);

  return {
    isOpen,
    containerRef,
    menuRef,
    placeholder,
    portalTheme,
    menuPosition,
    portalStyle,
    ...presentation,
    ...handlers,
  };
}
