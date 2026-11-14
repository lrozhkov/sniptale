import DOMPurify from 'dompurify';

export interface SvgSanitizerOptions {
  allowedAttributes: readonly string[];
  allowedTags: readonly string[];
}

/** Sanitize an SVG fragment with a caller's explicit profile and no HTML or resource extensions. */
export function sanitizeSvgFragment(svg: string, options: SvgSanitizerOptions): string | null {
  if (!DOMPurify.isSupported) return null;
  try {
    const purifier = DOMPurify(window);
    purifier.addHook('uponSanitizeAttribute', (element, attribute) => {
      const original = element.getAttribute(attribute.attrName);
      // Preserve legacy SVG whitespace before DOMPurify performs its normal attribute checks.
      if (original !== null && original.trim() === attribute.attrValue)
        attribute.attrValue = original;
    });
    try {
      if (!purifier.isSupported) return null;
      const clean = purifier.sanitize(svg, {
        ALLOWED_TAGS: [...options.allowedTags],
        ALLOWED_ATTR: [...options.allowedAttributes],
        ALLOWED_NAMESPACES: ['http://www.w3.org/2000/svg'],
        NAMESPACE: 'http://www.w3.org/2000/svg',
        PARSER_MEDIA_TYPE: 'application/xhtml+xml',
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
        SAFE_FOR_XML: true,
        SANITIZE_DOM: true,
        KEEP_CONTENT: false,
        RETURN_TRUSTED_TYPE: false,
        FORBID_TAGS: [
          'script',
          'style',
          'foreignObject',
          'a',
          'image',
          'use',
          'animate',
          'animateMotion',
          'animateTransform',
          'set',
          'feImage',
        ],
        FORBID_ATTR: [
          'style',
          'href',
          'xlink:href',
          'src',
          'srcset',
          ...options.allowedAttributes.filter((name) => name.toLowerCase().startsWith('on')),
        ],
      });
      return typeof clean === 'string' ? clean : null;
    } finally {
      purifier.removeAllHooks();
    }
  } catch {
    return null;
  }
}
