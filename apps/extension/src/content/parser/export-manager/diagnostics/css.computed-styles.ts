import type { ArchiveAsset } from '../archive';
import {
  COMPUTED_STYLE_TARGET_SELECTORS,
  MAX_COMPUTED_STYLE_TARGETS,
  type ComputedStyleSnapshot,
} from './css.constants';
import { listComputedStyleRootTargets, queryComputedStyleTargets } from './dom-driver';
import {
  resolveDiagnosticsDocument,
  resolveOptionalDiagnosticsView,
  type ExportDiagnosticsSource,
} from './source';

const ALLOWED_COMPUTED_STYLE_PROPERTIES = [
  'background-color',
  'color',
  'display',
  'font-size',
  'font-weight',
  'gap',
  'grid-template-columns',
  'height',
  'justify-content',
  'margin',
  'opacity',
  'padding',
  'position',
  'visibility',
  'width',
  'z-index',
] as const;

function roundNumber(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function getSiblingIndex(element: Element): number {
  let index = 1;
  let previous = element.previousElementSibling;

  while (previous) {
    if (previous.tagName === element.tagName) {
      index += 1;
    }

    previous = previous.previousElementSibling;
  }

  return index;
}

function buildElementPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && segments.length < 6) {
    const tagName = current.tagName.toLowerCase();
    const siblingIndex = getSiblingIndex(current);
    const nthSuffix = siblingIndex > 1 ? `:nth-of-type(${siblingIndex})` : '';

    segments.unshift(`${tagName}${nthSuffix}`);
    current = current.parentElement;
  }

  return segments.join(' > ');
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

    styles[propertyName] = value;
  }

  return styles;
}

function serializeComputedStyleTarget(
  element: HTMLElement,
  elementIndex: number,
  sourceView: Window
): ComputedStyleSnapshot {
  const rect = element.getBoundingClientRect();

  return {
    elementRef: `e${elementIndex + 1}`,
    path: buildElementPath(element),
    rect: {
      height: roundNumber(rect.height),
      width: roundNumber(rect.width),
      x: roundNumber(rect.x),
      y: roundNumber(rect.y),
    },
    styles: buildComputedStyleMap(element, sourceView),
    tagName: element.tagName.toLowerCase(),
  };
}

export function buildComputedStyleDiagnosticAsset(source?: ExportDiagnosticsSource): ArchiveAsset {
  const sourceView = resolveOptionalDiagnosticsView(source);
  const targets = collectComputedStyleTargets(source);

  return {
    path: 'logs/css/computed-styles.json',
    content: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
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
