import fs from 'node:fs';

import { PRODUCT_QA_SUITE } from '../../composition/scope/qa-scope.mjs';
import { fromRelativePath } from '../../analysis/repository/shared-paths.mjs';
import { resolveQaResourceProfile } from '../../runtime/scheduling/resource-profile.mjs';
import { resolveProductUnitTestPool, runUnitTests } from '../unit/verify-unit-tests.mjs';
import {
  CANONICAL_COVERAGE_DIRECTORY,
  collectCoverageAuditReport,
  writeCanonicalCoverageArtifacts,
} from './coverage-audit-report.mjs';

const UNIT_COVERAGE_DIRECTORY = '.tmp/coverage/unit';
const PROFILE_DIRECTORY = '.tmp/coverage/profile';
const PROVIDER_PROFILE = `${UNIT_COVERAGE_DIRECTORY}/coverage-profile.json`;
const PROFILE_RESULT = `${PROFILE_DIRECTORY}/full-coverage-profile.json`;
const DEBUG_LOG = `${PROFILE_DIRECTORY}/vitest-coverage-debug.log`;

function roundDuration(value) {
  return Math.round(value * 10) / 10;
}

function recreateDirectory(relativePath) {
  const absolutePath = fromRelativePath(relativePath);
  fs.rmSync(absolutePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(absolutePath, { recursive: true });
}

function writeJson(relativePath, value) {
  fs.writeFileSync(fromRelativePath(relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseMaxWorkers(argv) {
  const argument = argv.find((entry) => entry.startsWith('--maxWorkers='));
  if (!argument) return resolveQaResourceProfile().vitestMaxWorkers;
  const value = Number(argument.slice('--maxWorkers='.length));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--maxWorkers must be a positive integer.');
  }
  return value;
}

const maxWorkers = parseMaxWorkers(process.argv.slice(2));
recreateDirectory(PROFILE_DIRECTORY);
recreateDirectory(UNIT_COVERAGE_DIRECTORY);
fs.rmSync(fromRelativePath(CANONICAL_COVERAGE_DIRECTORY), { recursive: true, force: true });

process.env.SNIPTALE_COVERAGE_PROFILE = '1';
process.env.DEBUG = 'vitest:coverage';

const runStartedAt = performance.now();
const unitResult = runUnitTests({
  coverage: true,
  coverageMode: 'manual',
  maxWorkers,
  pool: resolveProductUnitTestPool() ?? 'threads',
  suite: PRODUCT_QA_SUITE,
});
const vitestWallMs = roundDuration(performance.now() - runStartedAt);
fs.writeFileSync(
  fromRelativePath(DEBUG_LOG),
  `${unitResult.stdout ?? ''}${unitResult.stderr ?? ''}`,
  'utf8'
);
if (unitResult.status !== 0) {
  process.stderr.write(unitResult.stderr || unitResult.stdout || 'Coverage profiling failed.\n');
  process.exit(unitResult.status ?? 1);
}

const auditStartedAt = performance.now();
const auditReport = collectCoverageAuditReport();
const auditMs = roundDuration(performance.now() - auditStartedAt);
if (auditReport.error) throw new Error(auditReport.error);

const publicationStartedAt = performance.now();
const publication = writeCanonicalCoverageArtifacts({ report: auditReport });
const canonicalPublicationMs = roundDuration(performance.now() - publicationStartedAt);
const provider = JSON.parse(fs.readFileSync(fromRelativePath(PROVIDER_PROFILE), 'utf8'));
const result = {
  auditMs,
  canonicalPublicationMs,
  canonicalReporterTimings: publication.reporterTimings,
  debugLog: DEBUG_LOG,
  maxWorkers,
  profileResult: PROFILE_RESULT,
  provider,
  schemaVersion: 1,
  vitestWallMs,
};
writeJson(PROFILE_RESULT, result);

process.stdout.write(
  `${JSON.stringify(
    {
      auditMs,
      canonicalPublicationMs,
      canonicalReporterTimings: publication.reporterTimings,
      processingPasses: provider.processingPasses.map((pass) => ({
        concurrency: pass.concurrency,
        durationMs: pass.durationMs,
      })),
      profileResult: PROFILE_RESULT,
      testExecutionMs: provider.testExecutionMs,
      vitestJsonReportMs: provider.vitestJsonReportMs,
      vitestWallMs,
    },
    null,
    2
  )}\n`
);
