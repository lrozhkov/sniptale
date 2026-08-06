// policyStateIds: [] - Quick Edit target catalogs are immutable selection policy.
import { projectSelectablePageElement, resolveSelectablePageElement } from '../page-element-target';
import { isQuickEditTextElement } from './elements';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const QUICK_EDIT_EXCLUDED_ORIGIN_TAGS = new Set([
  'audio',
  'canvas',
  'embed',
  'iframe',
  'img',
  'input',
  'object',
  'picture',
  'select',
  'svg',
  'textarea',
  'video',
]);

function isEligibleQuickEditOrigin(element: Element): boolean {
  if (element.namespaceURI !== HTML_NAMESPACE) return false;
  if (QUICK_EDIT_EXCLUDED_ORIGIN_TAGS.has(element.localName.toLowerCase())) return false;
  return Boolean(element.textContent?.trim());
}

export function resolveQuickEditTextTarget(
  event: MouseEvent | FocusEvent,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  const origin = resolveSelectablePageElement(event, iframe);
  if (!origin || !isEligibleQuickEditOrigin(origin)) return null;

  return projectSelectablePageElement(origin, (candidate) => {
    if (candidate.namespaceURI !== HTML_NAMESPACE) return null;
    const htmlCandidate = candidate as HTMLElement;
    return isQuickEditTextElement(htmlCandidate) ? htmlCandidate : null;
  });
}
