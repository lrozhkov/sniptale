export type I18nUsage = {
  keys: Set<string>;
  references: Set<string>;
  patterns: Set<string>;
  unresolved: string[];
};

type I18nReportOptions = {
  files?: string[] | null;
  root?: string;
  collectUsage?: boolean;
};

export function collectFileFailures(relativeFile: string, options?: {
  root?: string;
  usage?: I18nUsage | null;
}): string[];
export function runI18nReport(options?: I18nReportOptions): {
  failures: string[];
  usage: { complete: boolean; candidates: string[]; unresolved: string[] };
};
export function runI18nCheck(options?: I18nReportOptions): string[];
