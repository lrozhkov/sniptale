import {
  sanitizeHtmlFragment,
  type HtmlSanitizerOptions,
} from '@sniptale/platform/security/sanitizers/html';

export const CALLOUT_HTML_SANITIZER_OPTIONS: HtmlSanitizerOptions = {
  allowedAttributes: [],
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'p', 'span'],
};

export function sanitizeCalloutHtml(html: string): string {
  try {
    return sanitizeHtmlFragment(html, CALLOUT_HTML_SANITIZER_OPTIONS);
  } catch {
    return '';
  }
}
