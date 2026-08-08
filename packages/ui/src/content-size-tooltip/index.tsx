import type { CSSProperties } from 'react';
import { mergeStyleRecords } from './core';
import type { ContentSizeTooltipProps } from './types';
import { ContentSizeTooltipContent } from './views';
import { CONTENT_SIZE_TOOLTIP_INPUT_STYLE_TEXT, getContentSizeTooltipSurfaceStyle } from './styles';

export function ContentSizeTooltip(props: ContentSizeTooltipProps) {
  const canToggleAspectRatio = props.canToggleAspectRatio ?? true;

  return (
    <>
      <style>{CONTENT_SIZE_TOOLTIP_INPUT_STYLE_TEXT}</style>
      <div
        className="sniptale-content-size-tooltip-positioner"
        style={{ position: 'fixed', top: props.position.y, left: props.position.x }}
      >
        <div
          className="sniptale-content-size-tooltip sniptale-content-ui-zoom-surface"
          data-theme={props.portalTheme ?? undefined}
          data-variant={props.variant ?? 'default'}
          style={
            mergeStyleRecords(getContentSizeTooltipSurfaceStyle(props.variant), {
              position: 'relative',
              top: 'auto',
              left: 'auto',
            }) as CSSProperties
          }
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <ContentSizeTooltipContent {...props} canToggleAspectRatio={canToggleAspectRatio} />
        </div>
      </div>
    </>
  );
}
