import { describe, expect, it, vi } from 'vitest';

import { runFormatterCheck, runFormatterWrite } from './verify-oxfmt.mjs';

function commandResult(status: number, stdout = '', stderr = '') {
  return { error: undefined, signal: null, status, stderr, stdout };
}

describe('QA Oxfmt wrapper', () => {
  it('preserves canonical byte-exact fixtures listed in .oxfmtignore', () => {
    const fixture =
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
      'neutral-runtime-conformance.sniptale-effect.json';
    const runner = vi.fn(() => commandResult(0));

    expect(runFormatterCheck([fixture], runner)).toMatchObject({ failures: [] });
    expect(runner).toHaveBeenCalledWith(
      'node_modules/oxfmt/bin/oxfmt',
      expect.arrayContaining(['--ignore-path=.oxfmtignore', fixture]),
      { stdio: 'pipe' }
    );
  });

  it('reports and writes exactly the files returned by Oxfmt', () => {
    const runner = vi
      .fn()
      .mockReturnValueOnce(commandResult(1, 'bad.ts'))
      .mockReturnValueOnce(commandResult(0));

    expect(runFormatterWrite(['good.ts', 'bad.ts'], runner)).toEqual({
      checkedFiles: ['bad.ts', 'good.ts'],
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
      checkedFiles: [],
      failures: [],
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it('chunks a large explicit inventory without changing its result contract', () => {
    const files = Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`);
    const runner = vi.fn(() => commandResult(0));

    expect(runFormatterCheck(files, runner)).toEqual({
      checkedFiles: files.toSorted(),
      failures: [],
    });
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('uses one Oxfmt process for the complete repository inventory', () => {
    const files = Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`);
    const runner = vi.fn(() => commandResult(0));

    expect(runFormatterCheck(files, runner, { repositoryWide: true })).toEqual({
      checkedFiles: files.toSorted(),
      failures: [],
    });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['--list-different', '.']));
  });
});
