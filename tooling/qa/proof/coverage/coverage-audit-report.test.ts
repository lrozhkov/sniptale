import fs from 'node:fs';

import istanbulCoverage from 'istanbul-lib-coverage';
import { expect, it } from 'vitest';

import {
  collectCoverageAuditReport,
  collectProductionCoverageFiles,
  getCoverageOwnerKey,
  writeCanonicalCoverageArtifacts,
} from './coverage-audit-report.mjs';
import { createTempRoot, writeFile } from '../../test-support/test-helpers';

const { createFileCoverage } = istanbulCoverage;

function writeCoverage(root: string, filePaths: string[]) {
  const coverage = Object.fromEntries(
    filePaths.map((filePath) => {
      const absolutePath = filePath.startsWith('/') ? filePath : `${root}/${filePath}`;
      return [absolutePath, createFileCoverage(absolutePath).toJSON()];
    })
  );
  writeFile(root, '.tmp/coverage/unit/coverage-final.json', JSON.stringify(coverage));
}

it('discovers production coverage files from authoritative app and package roots', () => {
  const root = createTempRoot('coverage-audit-roots-');
  writeFile(root, 'apps/extension/src/background/service.ts', 'export const service = true;\n');
  writeFile(root, 'packages/foundation/src/history/clone.ts', 'export const clone = true;\n');
  writeFile(root, 'src/legacy.ts', 'export const legacy = true;\n');
  writeFile(root, 'apps/extension/src/background/service.test.ts', 'export const test = true;\n');

  expect(collectProductionCoverageFiles({ root })).toEqual([
    'apps/extension/src/background/service.ts',
    'packages/foundation/src/history/clone.ts',
  ]);
  expect(fs.existsSync(`${root}/src/legacy.ts`)).toBe(true);
});

it('groups coverage gaps by concrete app and package owners', () => {
  expect(getCoverageOwnerKey('apps/extension/src/content/logic/selection/file.ts')).toBe(
    'apps/extension/src/content/logic/selection'
  );
  expect(getCoverageOwnerKey('apps/extension/src/editor/controller/actions/file.ts')).toBe(
    'apps/extension/src/editor/controller/actions'
  );
  expect(getCoverageOwnerKey('packages/foundation/src/history/clone.ts')).toBe(
    'packages/foundation/src/history'
  );
});

it('publishes every canonical format from the exact production file set', () => {
  const root = createTempRoot('coverage-canonical-');
  const productionFile = 'apps/extension/src/background/service.ts';
  writeFile(root, productionFile, 'export const service = true;\n');
  writeCoverage(root, [productionFile]);

  const report = collectCoverageAuditReport({ root });
  expect(report.error).toBeNull();
  expect(report.prod.files).toBe(1);
  const result = writeCanonicalCoverageArtifacts({ report, root });
  expect(result.summary).toEqual(report.prod.summary);

  expect(result.files).toEqual([
    'coverage-final.json',
    'coverage-summary.json',
    'lcov.info',
    'html/index.html',
  ]);
  expect(Object.keys(result.reporterTimings)).toEqual(['json', 'json-summary', 'lcovonly', 'html']);
  for (const durationMs of Object.values(result.reporterTimings)) {
    expect(durationMs).toBeGreaterThanOrEqual(0);
  }
  const filtered = JSON.parse(
    fs.readFileSync(`${root}/.tmp/coverage/canonical/coverage-final.json`, 'utf8')
  );
  expect(Object.keys(filtered)).toEqual([`${root}/${productionFile}`]);
  expect(fs.readFileSync(`${root}/.tmp/coverage/canonical/lcov.info`, 'utf8')).toContain(
    `SF:${productionFile}`
  );
});

it('blocks missing, malformed, and outside-root coverage inputs', () => {
  const missingRoot = createTempRoot('coverage-missing-');
  writeFile(
    missingRoot,
    'apps/extension/src/background/service.ts',
    'export const service = true;\n'
  );
  writeCoverage(missingRoot, []);
  const missing = collectCoverageAuditReport({ root: missingRoot });
  expect(missing.prod.missing).toBe(1);
  expect(() => writeCanonicalCoverageArtifacts({ report: missing, root: missingRoot })).toThrow(
    'Coverage is missing 1 production file(s).'
  );

  const malformedRoot = createTempRoot('coverage-malformed-');
  writeFile(malformedRoot, '.tmp/coverage/unit/coverage-final.json', '{');
  expect(collectCoverageAuditReport({ root: malformedRoot }).error).toMatch(/^Malformed /);

  const outsideRoot = createTempRoot('coverage-outside-');
  writeCoverage(outsideRoot, ['/tmp/sniptale-outside.ts']);
  expect(collectCoverageAuditReport({ root: outsideRoot }).error).toContain(
    'outside repository root'
  );
});
