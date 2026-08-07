import type { RefObject } from 'react';
import { useFloatingPopoverDrag } from './drag';
import type { SettingsPopoverContext } from './header';
import { useFrameAnnotationSettingsPopoverPosition } from './position';

export function useFrameAnnotationPopoverPresentation(args: {
  anchorEl: HTMLElement | null;
  context: SettingsPopoverContext;
  height: number;
  isOpen: boolean;
  popoverRef: RefObject<HTMLDivElement | null>;
  resetKey: string;
  width: number;
}) {
  const baseStyle = useFrameAnnotationSettingsPopoverPosition(args);
  const drag = useFloatingPopoverDrag({
    basePosition: {
      left: typeof baseStyle.left === 'number' ? baseStyle.left : 0,
      top: typeof baseStyle.top === 'number' ? baseStyle.top : 0,
    },
    isOpen: args.isOpen,
    popoverRef: args.popoverRef,
    resetKey: args.resetKey,
  });
  const draggable = args.context === 'element';
  return {
    drag: draggable ? drag : undefined,
    style: draggable
      ? { ...baseStyle, left: drag.position.left, top: drag.position.top }
      : baseStyle,
  };
}
