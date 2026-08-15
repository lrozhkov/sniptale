import type React from 'react';
import { createPortal } from 'react-dom';
import { useFixedPortalContainer, Z_INDEX_FLOATING_UI } from '../layout/portal';

export function InteractiveFrameSizePanelPortal(props: { children: React.ReactNode }) {
  const portalContainer = useFixedPortalContainer(
    'sniptale-frame-size-panel-portal',
    `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: ${Z_INDEX_FLOATING_UI};
    `,
    null
  );

  return createPortal(props.children, portalContainer);
}
