type PageStyleRuntimeDiagnosticLevel = 'warning' | 'error';

export interface PageStyleRuntimeDiagnostic {
  level: PageStyleRuntimeDiagnosticLevel;
  message: string;
  ruleId?: string;
}

export function createPageStyleRuntimeDiagnostic(
  level: PageStyleRuntimeDiagnosticLevel,
  message: string,
  ruleId?: string
): PageStyleRuntimeDiagnostic {
  return {
    level,
    message,
    ...(ruleId ? { ruleId } : {}),
  };
}
