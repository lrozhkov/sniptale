import { createPortal } from 'react-dom';
import type { CSSProperties, RefObject } from 'react';
import type { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import { resolveThemeSafePortalTarget } from '@sniptale/ui/theme/safe-portal';
import { GlassSelectMenu } from './menu';
import type { GlassSelectOption } from '@sniptale/ui/glass-select/types';

interface GlassSelectOverlayProps<T extends string = string> {
  isOpen: boolean;
  portal: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  options: GlassSelectOption<T>[];
  value: T | '';
  size: 'sm' | 'md';
  portalTheme: ReturnType<typeof useResolvedPortalTheme>;
  portalStyle: CSSProperties;
  menuPosition: 'bottom' | 'top';
  menuSizeClasses: string;
  menuClassName: string;
  menuSurfaceClassName: string;
  isPopupFlat: boolean;
  onSelect: (option: GlassSelectOption<T>) => void;
}

export function GlassSelectOverlay<T extends string = string>({
  isOpen,
  portal,
  containerRef,
  menuRef,
  options,
  value,
  size,
  portalTheme,
  portalStyle,
  menuPosition,
  menuSizeClasses,
  menuClassName,
  menuSurfaceClassName,
  isPopupFlat,
  onSelect,
}: GlassSelectOverlayProps<T>) {
  if (!isOpen) {
    return null;
  }

  const menuContent = (
    <GlassSelectMenu
      options={options}
      value={value}
      size={size}
      portal={portal}
      portalTheme={portalTheme}
      portalStyle={portalStyle}
      menuPosition={menuPosition}
      menuSizeClasses={menuSizeClasses}
      menuClassName={menuClassName}
      menuSurfaceClassName={menuSurfaceClassName}
      isPopupFlat={isPopupFlat}
      menuRef={menuRef}
      onSelect={onSelect}
    />
  );

  if (!portal || typeof document === 'undefined') {
    return menuContent;
  }

  return createPortal(menuContent, resolveThemeSafePortalTarget(containerRef.current));
}
