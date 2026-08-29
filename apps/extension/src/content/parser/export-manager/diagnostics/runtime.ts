import {
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { ExportDiagnosticsSource } from './source';
import { resolveDiagnosticsDocument, resolveOptionalDiagnosticsView } from './source';

const MAX_RUNTIME_RESOURCES = 5_000;
const MAX_APPLICATION_ITEMS = 512;

function elementPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && parts.length < 6) {
    const id = current.id ? `#${current.id.replace(/[^a-zA-Z0-9_-]/gu, '_')}` : '';
    parts.unshift(`${current.localName}${id}`);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function safeLocation(view: Window | undefined): string {
  try {
    return sanitizeDiagnosticUrl(view?.location.href) ?? '';
  } catch {
    return '';
  }
}

function collectMediaState(view: Window | undefined): Record<string, boolean> {
  if (!view?.matchMedia) return {};
  return Object.fromEntries(
    (
      [
        ['colorSchemeDark', '(prefers-color-scheme: dark)'],
        ['colorSchemeLight', '(prefers-color-scheme: light)'],
        ['reducedMotion', '(prefers-reduced-motion: reduce)'],
        ['portrait', '(orientation: portrait)'],
        ['landscape', '(orientation: landscape)'],
        ['forcedColors', '(forced-colors: active)'],
      ] as const
    ).map(([name, query]) => [name, view.matchMedia(query).matches])
  );
}

export function buildRuntimePageState(source?: ExportDiagnosticsSource): Record<string, unknown> {
  const documentRoot = resolveDiagnosticsDocument(source);
  const view = resolveOptionalDiagnosticsView(source);
  const root = documentRoot.documentElement;
  return {
    capturedAt: new Date().toISOString(),
    document: {
      compatMode: documentRoot.compatMode,
      direction: root.dir || view?.getComputedStyle(root).direction || '',
      language: root.lang,
      readyState: documentRoot.readyState,
      title: sanitizeDiagnosticMessage(documentRoot.title),
      url: sanitizeDiagnosticUrl(source?.pageUrl) ?? safeLocation(view),
      visibilityState: documentRoot.visibilityState,
    },
    geometry: {
      devicePixelRatio: view?.devicePixelRatio ?? null,
      documentHeight: root.scrollHeight,
      documentWidth: root.scrollWidth,
      scrollX: view?.scrollX ?? null,
      scrollY: view?.scrollY ?? null,
      viewportHeight: view?.innerHeight ?? null,
      viewportWidth: view?.innerWidth ?? null,
    },
    counts: {
      customElements: documentRoot.querySelectorAll('*').length
        ? new Set(
            Array.from(documentRoot.querySelectorAll('*'), (element) => element.localName).filter(
              (name) => name.includes('-')
            )
          ).size
        : 0,
      elements: documentRoot.querySelectorAll('*').length,
      forms: documentRoot.forms.length,
      iframes: documentRoot.querySelectorAll('iframe, frame').length,
      openShadowRoots: Array.from(documentRoot.querySelectorAll('*')).filter(
        (element) => element.shadowRoot !== null
      ).length,
      scripts: documentRoot.scripts.length,
      stylesheets: documentRoot.styleSheets.length,
    },
    fonts: {
      available: Boolean(documentRoot.fonts),
      status: documentRoot.fonts?.status ?? 'unavailable',
    },
    media: collectMediaState(view),
    performance: {
      navigationStart: view?.performance.timeOrigin ?? null,
      now: view ? Math.round(view.performance.now()) : null,
    },
  };
}

export function buildRuntimeResourceTiming(
  source?: ExportDiagnosticsSource
): Record<string, unknown> {
  const view = resolveOptionalDiagnosticsView(source);
  const rawEntries =
    (view?.performance.getEntriesByType('resource') as PerformanceResourceTiming[] | undefined) ??
    [];
  const entries = rawEntries.slice(0, MAX_RUNTIME_RESOURCES).map((entry) => {
    const responseStatus =
      'responseStatus' in entry && typeof entry.responseStatus === 'number'
        ? entry.responseStatus
        : null;
    return {
      cache: entry.transferSize === 0 && entry.decodedBodySize > 0 ? 'likely-cache-hit' : 'unknown',
      decodedBodySize: entry.decodedBodySize || 0,
      duration: Math.round(entry.duration),
      encodedBodySize: entry.encodedBodySize || 0,
      initiatorType: entry.initiatorType || 'other',
      responseStatus,
      startTime: Math.round(entry.startTime),
      transferSize: entry.transferSize || 0,
      url: sanitizeDiagnosticUrl(entry.name) ?? '',
    };
  });
  return {
    capturedAt: new Date().toISOString(),
    entries,
    omitted: Math.max(0, rawEntries.length - entries.length),
    total: rawEntries.length,
  };
}

function collectFrameworkHints(documentRoot: Document): string[] {
  const hints = new Set<string>();
  if (documentRoot.querySelector('[data-reactroot], [data-reactid], #__next')) hints.add('react');
  if (documentRoot.querySelector('[data-v-app], [data-vue-meta]')) hints.add('vue');
  if (documentRoot.querySelector('[ng-version], [ng-app]')) hints.add('angular');
  if (documentRoot.querySelector('[data-svelte-h]')) hints.add('svelte');
  return [...hints];
}

export function buildRuntimeApplicationMap(
  source?: ExportDiagnosticsSource
): Record<string, unknown> {
  const documentRoot = resolveDiagnosticsDocument(source);
  const elements = Array.from(documentRoot.querySelectorAll('*'));
  const customElements = [...new Set(elements.map((element) => element.localName))]
    .filter((name) => name.includes('-'))
    .slice(0, MAX_APPLICATION_ITEMS);
  const landmarks = elements
    .filter(
      (element) =>
        ['main', 'nav', 'header', 'footer', 'aside', 'form'].includes(element.localName) ||
        element.hasAttribute('role')
    )
    .slice(0, MAX_APPLICATION_ITEMS)
    .map((element) => ({ path: elementPath(element), role: element.getAttribute('role') }));
  const controls = Array.from(
    documentRoot.querySelectorAll('button, input, select, textarea, [role="button"]')
  )
    .slice(0, MAX_APPLICATION_ITEMS)
    .map((element) => ({
      ariaLabel: sanitizeDiagnosticMessage(element.getAttribute('aria-label') ?? ''),
      disabled: element.matches(':disabled, [aria-disabled="true"]'),
      path: elementPath(element),
      tagName: element.localName,
      type: element.getAttribute('type'),
    }));
  const opaqueSurfaces = Array.from(documentRoot.querySelectorAll('canvas, video'))
    .slice(0, MAX_APPLICATION_ITEMS)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        kind: element.localName === 'canvas' ? 'canvas-or-webgl' : 'video',
        height: Math.round(rect.height),
        path: elementPath(element),
        width: Math.round(rect.width),
      };
    });
  return {
    applicationRoots: elements
      .filter(
        (element) => /^(?:app|root|main)$/iu.test(element.id) || element.hasAttribute('data-app')
      )
      .slice(0, MAX_APPLICATION_ITEMS)
      .map(elementPath),
    controls,
    customElements,
    frameworkHints: collectFrameworkHints(documentRoot),
    importMaps: Array.from(documentRoot.querySelectorAll('script[type="importmap"]')).length,
    landmarks,
    moduleScripts: Array.from(documentRoot.querySelectorAll('script[type="module"]'))
      .slice(0, MAX_APPLICATION_ITEMS)
      .map((script) => ({
        inline: !script.hasAttribute('src'),
        src: sanitizeDiagnosticUrl(script.getAttribute('src') ?? undefined) ?? null,
      })),
    opaqueSurfaces,
  };
}
