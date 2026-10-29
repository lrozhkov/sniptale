import { FRAME_ANNOTATION_Z_INDEX } from '../../../../features/highlighter/frame-annotation/interaction/z-index';
import { createPortal } from 'react-dom';
import { getThemedPortalStyle, resolveContentPortalTarget } from '../layout/portal';
import { InteractiveFrameHoverOverlaySurface } from './hover-surface';
import type { InteractiveFrameHoverOverlayProps } from '../controller/types';

export function FrameHoverOverlay(props: InteractiveFrameHoverOverlayProps) {
  return <InteractiveFrameHoverOverlaySurface {...props} />;
}

export function FrameEditingOverlay(props: {
  portalTheme: 'light' | 'dark' | null;
  clipPath: string;
}) {
  const { portalTheme, clipPath } = props;

  return createPortal(
    <div
      className="sniptale-editing-blocking-overlay"
      data-theme={portalTheme ?? undefined}
      style={getThemedPortalStyle(portalTheme, {
        position: 'fixed',
        inset: 0,
        backgroundColor: 'transparent',
        zIndex: FRAME_ANNOTATION_Z_INDEX.editingOverlay,
        cursor: 'default',
        pointerEvents: 'auto',
        clipPath,
      })}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    />,
    resolveContentPortalTarget()
  );
}
