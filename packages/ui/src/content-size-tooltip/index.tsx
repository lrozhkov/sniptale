import type { CSSProperties } from 'react';
import { mergeStyleRecords } from './core';
import type { ContentSizeTooltipProps } from './types';
import { ContentSizeTooltipContent } from './views';
import {
  CONTENT_SIZE_TOOLTIP_INPUT_STYLE_TEXT,
  CONTENT_SIZE_TOOLTIP_SURFACE_STYLE,
} from './styles';

export function ContentSizeTooltip(props: ContentSizeTooltipProps) {
  const canToggleAspectRatio = props.canToggleAspectRatio ?? true;

  return (
    <>
      <style>{CONTENT_SIZE_TOOLTIP_INPUT_STYLE_TEXT}</style>
      <div
        className="sniptale-content-size-tooltip"
        data-theme={props.portalTheme ?? undefined}
        style={
          mergeStyleRecords(CONTENT_SIZE_TOOLTIP_SURFACE_STYLE, {
            top: `${props.position.y}px`,
            left: `${props.position.x}px`,
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
    </>
  );
}
