import fs from 'node:fs';

import { isCoverageExcluded, isCoverageTargetFile } from './verify-test-coverage.registry.mjs';
import { resolveCoverageThreshold } from './verify-test-coverage.thresholds.mjs';
import { fromRelativePath } from './shared.mjs';
import { collectFocusedCoverageOwnerMappingViolations } from './focused-coverage-owner-map.mjs';
import { resolveLocalFocusedCoverageOwnerTests } from './focused-coverage-owner-tests.mjs';

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

function createCounts(ownerTestsByFile, directTestFiles) {
  const ownerTests = [...new Set([...ownerTestsByFile.values()].flat())].sort();
  return {
    coverageTargets: ownerTestsByFile.size,
    ownerTests: ownerTests.length,
    tests: new Set([...directTestFiles, ...ownerTests]).size,
  };
}

function createDeferredResult(verdict, detail, ownerTestsByFile, directTestFiles) {
  return {
    counts: createCounts(ownerTestsByFile, directTestFiles),
    coverageTargetFiles: [...ownerTestsByFile.keys()],
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

function createNoOwnerRequiredScope({ directTestFiles, outsideExistingFiles }) {
  if (outsideExistingFiles.length > 0 && directTestFiles.length === 0) {
    return createDeferredResult(
      'defer-ambiguous-existing',
      `outside-registry files without changed local tests: ${outsideExistingFiles.join(', ')}`,
      new Map(),
      directTestFiles
    );
  }

  return {
    counts: { coverageTargets: 0, ownerTests: 0, tests: directTestFiles.length },
    coverageTargetFiles: [],
    detail:
      outsideExistingFiles.length > 0
        ? 'outside-registry runtime changes covered by changed direct tests'
        : 'no changed runtime coverage targets',
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

function createRunnableScope({ counts, directTestFiles, ownerTestsByFile, rolloutFiles }) {
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
    counts,
    coverageTargetFiles,
    detail: `local owner tests=${testFiles.length}; coverageTargets=${coverageTargetFiles.length}`,
    directTestFiles,
    ownerTestsByFile,
    reasons: [],
    testFiles,
    verdict: coverageTargetFiles.length > 0 ? 'run-local-coverage' : 'run-local-tests-no-coverage',
  };
}

function shouldValidateMappings(mappingOptions) {
  return (
    mappingOptions.mappings ||
    fs.existsSync(fromRelativePath('tooling/qa/core/focused-coverage-owner-map.mjs'))
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
  const ownerRequiredFiles = [...new Set([...newEligibleFiles, ...rolloutFiles])].sort();
  if (ownerRequiredFiles.length === 0) {
    return createNoOwnerRequiredScope({ directTestFiles, outsideExistingFiles });
  }

  const ownerTestsByFile = collectOwnerTests(ownerRequiredFiles, mappingOptions);
  const newFilesWithoutOwner = findFilesWithoutOwner(
    new Map(newEligibleFiles.map((file) => [file, ownerTestsByFile.get(file) ?? []]))
  );
  if (newFilesWithoutOwner.length > 0) {
    return createDeferredResult(
      'block-new-file-no-owner',
      `new files without local test owner: ${newFilesWithoutOwner.join(', ')}`,
      ownerTestsByFile,
      directTestFiles
    );
  }

  const existingWithoutOwner = findFilesWithoutOwner(ownerTestsByFile);
  if (existingWithoutOwner.length > 0) {
    return createDeferredResult(
      'defer-ambiguous-existing',
      `existing files without explicit local test owner: ${existingWithoutOwner.join(', ')}`,
      ownerTestsByFile,
      directTestFiles
    );
  }

  return createRunnableScope({
    counts: createCounts(ownerTestsByFile, directTestFiles),
    directTestFiles,
    ownerTestsByFile,
    rolloutFiles,
  });
}
