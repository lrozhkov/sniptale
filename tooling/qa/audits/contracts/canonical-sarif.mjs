import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import {
  assertRepositoryRelativePath,
  resolveRepositoryWritePath,
} from '../../policy/paths/repository-contained-paths.mjs';
import { sanitizeLogText, truncateUtf8 } from '../../runtime/observability/sanitize.mjs';

function canonicalText(value, maximumBytes, root) {
  return truncateUtf8(sanitizeLogText(value, { repositoryRoot: root }), maximumBytes).text;
}

export function violationsToSarif({ toolName, informationUri, violations, root = repoRoot }) {
  const normalized = violations.map(({ rule, file, line, message }) => {
    const relativeFile = assertRepositoryRelativePath(file);
    return {
      rule: canonicalText(rule, 512, root) || 'unknown-rule',
      file: assertRepositoryRelativePath(canonicalText(relativeFile, 4096, root)),
      line: Number.isInteger(line) && line > 0 ? line : 1,
      message: canonicalText(message, 16 * 1024, root) || '<redacted>',
    };
  });
  const rules = [...new Set(normalized.map(({ rule }) => rule))].sort().map((id) => ({ id }));
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: { driver: { name: toolName, informationUri, rules } },
        results: normalized.map(({ rule, file, line, message }) => ({
          ruleId: rule,
          level: 'error',
          message: { text: message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: file, uriBaseId: '%SRCROOT%' },
                region: { startLine: line ?? 1 },
              },
            },
          ],
        })),
      },
    ],
  };
}

export function writeCanonicalSarif(relativePath, sarif, { root = repoRoot } = {}) {
  const outputPath = resolveRepositoryWritePath(root, relativePath);
  return writeCanonicalSarifFile(outputPath, sarif);
}

export function writeCanonicalSarifFile(outputPath, sarif) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (fs.existsSync(outputPath) && fs.lstatSync(outputPath).isSymbolicLink()) {
    throw new Error(`Unsafe SARIF output symlink: ${outputPath}`);
  }
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(sarif, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, outputPath);
  return outputPath;
}
