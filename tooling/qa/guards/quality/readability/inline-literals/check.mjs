import ts from 'typescript';

import { QUALITY_LIMITS } from '../../../../policy/quality/quality.config.mjs';
import { isDataCarrierFile } from '../../../../analysis/repository/shared-paths.mjs';
import { getSourceSnapshot } from '../../../../analysis/source/source-snapshot.mjs';

export function collectOversizedInlineLiteralViolations(relativePath, source) {
  if (isDataCarrierFile(relativePath) || !/\.(?:[cm]?[jt]sx?|mjs|cjs)$/u.test(relativePath)) {
    return [];
  }
  const sourceFile = getSourceSnapshot({ filePath: relativePath, text: source }).sourceFile;
  const violations = [];
  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text.length > QUALITY_LIMITS.maxGeneratedDataLineLength
    ) {
      violations.push({
        rule: 'oversized-inline-literal',
        file: relativePath,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        message:
          `contains a ${node.text.length}-character inline literal; ` +
          'move classified data to an owned data/fixture file',
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}
