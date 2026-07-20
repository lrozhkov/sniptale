import React from 'react';
import { createPortal } from 'react-dom';
import { ProductGlassToolbar } from '@sniptale/ui/product-glass-toolbar';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
  Z_INDEX_FLOATING_UI,
} from '../layout/portal';

export function InteractiveFrameToolbarPortal(props: {
  portalTheme: 'light' | 'dark' | null;
  toolbarCoords: { x: number; y: number };
  onWrapperMouseDown: (event: React.MouseEvent) => void;
  onWrapperClick: (event: React.MouseEvent) => void;
  onToolbarMouseDown: (event: React.MouseEvent) => void;
  onToolbarClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      className="sniptale-toolbar-portal-wrapper"
      data-theme={props.portalTheme ?? undefined}
      style={getThemedPortalStyle(props.portalTheme, {
        position: 'fixed',
        top: `${props.toolbarCoords.y}px`,
        left: `${props.toolbarCoords.x}px`,
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
        onMouseDown={props.onToolbarMouseDown}
        onClick={props.onToolbarClick}
      >
        <>{props.children}</>
      </ProductGlassToolbar>
    </div>,
    resolveContentPortalTarget()
  );
}
