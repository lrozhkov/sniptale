import type { CSSProperties } from 'react';

const RESERVED_FRAME_CSS_PROPERTIES: readonly string[] = [
  'all',
  'alignSelf',
  'anchorName',
  'aspectRatio',
  'blockSize',
  'bottom',
  'boxSizing',
  'clear',
  'clip',
  'clipPath',
  'contain',
  'contentVisibility',
  'cursor',
  'display',
  'float',
  'gridArea',
  'height',
  'inlineSize',
  'isolation',
  'justifySelf',
  'left',
  'maxBlockSize',
  'maxHeight',
  'maxInlineSize',
  'maxWidth',
  'minBlockSize',
  'minHeight',
  'minInlineSize',
  'minWidth',
  'order',
  'placeSelf',
  'pointerEvents',
  'right',
  'rotate',
  'scale',
  'top',
  'touchAction',
  'transform',
  'translate',
  'visibility',
  'width',
  'zIndex',
  'zoom',
];

const RESERVED_FRAME_CSS_PREFIXES = [
  'animation',
  'border',
  'inset',
  'margin',
  'mask',
  'offset',
  'overflow',
  'padding',
  'position',
  'transition',
] as const;

const VENDOR_PREFIX_PATTERN = /^(?:Webkit|Moz|ms|O)(?=[A-Z])/u;

function normalizeFrameCssProperty(property: string): string {
  const unprefixed = property.replace(VENDOR_PREFIX_PATTERN, '');
  if (unprefixed === property || unprefixed.length === 0) {
    return property;
  }

  return `${unprefixed[0]?.toLowerCase()}${unprefixed.slice(1)}`;
}

export function isReservedFrameCssProperty(property: string): boolean {
  const canonicalProperty = normalizeFrameCssProperty(property);
  return (
    RESERVED_FRAME_CSS_PROPERTIES.includes(canonicalProperty) ||
    RESERVED_FRAME_CSS_PREFIXES.some((prefix) => canonicalProperty.startsWith(prefix))
  );
}

export function projectFrameDecorationCssStyles(
  styles: CSSProperties & Record<string, string>
): CSSProperties {
  return Object.fromEntries(
    Object.entries(styles).filter(([property]) => !isReservedFrameCssProperty(property))
  );
}
