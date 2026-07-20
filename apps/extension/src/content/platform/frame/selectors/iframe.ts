import { escapeCssIdentifier } from '@sniptale/platform/browser/iframe-selectors/css';

export function getIframeSelector(iframe: HTMLIFrameElement): string {
  if (iframe.id) {
    return `iframe#${escapeCssIdentifier(iframe.id)}`;
  }

  const src = iframe.src || '';
  if (src && !src.startsWith('about:')) {
    const srcMatch = src.match(/[^/]+$/);
    if (srcMatch) {
      return `iframe[src*="${srcMatch[0]}"]`;
    }
  }

  const appCode = iframe.getAttribute('data-application-code');
  if (appCode) {
    return `iframe[data-application-code="${appCode}"]`;
  }

  const iframes = document.querySelectorAll('iframe');
  const index = Array.from(iframes).indexOf(iframe);
  return `iframe:nth-of-type(${index + 1})`;
}
