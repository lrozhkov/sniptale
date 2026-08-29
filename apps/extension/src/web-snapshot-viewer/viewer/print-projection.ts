import type { WebSnapshotViewport } from '@sniptale/runtime-contracts/web-snapshot';
import { hydrateSnapshotDeclarativeShadowDom } from './declarative-shadow';
import { withOfflineSnapshotPolicy } from './document-policy';

const CSS_IMPORT_RULE = 3;
const CSS_MEDIA_RULE = 4;
const PRINT_PROJECTION_TIMEOUT_MS = 15_000;

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

function serializeCssRule(rule: CSSRule, targetWindow: Window): string {
  if (rule.type === CSS_MEDIA_RULE) {
    const mediaRule = rule as CSSMediaRule;
    return mediaMatches(mediaRule.conditionText, targetWindow)
      ? serializeCssRules(mediaRule.cssRules, targetWindow)
      : '';
  }

  if (rule.type === CSS_IMPORT_RULE) {
    const importRule = rule as CSSImportRule;
    if (!mediaMatches(importRule.media.mediaText, targetWindow)) return '';
    if (!importRule.styleSheet) {
      throw new Error('Snapshot print stylesheet import is unavailable.');
    }
    return serializeCssRules(importRule.styleSheet.cssRules, targetWindow);
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

function appendPrintStyles(document: Document, viewport: WebSnapshotViewport | null): void {
  const width = Math.max(1, Math.round(viewport?.width ?? document.documentElement.clientWidth));
  const height = Math.max(1, Math.round(viewport?.height ?? document.documentElement.clientHeight));
  const style = createProjectionStyleElement(document);
  style.setAttribute('data-sniptale-print-policy', '');
  style.textContent = [
    `@page{size:${width}px ${height}px;margin:0}`,
    `html,body{width:${width}px;margin:0!important;`,
    '-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}',
    'img,svg,canvas,video,table,pre,blockquote{break-inside:avoid-page}',
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

  const frame = hostDocument.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${Math.max(1, Math.round(args.viewport?.width ?? hostWindow.innerWidth))}px`,
    `height:${Math.max(1, Math.round(args.viewport?.height ?? hostWindow.innerHeight))}px`,
    'border:0',
    'pointer-events:none',
  ].join(';');
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
    freezeSnapshotMediaQueries(projectionDocument, projectionWindow);
    appendPrintStyles(projectionDocument, args.viewport);
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
