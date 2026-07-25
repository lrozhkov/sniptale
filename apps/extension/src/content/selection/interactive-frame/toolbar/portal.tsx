import React from 'react';
import { createPortal } from 'react-dom';
import { ProductGlassToolbar } from '@sniptale/ui/product-glass-toolbar';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
  Z_INDEX_FLOATING_UI,
} from '../layout/portal';
import { calculateInteractiveFrameToolbarPosition } from '../layout/positioning';
import { collectFrameFloatingExclusions } from '../layout/floating-placement';

export function InteractiveFrameToolbarPortal(props: {
  portalTheme: 'light' | 'dark' | null;
  toolbarCoords: { x: number; y: number };
  frameRect: { x: number; y: number; width: number; height: number };
  frameId: string;
  anchorOffset: { x: number; y: number } | null;
  onWrapperMouseDown: (event: React.MouseEvent) => void;
  onWrapperClick: (event: React.MouseEvent) => void;
  onToolbarMouseDown: (event: React.MouseEvent) => void;
  onToolbarClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { frameId, frameRect, toolbarCoords } = props;
  const { x: frameX, y: frameY, width: frameWidth, height: frameHeight } = frameRect;
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = React.useState<{ width: number; height: number } | null>(
    null
  );
  const [, refreshPlacement] = React.useReducer((value) => value + 1, 0);
  React.useLayoutEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setToolbarSize((current) =>
        current?.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    const refresh = () => refreshPlacement();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, []);
  const coords = toolbarSize
    ? calculateInteractiveFrameToolbarPosition(
        { x: frameX, y: frameY, width: frameWidth, height: frameHeight },
        toolbarSize,
        {
          ...collectFrameFloatingExclusions(frameId, { includeFrameGeometry: false }),
          ...(props.anchorOffset
            ? {
                anchorPoint: {
                  x: frameX + props.anchorOffset.x,
                  y: frameY + props.anchorOffset.y,
                },
              }
            : {}),
        }
      )
    : { ...toolbarCoords, side: 'top' as const };

  return createPortal(
    <div
      ref={toolbarRef}
      className="sniptale-toolbar-portal-wrapper"
      data-frame-id={frameId}
      data-placement-side={coords.side}
      data-theme={props.portalTheme ?? undefined}
      style={getThemedPortalStyle(props.portalTheme, {
        position: 'fixed',
        top: `${coords.y}px`,
        left: `${coords.x}px`,
        width: 'max-content',
        height: 'max-content',
        pointerEvents: 'auto',
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        zIndex: Z_INDEX_FLOATING_UI,
      })}
      onMouseDown={props.onWrapperMouseDown}
      onClick={props.onWrapperClick}
    >
      <ProductGlassToolbar
        className="sniptale-action-toolbar"
        style={{ maxWidth: 'calc(100vw - 16px)', flexWrap: 'wrap' }}
        onMouseDown={props.onToolbarMouseDown}
        onClick={props.onToolbarClick}
      >
        <>{props.children}</>
      </ProductGlassToolbar>
    </div>,
    resolveContentPortalTarget()
  );
}
