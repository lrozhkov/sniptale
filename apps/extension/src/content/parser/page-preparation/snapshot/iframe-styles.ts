import { getIframeDocument, isAccessibleDocumentRuntimeStyle } from '../../../platform/frame';
import type { VirtualDomOriginalElementResolver } from '../../dom-tree-parser/traversal';
import { sanitizePreparedSnapshotCapturedCssText } from './style-assets';

const IFRAME_STYLE_SCOPE_ATTRIBUTE = 'data-sniptale-iframe-style-scope';

function splitCssList(value: string): string[] {
  const items: string[] = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') parentheses += 1;
    else if (character === ')') parentheses = Math.max(0, parentheses - 1);
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets = Math.max(0, brackets - 1);
    else if (character === ',' && parentheses === 0 && brackets === 0) {
      items.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(value.slice(start).trim());
  return items.filter(Boolean);
}

function escapeCssString(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/[\n\r\f]/gu, ' ');
}

function createScopeSelectors(scopeId: string): { container: string; owner: string } {
  const owner = `[${IFRAME_STYLE_SCOPE_ATTRIBUTE}="${escapeCssString(scopeId)}"]`;
  return {
    container: `[data-virtual-iframe="true"]${owner}`,
    owner,
  };
}

function constrainSelectorTarget(selector: string, ownerSelector: string): string {
  const trimmed = selector.trim();
  const pseudoElementIndex = trimmed.lastIndexOf('::');
  const constraint = `:where(${ownerSelector})`;
  return pseudoElementIndex >= 0
    ? `${trimmed.slice(0, pseudoElementIndex)}${constraint}${trimmed.slice(pseudoElementIndex)}`
    : `${trimmed}${constraint}`;
}

