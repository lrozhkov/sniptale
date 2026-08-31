import { sanitizeDiagnosticUrl } from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { ArchiveAsset } from '../archive';
import { buildDiagnosticElementPath, listAccessibleDiagnosticDocuments } from './dom-driver';
import { resolveDiagnosticsDocument, type ExportDiagnosticsSource } from './source';
import { sanitizeCssDiagnosticScalar } from './css.sanitizer';

const MAX_FONT_FACES = 256;
const MAX_FONT_USAGE_TARGETS = 128;
const FONT_USAGE_SELECTOR = [
  '[class*="icon" i]',
  '[class*="glyph" i]',
  'button',
  '[role="button"]',
  'svg',
].join(',');

function sanitizeFontSourceUrl(value: string): { kind: 'embedded' | 'url'; value: string } | null {
  const trimmed = value.trim().replace(/^["']|["']$/gu, '');
  if (trimmed.startsWith('data:')) {
    const mimeType = trimmed.slice(5).split(/[;,]/u, 1)[0]?.toLowerCase() ?? 'unknown';
    return { kind: 'embedded', value: mimeType };
  }
  const sanitized = sanitizeDiagnosticUrl(trimmed);
  return sanitized ? { kind: 'url', value: sanitized } : null;
}

function collectFontFaceRules(rules: CSSRuleList, scope: string, target: unknown[]): void {
  for (const rule of Array.from(rules)) {
    if (target.length >= MAX_FONT_FACES) return;
    if (/^@font-face\b/iu.test(rule.cssText) && 'style' in rule) {
      const style = (rule as CSSFontFaceRule).style;
      const sourceUrls = Array.from(style.getPropertyValue('src').matchAll(/url\(([^)]+)\)/giu))
        .map((match) => sanitizeFontSourceUrl(match[1] ?? ''))
        .filter((value): value is NonNullable<typeof value> => value !== null);
      target.push({
        family: sanitizeCssDiagnosticScalar(style.getPropertyValue('font-family')),
        scope: sanitizeCssDiagnosticScalar(scope),
        sources: sourceUrls,
        style: sanitizeCssDiagnosticScalar(style.getPropertyValue('font-style') || 'normal'),
        weight: sanitizeCssDiagnosticScalar(style.getPropertyValue('font-weight') || 'normal'),
      });
      continue;
    }
    if ('cssRules' in rule) {
      try {
        collectFontFaceRules((rule as CSSGroupingRule).cssRules, scope, target);
      } catch {
        // Cross-origin and unsupported grouping rules remain represented by stylesheets.json.
      }
    }
  }
}

function collectDocumentFontFaces(documentRoot: Document, scope: string, target: unknown[]): void {
  const sheets = [
    ...Array.from(documentRoot.styleSheets),
    ...Array.from(documentRoot.adoptedStyleSheets ?? []),
  ];
  for (const sheet of sheets) {
    if (target.length >= MAX_FONT_FACES) return;
    try {
      collectFontFaceRules(sheet.cssRules, scope, target);
    } catch {
      // Restricted sheets remain represented by stylesheets.json.
    }
  }
}

function collectLoadedFonts(documentRoot: Document, scope: string): unknown[] {
  const fonts: FontFace[] = [];
  documentRoot.fonts?.forEach((font) => fonts.push(font));
  return fonts.slice(0, MAX_FONT_FACES).map((font) => ({
    family: sanitizeCssDiagnosticScalar(font.family),
    scope: sanitizeCssDiagnosticScalar(scope),
    status: sanitizeCssDiagnosticScalar(font.status),
    style: sanitizeCssDiagnosticScalar(font.style),
    weight: sanitizeCssDiagnosticScalar(font.weight),
  }));
}

function collectFontUsage(documentRoot: Document, scope: string): unknown[] {
  const sourceView = documentRoot.defaultView;
  if (!sourceView) return [];
  return Array.from(documentRoot.querySelectorAll(FONT_USAGE_SELECTOR))
    .slice(0, MAX_FONT_USAGE_TARGETS)
    .flatMap((element) => {
      if (element.closest('#sniptale-extension-root')) return [];
      const base = {
        path: buildDiagnosticElementPath(element),
        scope: sanitizeCssDiagnosticScalar(scope),
        tagName: element.tagName.toLowerCase(),
      };
      const probes = [null, '::before', '::after'] as const;
      return probes.flatMap((pseudo) => {
        const style = sourceView.getComputedStyle(element, pseudo);
        const family = style.getPropertyValue('font-family');
        const content = pseudo ? style.getPropertyValue('content') : '';
        if (!family || (pseudo && (!content || content === 'none' || content === 'normal'))) {
          return [];
        }
        return [{ ...base, family: sanitizeCssDiagnosticScalar(family), pseudo }];
      });
    })
    .slice(0, MAX_FONT_USAGE_TARGETS);
}

export function buildFontDiagnosticAsset(source?: ExportDiagnosticsSource): ArchiveAsset {
  const documents = listAccessibleDiagnosticDocuments(resolveDiagnosticsDocument(source));
  const declaredFaces: unknown[] = [];
  const loadedFonts: unknown[] = [];
  const usage: unknown[] = [];
  for (const entry of documents) {
    collectDocumentFontFaces(entry.document, entry.scope, declaredFaces);
    loadedFonts.push(...collectLoadedFonts(entry.document, entry.scope));
    usage.push(...collectFontUsage(entry.document, entry.scope));
  }
  return {
    path: 'logs/css/fonts.json',
    content: JSON.stringify(
      {
        source: {
          documentCount: documents.length,
          elementCount: documents.reduce(
            (total, entry) => total + entry.document.querySelectorAll('*').length,
            0
          ),
          hasView: documents.some((entry) => entry.document.defaultView !== null),
        },
        declaredFaces: declaredFaces.slice(0, MAX_FONT_FACES),
        loadedFonts: loadedFonts.slice(0, MAX_FONT_FACES),
        usage: usage.slice(0, MAX_FONT_USAGE_TARGETS),
      },
      null,
      2
    ),
  };
}
