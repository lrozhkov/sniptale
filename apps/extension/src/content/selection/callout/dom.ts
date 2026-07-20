import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import {
  sanitizeHtmlFragment,
  type HtmlSanitizerOptions,
} from '@sniptale/platform/security/sanitizers/html';

export const CALLOUT_HTML_SANITIZER_OPTIONS: HtmlSanitizerOptions = {
  allowedAttributes: [],
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'p', 'span'],
};

export function resolveCalloutThemeOwner(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.getElementById(CONTENT_ROOT_ID);
}

export function sanitizeCalloutHtml(html: string): string {
  try {
    return sanitizeHtmlFragment(html, CALLOUT_HTML_SANITIZER_OPTIONS);
  } catch {
    return '';
  }
}
