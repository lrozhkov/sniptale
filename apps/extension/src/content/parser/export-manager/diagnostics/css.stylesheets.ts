import type { ArchiveAsset } from '../archive';
import { sanitizeDiagnosticUrl } from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { StylesheetMetadata } from './css.constants';
import { resolveDiagnosticsDocument, type ExportDiagnosticsSource } from './source';
import { listAccessibleDiagnosticDocuments } from './dom-driver';
import { sanitizeCssDiagnosticScalar } from './css.sanitizer';

const MAX_STYLESHEET_RECORDS = 512;
const MAX_STYLESHEET_MEDIA_VALUES = 32;

function getOwnerNodeMetadata(sheet: CSSStyleSheet): Record<string, unknown> | null {
  const ownerNode = sheet.ownerNode;
  const ownerElementConstructor =
    ownerNode?.ownerDocument?.defaultView?.Element ??
    (typeof Element === 'undefined' ? undefined : Element);

  if (!ownerElementConstructor || !(ownerNode instanceof ownerElementConstructor)) {
    return null;
  }

  return {
    dataUi: ownerNode.getAttribute('data-ui')
      ? sanitizeCssDiagnosticScalar(ownerNode.getAttribute('data-ui') ?? '')
      : null,
    id: ownerNode.id ? sanitizeCssDiagnosticScalar(ownerNode.id) : null,
    media: ownerNode.getAttribute('media')
      ? sanitizeCssDiagnosticScalar(ownerNode.getAttribute('media') ?? '')
      : null,
    rel: ownerNode.getAttribute('rel')
      ? sanitizeCssDiagnosticScalar(ownerNode.getAttribute('rel') ?? '')
      : null,
    tagName: ownerNode.tagName.toLowerCase(),
  };
}

function getAdoptedStyleSheets(documentRoot: Document): CSSStyleSheet[] {
  const documentWithAdoptedStylesheets = documentRoot as Document & {
    adoptedStyleSheets?: CSSStyleSheet[];
  };

  return documentWithAdoptedStylesheets.adoptedStyleSheets ?? [];
}

function getStylesheetMediaValues(sheet: CSSStyleSheet): string[] {
  if (!sheet.media) {
    return [];
  }

  return Array.from(sheet.media)
    .slice(0, MAX_STYLESHEET_MEDIA_VALUES)
    .map(sanitizeCssDiagnosticScalar);
}

function serializeStylesheetRules(sheet: CSSStyleSheet): {
  restricted: boolean;
  ruleCount: number | null;
} {
  try {
    const rules = Array.from(sheet.cssRules);

    return {
      restricted: false,
      ruleCount: rules.length,
    };
  } catch {
    return {
      restricted: true,
      ruleCount: null,
    };
  }
}

export function buildStylesheetDiagnosticAssets(source?: ExportDiagnosticsSource): ArchiveAsset[] {
  const documentRoot = resolveDiagnosticsDocument(source);
  const metadata: StylesheetMetadata[] = [];
  for (const documentScope of listAccessibleDiagnosticDocuments(documentRoot)) {
    const sheets = [
      ...Array.from(documentScope.document.styleSheets),
      ...getAdoptedStyleSheets(documentScope.document),
    ];
    sheets.forEach((sheet, index) => {
      if (metadata.length >= MAX_STYLESHEET_RECORDS) return;
      const sourceLabel =
        index < documentScope.document.styleSheets.length ? 'document' : 'adopted';
      const serialized = serializeStylesheetRules(sheet);
      const scopePrefix = documentScope.scope === 'document' ? '' : `${documentScope.scope}-`;
      metadata.push({
        disabled: sheet.disabled,
        href: sanitizeDiagnosticUrl(sheet.href ?? undefined) ?? null,
        id: `${scopePrefix}${sourceLabel}-stylesheet-${String(index + 1).padStart(2, '0')}`,
        media: getStylesheetMediaValues(sheet),
        owner: getOwnerNodeMetadata(sheet),
        restricted: serialized.restricted,
        ruleCount: serialized.ruleCount,
        source: sourceLabel,
        ...(documentScope.scope === 'document' ? {} : { scope: documentScope.scope }),
      });
    });
  }

  return [
    {
      path: 'logs/css/stylesheets.json',
      content: JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          totalStylesheets: metadata.length,
          stylesheets: metadata,
        },
        null,
        2
      ),
    },
  ];
}
