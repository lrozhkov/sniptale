import { GlassSelectOverlay } from './overlay';
import type { GlassSelectController } from './controller';
import { GlassSelectTrigger } from '@sniptale/ui/glass-select/trigger';
import type { GlassSelectOption } from '@sniptale/ui/glass-select/types';

interface GlassSelectContentProps<T extends string = string> {
  controller: GlassSelectController<T>;
  disabled: boolean;
  portal: boolean;
  options: GlassSelectOption<T>[];
  value: T | '';
  size: 'sm' | 'md';
  menuClassName: string;
}

export function GlassSelectContent<T extends string = string>({
  controller,
  disabled,
  portal,
  options,
  value,
  size,
  menuClassName,
}: GlassSelectContentProps<T>) {
  return (
    <>
      <GlassSelectTrigger
        disabled={disabled}
        isOpen={controller.isOpen}
        triggerClassName={controller.triggerClassName}
        placeholder={controller.placeholder}
        onToggle={controller.handleToggle}
        {...(controller.selectedOption === undefined
          ? {}
          : { selectedOption: controller.selectedOption })}
      />
      <GlassSelectOverlay
        isOpen={controller.isOpen}
        portal={portal}
        containerRef={controller.containerRef}
        menuRef={controller.menuRef}
        options={options}
        value={value}
        size={size}
        portalTheme={controller.portalTheme}
        portalStyle={controller.portalStyle}
        menuPosition={controller.menuPosition}
        menuSizeClasses={controller.menuSizeClasses}
        menuClassName={menuClassName}
        menuSurfaceClassName={controller.menuSurfaceClassName}
        isPopupFlat={controller.isPopupFlat}
        onSelect={controller.handleSelect}
      />
    </>
  );
}
