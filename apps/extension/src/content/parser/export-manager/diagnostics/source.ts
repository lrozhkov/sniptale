export interface ExportDiagnosticsSource {
  document: Document;
  pageUrl?: string | undefined;
  view?: Window | null | undefined;
}

export function resolveDiagnosticsDocument(source?: ExportDiagnosticsSource): Document {
  return source?.document ?? document;
}

function resolveAmbientDiagnosticsView(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

export function resolveOptionalDiagnosticsView(
  source?: ExportDiagnosticsSource
): Window | undefined {
  const sourceDocument = resolveDiagnosticsDocument(source);
  if (source) {
    return source.view ?? sourceDocument.defaultView ?? undefined;
  }

  return sourceDocument.defaultView ?? resolveAmbientDiagnosticsView();
}
