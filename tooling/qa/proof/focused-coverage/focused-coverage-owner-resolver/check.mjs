import fs from 'node:fs';
import { posix } from 'node:path';

import {
  isCoverageExcluded,
  isCoverageTargetFile,
} from '../../coverage/test-coverage/registry.mjs';
import { resolveCoverageThreshold } from '../../coverage/test-coverage/thresholds.mjs';
import { fromRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import { collectFocusedCoverageOwnerMappingViolations } from '../focused-coverage-owner-map.mjs';
import {
  resolveDeterministicFocusedCoverageOwnerTests,
  resolveLocalFocusedCoverageOwnerTests,
} from '../focused-coverage-owner-tests.mjs';

const OWNER_TEST_BUDGET = 260;

function isRuntimeCoverageEligible(file) {
  return isCoverageTargetFile(file) && !isCoverageExcluded(file);
}

function splitCoverageFiles({ codeFiles = [], newFiles = [] }) {
  const newFileSet = new Set(newFiles);
  const eligibleFiles = codeFiles.filter(isRuntimeCoverageEligible);
  const rolloutFiles = eligibleFiles.filter((file) => resolveCoverageThreshold(file) !== null);
  return {
    newEligibleFiles: eligibleFiles.filter((file) => newFileSet.has(file)),
    outsideExistingFiles: eligibleFiles.filter(
      (file) => !newFileSet.has(file) && !rolloutFiles.includes(file)
    ),
    rolloutFiles,
  };
}

function collectOwnerTests(files, options) {
  return new Map(files.map((file) => [file, resolveLocalFocusedCoverageOwnerTests(file, options)]));
}

function findFilesWithoutOwner(ownerTestsByFile) {
  return [...ownerTestsByFile.entries()]
    .filter(([, ownerTests]) => ownerTests.length === 0)
    .map(([file]) => file);
}

function createCounts(ownerTestsByFile, directTestFiles, coverageTargetFiles = []) {
  const ownerTests = [...new Set([...ownerTestsByFile.values()].flat())].sort();
  return {
    coverageTargets: coverageTargetFiles.length,
    ownerTests: ownerTests.length,
    tests: new Set([...directTestFiles, ...ownerTests]).size,
  };
}

function createDeferredResult(
  verdict,
  detail,
  ownerTestsByFile,
  directTestFiles,
  coverageTargetFiles = []
) {
  return {
    counts: createCounts(ownerTestsByFile, directTestFiles, coverageTargetFiles),
    coverageTargetFiles,
    detail,
    directTestFiles,
    ownerTestsByFile,
    reasons: [detail],
    testFiles: [],
    verdict,
  };
}

function createInvalidMappingScope({ directTestFiles, violations }) {
  return {
    counts: { coverageTargets: 0, ownerTests: 0, tests: directTestFiles.length },
    coverageTargetFiles: [],
    detail: violations.map((violation) => `${violation.rule}: ${violation.file}`).join('\n'),
    directTestFiles,
    ownerTestsByFile: new Map(),
    reasons: ['focused coverage owner map is invalid'],
    testFiles: [],
    violations,
    verdict: 'block-invalid-owner-map',
  };
}

function createNoOwnerRequiredScope({ directTestFiles }) {
  return {
    counts: { coverageTargets: 0, ownerTests: 0, tests: directTestFiles.length },
    coverageTargetFiles: [],
    detail: 'no changed runtime coverage targets',
    directTestFiles,
    ownerTestsByFile: new Map(),
    reasons: [],
    testFiles: [...directTestFiles],
    verdict:
      directTestFiles.length > 0
        ? 'run-local-tests-no-coverage'
        : 'skip-no-runtime-coverage-target',
  };
}

function createRunnableScope({ directTestFiles, ownerTestsByFile, rolloutFiles }) {
  const ownerTests = [...new Set([...ownerTestsByFile.values()].flat())].sort();
  const directTestSet = new Set(directTestFiles);
  const expandedOwnerTests = ownerTests.filter((testFile) => !directTestSet.has(testFile));
  const ownerTestBudget = Math.max(OWNER_TEST_BUDGET, directTestFiles.length);
  const testFiles = [...new Set([...directTestFiles, ...ownerTests])].sort();
  if (expandedOwnerTests.length > ownerTestBudget) {
    return createDeferredResult(
      'defer-ambiguous-existing',
      `local owner test expansion exceeds budget: ${expandedOwnerTests.length}; budget=${ownerTestBudget}`,
      ownerTestsByFile,
      directTestFiles
    );
  }

  const coverageTargetFiles = rolloutFiles.filter((file) => ownerTestsByFile.has(file));
  return {
    counts: createCounts(ownerTestsByFile, directTestFiles, coverageTargetFiles),
    coverageTargetFiles,
    detail: `local owner tests=${testFiles.length}; coverageTargets=${coverageTargetFiles.length}`,
    directTestFiles,
    ownerTestsByFile,
    reasons: [],
    testFiles,
    verdict: coverageTargetFiles.length > 0 ? 'run-local-coverage' : 'run-local-tests-no-coverage',
  };
}

function hasChangedDirectOwnerTest(file, directTestFiles) {
  const directory = posix.dirname(file);
  return directTestFiles.some((testFile) => posix.dirname(testFile) === directory);
}

function shouldValidateMappings(mappingOptions) {
  return (
    mappingOptions.mappings ||
    fs.existsSync(
      fromRelativePath('tooling/qa/proof/focused-coverage/focused-coverage-owner-map.mjs')
    )
  );
}

function collectMappingViolations(mappingOptions) {
  return shouldValidateMappings(mappingOptions)
    ? collectFocusedCoverageOwnerMappingViolations(mappingOptions)
    : [];
}

export function resolveFocusedCoverageOwnerScope({
  codeFiles = [],
  directTestFiles = [],
  newFiles = [],
  mappingOptions = {},
} = {}) {
  const mappingViolations = collectMappingViolations(mappingOptions);
  if (mappingViolations.length > 0) {
    return createInvalidMappingScope({ directTestFiles, violations: mappingViolations });
  }

  const { newEligibleFiles, outsideExistingFiles, rolloutFiles } = splitCoverageFiles({
    codeFiles,
    newFiles,
  });
  const changedEligibleFiles = [
    ...new Set([...newEligibleFiles, ...outsideExistingFiles, ...rolloutFiles]),
  ].sort();
  if (changedEligibleFiles.length === 0) {
    return createNoOwnerRequiredScope({ directTestFiles });
  }

  const ownerRequiredFiles = [...new Set([...newEligibleFiles, ...rolloutFiles])].sort();
  const ownerTestsByFile = collectOwnerTests(ownerRequiredFiles, mappingOptions);
  for (const file of outsideExistingFiles) {
    ownerTestsByFile.set(file, resolveDeterministicFocusedCoverageOwnerTests(file, mappingOptions));
  }
  const coverageTargetFiles = rolloutFiles.filter((file) => ownerTestsByFile.has(file));
  const newFilesWithoutOwner = findFilesWithoutOwner(
    new Map(newEligibleFiles.map((file) => [file, ownerTestsByFile.get(file) ?? []]))
  );
  if (newFilesWithoutOwner.length > 0) {
    return createDeferredResult(
      'block-new-file-no-owner',
      `new files without local test owner: ${newFilesWithoutOwner.join(', ')}`,
      ownerTestsByFile,
      directTestFiles,
      coverageTargetFiles
    );
  }

  const existingWithoutOwner = findFilesWithoutOwner(
    new Map(ownerRequiredFiles.map((file) => [file, ownerTestsByFile.get(file) ?? []]))
  );
  if (existingWithoutOwner.length > 0) {
    return createDeferredResult(
      'defer-ambiguous-existing',
      `existing files without explicit local test owner: ${existingWithoutOwner.join(', ')}`,
      ownerTestsByFile,
      directTestFiles,
      coverageTargetFiles
    );
  }

  const outsideWithoutOwner = outsideExistingFiles.filter(
    (file) =>
      (ownerTestsByFile.get(file)?.length ?? 0) === 0 &&
      !hasChangedDirectOwnerTest(file, directTestFiles)
  );
  if (outsideWithoutOwner.length > 0) {
    return createDeferredResult(
      'defer-ambiguous-existing',
      [
        'outside-registry files without mapped, adjacent, or changed direct owner tests:',
        outsideWithoutOwner.join(', '),
      ].join(' '),
      ownerTestsByFile,
      directTestFiles,
      coverageTargetFiles
    );
  }

  return createRunnableScope({
    directTestFiles,
    ownerTestsByFile,
    rolloutFiles,
  });
}
