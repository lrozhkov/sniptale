import { resolveContentShadowRoot } from '../../platform/dom-host';
export {
  CALLOUT_HTML_SANITIZER_OPTIONS,
  sanitizeCalloutHtml,
} from '../../../features/highlighter/frame-annotation/callout/html';

export function resolveCalloutThemeOwner(): HTMLElement | null {
  const host = resolveContentShadowRoot()?.host;
  return host instanceof HTMLElement ? host : null;
}
