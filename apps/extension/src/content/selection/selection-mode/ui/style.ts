import type { CSSProperties } from 'react';
import {
  colorToRgba,
  resolveBorderShadowVisual,
  type ResolvedBorderPresetVisual,
} from '../../../../features/highlighter/style';

type SerializableStyleRecord = Record<string, string | number | undefined>;

function serializeStyleEntry([property, value]: [string, string | number | undefined]): string {
  if (value === undefined) {
    return '';
  }

  const cssProperty = property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
  return `${cssProperty}: ${String(value)};`;
}

function serializeInlineStyles(styles: CSSProperties): string {
  return Object.entries(styles as SerializableStyleRecord)
    .map(serializeStyleEntry)
    .filter(Boolean)
    .join('\n');
}

function getSelectionFrameCss(visual: ResolvedBorderPresetVisual): string {
  const customCss = serializeInlineStyles(visual.customCssStyles);
  const frameShadow = resolveBorderShadowVisual(visual.shadow, visual.strokeColor).frameBoxShadow;

  return `
    border: ${visual.strokeWidth}px ${visual.strokeStyle} ${colorToRgba(
      visual.strokeColor,
      visual.strokeOpacity
    )};
    border-radius: ${visual.radius}px;
    background-color: ${colorToRgba(visual.fillColor, visual.fillOpacity)};
    ${frameShadow ? `box-shadow: ${frameShadow};` : ''}
    ${customCss}
  `;
}

export function getSelectionDragFrameStyle(
  visual: ResolvedBorderPresetVisual,
  overlayBackground: string
): string {
  const frameShadow = resolveBorderShadowVisual(visual.shadow, visual.strokeColor).frameBoxShadow;

  return `
    position: absolute;
    ${getSelectionFrameCss(visual)}
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    box-shadow:
      0 0 0 9999px ${overlayBackground}
      ${frameShadow ? `,\n      ${frameShadow}` : ''};
    pointer-events: none;
    display: none;
    user-select: none;
  `;
}

export function getSelectionHoverFrameStyle(visual: ResolvedBorderPresetVisual): string {
  return `
    position: absolute;
    ${getSelectionFrameCss(visual)}
    box-sizing: border-box;
    pointer-events: none;
    display: none;
    transition:
      top 0.05s ease-out,
      left 0.05s ease-out,
      width 0.05s ease-out,
      height 0.05s ease-out;
  `;
}

export function getSelectionFinalFrameStyle(
  visual: ResolvedBorderPresetVisual,
  zIndexBase: number
): string {
  return `
    position: absolute;
    ${getSelectionFrameCss(visual)}
    box-sizing: border-box;
    pointer-events: auto;
    cursor: move;
    z-index: ${zIndexBase + 1};
  `;
}
