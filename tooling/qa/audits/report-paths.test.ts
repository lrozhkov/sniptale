import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../core/test-helpers';
import { writeSanitizedAuditReport } from './report-paths.mjs';

it('persists audit evidence without repository paths or known sensitive values', () => {
  const root = createTempRoot('audit-report-sanitization-');
  const reportPath = path.join(root, '.tmp/audit/results.json');
  const sensitiveValue = 'sentinel-audit-token';

  writeSanitizedAuditReport(
    '.tmp/audit/results.json',
    {
      location: path.join(root, 'package-lock.json'),
      registry: `https://registry.example.test/?token=${sensitiveValue}`,
    },
    { root, sensitiveValues: [sensitiveValue] }
  );

  const persisted = fs.readFileSync(reportPath, 'utf8');
  expect(persisted).toContain('<repo>/package-lock.json');
  expect(persisted).toContain('<redacted>');
  expect(persisted).not.toContain(root);
  expect(persisted).not.toContain(sensitiveValue);
});

it('sanitizes property names and rejects redaction collisions without leaving evidence', () => {
  const root = createTempRoot('audit-report-key-sanitization-');
  const reportPath = path.join(root, 'results.json');
  const sensitiveValue = 'sentinel-audit-key';

  expect(() =>
    writeSanitizedAuditReport(
      'results.json',
      {
        [sensitiveValue]: 'secret-key',
        '<redacted>': 'existing-key',
      },
      { root, sensitiveValues: [sensitiveValue] }
    )
  ).toThrow('Sanitized audit report key collision');
  expect(fs.existsSync(reportPath)).toBe(false);
});

it('round-trips special JSON property names as own evidence fields', () => {
  const root = createTempRoot('audit-report-special-keys-');
  const reportPath = path.join(root, 'results.json');
  const evidence = JSON.parse('{"__proto__":{"kept":true},"constructor":"kept"}');

  writeSanitizedAuditReport('results.json', evidence, { root });

  const persisted = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  expect(Object.hasOwn(persisted, '__proto__')).toBe(true);
  expect(persisted.__proto__).toEqual({ kept: true });
  expect(persisted.constructor).toBe('kept');
});

it('rejects symlinked evidence parents without touching the external target', () => {
  const root = createTempRoot('audit-report-repository-');
  const externalRoot = createTempRoot('audit-report-external-');
  const externalReport = path.join(externalRoot, 'results.json');
  fs.writeFileSync(externalReport, '{"keep":true}\n');
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  fs.symlinkSync(externalRoot, path.join(root, '.tmp/npm-audit'), 'dir');

  expect(() =>
    writeSanitizedAuditReport('.tmp/npm-audit/results.json', { safe: true }, { root })
  ).toThrow('unsafe repository path');
  expect(fs.readFileSync(externalReport, 'utf8')).toBe('{"keep":true}\n');
});
