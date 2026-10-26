import { isContentOwnedElement } from '../../../platform/dom-host';
import { readCheckName } from './name';
import { readCheckContrast } from './contrast';

export type ReviewCheckScope = 'selected' | 'page';
type ReviewCheckData =
  | { kind: 'missing-alt'; evidence: { attribute: 'alt' } }
  | { kind: 'missing-name' | 'missing-label'; evidence: { tag: string } }
  | { kind: 'positive-tabindex'; evidence: { value: number } }
  | {
      kind: 'contrast';
      evidence: { ratio: number; required: number; foreground: string; background: string };
    }
  | { kind: 'small-target'; evidence: { width: number; height: number } }
  | { kind: 'text-clipping'; evidence: { clientWidth: number; scrollWidth: number } }
  | {
      kind: 'horizontal-overflow';
      evidence: { width: number; available: number; overflow: number };
    };
export type ReviewCheckFinding = ReviewCheckData & { id: string; target: Element; label: string };
export interface ReviewCheckResult {
  root: Element;
  scope: ReviewCheckScope;
  rootLabel: string;
  completedAt: number;
  viewport: { width: number; height: number; frame: boolean };
  visited: number;
  inspected: number;
  truncated: boolean;
  totalFindings: number;
  findings: ReviewCheckFinding[];
  skipped: {
    hidden: number;
    owned: number;
    boundaries: number;
    unknownNames: number;
    unknownContrast: number;
  };
}
export const REVIEW_CHECK_MAX_ELEMENTS = 1000;
const MAX_FINDINGS = 200;

function reviewCheckTargetLabel(element: Element): string {
  const id = element.id.slice(0, 80);
  return `${element.localName}${id ? `#${id}` : ''}`;
}
function parent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode(),
    view = element.ownerDocument.defaultView;
  return view && root instanceof view.ShadowRoot ? root.host : null;
}
export function isReviewCheckRootAvailable(root: Element): boolean {
  try {
    if (
      isContentOwnedElement(root) ||
      !root.isConnected ||
      !root.ownerDocument.defaultView ||
      root.ownerDocument.defaultView.document !== root.ownerDocument
    )
      return false;
    let ancestor: Element | null = root;
    for (let depth = 0; ancestor; depth += 1) {
      if (
        depth >= 128 ||
        ancestor.hasAttribute('hidden') ||
        ancestor.hasAttribute('inert') ||
        ancestor.getAttribute('aria-hidden') === 'true'
      )
        return false;
      const style = ancestor.ownerDocument.defaultView?.getComputedStyle(ancestor);
      if (!style || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility))
        return false;
      ancestor = parent(ancestor);
    }
    let doc = root.ownerDocument;
    for (let depth = 0; doc !== document; depth += 1) {
      if (depth >= 10) return false;
      const frame = doc.defaultView?.frameElement;
      if (!frame?.isConnected || !doc.defaultView || doc.defaultView.document !== doc) return false;
      doc = frame.ownerDocument;
    }
    return true;
  } catch {
    return false;
  }
}
function nextElement(current: Element, root: Element, descend: boolean): Element | null {
  if (descend && current.firstElementChild) return current.firstElementChild;
  let cursor: Element | null = current;
  while (cursor && cursor !== root && !cursor.nextElementSibling) cursor = cursor.parentElement;
  return cursor === root ? null : (cursor?.nextElementSibling ?? null);
}
function ownText(element: Element): boolean {
  let node = element.firstChild;
  for (let count = 0; node && count < 32; count += 1, node = node.nextSibling)
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.slice(0, 256).trim()) return true;
  return false;
}

function ownTextOutside(
  element: Element,
  readStyle: (element: Element) => CSSStyleDeclaration | null
): boolean {
  let ancestor: Element | null = element;
  for (let depth = 0; ancestor; depth += 1) {
    if (depth >= 32) return false;
    const style = readStyle(ancestor);
    if (
      !style ||
      (style.transform && style.transform !== 'none') ||
      ['rotate', 'scale', 'translate'].some((property) => {
        const value = style.getPropertyValue(property);
        return Boolean(value && value !== 'none');
      }) ||
      !['', '1', 'normal'].includes(style.getPropertyValue('zoom'))
    )
      return false;
    ancestor = parent(ancestor);
  }
  const rect = element.getBoundingClientRect(),
    style = readStyle(element);
  const left = rect.left + (Number.parseFloat(style?.borderLeftWidth ?? '0') || 0),
    right = left + element.clientWidth;
  let node = element.firstChild;
  for (let count = 0; node && count < 32; count += 1, node = node.nextSibling) {
    if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue?.slice(0, 256).trim()) continue;
    const range = element.ownerDocument.createRange();
    try {
      range.setStart(node, 0);
      range.setEnd(node, Math.min(node.nodeValue.length, 256));
      const text = range.getBoundingClientRect();
      if (text.width > 0 && (text.left < left - 2 || text.right > right + 2)) return true;
    } catch {
      return false;
    } finally {
      range.detach();
    }
  }
  return false;
}

