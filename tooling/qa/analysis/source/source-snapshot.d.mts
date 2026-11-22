import type ts from 'typescript';

export type SourceSnapshotOptions = {
  filePath: string;
  scriptKind?: ts.ScriptKind;
  text?: string;
  version?: 'current' | 'HEAD';
};

export type SourceSnapshot = Readonly<{
  contentDigest: string;
  filePath: string;
  lines: readonly string[];
  parseDiagnostics: ReadonlyArray<Readonly<{
    code: number;
    length: number | undefined;
    message: string;
    start: number | undefined;
  }>>;
  scriptKind: ts.ScriptKind;
  sourceFile: ts.SourceFile;
  text: string;
  version: 'current' | 'HEAD';
}>;

type SourceSnapshotStats = Readonly<{
  evictionCount: number;
  parseCount: number;
  readCount: number;
  snapshotCount: number;
}>;

export function resolveSourceScriptKind(filePath: string): ts.ScriptKind;
export function createSourceSnapshotStore(options?: {
  createSourceFile?: typeof ts.createSourceFile;
  maxStrongSnapshots?: number;
  readFile?: (filePath: string) => string;
}): Readonly<{
  get: (options: SourceSnapshotOptions) => SourceSnapshot;
  getStats: () => SourceSnapshotStats;
}>;
export function getSourceSnapshot(options: SourceSnapshotOptions): SourceSnapshot;
export function assertSourceSnapshotParseable<T extends SourceSnapshot>(snapshot: T, label?: string): T;
export function getParseableSourceSnapshot(options: SourceSnapshotOptions): SourceSnapshot;
export function getSourceSnapshotStats(): SourceSnapshotStats;
