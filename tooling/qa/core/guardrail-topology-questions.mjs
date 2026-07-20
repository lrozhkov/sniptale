import {
  collectSiblingFamilyFiles,
  fileExists,
  isProductionCodeFile,
  readProductionCodeFiles,
} from './guardrail-seam-audit-helpers.mjs';
import { isProductSourcePath } from './src-production-targets.mjs';

function collectSiblingFamilyTopologyQuestions(codeFiles) {
  const allCodeFiles = readProductionCodeFiles();
  const questions = [];
  const seen = new Set();

  for (const file of codeFiles.filter(
    (entry) => isProductSourcePath(entry) && isProductionCodeFile(entry) && fileExists(entry)
  )) {
    const siblings = collectSiblingFamilyFiles(file, allCodeFiles).filter(fileExists);
    if (siblings.length === 0) {
      continue;
    }

    const familyKey = [file, ...siblings].sort().join('|');
    if (seen.has(familyKey)) {
      continue;
    }
    seen.add(familyKey);
    questions.push(
      [
        `shallow owner folder: ${file}`,
        `has same-family seams ${siblings.slice(0, 3).join(', ')}`,
        'confirm role-named owner topology before adding behavior',
      ].join('; ')
    );
  }

  return questions;
}

export function collectTopologyPreflightQuestions({
  targetFiles = [],
  codeFiles = [],
  clusters = [],
  residualSeams = [],
  thinShells = [],
  falsePublicSeams = [],
  pathAudits = [],
} = {}) {
  if (targetFiles.length === 0) {
    return [];
  }

  const ownerLabel = clusters.length > 0 ? clusters.join(', ') : 'target owner';
  const questions = [
    `owner seam/runtime boundary: confirm ${ownerLabel} before editing`,
    'next 2-3 growth vectors: verify the chosen topology still holds after likely follow-up changes',
  ];

  if (falsePublicSeams.length > 0 || thinShells.length > 0 || pathAudits.length > 0) {
    questions.push(
      [
        'public surface/facade decision:',
        `${falsePublicSeams.length} false-public,`,
        `${thinShells.length} thin-shell,`,
        `${pathAudits.length} path-audit signal(s)`,
      ].join(' ')
    );
  }

  questions.push(...collectSiblingFamilyTopologyQuestions(codeFiles).slice(0, 3));

  if (residualSeams.length > 0 || thinShells.length > 0) {
    questions.push(
      'metrics are planning signals: do not count size reduction as done while owner boundary remains broad'
    );
  }

  return [...new Set(questions)];
}
