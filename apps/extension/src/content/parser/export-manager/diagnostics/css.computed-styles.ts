import type { ArchiveAsset } from '../archive';
import {
  COMPUTED_STYLE_TARGET_SELECTORS,
  MAX_COMPUTED_STYLE_TARGETS,
  type ComputedStyleSnapshot,
} from './css.constants';
import {
  buildDiagnosticElementPath,
  listComputedStyleRootTargets,
  queryComputedStyleTargets,
} from './dom-driver';
import {
  resolveDiagnosticsDocument,
  resolveOptionalDiagnosticsView,
  type ExportDiagnosticsSource,
} from './source';
import { sanitizeDiagnosticUrl } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { sanitizeCssDiagnosticContent, sanitizeCssDiagnosticScalar } from './css.sanitizer';

const ALLOWED_COMPUTED_STYLE_PROPERTIES = [
  'background-color',
  'background-image',
  'color',
  'display',
  'font-size',
  'font-family',
  'font-style',
  'font-weight',
  'gap',
  'grid-template-columns',
  'height',
  'justify-content',
  'line-height',
  'mask-image',
  'margin',
  'opacity',
  'padding',
  'position',
  'visibility',
  'width',
  'z-index',
] as const;
const MAX_MATCHED_RULES_PER_TARGET = 16;
const MAX_SCANNED_RULES_PER_TARGET = 4_096;

function roundNumber(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function isVisibleDiagnosticTarget(element: Element, sourceView: Window): element is HTMLElement {
  const elementView = sourceView as Window & typeof globalThis;
  if (!(element instanceof elementView.HTMLElement)) {
    return false;
  }

  if (element.closest('#sniptale-extension-root')) {
    return false;
  }

  const computedStyle = sourceView.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const hasBox = rect.width > 0 || rect.height > 0;
  const isVisible =
    computedStyle.display !== 'none' &&
    computedStyle.visibility !== 'hidden' &&
    computedStyle.opacity !== '0';

  return isVisible && hasBox;
}

function collectComputedStyleTargets(source?: ExportDiagnosticsSource): HTMLElement[] {
  const documentRoot = resolveDiagnosticsDocument(source);
  const sourceView = resolveOptionalDiagnosticsView(source);
  const targets: HTMLElement[] = [];
  const seen = new Set<Element>();

  if (!sourceView) {
    return [];
  }

  const tryAdd = (element: Element | null) => {
    if (!element || seen.has(element) || !isVisibleDiagnosticTarget(element, sourceView)) {
      return;
    }

    seen.add(element);
    targets.push(element);
  };

  for (const rootTarget of listComputedStyleRootTargets(documentRoot)) {
    tryAdd(rootTarget);
  }

  for (const selector of COMPUTED_STYLE_TARGET_SELECTORS) {
    if (targets.length >= MAX_COMPUTED_STYLE_TARGETS) {
      break;
    }

    const elements = queryComputedStyleTargets(selector, documentRoot);

    for (const element of elements) {
      tryAdd(element);

      if (targets.length >= MAX_COMPUTED_STYLE_TARGETS) {
        break;
      }
    }
  }

  return targets;
}

function buildComputedStyleMap(element: HTMLElement, sourceView: Window): Record<string, string> {
  const computedStyle = sourceView.getComputedStyle(element);
  const styles: Record<string, string> = {};

  for (const propertyName of ALLOWED_COMPUTED_STYLE_PROPERTIES) {
    const value = computedStyle.getPropertyValue(propertyName);
    if (!value) {
      continue;
    }

    styles[propertyName] = sanitizeCssDiagnosticScalar(value);
  }

  return styles;
}

function buildPseudoElementStyleMap(
  element: HTMLElement,
  sourceView: Window,
  pseudo: '::after' | '::before'
): Record<string, string> | null {
  const computedStyle = sourceView.getComputedStyle(element, pseudo);
  const properties = ['background-image', 'content', 'font-family', 'mask-image'] as const;
  const content = computedStyle.getPropertyValue('content');
  const backgroundImage = computedStyle.getPropertyValue('background-image');
  const maskImage = computedStyle.getPropertyValue('mask-image');
  const hasRenderedContent = Boolean(content && content !== 'none' && content !== 'normal');
  const hasRenderedImage = [backgroundImage, maskImage].some(
    (value) => value && value !== 'none' && value !== 'normal'
  );
  if (!hasRenderedContent && !hasRenderedImage) return null;
  const styles = Object.fromEntries(
    properties
      .map((property) => {
        const value = computedStyle.getPropertyValue(property);
        return [
          property,
          property === 'content'
            ? sanitizeCssDiagnosticContent(value)
            : sanitizeCssDiagnosticScalar(value),
        ] as const;
      })
      .filter(([, value]) => value && value !== 'none' && value !== 'normal')
  );
  return Object.keys(styles).length > 0 ? styles : null;
}

function collectMatchedRules(
  element: HTMLElement,
  sourceView: Window
): NonNullable<ComputedStyleSnapshot['matchedRules']> {
  const matched: NonNullable<ComputedStyleSnapshot['matchedRules']> = [];
  let scannedRuleCount = 0;
  const visit = (
    rules: CSSRuleList,
    stylesheet: string | null,
    media: string | null,
    active: boolean | null
  ): void => {
    for (const rule of Array.from(rules)) {
      if (matched.length >= MAX_MATCHED_RULES_PER_TARGET) return;
      scannedRuleCount += 1;
      if (scannedRuleCount > MAX_SCANNED_RULES_PER_TARGET) return;
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        try {
          if (!element.matches(styleRule.selectorText)) continue;
        } catch {
          continue;
        }
        const properties = Object.fromEntries(
          ALLOWED_COMPUTED_STYLE_PROPERTIES.flatMap((property) => {
            const value = styleRule.style.getPropertyValue(property);
            return value
              ? [
                  [
                    property,
                    {
                      important: styleRule.style.getPropertyPriority(property) === 'important',
                      value: sanitizeCssDiagnosticScalar(value),
                    },
                  ],
                ]
              : [];
          })
        );
        if (Object.keys(properties).length > 0) {
          matched.push({
            active,
            media: media ? sanitizeCssDiagnosticScalar(media) : null,
            properties,
            selector: sanitizeCssDiagnosticScalar(styleRule.selectorText),
            stylesheet,
          });
        }
        continue;
      }
      if (!('cssRules' in rule)) continue;
      const condition = 'conditionText' in rule ? String(rule.conditionText) : null;
      const isMedia = rule.type === CSSRule.MEDIA_RULE;
      let nestedActive = active;
      if (isMedia && condition) {
        nestedActive = sourceView.matchMedia ? sourceView.matchMedia(condition).matches : null;
      }
      try {
        visit((rule as CSSGroupingRule).cssRules, stylesheet, condition ?? media, nestedActive);
      } catch {
        // Restricted nested rules remain represented by the stylesheet inventory.
      }
    }
  };
  for (const sheet of Array.from(element.ownerDocument.styleSheets)) {
    try {
      visit(sheet.cssRules, sanitizeDiagnosticUrl(sheet.href ?? undefined) ?? null, null, true);
    } catch {
      // Cross-origin sheets remain represented by stylesheets.json.
    }
  }
  return matched;
}