function containsFunctionalRootCompound(selector: string): boolean {
  let parentheses = 0;
  let brackets = 0;
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index] ?? '';
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[') {
      brackets += 1;
      continue;
    }
    if (character === ']') {
      brackets = Math.max(0, brackets - 1);
      continue;
    }
    if (brackets > 0) continue;
    if (character === '(') {
      parentheses += 1;
      continue;
    }
    if (character === ')') {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (parentheses === 0) continue;
    const remainder = selector.slice(index);
    const rootMatch = /^(?:html|body|:root)(?=$|[.#:[\s>+~,\)])/iu.exec(remainder);
    if (rootMatch) return true;
  }
  return false;
}

function projectIframeSelector(
  selector: string,
  selectors: { container: string; owner: string },
  iframeDocument: Document
): string {
  if (/:has\s*\(/iu.test(selector) || containsFunctionalRootCompound(selector)) {
    return ':not(*)';
  }
  let projectedRoot = false;
  const projected = selector.replace(
    /(^|[\s>+~])((?:html|body|:root)(?:[^\s>+~]*))/giu,
    (match, leading: string, compound: string) => {
      const target = compound.toLowerCase().startsWith('body')
        ? iframeDocument.body
        : iframeDocument.documentElement;
      const normalizedCompound = compound.replace(/^:root/iu, 'html');
      let matches = false;
      try {
        matches = target.matches(normalizedCompound);
      } catch {
        return match;
      }
      projectedRoot = true;
      return `${leading}${matches ? selectors.container : ':not(*)'}`;
    }
  );
  let collapsedRootChain = projected;
  if (projectedRoot) {
    while (
      collapsedRootChain.includes(`${selectors.container} ${selectors.container}`) ||
      collapsedRootChain.includes(`${selectors.container} > ${selectors.container}`)
    ) {
      collapsedRootChain = collapsedRootChain
        .replace(`${selectors.container} > ${selectors.container}`, selectors.container)
        .replace(`${selectors.container} ${selectors.container}`, selectors.container);
    }
  }
  const scoped = projectedRoot
    ? collapsedRootChain
    : `${selectors.container} ${collapsedRootChain}`;
  return constrainSelectorTarget(scoped, selectors.owner);
}

function normalizeFontFamilyName(value: string): string {
  return value
    .trim()
    .replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, '$1$2')
    .toLowerCase();
}

function collectIframeFontAliases(
  rules: CSSRuleList,
  captureToken: string,
  scopeOrdinal: number,
  aliases: Map<string, string>
): void {
  for (const rule of Array.from(rules)) {
    if (/^@font-face\b/iu.test(rule.cssText) && 'style' in rule) {
      const family = (rule as CSSFontFaceRule).style.getPropertyValue('font-family');
      const normalized = normalizeFontFamilyName(family);
      if (normalized && !aliases.has(normalized)) {
        aliases.set(
          normalized,
          `sniptale-iframe-font-${captureToken}-${scopeOrdinal}-${aliases.size + 1}`
        );
      }
      continue;
    }
    if ('cssRules' in rule && /^@(media|supports)\b/iu.test(rule.cssText)) {
      collectIframeFontAliases(
        (rule as CSSGroupingRule).cssRules,
        captureToken,
        scopeOrdinal,
        aliases
      );
    }
  }
}

function rewriteFontFamilyList(value: string, aliases: ReadonlyMap<string, string>): string {
  return splitCssList(value)
    .map((family) => {
      const replacement = aliases.get(normalizeFontFamilyName(family));
      return replacement ? `"${replacement}"` : family;
    })
    .join(', ');
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function rewriteFontShorthand(value: string, aliases: ReadonlyMap<string, string>): string {
  let rewritten = value;
  for (const [family, replacement] of aliases) {
    const escaped = escapeRegularExpression(family);
    rewritten = rewritten
      .replace(new RegExp(`(["'])${escaped}\\1`, 'giu'), `"${replacement}"`)
      .replace(
        new RegExp(`(^|[^a-z0-9_-])${escaped}(?=$|[^a-z0-9_-])`, 'giu'),
        `$1"${replacement}"`
      );
  }
  return rewritten;
}

function sanitizeAndRewriteDeclarations(
  style: CSSStyleDeclaration,
  stylesheetBaseUrl: string,
  iframeDocument: Document,
  fontAliases: ReadonlyMap<string, string>
): string {
  const sanitized = sanitizePreparedSnapshotCapturedCssText(style.cssText, stylesheetBaseUrl);
  if (!sanitized) return '';
  const carrier = iframeDocument.createElement('span');
  carrier.style.cssText = sanitized;
  const fontFamily = carrier.style.getPropertyValue('font-family');
  if (fontFamily) {
    carrier.style.setProperty(
      'font-family',
      rewriteFontFamilyList(fontFamily, fontAliases),
      carrier.style.getPropertyPriority('font-family')
    );
  }
  const font = carrier.style.getPropertyValue('font');
  if (font) {
    carrier.style.setProperty(
      'font',
      rewriteFontShorthand(font, fontAliases),
      carrier.style.getPropertyPriority('font')
    );
  }
  return carrier.style.cssText;
}

function serializeScopedIframeCssRules(args: {
  fontAliases: ReadonlyMap<string, string>;
  iframeDocument: Document;
  rules: CSSRuleList;
  selectors: { container: string; owner: string };
  stylesheetBaseUrl: string;
}): string {
  return Array.from(args.rules)
    .map((rule) => {
      if ('selectorText' in rule && 'style' in rule) {
        const styleRule = rule as CSSStyleRule;
        const selectorText = splitCssList(styleRule.selectorText)
          .map((selector) => projectIframeSelector(selector, args.selectors, args.iframeDocument))
          .join(', ');
        const declarations = sanitizeAndRewriteDeclarations(
          styleRule.style,
          args.stylesheetBaseUrl,
          args.iframeDocument,
          args.fontAliases
        );
        return declarations ? `${selectorText} { ${declarations} }` : '';
      }
      if (/^@font-face\b/iu.test(rule.cssText) && 'style' in rule) {
        const fontFaceRule = rule as CSSFontFaceRule;
        const originalFamily = normalizeFontFamilyName(
          fontFaceRule.style.getPropertyValue('font-family')
        );
        const replacement = args.fontAliases.get(originalFamily);
        if (!replacement) return '';
        const declarations = sanitizePreparedSnapshotCapturedCssText(
          fontFaceRule.style.cssText,
          args.stylesheetBaseUrl
        );
        const rewrittenDeclarations = declarations.replace(
          /(^|;)\s*font-family\s*:[^;]*(?=;|$)/iu,
          `$1 font-family: "${replacement}"`
        );
        return rewrittenDeclarations ? `@font-face { ${rewrittenDeclarations} }` : '';
      }
      if ('cssRules' in rule && /^@(media|supports)\b/iu.test(rule.cssText)) {
        const openingBrace = rule.cssText.indexOf('{');
        if (openingBrace < 0) return '';
        const header = rule.cssText.slice(0, openingBrace).trim();
        return `${header} { ${serializeScopedIframeCssRules({
          ...args,
          rules: (rule as CSSGroupingRule).cssRules,
        })} }`;
      }
      // Keyframes, custom properties, counter styles, page rules, and imports have document-global
      // authority. A flattened iframe cannot safely publish them without complete name rewriting.
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function collectOwnedStyleSheets(iframeDocument: Document): CSSStyleSheet[] {
  return [
    ...Array.from(iframeDocument.styleSheets),
    ...(iframeDocument.adoptedStyleSheets ?? []),
  ].filter(
    (sheet) => !sheet.disabled && !isAccessibleDocumentRuntimeStyle(sheet.ownerNode ?? undefined)
  );
}

function markOwnedIframeElements(container: Element, scopeId: string): void {
  container.setAttribute(IFRAME_STYLE_SCOPE_ATTRIBUTE, scopeId);
  const pending = Array.from(container.children);
  while (pending.length > 0) {
    const element = pending.pop();
    if (!element || element.getAttribute('data-virtual-iframe') === 'true') continue;
    element.setAttribute(IFRAME_STYLE_SCOPE_ATTRIBUTE, scopeId);
    pending.push(...Array.from(element.children));
  }
}

function materializeIframeDocumentStyles(args: {
  captureToken: string;
  container: Element;
  iframeDocument: Document;
  scopeId: string;
  scopeOrdinal: number;
  snapshot: Document;
}): void {
  markOwnedIframeElements(args.container, args.scopeId);
  const styleSheets = collectOwnedStyleSheets(args.iframeDocument);
  const fontAliases = new Map<string, string>();
  for (const sheet of styleSheets) {
    try {
      collectIframeFontAliases(sheet.cssRules, args.captureToken, args.scopeOrdinal, fontAliases);
    } catch {
      // An unreadable sheet cannot be projected without breaking iframe isolation.
    }
  }
  const selectors = createScopeSelectors(args.scopeId);
  for (const sheet of styleSheets) {
    let scopedCssText = '';
    try {
      scopedCssText = serializeScopedIframeCssRules({
        fontAliases,
        iframeDocument: args.iframeDocument,
        rules: sheet.cssRules,
        selectors,
        stylesheetBaseUrl: sheet.href ?? args.iframeDocument.baseURI,
      });
    } catch {
      continue;
    }
    if (!scopedCssText) continue;
    const style = args.snapshot.createElement('style');
    style.setAttribute('data-sniptale-captured-iframe-stylesheet', args.scopeId);
    style.textContent = scopedCssText;
    args.snapshot.head.append(style);
  }
}

/** Projects readable iframe CSS into the flattened document without leaking CSS authority. */
export function materializePreparedSnapshotIframeStyles(
  snapshot: Document,
  resolveOriginalElement: VirtualDomOriginalElementResolver
): void {
  for (const element of snapshot.querySelectorAll(`[${IFRAME_STYLE_SCOPE_ATTRIBUTE}]`)) {
    element.removeAttribute(IFRAME_STYLE_SCOPE_ATTRIBUTE);
  }
  const containers = Array.from(snapshot.querySelectorAll('[data-virtual-iframe="true"]'));
  const captureToken = globalThis.crypto.randomUUID().replace(/-/gu, '');
  for (const [index, container] of containers.entries()) {
    const originalElement = resolveOriginalElement(container);
    if (
      !originalElement ||
      originalElement.nodeType !== Node.ELEMENT_NODE ||
      (originalElement as Element).tagName.toLowerCase() !== 'iframe'
    ) {
      continue;
    }
    const originalIframe = originalElement as HTMLIFrameElement;
    const iframeDocument = getIframeDocument(originalIframe);
    if (!iframeDocument?.body) continue;
    materializeIframeDocumentStyles({
      captureToken,
      container,
      iframeDocument,
      scopeId: `sniptale-frame-${captureToken}-${index + 1}`,
      scopeOrdinal: index + 1,
      snapshot,
    });
  }
}
