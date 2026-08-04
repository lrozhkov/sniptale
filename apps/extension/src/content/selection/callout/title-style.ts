import type { CSSProperties } from 'react';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import { FONT_FAMILY_MAP } from './constants';

const TITLE_TYPOGRAPHY_STYLE = {
  fontFamily: FONT_FAMILY_MAP['sans'],
  fontStyle: 'normal',
  textAlign: 'left',
  textDecoration: 'none',
} as const satisfies CSSProperties;

export function getCalloutTitleStyle(
  style: CalloutVisualStyle,
  hasWedgeOutline: boolean
): CSSProperties {
  const outlineInset = hasWedgeOutline ? style.surface.borderWidth / 2 : 0;
  const horizontalExtension = style.surface.paddingX + outlineInset;
  const verticalExtension = style.surface.paddingY + outlineInset;
  const titleRadius = Math.max(0, style.surface.radius - outlineInset);

  return {
    display: 'block',
    boxSizing: 'border-box',
    minWidth: 0,
    width: `calc(100% + ${horizontalExtension * 2}px)`,
    marginTop: -verticalExtension,
    marginRight: -horizontalExtension,
    marginBottom: style.surface.paddingY,
    marginLeft: -horizontalExtension,
    padding: `${style.surface.paddingY}px ${style.surface.paddingX}px`,
    border: 0,
    borderBottom: `${style.title.dividerWidth}px ${style.title.dividerStyle} ${style.title.dividerColor}`,
    borderRadius: `${titleRadius}px ${titleRadius}px 0 0`,
    outline: 0,
    background: style.title.backgroundColor,
    color: style.title.textColor,
    ...TITLE_TYPOGRAPHY_STYLE,
    fontSize: style.title.fontSize,
    fontWeight: style.title.fontWeight,
  };
}

export function getCalloutTitleMeasureStyle(style: CalloutVisualStyle): CSSProperties {
  return {
    display: 'block',
    width: 'max-content',
    height: 0,
    overflow: 'hidden',
    visibility: 'hidden',
    whiteSpace: 'pre',
    ...TITLE_TYPOGRAPHY_STYLE,
    fontSize: style.title.fontSize,
    fontWeight: style.title.fontWeight,
    lineHeight: 0,
    pointerEvents: 'none',
  };
}
