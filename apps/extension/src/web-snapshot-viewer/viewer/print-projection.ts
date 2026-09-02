import type { WebSnapshotViewport } from '@sniptale/runtime-contracts/web-snapshot';
import { hydrateSnapshotDeclarativeShadowDom } from './declarative-shadow';
import { withOfflineSnapshotPolicy } from './document-policy';

const CSS_STYLE_RULE = 1;
const CSS_IMPORT_RULE = 3;
const CSS_MEDIA_RULE = 4;
const PRINT_PROJECTION_TIMEOUT_MS = 15_000;
const MAIN_SCROLL_REGION_VIEWPORT_RATIO = 0.25;

function getNestedRules(rule: CSSRule): CSSRuleList | null {
  const candidate = rule as CSSRule & { cssRules?: CSSRuleList };
  return candidate.cssRules ?? null;
}

function serializeCssRules(rules: CSSRuleList, targetWindow: Window): string {
  return Array.from(rules)
    .map((rule) => serializeCssRule(rule, targetWindow))
    .join('\n');
}

function mediaMatches(mediaText: string, targetWindow: Window): boolean {
  return mediaText.trim() === '' || targetWindow.matchMedia(mediaText).matches;
}

function includesPrintMedia(mediaText: string): boolean {
  return mediaText.split(',').some((mediaQuery) => {
    const tokens = mediaQuery.trim().toLocaleLowerCase('en-US').split(' ').filter(Boolean);
    if (tokens[0] === 'only') tokens.shift();
    return tokens[0] === 'print' && (tokens.length === 1 || tokens[1] === 'and');
  });
}

function serializeCssRule(rule: CSSRule, targetWindow: Window): string {
  if (rule.type === CSS_STYLE_RULE) {
    const styleRule = rule as CSSStyleRule;
    const nestedRules = getNestedRules(styleRule);
    if (!nestedRules || nestedRules.length === 0) return styleRule.cssText;
    return `${styleRule.selectorText}{${styleRule.style.cssText}${serializeCssRules(
      nestedRules,
      targetWindow
    )}}`;
  }

  if (rule.type === CSS_MEDIA_RULE) {
    const mediaRule = rule as CSSMediaRule;
    if (includesPrintMedia(mediaRule.conditionText)) return '';
    return mediaMatches(mediaRule.conditionText, targetWindow)
      ? serializeCssRules(mediaRule.cssRules, targetWindow)
      : '';
  }

  if (rule.type === CSS_IMPORT_RULE) {
    const importRule = rule as CSSImportRule;
    if (!importRule.styleSheet) {
      throw new Error('Snapshot print stylesheet import is unavailable.');
    }
    const mediaText = importRule.media.mediaText;
    if (includesPrintMedia(mediaText)) return '';
    return mediaMatches(mediaText, targetWindow)
      ? serializeCssRules(importRule.styleSheet.cssRules, targetWindow)
      : '';
  }

  const nestedRules = getNestedRules(rule);
  if (!nestedRules) return rule.cssText;
  const openingBrace = rule.cssText.indexOf('{');
  const closingBrace = rule.cssText.lastIndexOf('}');
  if (openingBrace < 0 || closingBrace <= openingBrace) return rule.cssText;
  return `${rule.cssText.slice(0, openingBrace + 1)}${serializeCssRules(
    nestedRules,
    targetWindow
  )}${rule.cssText.slice(closingBrace)}`;
}

function collectSnapshotRoots(document: Document): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [document];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    if (!root) continue;
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  return roots;
}

function createProjectionStyleElement(document: Document): HTMLStyleElement {
  const namespace = document.documentElement.namespaceURI;
  return (
    namespace ? document.createElementNS(namespace, 'style') : document.createElement('style')
  ) as HTMLStyleElement;
}

function freezeRootStyleSheets(root: Document | ShadowRoot, targetWindow: Window): void {
  const owners = Array.from(
    root.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel~="stylesheet"]')
  );
  for (const owner of owners) {
    const sheet = owner.sheet;
    if (!sheet) {
      throw new Error('Snapshot print stylesheet is unavailable.');
    }
    const replacement = createProjectionStyleElement(owner.ownerDocument);
    replacement.setAttribute('data-sniptale-print-frozen-styles', '');
    replacement.textContent = serializeCssRules(sheet.cssRules, targetWindow);
    owner.replaceWith(replacement);
  }
}

export function freezeSnapshotMediaQueries(document: Document, targetWindow: Window): void {
  for (const root of collectSnapshotRoots(document)) {
    freezeRootStyleSheets(root, targetWindow);
  }
}

function getLayoutParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  const shadowRootConstructor = element.ownerDocument.defaultView?.ShadowRoot;
  return shadowRootConstructor && root instanceof shadowRootConstructor ? root.host : null;
}

function setImportantStyle(element: HTMLElement, property: string, value: string): void {
  element.style.setProperty(property, value, 'important');
}

