const CONTENT_HOST_INLINE_STYLE: ReadonlyArray<readonly [property: string, value: string]> = [
  ['position', 'fixed'],
  ['top', '0'],
  ['left', '0'],
  ['z-index', '2147483647'],
  ['display', 'block'],
  ['box-sizing', 'border-box'],
  ['margin', '0'],
  ['padding', '0'],
  ['border', '0'],
  ['background', 'transparent'],
  ['opacity', '1'],
  ['visibility', 'visible'],
  ['pointer-events', 'none'],
  ['width', '0'],
  ['height', '0'],
  ['overflow', 'visible'],
  ['max-width', 'none'],
  ['max-height', 'none'],
  ['min-width', '0'],
  ['min-height', '0'],
  ['box-shadow', 'none'],
  ['filter', 'none'],
  ['backdrop-filter', 'none'],
  ['transform', 'none'],
  ['clip-path', 'none'],
  ['isolation', 'isolate'],
];

function applyContentHostInlineStyle(host: HTMLElement): void {
  CONTENT_HOST_INLINE_STYLE.forEach(([property, value]) => {
    host.style.setProperty(property, value);
  });
}

export function createShadowRootWithStyles(hostElement: HTMLElement, styles: string): ShadowRoot {
  const shadow = hostElement.attachShadow({ mode: 'open' });
  const styleTag = document.createElement('style');
  styleTag.textContent = styles;
  shadow.appendChild(styleTag);
  return shadow;
}

export function createShadowHost(id: string): HTMLElement {
  const host = document.createElement('div');
  host.id = id;
  applyContentHostInlineStyle(host);
  return host;
}
