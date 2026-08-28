import {
  isSafeWebSnapshotCaptureAssetUrl,
  sanitizeWebSnapshotCssText,
} from '../../../../features/web-snapshot/public';
import { collectOpenShadowHosts } from '../../dom-tree-parser/traversal/virtual-dom.helpers';
import { isAccessibleDocumentRuntimeStyle } from '../../../platform/frame';

const SHADOW_STYLE_HOST_ATTRIBUTE = 'data-sniptale-shadow-style-host';
const SHADOW_BOUNDARY_ATTRIBUTE = 'data-sniptale-shadow-boundary';

interface MarkedShadowStyleHost {
  host: Element;
  id: string;
  previousMarker: string | null;
  shadowRoot: ShadowRoot;
}

function rewriteCapturedCssUrl(value: string, baseUrl: string): string | null {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith('#')) return trimmedValue;
  if (!isSafeWebSnapshotCaptureAssetUrl(trimmedValue, baseUrl)) return null;
  try {
    const resolved = new URL(trimmedValue, baseUrl);
    return ['data:', 'http:', 'https:'].includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

function readStyleSheetRules(sheet: CSSStyleSheet, documentBaseUrl: string): string | null {
  try {
    const stylesheetBaseUrl = sheet.href ?? documentBaseUrl;
    return Array.from(sheet.cssRules)
      .map((rule) =>
        sanitizeWebSnapshotCssText(rule.cssText, (url) =>
          rewriteCapturedCssUrl(url, stylesheetBaseUrl)
        )
      )
      .filter(Boolean)
      .join('\n');
  } catch {
    return null;
  }
}

function sanitizeCapturedCssText(cssText: string, stylesheetBaseUrl: string): string {
  return sanitizeWebSnapshotCssText(cssText, (url) =>
    rewriteCapturedCssUrl(url, stylesheetBaseUrl)
  );
}

function readAuthoredInlineStyleRules(owner: Element): string[] | null {
  const authoredCssText = owner.textContent?.trim() ?? '';
  if (owner.tagName.toLowerCase() !== 'style' || !authoredCssText) return null;
  const parserDocument = owner.ownerDocument.implementation.createHTMLDocument(
    'web-snapshot-inline-style-parser'
  );
  const parserStyle = parserDocument.createElement('style');
  parserStyle.textContent = authoredCssText;
  parserDocument.head.appendChild(parserStyle);
  const parserSheet = parserStyle.sheet;
  if (!parserSheet) return null;
  return Array.from(parserSheet.cssRules, (rule) => rule.cssText);
}

function readLosslessInlineStyleSheet(
  sheet: CSSStyleSheet,
  owner: Element | undefined,
  documentBaseUrl: string
): string | null {
  if (!owner || owner.tagName.toLowerCase() !== 'style') return null;
  const authoredCssText = owner.textContent?.trim() ?? '';
  const authoredRules = readAuthoredInlineStyleRules(owner);
  if (!authoredCssText || !authoredRules) return null;
  try {
    const liveRules = Array.from(sheet.cssRules, (rule) => rule.cssText);
    const authoredRulesRemainPrefix = authoredRules.every(
      (rule, index) => liveRules[index] === rule
    );
    const authoredRulesRemainSuffix = authoredRules.every(
      (rule, index) => liveRules[liveRules.length - authoredRules.length + index] === rule
    );
    const stylesheetBaseUrl = sheet.href ?? documentBaseUrl;
    const sanitizedAuthoredCss = sanitizeCapturedCssText(authoredCssText, stylesheetBaseUrl);
    if (liveRules.length === authoredRules.length && authoredRulesRemainPrefix) {
      return sanitizedAuthoredCss;
    }
    if (liveRules.length > authoredRules.length && authoredRulesRemainPrefix) {
      const appendedCss = liveRules
        .slice(authoredRules.length)
        .map((rule) => sanitizeCapturedCssText(rule, stylesheetBaseUrl))
        .filter(Boolean)
        .join('\n');
      return [sanitizedAuthoredCss, appendedCss].filter(Boolean).join('\n');
    }
    if (liveRules.length > authoredRules.length && authoredRulesRemainSuffix) {
      const prependedCss = liveRules
        .slice(0, liveRules.length - authoredRules.length)
        .map((rule) => sanitizeCapturedCssText(rule, stylesheetBaseUrl))
        .filter(Boolean)
        .join('\n');
      return [prependedCss, sanitizedAuthoredCss].filter(Boolean).join('\n');
    }
    return null;
  } catch {
    return null;
  }
}

function appendMaterializedStyle(
  snapshot: Document,
  sheet: CSSStyleSheet,
  cssText: string,
  fallbackOwner: Element | undefined,
  target: Element = snapshot.head
): void {
  if (!cssText) return;
  const style = snapshot.createElement('style');
  style.setAttribute('data-sniptale-captured-stylesheet', 'true');
  const media = (sheet.media?.mediaText ?? fallbackOwner?.getAttribute('media') ?? '').trim();
  style.textContent = media ? `@media ${media} {\n${cssText}\n}` : cssText;
  target.appendChild(style);
}

function appendRestrictedStylesheetLink(
  snapshot: Document,
  sheet: CSSStyleSheet,
  fallbackOwner: Element | undefined
): void {
  const owner = sheet.ownerNode ?? fallbackOwner;
  if (!(owner instanceof Element) || owner.tagName.toLowerCase() !== 'link') return;
  snapshot.head.appendChild(snapshot.importNode(owner, true));
}

function preserveSourceStylesheetLink(
  snapshot: Document,
  sheet: CSSStyleSheet,
  fallbackOwner: Element | undefined
): boolean {
  const owner = sheet.ownerNode ?? fallbackOwner;
  if (!(owner instanceof Element) || owner.tagName.toLowerCase() !== 'link') return false;
  appendRestrictedStylesheetLink(snapshot, sheet, fallbackOwner);
  return true;
}

function appendCapturedRenderingEnvironmentStyle(
  sourceDocument: Document,
  snapshot: Document
): void {
  const sourceBody = sourceDocument.body;
  const sourceWindow = sourceDocument.defaultView;
  if (!sourceBody || !sourceWindow) return;
  const computedStyle = sourceWindow.getComputedStyle(sourceBody);
  const fontSize = computedStyle.fontSize.trim();
  const fontFamily = computedStyle.fontFamily.trim();
  const numericFontSize = fontSize.endsWith('px') ? Number(fontSize.slice(0, -2)) : Number.NaN;
  if (!Number.isFinite(numericFontSize) || numericFontSize <= 0) return;
  if (!fontFamily) return;

  const style = snapshot.createElement('style');
  style.setAttribute('data-sniptale-captured-rendering-environment', 'true');
  style.textContent = `body { font-family: ${fontFamily}; font-size: ${fontSize}; }`;
  snapshot.head.appendChild(style);
}

function resolveSourceStylesheetOwner(
  sheet: CSSStyleSheet,
  sourceOwners: Element[]
): Element | undefined {
  if (sheet.ownerNode instanceof Element) return sheet.ownerNode;
  return sourceOwners.find(
    (owner) => (owner as HTMLStyleElement | HTMLLinkElement).sheet === sheet
  );
}

/** Materializes the live CSSOM because runtime-inserted rules are not represented by DOM cloning. */
export function materializePreparedSnapshotStyles(
  sourceDocument: Document,
  snapshot: Document
): void {
  for (const element of snapshot.head.querySelectorAll('style, link[rel~="stylesheet"]')) {
    element.remove();
  }

  const sourceOwners = Array.from(
    sourceDocument.querySelectorAll('style, link[rel~="stylesheet"]')
  );
  for (const sheet of Array.from(sourceDocument.styleSheets)) {
    if (sheet.disabled) continue;
    const fallbackOwner = resolveSourceStylesheetOwner(sheet, sourceOwners);
    const owner = sheet.ownerNode instanceof Element ? sheet.ownerNode : fallbackOwner;
    if (isAccessibleDocumentRuntimeStyle(owner)) continue;
    // Preserve authored linked CSS bytes. Chromium's CSSOM serialization can expand shorthands
    // containing var() into empty longhands, which changes
    // box geometry when reparsed. The asset pipeline captures and sanitizes this link recursively.
    if (preserveSourceStylesheetLink(snapshot, sheet, fallbackOwner)) continue;
    const cssText =
      readLosslessInlineStyleSheet(sheet, owner, sourceDocument.baseURI) ??
      readStyleSheetRules(sheet, sourceDocument.baseURI);
    if (cssText === null) {
      appendRestrictedStylesheetLink(snapshot, sheet, fallbackOwner);
      continue;
    }
    appendMaterializedStyle(snapshot, sheet, cssText, fallbackOwner);
  }
  for (const sheet of sourceDocument.adoptedStyleSheets ?? []) {
    if (sheet.disabled) continue;
    const cssText = readStyleSheetRules(sheet, sourceDocument.baseURI);
    if (cssText !== null) appendMaterializedStyle(snapshot, sheet, cssText, undefined);
  }
  appendCapturedRenderingEnvironmentStyle(sourceDocument, snapshot);
}

export function markPreparedSnapshotShadowStyles(sourceDocument: Document): {
  cleanup(): void;
  encapsulate(snapshot: Document): void;
  materialize(snapshot: Document): void;
} {
  const marked = collectOpenShadowHosts(sourceDocument).flatMap(
    (host, index): MarkedShadowStyleHost[] => {
      const shadowRoot = host.shadowRoot;
      if (!shadowRoot) return [];
      const previousMarker = host.getAttribute(SHADOW_STYLE_HOST_ATTRIBUTE);
      const id = `sniptale-shadow-style-${index + 1}`;
      host.setAttribute(SHADOW_STYLE_HOST_ATTRIBUTE, id);
      return [{ host, id, previousMarker, shadowRoot }];
    }
  );

  return {
    cleanup() {
      for (const item of marked) {
        if (item.previousMarker === null) item.host.removeAttribute(SHADOW_STYLE_HOST_ATTRIBUTE);
        else item.host.setAttribute(SHADOW_STYLE_HOST_ATTRIBUTE, item.previousMarker);
      }
    },
    encapsulate(snapshot) {
      for (const item of [...marked].reverse()) {
        const target = snapshot.querySelector(`[${SHADOW_STYLE_HOST_ATTRIBUTE}="${item.id}"]`);
        if (!target) continue;
        const boundary = Array.from(target.children).find(
          (child) => child.getAttribute(SHADOW_BOUNDARY_ATTRIBUTE) === item.id
        );
        if (!(boundary instanceof HTMLTemplateElement)) continue;
        while (boundary.nextSibling) boundary.content.appendChild(boundary.nextSibling);
        boundary.removeAttribute(SHADOW_BOUNDARY_ATTRIBUTE);
        boundary.setAttribute('shadowrootmode', 'open');
        target.removeAttribute(SHADOW_STYLE_HOST_ATTRIBUTE);
      }
    },
    materialize(snapshot) {
      for (const item of marked) {
        const target = snapshot.querySelector(`[${SHADOW_STYLE_HOST_ATTRIBUTE}="${item.id}"]`);
        if (!target) continue;
        const boundary = snapshot.createElement('template');
        boundary.setAttribute(SHADOW_BOUNDARY_ATTRIBUTE, item.id);
        const firstShadowNode = target.childNodes[item.host.childNodes.length] ?? null;
        target.insertBefore(boundary, firstShadowNode);
        const sourceOwners = Array.from(
          item.shadowRoot.querySelectorAll('style, link[rel~="stylesheet"]')
        );
        for (const sheet of Array.from(item.shadowRoot.styleSheets ?? [])) {
          if (sheet.disabled) continue;
          const owner = resolveSourceStylesheetOwner(sheet, sourceOwners);
          if (isAccessibleDocumentRuntimeStyle(owner)) continue;
          const cssText = readStyleSheetRules(sheet, sourceDocument.baseURI);
          if (cssText !== null)
            appendMaterializedStyle(snapshot, sheet, cssText, undefined, target);
        }
        for (const sheet of item.shadowRoot.adoptedStyleSheets ?? []) {
          if (sheet.disabled) continue;
          const cssText = readStyleSheetRules(sheet, sourceDocument.baseURI);
          if (cssText !== null)
            appendMaterializedStyle(snapshot, sheet, cssText, undefined, target);
        }
      }
    },
  };
}
