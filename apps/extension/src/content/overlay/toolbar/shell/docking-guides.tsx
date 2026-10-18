import type { CSSProperties } from 'react';
import type { ContentToolbarDockEdge } from '../../../../contracts/settings';
import { TOOLBAR_DOCK_EDGES, TOOLBAR_DOCK_INSET, TOOLBAR_DOCK_ZONE_SIZE } from './docking';

/** Disposable, pointer-transparent drop guides in the same scaled viewport as the toolbar. */
export function ToolbarDockingGuides(props: {
  activeEdge: ContentToolbarDockEdge | null;
  uiScale: number;
}) {
  const inset = TOOLBAR_DOCK_INSET * props.uiScale;
  const thickness = TOOLBAR_DOCK_ZONE_SIZE * props.uiScale;
  return (
    <div
      aria-hidden
      data-ui="content.toolbar.dock-guides"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483645 }}
    >
      {TOOLBAR_DOCK_EDGES.map((edge) => {
        const horizontal = edge === 'top' || edge === 'bottom';
        const active = props.activeEdge === edge;
        const color = active ? '--sniptale-color-accent' : '--sniptale-color-surface-contrast';
        const style: CSSProperties = {
          position: 'absolute',
          pointerEvents: 'none',
          boxSizing: 'border-box',
          [edge]: inset,
          ...(horizontal
            ? { left: '33.333333%', width: '33.333333%', height: thickness }
            : { top: '33.333333%', height: '33.333333%', width: thickness }),
          borderRadius: 'var(--sniptale-radius-lg)',
          border: `2px ${active ? 'solid' : 'dashed'} var(${color})`,
          outline: '1px solid var(--sniptale-color-text-inverse)',
          outlineOffset: 0,
          background: `color-mix(in srgb, var(${color}) ${active ? 18 : 8}%, transparent)`,
        };
        return (
          <div
            key={edge}
            data-ui={`content.toolbar.dock-zone.${edge}`}
            data-active={active}
            style={style}
          />
        );
      })}
    </div>
  );
}
