import type { CSSProperties } from 'react';
import type { ContentToolbarDockEdge } from '../../../../contracts/settings';
import {
  TOOLBAR_DOCK_EDGES,
  TOOLBAR_DOCK_INSET,
  TOOLBAR_DOCK_ZONE_SIZE,
  TOOLBAR_DOCK_SCROLLBAR_GAP,
  resolveToolbarDockViewport,
  getToolbarDockDisplayMode,
} from './docking';

/** Disposable, pointer-transparent drop guides in the same scaled viewport as the toolbar. */
export function ToolbarDockingGuides(props: {
  activeEdge: ContentToolbarDockEdge | null;
  uiScale: number;
}) {
  const viewport = resolveToolbarDockViewport(props.uiScale);
  const rightGutter = window.innerWidth - viewport.width * props.uiScale;
  const bottomGutter = window.innerHeight - viewport.height * props.uiScale;
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
  const zone =
    props.activeEdge === 'left-top'
      ? 'top-left'
      : props.activeEdge === 'right-top'
        ? 'top-right'
        : props.activeEdge === 'left-bottom'
          ? 'bottom-left'
          : props.activeEdge === 'right-bottom'
            ? 'bottom-right'
            : props.activeEdge;
  const inset = TOOLBAR_DOCK_INSET * props.uiScale;
  const thickness = TOOLBAR_DOCK_ZONE_SIZE * props.uiScale;
  return (
    <div
      aria-hidden
      data-ui="content.toolbar.dock-guides"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483645 }}
    >
      {[...TOOLBAR_DOCK_EDGES, ...corners].map((edge) => {
        const horizontal = edge === 'top' || edge === 'bottom';
        const corner = edge.includes('-');
        const active = zone === edge;
        const right = edge === 'right' || edge.endsWith('-right');
        const bottom = edge === 'bottom' || edge.startsWith('bottom-');
        const rightInset = inset + TOOLBAR_DOCK_SCROLLBAR_GAP * props.uiScale + rightGutter;
        const bottomInset = inset + bottomGutter;
        const borderColor = [
          'color-mix(in srgb,',
          `var(--sniptale-color-surface-contrast) ${active ? 40 : 65}%,`,
          'var(--sniptale-color-text-inverse))',
        ].join(' ');
        const style: CSSProperties = {
          position: 'absolute',
          pointerEvents: 'none',
          boxSizing: 'border-box',
          ...(corner
            ? {
                [right ? 'right' : 'left']: right ? rightInset : inset,
                [bottom ? 'bottom' : 'top']: bottom ? bottomInset : inset,
                width: thickness,
                height: thickness,
              }
            : { [edge]: right ? rightInset : bottom ? bottomInset : inset }),
          ...(corner
            ? {}
            : horizontal
              ? { left: '33.333333%', width: '33.333333%', height: thickness }
              : { top: '33.333333%', height: '33.333333%', width: thickness }),
          borderRadius: 'var(--sniptale-radius-lg)',
          border: `${active ? 2 : 1}px ${active ? 'solid' : 'dashed'} ${borderColor}`,
          outline:
            '1px solid color-mix(in srgb, var(--sniptale-color-surface-contrast) 24%, transparent)',
          outlineOffset: 0,
          background: `color-mix(in srgb, var(--sniptale-color-surface-contrast) ${active ? 10 : 4}%, transparent)`,
        };
        return (
          <div
            key={edge}
            data-ui={`content.toolbar.dock-zone.${edge}`}
            data-active={active}
            style={style}
          >
            {corner && active && props.activeEdge ? (
              <span
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: getToolbarDockDisplayMode(props.activeEdge) === 'horizontal' ? 28 : 8,
                  height: getToolbarDockDisplayMode(props.activeEdge) === 'horizontal' ? 8 : 28,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 2,
                  background: borderColor,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
