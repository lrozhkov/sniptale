import type { ArchiveAsset } from '../archive';
import { sanitizeDiagnosticUrl } from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { StylesheetMetadata } from './css.constants';
import { resolveDiagnosticsDocument, type ExportDiagnosticsSource } from './source';

function getOwnerNodeMetadata(sheet: CSSStyleSheet): Record<string, unknown> | null {
  const ownerNode = sheet.ownerNode;
  const ownerElementConstructor =
    ownerNode?.ownerDocument?.defaultView?.Element ??
    (typeof Element === 'undefined' ? undefined : Element);

  if (!ownerElementConstructor || !(ownerNode instanceof ownerElementConstructor)) {
    return null;
  }

  return {
    dataUi: ownerNode.getAttribute('data-ui'),
    id: ownerNode.id || null,
    media: ownerNode.getAttribute('media'),
    rel: ownerNode.getAttribute('rel'),
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

  return Array.from(sheet.media);
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
  const sheets = [...Array.from(documentRoot.styleSheets), ...getAdoptedStyleSheets(documentRoot)];

  sheets.forEach((sheet, index) => {
    const sourceLabel = index < documentRoot.styleSheets.length ? 'document' : 'adopted';
    const serialized = serializeStylesheetRules(sheet);

    metadata.push({
      disabled: sheet.disabled,
      href: sanitizeDiagnosticUrl(sheet.href ?? undefined) ?? null,
      id: `${sourceLabel}-stylesheet-${String(index + 1).padStart(2, '0')}`,
      media: getStylesheetMediaValues(sheet),
      owner: getOwnerNodeMetadata(sheet),
      restricted: serialized.restricted,
      ruleCount: serialized.ruleCount,
      source: sourceLabel,
    });
  });

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
