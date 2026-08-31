// policyStateIds: [] - SVG element and presentation-attribute sets are immutable sanitizer policy.
import { sanitizeWebSnapshotCssText } from './sanitize-css';

const BLOCKED_SVG_ELEMENTS = [
  'animate',
  'animateMotion',
  'animateTransform',
  'audio',
  'discard',
  'embed',
  'foreignObject',
  'iframe',
  'object',
  'script',
  'set',
  'video',
];
const CSS_PRESENTATION_ATTRIBUTES = new Set([
  'clip-path',
  'cursor',
  'fill',
  'filter',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke',
]);

function retainSvgFragmentUrl(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.startsWith('#') ? trimmedValue : null;
}

function sanitizeSvgElement(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === 'href' || name === 'xlink:href' || name === 'src') {
      if (!attribute.value.trim().startsWith('#')) element.removeAttribute(attribute.name);
      continue;
    }
    if (name === 'style' || CSS_PRESENTATION_ATTRIBUTES.has(name)) {
      element.setAttribute(
        attribute.name,
        sanitizeWebSnapshotCssText(attribute.value, retainSvgFragmentUrl)
      );
    }
  }
}

/** Converts an SVG asset into a passive, self-contained image document. */
export function sanitizeWebSnapshotSvgText(value: string): string {
  const document = new DOMParser().parseFromString(value, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('invalid web snapshot SVG asset');
  }

  for (const element of document.querySelectorAll(BLOCKED_SVG_ELEMENTS.join(','))) {
    element.remove();
  }
  for (const style of document.querySelectorAll('style')) {
    style.textContent = sanitizeWebSnapshotCssText(style.textContent ?? '', retainSvgFragmentUrl);
  }
  for (const element of document.querySelectorAll('*')) {
    sanitizeSvgElement(element);
  }

  return new XMLSerializer().serializeToString(document.documentElement);
}
