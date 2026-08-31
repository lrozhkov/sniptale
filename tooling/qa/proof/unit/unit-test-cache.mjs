import fs from 'node:fs';
import path from 'node:path';

import {
  recordSuccessfulExecution,
  resolveReusableExecution,
} from '../../runtime/cache/execution-cache.mjs';
import { PRODUCT_QA_SUITE, normalizeQaSuite } from '../../composition/scope/qa-scope.mjs';
import { createUnitTestPlan } from './unit-test-plan.mjs';

const UNIT_TEST_TOOL = 'verify-unit-tests.mjs';
const COVERAGE_REPORT_PATH = '.tmp/coverage/unit/coverage-final.json';
const UNIT_TEST_CONFIG_FILES = [
  'vitest.config.ts',
  'tooling/test/harness/vitest.setup.ts',
  'package.json',
];

function createUnitTestKeyInputs(
  plan,
  { coverageMode = 'manual', coverageTargets = [], pool = null, suite = PRODUCT_QA_SUITE } = {}
) {
  return {
    coverage: plan.coverage,
    coverageMode,
    coverageTargets,
    allowNoTests: plan.allowNoTests,
    expandedRelatedFiles: plan.expandedRelatedFiles,
    pool,
    suite: normalizeQaSuite(suite),
  };
}

export function resolveUnitTestPlan({
  relatedFiles = [],
  coverage = false,
  requireTests = false,
} = {}) {
  return createUnitTestPlan({ relatedFiles, coverage, requireTests });
}

export function recordSuccessfulUnitTestPlan({
  cwd = process.cwd(),
  targetFiles = [],
  relatedFiles = [],
  coverage = false,
  coverageMode = 'manual',
  coverageTargets = [],
  pool = null,
  requireTests = false,
  source = 'unknown',
  suite = PRODUCT_QA_SUITE,
} = {}) {
  const plan = createUnitTestPlan({ relatedFiles, coverage, requireTests });

  return {
    plan,
    record: recordSuccessfulExecution({
      cwd,
      tool: UNIT_TEST_TOOL,
      mode: plan.mode,
      source,
      targetFiles,
      configFiles: UNIT_TEST_CONFIG_FILES,
      keyInputs: createUnitTestKeyInputs(plan, { coverageMode, coverageTargets, pool, suite }),
    }),
  };
}

export function resolveReusableUnitTestPlan({
  cwd = process.cwd(),
  targetFiles = [],
  relatedFiles = [],
  coverage = false,
  coverageMode = 'manual',
  coverageTargets = [],
  pool = null,
  requireTests = false,
  suite = PRODUCT_QA_SUITE,
} = {}) {
  const plan = createUnitTestPlan({ relatedFiles, coverage, requireTests });
  const reusableState = resolveReusableExecution({
    cwd,
    tool: UNIT_TEST_TOOL,
    mode: plan.mode,
    targetFiles,
    configFiles: UNIT_TEST_CONFIG_FILES,
    keyInputs: createUnitTestKeyInputs(plan, { coverageMode, coverageTargets, pool, suite }),
  });

  if (!reusableState.matched) {
    return reusableState;
  }

  if (plan.coverage) {
    const coverageReportPath = path.join(cwd, COVERAGE_REPORT_PATH);
    if (!fs.existsSync(coverageReportPath)) {
      return {
        matched: false,
        reason: 'cached coverage artifact missing',
      };
    }
  }

  return {
    matched: true,
    plan,
    source: reusableState.source,
  };
}
