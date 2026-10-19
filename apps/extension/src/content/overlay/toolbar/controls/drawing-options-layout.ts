import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import type { ConfigurableDrawingQuickOptionsTool } from './drawing-options-updates';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
  TOOLBAR_SECONDARY_MENU_Z_INDEX,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import { readContentUiScaleCompensation } from '@sniptale/ui/floating-interactions/scale';

export type DrawingQuickOptionsTool = ConfigurableDrawingQuickOptionsTool | 'blur' | 'selection';

const DRAWING_OPTIONS_DIMENSIONS: Record<
  'horizontal' | 'vertical',
  Record<DrawingQuickOptionsTool, { height: number; width: number }>
> = {
  horizontal: {
    arrow: { height: 48, width: 600 },
    blur: { height: 48, width: 336 },
    marker: { height: 48, width: 560 },
    pencil: { height: 48, width: 340 },
    shape: { height: 48, width: 694 },
    selection: { height: 48, width: 676 },
    text: { height: 48, width: 700 },
  },
  vertical: {
    arrow: { height: 290, width: 190 },
    blur: { height: 174, width: 136 },
    marker: { height: 250, width: 190 },
    pencil: { height: 170, width: 190 },
    shape: { height: 365, width: 190 },
    selection: { height: 365, width: 190 },
    text: { height: 420, width: 190 },
  },
};

export function useDrawingOptionsLayout(args: {
  preferredPlacement?: 'up' | 'down';
  displayMode: 'horizontal' | 'vertical';
  hasSelection: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  tool: DrawingQuickOptionsTool;
  triggerRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
}) {
  const [, setViewportRevision] = useState(0);
  const measurementKey = `${args.displayMode}:${args.tool}:${args.hasSelection}`;
  const [measured, setMeasured] = useState<{ key: string; width: number; height: number } | null>(
    null
  );
  useLayoutEffect(() => {
    if (!args.open) {
      return;
    }
    const surface = args.panelRef.current?.closest<HTMLElement>(
      '[data-ui="content.toolbar.drawing-options.pair"], .sniptale-drawing-options-menu'
    );
    const root =
      surface?.closest<HTMLElement>('[data-ui="content.toolbar.drawing-options.pair"]') ?? surface;
    const measure = () => {
      if (!root) return;
      const width = root.offsetWidth;
      const height = root.offsetHeight;
      if (!width || !height) return;
      setMeasured((current) =>
        current?.key === measurementKey && current.width === width && current.height === height
          ? current
          : { key: measurementKey, width, height }
      );
    };
    const refresh = () => {
      measure();
      setViewportRevision((value) => value + 1);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (root) observer?.observe(root);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [args.panelRef, args.open, measurementKey]);
  const dimensions = DRAWING_OPTIONS_DIMENSIONS[args.displayMode][args.tool];
  const currentMeasurement = measured?.key === measurementKey ? measured : null;
  const menuHeight =
    currentMeasurement?.height ??
    dimensions.height + (args.hasSelection && args.displayMode === 'vertical' ? 294 : 0);
  const menuWidth = Math.min(
    currentMeasurement?.width ??
      dimensions.width + (args.hasSelection && args.displayMode === 'horizontal' ? 294 : 0),
    Math.max(0, window.innerWidth - 16)
  );
  const resolveLayout = () => {
    const anchor = args.triggerRef.current;
    const scale = readContentUiScaleCompensation(anchor);
    const above = (anchor?.getBoundingClientRect().top ?? 0) / scale;
    const below =
      (window.innerHeight - (anchor?.getBoundingClientRect().bottom ?? window.innerHeight)) / scale;
    const preferredFits =
      args.preferredPlacement === 'up' ? above >= menuHeight + 18 : below >= menuHeight + 18;
    const placement =
      args.preferredPlacement && preferredFits
        ? args.preferredPlacement
        : getToolbarMenuPosition(anchor, menuHeight);
    const positioned = resolveToolbarFloatingMenuStyle({
      anchorEl: args.triggerRef.current,
      displayMode: args.displayMode,
      menuHeight,
      menuWidth,
      placement,
      preferredTop: args.hasSelection ? -16 : 0,
    });
    const fallback: CSSProperties =
      args.displayMode === 'vertical'
        ? { left: 'calc(100% + 10px)', top: 0 }
        : { left: 0, top: 'calc(100% + 10px)' };
    const verticalOverflow: CSSProperties =
      args.displayMode === 'vertical' ? { maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' } : {};
    return {
      placement: resolveToolbarMenuPlacement(args.displayMode, placement),
      style: {
        ...(positioned ?? fallback),
        maxWidth: 'calc(100vw - 16px)',
        minWidth: 0,
        overflowX: 'auto',
        padding: '8px',
        zIndex: TOOLBAR_SECONDARY_MENU_Z_INDEX,
        ...verticalOverflow,
      } satisfies CSSProperties,
    };
  };
  return { ...resolveLayout(), resolveLayout };
}
