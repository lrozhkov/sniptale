import { getThemedPortalStyle } from '../interactive-frame/layout/portal';
import type { FrameSettingsPopoverSurfaceShellProps } from './types';
import { FrameSettingsPopoverContent } from './views';

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
        <FrameSettingsPopoverContent
          effectMode={props.effectMode}
          globalSettings={props.globalSettings}
          handleBlurChange={props.handleBlurChange}
          handleBlurShowBorderChange={props.handleBlurShowBorderChange}
          handleBlurTypeChange={props.handleBlurTypeChange}
          handleFocusChange={props.handleFocusChange}
          handleFocusShowBorderChange={props.handleFocusShowBorderChange}
          handleSelectPreset={props.handleSelectPreset}
          localBlurSettings={props.localBlurSettings}
          localFocusSettings={props.localFocusSettings}
          selectedPresetId={props.selectedPresetId}
        />
      </div>
    </div>
  );
}
