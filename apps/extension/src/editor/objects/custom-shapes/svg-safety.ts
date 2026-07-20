import { createCustomShapeImportDiagnostic } from './diagnostics';
import type { CustomShapeImportDiagnostic } from './types';

const SUPPORTED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'polygon',
  'polyline',
  'rect',
  'circle',
  'ellipse',
  'line',
  'title',
  'desc',
]);
const UNSAFE_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'image',
  'use',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'audio',
  'video',
  'canvas',
]);
const RESOURCE_ATTRIBUTES = new Set([
  'href',
  'xlink:href',
  'src',
  'filter',
  'clip-path',
  'mask',
  'marker-start',
  'marker-mid',
  'marker-end',
]);

function hasUnsafeAttribute(element: Element): string | null {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim().toLowerCase();
    if (name.startsWith('on') || name === 'style' || RESOURCE_ATTRIBUTES.has(name)) {
      return attribute.name;
    }
    if (
      value.includes('url(') ||
      value.startsWith('javascript:') ||
      value.startsWith('vbscript:') ||
      value.startsWith('data:')
    ) {
      return attribute.name;
    }
  }

  return null;
}

function validateElementSafety(element: Element): CustomShapeImportDiagnostic | null {
  const tagName = element.localName.toLowerCase();
  if (UNSAFE_ELEMENTS.has(tagName) || tagName.startsWith('animate')) {
    return createCustomShapeImportDiagnostic(
      'unsafe-svg',
      'SVG contains an unsafe element.',
      tagName
    );
  }
  if (!SUPPORTED_ELEMENTS.has(tagName)) {
    return createCustomShapeImportDiagnostic(
      'unsupported-element',
      'SVG contains an unsupported element.',
      tagName
    );
  }

  const unsafeAttribute = hasUnsafeAttribute(element);
  return unsafeAttribute
    ? createCustomShapeImportDiagnostic(
        'unsafe-svg',
        'SVG contains an unsafe attribute or resource reference.',
        unsafeAttribute
      )
    : null;
}

export function validateSvgSafety(root: Element): CustomShapeImportDiagnostic[] {
  const diagnostics: CustomShapeImportDiagnostic[] = [];
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const issue = validateElementSafety(element);
    if (issue) {
      diagnostics.push(issue);
    }
  }

  return diagnostics;
}