function isHtmlElement(element: Element): element is HTMLElement {
  const constructor = element.ownerDocument.defaultView?.HTMLElement;
  return constructor
    ? element instanceof constructor
    : element.namespaceURI === 'http://www.w3.org/1999/xhtml';
}

function normalizePrintFlow(element: HTMLElement): void {
  setImportantStyle(element, 'display', 'block');
  setImportantStyle(element, 'box-sizing', 'border-box');
  setImportantStyle(element, 'width', '100%');
  setImportantStyle(element, 'max-width', 'none');
  setImportantStyle(element, 'margin-inline', '0');
  setImportantStyle(element, 'position', 'relative');
  setImportantStyle(element, 'inset', 'auto');
  setImportantStyle(element, 'float', 'none');
  setImportantStyle(element, 'transform', 'none');
}

function expandScrollRegion(element: HTMLElement): void {
  const expandedHeight = element.scrollHeight;
  element.setAttribute('data-sniptale-print-scroll-region', '');
  setImportantStyle(element, 'height', `${expandedHeight}px`);
  setImportantStyle(element, 'min-height', `${expandedHeight}px`);
  setImportantStyle(element, 'max-height', 'none');
  setImportantStyle(element, 'flex', 'none');
  setImportantStyle(element, 'overflow', 'visible');
  normalizePrintFlow(element);

  let ancestor = getLayoutParent(element);
  while (ancestor && isHtmlElement(ancestor)) {
    ancestor.setAttribute('data-sniptale-print-scroll-ancestor', '');
    setImportantStyle(ancestor, 'height', 'auto');
    setImportantStyle(ancestor, 'max-height', 'none');
    setImportantStyle(ancestor, 'overflow', 'visible');
    normalizePrintFlow(ancestor);
    ancestor = getLayoutParent(ancestor);
  }
}

export function expandSnapshotScrollRegions(document: Document): void {
  const targetWindow = document.defaultView;
  if (!targetWindow) return;
  const candidates = collectSnapshotRoots(document).flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>('*'))
  );
  for (const element of candidates) {
    const computedStyle = targetWindow.getComputedStyle(element);
    const overflowY =
      element.style.overflowY ||
      element.style.overflow ||
      computedStyle.overflowY ||
      computedStyle.overflow;
    const isMainViewportRegion =
      element.clientHeight >= targetWindow.innerHeight * MAIN_SCROLL_REGION_VIEWPORT_RATIO &&
      element.clientWidth >= targetWindow.innerWidth * MAIN_SCROLL_REGION_VIEWPORT_RATIO;
    if (
      isMainViewportRegion &&
      (overflowY === 'auto' || overflowY === 'scroll') &&
      element.scrollHeight > element.clientHeight + 1
    ) {
      expandScrollRegion(element);
    }
  }
}

function appendPrintStyles(document: Document): void {
  const style = createProjectionStyleElement(document);
  style.setAttribute('data-sniptale-print-policy', '');
  style.textContent = [
    'html,body{height:auto!important;max-height:none!important;',
    'overflow:visible!important;',
    '-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}',
    '[data-sniptale-print-scroll-region],[data-sniptale-print-scroll-ancestor]{',
    'width:100%!important;max-width:none!important;margin-inline:0!important;',
    'position:relative!important;inset:auto!important;float:none!important;',
    'transform:none!important}',
    'img,svg,canvas,video,pre,blockquote{break-inside:avoid-page}',
  ].join('');
  (document.head ?? document.documentElement).append(style);
}

function appendImagePrintStyles(document: Document, pageWidth: number, pageHeight: number): void {
  const style = createProjectionStyleElement(document);
  style.setAttribute('data-sniptale-image-print-policy', '');
  style.textContent = [
    'html,body{margin:0!important;padding:0!important;',
    '-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}',
    `.sniptale-image-page{position:relative;width:100%;aspect-ratio:${pageWidth}/${pageHeight};`,
    'overflow:hidden;break-after:page;page-break-after:always}',
    '.sniptale-image-page:last-child{break-after:auto;page-break-after:auto}',
    '.sniptale-image-page img{position:absolute;left:0;width:100%;max-width:none;',
    'height:auto;display:block}',
  ].join('');
  (document.head ?? document.documentElement).append(style);
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === 'function') {
    return image.decode().catch(() => undefined);
  }
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
}

async function waitForProjectionLayout(document: Document, targetWindow: Window): Promise<void> {
  await document.fonts?.ready;
  const images = collectSnapshotRoots(document).flatMap((root) =>
    Array.from(root.querySelectorAll('img'))
  );
  images.forEach((image) => {
    image.loading = 'eager';
  });
  await Promise.all(images.map((image) => waitForImage(image)));
  await new Promise<void>((resolve) => targetWindow.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => targetWindow.requestAnimationFrame(() => resolve()));
}

function waitForFrameLoad(frame: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    frame.addEventListener(
      'error',
      () => reject(new Error('Snapshot print frame failed to load.')),
      {
        once: true,
      }
    );
  });
}

