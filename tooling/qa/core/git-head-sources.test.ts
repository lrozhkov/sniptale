import { expect, it, vi } from 'vitest';

import { createHeadFileTextResolver, readHeadFileTexts } from './git-head-sources.mjs';

it('reads HEAD file text without stdin-driven git batch mode', () => {
  const spawnSyncImpl = vi
    .fn()
    .mockReturnValueOnce({ status: 0, stdout: 'first source' })
    .mockReturnValueOnce({ status: 0, stdout: 'second source' });

  const result = readHeadFileTexts(['src/first.ts', 'src/second.ts'], { spawnSyncImpl });

  expect(spawnSyncImpl).toHaveBeenCalledTimes(2);
  expect(spawnSyncImpl).toHaveBeenCalledWith(
    expect.stringMatching(/git(?:\.exe)?$/u),
    ['show', 'HEAD:src/first.ts'],
    expect.objectContaining({
      encoding: 'utf8',
    })
  );
  expect(result).toEqual(
    new Map([
      ['src/first.ts', 'first source'],
      ['src/second.ts', 'second source'],
    ])
  );
});

it('exposes a resolver that returns null for missing HEAD files', () => {
  const resolver = createHeadFileTextResolver(['src/new-file.ts', 'src/existing.ts'], {
    spawnSyncImpl: vi
      .fn()
      .mockReturnValueOnce({ status: 128, stdout: '', stderr: 'missing' })
      .mockReturnValueOnce({ status: 0, stdout: 'existing source' }),
  });

  expect(resolver('src/new-file.ts')).toBeNull();
  expect(resolver('src/existing.ts')).toBe('existing source');
  expect(resolver('src/unknown.ts')).toBeNull();
});
