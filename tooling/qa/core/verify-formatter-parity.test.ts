import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { expect, it } from 'vitest';

import ROOT_PACKAGE from '../../../package.json';
import FORMATTER_MIGRATION from '../../configs/qa/formatter-migration.data.json';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function sha256File(path: string) {
  return createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

it('seals the complete classified Prettier-to-Oxfmt difference population', () => {
  expect(FORMATTER_MIGRATION).toMatchObject({
    schemaVersion: 1,
    sourceFormatter: 'prettier@3.8.1',
    targetFormatter: 'oxfmt@0.64.0',
    styleProjection: 'identical',
    ignoreInventory: 'byte-identical',
  });
  expect(FORMATTER_MIGRATION.baselineCommit).toMatch(/^[a-f0-9]{40}$/u);

  const paths = FORMATTER_MIGRATION.exceptions.map((entry) => entry.path);
  expect(paths).toHaveLength(FORMATTER_MIGRATION.exceptionCount);
  expect(paths).toEqual([...new Set(paths)].toSorted());

  const classificationCounts = Object.fromEntries(
    Object.keys(FORMATTER_MIGRATION.classificationCounts).map((classification) => [
      classification,
      FORMATTER_MIGRATION.exceptions.filter((entry) => entry.classification === classification)
        .length,
    ])
  );
  expect(classificationCounts).toEqual(FORMATTER_MIGRATION.classificationCounts);
  expect(Object.values(classificationCounts).reduce((total, count) => total + count, 0)).toBe(
    FORMATTER_MIGRATION.exceptionCount
  );

  for (const entry of FORMATTER_MIGRATION.exceptions) {
    expect(entry.reason.length).toBeGreaterThan(0);
    expect(entry.beforeSha256).toMatch(SHA256_PATTERN);
    expect(entry.afterSha256).toMatch(SHA256_PATTERN);
    expect(entry.beforeSha256).not.toBe(entry.afterSha256);
    expect(sha256File(entry.path), entry.path).toBe(entry.afterSha256);
  }
});

it('keeps the sealed formatter difference population Oxfmt-clean', () => {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/oxfmt/bin/oxfmt',
      '--list-different',
      '--config=.oxfmtrc.json',
      '--ignore-path=.oxfmtignore',
      '--disable-nested-config',
      ...FORMATTER_MIGRATION.exceptions.map((entry) => entry.path),
    ],
    { cwd: process.cwd(), encoding: 'utf8' }
  );

  expect(result.status, result.stderr || result.stdout).toBe(0);
  expect(result.stdout).toBe('');
});

it('keeps every retired formatter authority absent', () => {
  for (const path of FORMATTER_MIGRATION.retiredAuthorities) {
    expect(fs.existsSync(path), path).toBe(false);
  }

  expect(
    JSON.stringify({
      scripts: ROOT_PACKAGE.scripts,
      devDependencies: ROOT_PACKAGE.devDependencies,
    })
  ).not.toMatch(/prettier/iu);
});