function createPrintFrame(
  hostDocument: Document,
  width: number,
  height: number
): HTMLIFrameElement {
  const frame = hostDocument.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${Math.max(1, Math.round(width))}px`,
    `height:${Math.max(1, Math.round(height))}px`,
    'border:0',
    'pointer-events:none',
  ].join(';');
  return frame;
}

async function withProjectionTimeout<T>(work: Promise<T>, targetWindow: Window): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = targetWindow.setTimeout(
      () => reject(new Error('Snapshot print preparation timed out.')),
      PRINT_PROJECTION_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId !== null) targetWindow.clearTimeout(timeoutId);
  }
}

export async function printWebSnapshotProjection(args: {
  documentUrl: string | null;
  html: string;
  hostDocument?: Document;
  viewport: WebSnapshotViewport | null;
}): Promise<void> {
  const hostDocument = args.hostDocument ?? document;
  const hostWindow = hostDocument.defaultView;
  if (!hostWindow || !hostDocument.body) {
    throw new Error('Snapshot print host is unavailable.');
  }

  const frame = createPrintFrame(
    hostDocument,
    args.viewport?.width ?? hostWindow.innerWidth,
    args.viewport?.height ?? hostWindow.innerHeight
  );
  const loaded = waitForFrameLoad(frame);
  if (args.documentUrl) frame.src = args.documentUrl;
  else frame.srcdoc = withOfflineSnapshotPolicy(args.html, false);
  hostDocument.body.append(frame);

  try {
    await withProjectionTimeout(loaded, hostWindow);
    const projectionDocument = frame.contentDocument;
    const projectionWindow = frame.contentWindow;
    if (!projectionDocument || !projectionWindow) {
      throw new Error('Snapshot print projection is unavailable.');
    }
    hydrateSnapshotDeclarativeShadowDom(projectionDocument);
    expandSnapshotScrollRegions(projectionDocument);
    appendPrintStyles(projectionDocument);
    await withProjectionTimeout(
      waitForProjectionLayout(projectionDocument, projectionWindow),
      hostWindow
    );
    projectionWindow.focus();
    projectionWindow.print();
  } finally {
    frame.remove();
  }
}

function resolveImagePrintPageSize(args: {
  image: HTMLImageElement;
  viewport: WebSnapshotViewport | null;
  window: Window;
}): { height: number; width: number } {
  const width = Math.max(1, Math.round(args.image.naturalWidth || args.viewport?.width || 1));
  const height = args.image.naturalHeight || args.viewport?.height || args.window.innerHeight;
  return { height: Math.max(1, Math.round(height)), width };
}

function populateImagePrintPages(args: {
  document: Document;
  image: HTMLImageElement;
  pageHeight: number;
  pageWidth: number;
  screenshotUrl: string;
}): void {
  args.document.body.replaceChildren();
  const page = args.document.createElement('div');
  page.className = 'sniptale-image-page';
  const image = args.document.createElement('img');
  image.alt = '';
  image.src = args.screenshotUrl;
  image.style.top = '0';
  page.append(image);
  args.document.body.append(page);
}

export async function printWebSnapshotImageProjection(args: {
  screenshotUrl: string;
  viewport: WebSnapshotViewport | null;
  hostDocument?: Document;
}): Promise<void> {
  const hostDocument = args.hostDocument ?? document;
  const hostWindow = hostDocument.defaultView;
  if (!hostWindow || !hostDocument.body) {
    throw new Error('Snapshot image print host is unavailable.');
  }
  const frame = createPrintFrame(
    hostDocument,
    args.viewport?.width ?? hostWindow.innerWidth,
    args.viewport?.height ?? hostWindow.innerHeight
  );
  const loaded = waitForFrameLoad(frame);
  frame.srcdoc = withOfflineSnapshotPolicy(
    '<!doctype html><html><head></head><body></body></html>',
    false
  );
  hostDocument.body.append(frame);

  try {
    await withProjectionTimeout(loaded, hostWindow);
    const projectionDocument = frame.contentDocument;
    const projectionWindow = frame.contentWindow;
    if (!projectionDocument || !projectionWindow) {
      throw new Error('Snapshot image print projection is unavailable.');
    }
    const probe = projectionDocument.createElement('img');
    probe.alt = '';
    probe.src = args.screenshotUrl;
    projectionDocument.body.append(probe);
    await withProjectionTimeout(waitForImage(probe), hostWindow);
    const pageSize = resolveImagePrintPageSize({
      image: probe,
      viewport: args.viewport,
      window: projectionWindow,
    });
    appendImagePrintStyles(projectionDocument, pageSize.width, pageSize.height);
    populateImagePrintPages({
      document: projectionDocument,
      image: probe,
      pageHeight: pageSize.height,
      pageWidth: pageSize.width,
      screenshotUrl: args.screenshotUrl,
    });
    await withProjectionTimeout(
      waitForProjectionLayout(projectionDocument, projectionWindow),
      hostWindow
    );
    projectionWindow.focus();
    projectionWindow.print();
  } finally {
    frame.remove();
  }
}
