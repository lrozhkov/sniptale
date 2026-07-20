import React from 'react';
import { useAppLocale } from '../../../../platform/i18n';
import { isHighlighterEnabled } from '../../highlighter';
import { useContentPortalTheme } from '../layout/portal';
import { InteractiveFrameToolbarContent } from './view';
import { InteractiveFrameToolbarPortal } from './portal';
import { createToolbarSurfaceHandlers } from './actions';
import type { InteractiveFrameToolbarProps } from './types';

export function InteractiveFrameToolbar(
  props: InteractiveFrameToolbarProps
): React.ReactElement | null {
  useAppLocale();
  const portalTheme = useContentPortalTheme();
  if (props.state === 'editing' || props.state === 'idle' || !isHighlighterEnabled()) {
    return null;
  }

  const surfaceHandlers = createToolbarSurfaceHandlers(props);

  return (
    <InteractiveFrameToolbarPortal
      portalTheme={portalTheme}
      toolbarCoords={props.toolbarCoords}
      onWrapperMouseDown={surfaceHandlers.onWrapperMouseDown}
      onWrapperClick={surfaceHandlers.onWrapperClick}
      onToolbarMouseDown={surfaceHandlers.onToolbarMouseDown}
      onToolbarClick={surfaceHandlers.onToolbarClick}
    >
      <InteractiveFrameToolbarContent toolbarProps={props} />
    </InteractiveFrameToolbarPortal>
  );
}