function role(element: Element): string {
  return element.getAttribute('role')?.slice(0, 64).trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
}
function nativeField(element: Element): boolean {
  return ['input', 'select', 'textarea'].includes(element.localName);
}
function control(element: Element): boolean {
  return (
    ['button', 'summary'].includes(element.localName) ||
    (element.localName === 'a' && element.hasAttribute('href')) ||
    nativeField(element) ||
    ['button', 'link'].includes(role(element))
  );
}
function disabled(element: Element): boolean {
  return Boolean(element.closest(':disabled,[aria-disabled="true" i]'));
}

type ReadStyle = (element: Element) => CSSStyleDeclaration | null;
type ScanReader = { readStyle: ReadStyle; hasPseudo: (element: Element) => boolean };
type ScanContext = ScanReader & {
  result: ReviewCheckResult;
  add: (element: Element, finding: ReviewCheckData) => void;
};

function createScanReader(): ScanReader {
  const styles = new WeakMap<Element, CSSStyleDeclaration | null>();
  const readStyle: ReadStyle = (element) => {
    if (styles.has(element)) return styles.get(element) ?? null;
    let result: CSSStyleDeclaration | null = null;
    try {
      result = element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
    } catch {
      /* A navigated source remains unavailable. */
    }
    styles.set(element, result);
    return result;
  };
  const pseudo = new WeakMap<Element, boolean>();
  const hasPseudo = (element: Element) => {
    const cached = pseudo.get(element);
    if (cached !== undefined) return cached;
    let result = true;
    try {
      result = ['::before', '::after'].some((part) => {
        const content = element.ownerDocument.defaultView?.getComputedStyle(element, part).content;
        return Boolean(content && content !== 'none' && content !== 'normal');
      });
    } catch {
      /* Unknown paint is not a passed contrast check. */
    }
    pseudo.set(element, result);
    return result;
  };
  return { readStyle, hasPseudo };
}

function createScanResult(root: Element, scope: ReviewCheckScope, view: Window): ReviewCheckResult {
  return {
    root,
    scope,
    rootLabel: reviewCheckTargetLabel(root),
    completedAt: Date.now(),
    viewport: {
      width: view.innerWidth,
      height: view.innerHeight,
      frame: root.ownerDocument !== document,
    },
    visited: 0,
    inspected: 0,
    truncated: false,
    totalFindings: 0,
    findings: [],
    skipped: { hidden: 0, owned: 0, boundaries: 0, unknownNames: 0, unknownContrast: 0 },
  };
}

function createScanContext(result: ReviewCheckResult): ScanContext {
  const add = (target: Element, finding: ReviewCheckData) => {
    result.totalFindings += 1;
    if (result.findings.length < MAX_FINDINGS)
      result.findings.push({
        ...finding,
        target,
        label: reviewCheckTargetLabel(target),
        id: `${finding.kind}:${result.visited}:${result.totalFindings}`,
      });
  };
  return { ...createScanReader(), result, add };
}

function hasScrollContext(element: Element, readStyle: ReadStyle): boolean {
  let ancestor = parent(element);
  for (let depth = 0; ancestor; depth += 1) {
    if (depth >= 32) return true;
    const style = readStyle(ancestor);
    if (!style) return true;
    if (
      /^(auto|scroll|hidden|clip)$/u.test(style.overflowX || style.overflow) ||
      ['fixed', 'sticky'].includes(style.position)
    )
      return true;
    ancestor = parent(ancestor);
  }
  return false;
}

function checkImageDescription(element: Element, context: ScanContext): void {
  if (
    element.localName === 'img' &&
    !element.hasAttribute('alt') &&
    !['none', 'presentation'].includes(role(element)) &&
    readCheckName(element, context.readStyle).kind !== 'named'
  )
    context.add(element, { kind: 'missing-alt', evidence: { attribute: 'alt' } });
}

function checkControlName(element: Element, context: ScanContext): void {
  if (
    !control(element) ||
    (element.localName === 'input' && element.getAttribute('type')?.toLowerCase() === 'hidden')
  )
    return;
  const name = readCheckName(element, context.readStyle);
  if (name.kind === 'empty' && !context.hasPseudo(element))
    context.add(element, {
      kind: nativeField(element) ? 'missing-label' : 'missing-name',
      evidence: { tag: element.localName },
    });
  else if (name.kind === 'unknown' || (name.kind === 'empty' && context.hasPseudo(element)))
    context.result.skipped.unknownNames += 1;
}

function checkTabOrder(element: Element, context: ScanContext): void {
  const value = element.getAttribute('tabindex')?.slice(0, 24).trim();
  if (value && /^[+\-]?\d+$/u.test(value) && Number.isFinite(Number(value)) && Number(value) > 0)
    context.add(element, { kind: 'positive-tabindex', evidence: { value: Number(value) } });
}

