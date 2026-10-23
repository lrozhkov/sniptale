import { useLayoutEffect, useState, type CSSProperties } from 'react';
import type { ProductToolbarMenuPlacement } from '@sniptale/ui/product-menus/toolbar';

type ToolbarMenuLayout = {
  placement: ProductToolbarMenuPlacement;
  style: CSSProperties | null;
};

/** Project the existing menu layout to its trigger's disclosure direction. */
export function useToolbarMenuDirection(resolveLayout: () => ToolbarMenuLayout) {
  const [direction, setDirection] = useState<'up' | 'down' | 'left' | 'right'>();
  useLayoutEffect(() => {
    const refresh = () => {
      const layout = resolveLayout();
      if (!layout.style) return;
      const next =
        layout.placement === 'side'
          ? layout.style.right && layout.style.right !== 'auto'
            ? 'left'
            : 'right'
          : layout.placement;
      setDirection(next);
    };
    refresh();
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  });
  return direction;
}
