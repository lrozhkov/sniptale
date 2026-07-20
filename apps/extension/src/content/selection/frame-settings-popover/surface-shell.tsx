import { getThemedPortalStyle } from '../interactive-frame/layout/portal';
import { FrameSettingsPopoverSurfaceContent } from './surface-content';
import type { FrameSettingsPopoverSurfaceShellProps } from './types';

function stopPopoverPropagation(event: React.MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function FrameSettingsPopoverSurfaceShell(props: FrameSettingsPopoverSurfaceShellProps) {
  return (
    <div
      ref={props.popoverRef}
      className="sniptale-frame-settings-popover sniptale-glass-popover sniptale-content-popover"
      data-theme={props.portalTheme ?? undefined}
      data-frame-id={props.dataFrameId}
      onMouseDown={stopPopoverPropagation}
      onClick={stopPopoverPropagation}
      style={getThemedPortalStyle(props.portalTheme, props.getPopoverStyle())}
    >
      <div className="sniptale-content-popover-body">
        <FrameSettingsPopoverSurfaceContent {...props} />
      </div>
    </div>
  );
}
