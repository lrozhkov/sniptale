import type { CSSProperties } from 'react';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import { resolveFrameCalloutFontFamily } from './callout/font-family';

function getTitleTypographyStyle(style: CalloutVisualStyle): CSSProperties {
  const title = style.title;
  return {
    fontFamily: resolveFrameCalloutFontFamily(title.fontFamily),
    fontStyle: title.fontStyle,
    fontWeight: title.fontWeight,
    letterSpacing: title.letterSpacing,
    lineHeight: title.lineHeight,
    textAlign: title.textAlign,
    textDecoration: title.textDecoration,
  };
}

export function getFrameCalloutTitleStyle(
  style: CalloutVisualStyle,
  hasWedgeOutline: boolean
): CSSProperties {
  const outlineInset = hasWedgeOutline ? style.surface.borderWidth / 2 : 0;
  const horizontalExtension = style.surface.paddingX + outlineInset;
  const verticalExtension = style.surface.paddingY + outlineInset;
  const titleRadius = Math.max(0, style.surface.radius - outlineInset);
  return {
    alignItems: 'center',
    display: 'flex',
    gap: 6,
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
    background:
      style.title.fillMode === 'unified'
        ? 'transparent'
        : serializePaintToCss(style.title.fillPaint),
    color: style.title.textColor,
    ...getTitleTypographyStyle(style),
    fontSize: style.title.fontSize,
  };
}

export function getFrameCalloutTitleInputStyle(): CSSProperties {
  return {
    background: 'transparent',
    border: 0,
    color: 'inherit',
    cursor: 'inherit',
    font: 'inherit',
    letterSpacing: 'inherit',
    lineHeight: 'inherit',
    minWidth: 0,
    outline: 0,
    padding: 0,
    textAlign: 'inherit',
    textDecoration: 'inherit',
    width: '100%',
  };
}

export function getFrameCalloutTitleMeasureStyle(style: CalloutVisualStyle): CSSProperties {
  return {
    alignItems: 'center',
    display: 'flex',
    gap: 6,
    width: 'max-content',
    height: 0,
    overflow: 'hidden',
    visibility: 'hidden',
    whiteSpace: 'pre',
    ...getTitleTypographyStyle(style),
    fontSize: style.title.fontSize,
    lineHeight: 0,
    pointerEvents: 'none',
  };
}
