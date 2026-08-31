import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  parseFormatterCliArguments,
  runFormatterCheck,
  runFormatterWrite,
} from './verify-oxfmt.mjs';

function commandResult(status: number, stdout = '', stderr = '') {
  return { error: undefined, signal: null, status, stderr, stdout };
}

describe('QA Oxfmt wrapper', () => {
  it('preserves canonical byte-exact fixtures listed in .oxfmtignore', () => {
    const fixture =
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
      'neutral-runtime-conformance.sniptale-effect.json';
    const rawNativeResult = spawnSync(
      process.execPath,
      [
        'node_modules/oxfmt/bin/oxfmt',
        '--config=.oxfmtrc.json',
        '--ignore-path=.oxfmtignore',
        '--disable-nested-config',
        '--list-different',
        fixture,
      ],
      { encoding: 'utf8' }
    );

    expect(rawNativeResult.status).toBe(2);
    expect(rawNativeResult.stderr).toContain('Expected at least one target file');
    expect(runFormatterCheck([fixture])).toEqual({
      candidateFiles: [fixture],
      failures: [],
    });
    expect(runFormatterWrite([fixture])).toEqual({
      candidateFiles: [fixture],
      writtenFiles: [],
    });
  });

  it('reports and writes exactly the files returned by Oxfmt', () => {
    const runner = vi
      .fn()
      .mockReturnValueOnce(commandResult(1, 'bad.ts'))
      .mockReturnValueOnce(commandResult(0));

    expect(runFormatterWrite(['good.ts', 'bad.ts'], runner)).toEqual({
      candidateFiles: ['bad.ts', 'good.ts'],
      writtenFiles: ['bad.ts'],
    });
    expect(runner.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(['--write', 'bad.ts']));
  });

  it('fails closed when Oxfmt cannot parse or execute a file', () => {
    const runner = vi.fn(() => commandResult(2, '', 'parse error'));

    expect(() => runFormatterCheck(['bad.ts'], runner)).toThrow('parse error');
  });

  it('keeps Markdown outside explicit formatter scope without invoking Oxfmt', () => {
    const runner = vi.fn(() => commandResult(0));

    expect(runFormatterCheck(['README.md'], runner)).toEqual({
      candidateFiles: [],
      failures: [],
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it('chunks a large explicit inventory without changing its result contract', () => {
    const files = Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`);
    const runner = vi.fn(() => commandResult(0));

    expect(runFormatterCheck(files, runner)).toEqual({
      candidateFiles: files.toSorted(),
      failures: [],
    });
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('uses one Oxfmt process for the complete repository inventory', () => {
    const files = Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`);
    const runner = vi.fn(() => commandResult(0));

    expect(runFormatterCheck(files, runner, { repositoryWide: true })).toEqual({
      candidateFiles: files.toSorted(),
      failures: [],
    });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['--list-different', '.']));
  });

  it('rejects ambiguous, missing, duplicate, positional, and unknown CLI scope', () => {
    for (const argv of [
      ['--files'],
      ['--files', 'first.ts', '--staged'],
      ['--files', 'first.ts', '--files', 'second.ts'],
      ['--staged', '--staged'],
      ['first.ts'],
      ['--unknown'],
    ]) {
      expect(() => parseFormatterCliArguments(argv), argv.join(' ')).toThrow();
    }
    expect(parseFormatterCliArguments(['--write', '--files', 'first.ts'])).toMatchObject({
      explicitFiles: ['first.ts'],
      useStagedFiles: false,
      write: true,
    });
  });

  it('fails the real write CLI before a missing explicit scope can fall back repository-wide', () => {
    const result = spawnSync(
      process.execPath,
      ['tooling/qa/guards/quality/verify-oxfmt.mjs', '--write', '--files'],
      { encoding: 'utf8' }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing value for --files');
    expect(result.stdout).toBe('');
  });

  it('detects, writes, and clears a native admitted formatting smell', () => {
    const fixture = '.agents/.verify-oxfmt-native-fixture.ts';
    fs.writeFileSync(fixture, 'export const value={answer:42}\n');
    try {
      expect(runFormatterCheck([fixture])).toEqual({
        candidateFiles: [fixture],
        failures: [fixture],
      });
      expect(runFormatterWrite([fixture])).toEqual({
        candidateFiles: [fixture],
        writtenFiles: [fixture],
      });
      expect(runFormatterCheck([fixture])).toEqual({
        candidateFiles: [fixture],
        failures: [],
      });
    } finally {
      fs.rmSync(fixture, { force: true });
    }
  });
});