function serializeComputedStyleTarget(
  element: HTMLElement,
  elementIndex: number,
  sourceView: Window
): ComputedStyleSnapshot {
  const rect = element.getBoundingClientRect();
  const before = buildPseudoElementStyleMap(element, sourceView, '::before');
  const after = buildPseudoElementStyleMap(element, sourceView, '::after');
  const pseudoElements = {
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  };

  return {
    elementRef: `e${elementIndex + 1}`,
    path: buildDiagnosticElementPath(element),
    rect: {
      height: roundNumber(rect.height),
      width: roundNumber(rect.width),
      x: roundNumber(rect.x),
      y: roundNumber(rect.y),
    },
    styles: buildComputedStyleMap(element, sourceView),
    matchedRules: collectMatchedRules(element, sourceView),
    ...(Object.keys(pseudoElements).length > 0 ? { pseudoElements } : {}),
    tagName: element.tagName.toLowerCase(),
  };
}

export function buildComputedStyleDiagnosticAsset(source?: ExportDiagnosticsSource): ArchiveAsset {
  const sourceView = resolveOptionalDiagnosticsView(source);
  const sourceDocument = resolveDiagnosticsDocument(source);
  const targets = collectComputedStyleTargets(source);

  return {
    path: 'logs/css/computed-styles.json',
    content: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        source: {
          elementCount: sourceDocument.querySelectorAll('*').length,
          hasView: sourceView !== undefined,
        },
        totalTargets: targets.length,
        targets: sourceView
          ? targets.map((target, index) => serializeComputedStyleTarget(target, index, sourceView))
          : [],
      },
      null,
      2
    ),
  };
}