function checkTargetSize(
  element: Element,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  context: ScanContext
): void {
  const tag = element.localName;
  const target =
    tag === 'button' ||
    ['button', 'link'].includes(role(element)) ||
    (tag === 'a' && style.display !== 'inline');
  if (
    control(element) &&
    !disabled(element) &&
    target &&
    rect.width > 0 &&
    rect.height > 0 &&
    Math.min(rect.width, rect.height) < 24
  )
    context.add(element, {
      kind: 'small-target',
      evidence: { width: rect.width, height: rect.height },
    });
}

function checkTextContrast(element: Element, context: ScanContext): void {
  const contrast = readCheckContrast(element, context.readStyle, context.hasPseudo);
  if (contrast.kind === 'unknown') context.result.skipped.unknownContrast += 1;
  if (contrast.kind === 'measured' && contrast.ratio < contrast.required)
    context.add(element, {
      kind: 'contrast',
      evidence: {
        ratio: contrast.ratio,
        required: contrast.required,
        foreground: contrast.foreground,
        background: contrast.background,
      },
    });
}

function checkOwnTextClipping(
  element: Element,
  style: CSSStyleDeclaration,
  context: ScanContext
): void {
  const hasLineClamp = !['none', '0', ''].includes(style.getPropertyValue('-webkit-line-clamp'));
  if (
    style.display === 'inline' ||
    !/^(hidden|clip)$/u.test(style.overflowX || style.overflow) ||
    style.textOverflow === 'ellipsis' ||
    hasLineClamp ||
    element.clientWidth <= 0 ||
    element.scrollWidth - element.clientWidth <= 2 ||
    !ownTextOutside(element, context.readStyle)
  )
    return;
  context.add(element, {
    kind: 'text-clipping',
    evidence: { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth },
  });
}

function checkHorizontalOverflow(
  element: Element,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  context: ScanContext
): void {
  const doc = element.ownerDocument;
  const available = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
  const outside = Math.max(-rect.left, rect.right - available, 0);
  if (
    context.result.scope === 'selected' &&
    outside > 1 &&
    !['fixed', 'sticky'].includes(style.position) &&
    !hasScrollContext(element, context.readStyle)
  )
    context.add(element, {
      kind: 'horizontal-overflow',
      evidence: { width: rect.width, available, overflow: outside },
    });
}

function inspectRenderedElement(
  element: Element,
  style: CSSStyleDeclaration,
  context: ScanContext
): void {
  context.result.inspected += 1;
  checkImageDescription(element, context);
  checkControlName(element, context);
  checkTabOrder(element, context);
  const rect = element.getBoundingClientRect();
  checkTargetSize(element, style, rect, context);
  const text =
    !nativeField(element) &&
    element.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
    ownText(element);
  if (text && !disabled(element)) {
    checkTextContrast(element, context);
    checkOwnTextClipping(element, style, context);
  }
  checkHorizontalOverflow(element, style, rect, context);
}

function isCheckElementHidden(element: Element, style: CSSStyleDeclaration | null): boolean {
  return (
    !style ||
    style.display === 'none' ||
    ['hidden', 'collapse'].includes(style.visibility) ||
    element.hasAttribute('hidden') ||
    element.hasAttribute('inert') ||
    element.getAttribute('aria-hidden') === 'true'
  );
}

function inspectVisitedElement(element: Element, context: ScanContext): boolean {
  if (
    isContentOwnedElement(element) ||
    ['script', 'style', 'template'].includes(element.localName)
  ) {
    context.result.skipped.owned += 1;
    return false;
  }
  const style = context.readStyle(element);
  if (!style || isCheckElementHidden(element, style)) {
    context.result.skipped.hidden += 1;
    return false;
  }
  if (element.localName === 'iframe' || element.shadowRoot) context.result.skipped.boundaries += 1;
  if (element.getClientRects().length > 0) inspectRenderedElement(element, style, context);
  return !['iframe', 'input', 'select', 'textarea'].includes(element.localName);
}

function checkPageOverflow(root: Element, context: ScanContext, view: Window): void {
  if (context.result.scope !== 'page') return;
  const doc = root.ownerDocument,
    scrolling = doc.scrollingElement ?? doc.documentElement;
  const available = doc.documentElement.clientWidth || view.innerWidth;
  if (scrolling.scrollWidth - available > 1)
    context.add(root, {
      kind: 'horizontal-overflow',
      evidence: {
        width: scrolling.scrollWidth,
        available,
        overflow: scrolling.scrollWidth - available,
      },
    });
}

/** Reads bounded authoring hints without writing DOM, annotations, or storage. */
export function scanDesignReviewChecks(
  root: Element,
  scope: ReviewCheckScope
): ReviewCheckResult | null {
  if (!isReviewCheckRootAvailable(root)) return null;
  const view = root.ownerDocument.defaultView;
  if (!view) return null;
  const result = createScanResult(root, scope, view),
    context = createScanContext(result);
  let element: Element | null = root;
  while (element && result.visited < REVIEW_CHECK_MAX_ELEMENTS) {
    result.visited += 1;
    const descend = inspectVisitedElement(element, context);
    element = nextElement(element, root, descend);
  }
  result.truncated = Boolean(element);
  checkPageOverflow(root, context, view);
  return result;
}
