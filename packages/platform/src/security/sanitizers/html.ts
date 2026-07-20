import DOMPurify from 'dompurify';

export interface HtmlSanitizerOptions {
  allowedAttributes?: string[];
  allowedTags?: string[];
}

type HtmlPurifier = {
  sanitize: (dirtyHtml: string, config: Record<string, unknown>) => string | Node;
};

function sanitizeWithPurifier(
  dirtyHtml: string,
  config: Record<string, unknown>,
  purifier: HtmlPurifier = DOMPurify
) {
  try {
    return purifier.sanitize(dirtyHtml, config);
  } catch {
    return null;
  }
}

function buildPurifierConfig(options: HtmlSanitizerOptions = {}) {
  return {
    ALLOWED_ATTR: options.allowedAttributes ?? [],
    ALLOWED_TAGS: options.allowedTags,
    KEEP_CONTENT: true,
  };
}

/**
 * Sanitizes an HTML fragment and fails closed on purifier errors.
 */
export function sanitizeHtmlFragment(
  html: string,
  options: HtmlSanitizerOptions = {},
  purifier: HtmlPurifier = DOMPurify
): string {
  if (!html) {
    return '';
  }

  const cleanHtml = sanitizeWithPurifier(html, buildPurifierConfig(options), purifier);
  return typeof cleanHtml === 'string' ? cleanHtml : '';
}

export function sanitizeHtmlContainer(
  html: string,
  options: HtmlSanitizerOptions = {},
  purifier: HtmlPurifier = DOMPurify
): Element | null {
  if (!html) {
    return null;
  }

  const cleanNode = sanitizeWithPurifier(
    html,
    {
      ...buildPurifierConfig(options),
      RETURN_DOM: true,
    },
    purifier
  );

  return cleanNode instanceof Element ? cleanNode : null;
}

/**
 * Canonical shared sink for replacing element HTML with a sanitized fragment.
 */
export function writeSanitizedInnerHtml(
  element: HTMLElement,
  html: string,
  options: HtmlSanitizerOptions = {}
): string {
  const sanitizedHtml = sanitizeHtmlFragment(html, options);
  if (element.innerHTML !== sanitizedHtml) {
    element.innerHTML = sanitizedHtml;
  }
  return sanitizedHtml;
}
