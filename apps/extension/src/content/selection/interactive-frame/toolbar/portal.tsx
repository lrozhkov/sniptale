import React from 'react';
import { createPortal } from 'react-dom';
import { ProductGlassToolbar } from '@sniptale/ui/product-glass-toolbar';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
  Z_INDEX_FLOATING_UI,
} from '../layout/portal';
import { calculateInteractiveFrameToolbarPosition } from '../layout/positioning';

export function InteractiveFrameToolbarPortal(props: {
  portalTheme: 'light' | 'dark' | null;
  toolbarCoords: { x: number; y: number };
  frameRect: { x: number; y: number; width: number; height: number };
  onWrapperMouseDown: (event: React.MouseEvent) => void;
  onWrapperClick: (event: React.MouseEvent) => void;
  onToolbarMouseDown: (event: React.MouseEvent) => void;
  onToolbarClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = React.useState<{ width: number; height: number } | null>(
    null
  );
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
  const coords = toolbarSize
    ? calculateInteractiveFrameToolbarPosition(props.frameRect, toolbarSize)
    : props.toolbarCoords;

  return createPortal(
    <div
      ref={toolbarRef}
      className="sniptale-toolbar-portal-wrapper"
      data-theme={props.portalTheme ?? undefined}
      style={getThemedPortalStyle(props.portalTheme, {
        position: 'fixed',
        top: `${coords.y}px`,
        left: `${coords.x}px`,
        width: 'max-content',
        height: 'max-content',
        pointerEvents: 'auto',
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
