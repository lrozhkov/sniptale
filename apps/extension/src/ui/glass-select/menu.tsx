import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import type { GlassSelectOption } from '@sniptale/ui/glass-select/types';
import { GlassSelectMenuSurface } from './menu-surface';
import { GlassSelectOptionButton } from '@sniptale/ui/glass-select/option';

interface GlassSelectMenuProps<T extends string = string> {
  options: GlassSelectOption<T>[];
  value: T | '';
  size: 'sm' | 'md';
  portal: boolean;
  portalTheme: ReturnType<typeof useResolvedPortalTheme>;
  portalStyle: CSSProperties;
  menuPosition: 'bottom' | 'top';
  menuSizeClasses: string;
  menuClassName: string;
  menuSurfaceClassName: string;
  isPopupFlat: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onSelect: (option: GlassSelectOption<T>) => void;
}

function renderMenuRows<T extends string = string>(props: {
  isPopupFlat: boolean;
  onSelect: (option: GlassSelectOption<T>) => void;
  options: GlassSelectOption<T>[];
  size: 'sm' | 'md';
  value: T | '';
}) {
  const rows: ReactNode[] = [];
  let previousGroupLabel: string | undefined;

  props.options.forEach((option, index) => {
    if (option.groupLabel && option.groupLabel !== previousGroupLabel) {
      rows.push(
        <p
          key={`group-${option.groupLabel}-${index}`}
          className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em]
            text-[var(--sniptale-color-text-dim)]"
        >
          {option.groupLabel}
        </p>
      );
      previousGroupLabel = option.groupLabel;
    }

    rows.push(
      <GlassSelectOptionButton
        key={option.value}
        option={option}
        value={props.value}
        index={index}
        totalOptions={props.options.length}
        size={props.size}
        isPopupFlat={props.isPopupFlat}
        onSelect={props.onSelect}
      />
    );
  });

  return rows;
}

export function GlassSelectMenu<T extends string = string>({
  options,
  value,
  size,
  portal,
  portalTheme,
  portalStyle,
  menuPosition,
  menuSizeClasses,
  menuClassName,
  menuSurfaceClassName,
  isPopupFlat,
  menuRef,
  onSelect,
}: GlassSelectMenuProps<T>) {
  return (
    <GlassSelectMenuSurface
      portal={portal}
      portalTheme={portalTheme}
      portalStyle={portalStyle}
      menuPosition={menuPosition}
      menuSizeClasses={menuSizeClasses}
      menuClassName={menuClassName}
      menuSurfaceClassName={menuSurfaceClassName}
      menuRef={menuRef}
    >
      {renderMenuRows({
        isPopupFlat,
        onSelect,
        options,
        size,
        value,
      })}
    </GlassSelectMenuSurface>
  );
}
