import fs from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import ROOT_PACKAGE from '../../../../package.json';
import { runKnipCheck } from './knip.mjs';

describe('Knip configured integrity owner', () => {
  it('keeps raw and canonical execution on the same exact policy scope', () => {
    const config = JSON.parse(fs.readFileSync('tooling/configs/qa/knip.json', 'utf8'));
    expect(config.include).toEqual(['unresolved', 'unlisted', 'binaries']);
    expect(config.ignoreBinaries).toEqual(['codeql', 'gcc', 'mkfifo', 'printf']);
    expect(config.ignore).not.toContain('tooling/test/e2e/**');
    expect(ROOT_PACKAGE.scripts['qa:raw:knip']).toBe('knip --config tooling/configs/qa/knip.json');
  });

  it('passes the canonical config and parses every configured finding category', () => {
    const runner = vi.fn(() => ({
      status: 1,
      stdout: JSON.stringify({
        issues: [
          {
            file: 'tooling/example.ts',
            binaries: [{ name: 'unknown-bin' }],
            unlisted: [{ name: 'unknown-package' }],
            unresolved: [{ name: './missing' }],
          },
        ],
      }),
      stderr: '',
    }));
    const result = runKnipCheck({ executable: 'knip', runCommandImpl: runner });

    expect(runner.mock.calls[0]?.[1]).toEqual([
      '--config',
      'tooling/configs/qa/knip.json',
      '--reporter',
      'json',
      '--no-progress',
      '--no-config-hints',
    ]);
    expect(result.violations.map(({ rule }) => rule)).toEqual([
      'knip-unlisted',
      'knip-binaries',
      'knip-unresolved',
    ]);
  });

  it('fails closed when native output adds a nonempty category outside configured authority', () => {
    expect(() =>
      runKnipCheck({
        executable: 'knip',
        runCommandImpl: () => ({
          status: 1,
          stdout: JSON.stringify({
            issues: [{ file: 'tooling/example.ts', exports: [{ name: 'unexpected' }] }],
          }),
          stderr: '',
        }),
      })
    ).toThrow(/unsupported issue categories: exports/u);
  });
});
