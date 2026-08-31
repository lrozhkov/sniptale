import crypto from 'node:crypto';

import ts from 'typescript';

function normalizeParseDiagnostics(sourceFile) {
  return Object.freeze(
    sourceFile.parseDiagnostics.map((diagnostic) =>
      Object.freeze({
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        start: diagnostic.start ?? 0,
      })
    )
  );
}

export function createArtifactSourceSnapshotStore({ createSourceFile = ts.createSourceFile } = {}) {
  const snapshots = new Map();
  let parseCount = 0;

  return Object.freeze({
    get({ relativePath, text }) {
      const contentDigest = crypto.createHash('sha256').update(text).digest('hex');
      const key = `${relativePath}\0${contentDigest}`;
      const cached = snapshots.get(key);
      if (cached) return cached;
      const sourceFile = createSourceFile(
        relativePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
      );
      parseCount += 1;
      const parseDiagnostics = normalizeParseDiagnostics(sourceFile);
      if (parseDiagnostics.length > 0) {
        const first = parseDiagnostics[0];
        throw new Error(
          `Release artifact ${relativePath} is malformed JavaScript: TS${first.code} ` +
            `at offset ${first.start}: ${first.message}`
        );
      }
      const snapshot = Object.freeze({
        contentDigest,
        parseDiagnostics,
        relativePath,
        sourceFile,
        text,
      });
      snapshots.set(key, snapshot);
      return snapshot;
    },
    getStats: () => Object.freeze({ parseCount, snapshotCount: snapshots.size }),
  });
}

const artifactSourceSnapshotStore = createArtifactSourceSnapshotStore();

export function getArtifactSourceSnapshot(options) {
  return artifactSourceSnapshotStore.get(options);
}

export function getArtifactSourceSnapshotStats() {
  return artifactSourceSnapshotStore.getStats();
}
