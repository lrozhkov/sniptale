import { expect, it, vi } from 'vitest';

import {
  createHeadFileTextResolver,
  listHeadCodeFilesContainingText,
  readHeadFileText,
  readHeadFileTexts,
  readRevisionFileTexts,
} from './git-head-sources.mjs';

function createFalseEperm() {
  return Object.assign(new Error('spawnSync git EPERM'), { code: 'EPERM' });
}

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

it('reads source text from an explicit candidate baseline revision', () => {
  const spawnSyncImpl = vi.fn().mockReturnValue({ status: 0, stdout: 'base source' });

  expect(
    readRevisionFileTexts(['src/example.ts'], { revision: 'base-sha', spawnSyncImpl })
  ).toEqual(new Map([['src/example.ts', 'base source']]));
  expect(spawnSyncImpl).toHaveBeenCalledWith(
    expect.stringMatching(/git(?:\.exe)?$/u),
    ['show', 'base-sha:src/example.ts'],
    expect.objectContaining({ encoding: 'utf8' })
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

it('reads one HEAD source through the same neutral owner', () => {
  const spawnSyncImpl = vi.fn().mockReturnValue({ status: 0, stdout: 'source' });

  expect(readHeadFileText('src/example.ts', { spawnSyncImpl })).toBe('source');
});

it('trusts successful HEAD output when WSL reports a false EPERM', () => {
  const error = createFalseEperm();

  expect(
    readHeadFileText('src/example.ts', {
      spawnSyncImpl: vi.fn(() => ({ error, status: 0, stdout: 'source' })),
    })
  ).toBe('source');
  expect(
    listHeadCodeFilesContainingText('/example', {
      spawnSyncImpl: vi.fn(() => ({
        error,
        status: 0,
        stdout: 'HEAD:src/consumer.ts\n',
      })),
    })
  ).toEqual({ complete: true, files: ['src/consumer.ts'] });
});

it('rejects false EPERM output when git reports a failing status', () => {
  const error = createFalseEperm();

  expect(
    readHeadFileText('src/example.ts', {
      spawnSyncImpl: vi.fn(() => ({ error, status: 128, stdout: '' })),
    })
  ).toBeNull();
});

it('rejects partial output from non-EPERM execution failures even with status zero', () => {
  const error = Object.assign(new Error('spawnSync git ENOBUFS'), { code: 'ENOBUFS' });

  expect(
    readHeadFileText('src/example.ts', {
      spawnSyncImpl: vi.fn(() => ({ error, status: 0, stdout: 'partial source' })),
    })
  ).toBeNull();
  expect(
    listHeadCodeFilesContainingText('/example', {
      spawnSyncImpl: vi.fn(() => ({
        error,
        status: 0,
        stdout: 'HEAD:src/partial-consumer.ts\n',
      })),
    })
  ).toEqual({ complete: false, files: [] });
});
