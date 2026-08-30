import { describe, expect, it, vi } from 'vitest';

import {
  formatCommandHelp,
  parseStrictArguments,
  resolveExplicitOrStagedFiles,
} from './shared-cli.mjs';

const contract = {
  command: 'qa:sample',
  description: 'Sample wrapper.',
  usage: 'npm run qa:sample -- [options]',
  options: [
    { name: '--files', kind: 'many', description: 'Files.', key: 'files' },
    { name: '--mode', kind: 'value', description: 'Mode.', key: 'mode' },
    { name: '--verbose', aliases: ['-v'], kind: 'flag', description: 'Verbose.', key: 'verbose' },
  ],
};

describe('strict CLI parsing', () => {
  it('parses only declared flags, scalar values and variadic values', () => {
    expect(
      parseStrictArguments(['--files', 'src/a.ts', 'src/b.ts', '--mode=full', '-v'], contract)
        .values
    ).toEqual({
      files: ['src/a.ts', 'src/b.ts'],
      mode: 'full',
      verbose: true,
    });
  });

  it.each([
    [['--unknown'], /Unknown argument/u],
    [['stray'], /Unknown argument/u],
    [['--mode'], /Missing value/u],
    [['--verbose=true'], /does not accept a value/u],
    [['--mode', 'one', '--mode', 'two'], /Duplicate option/u],
  ])('rejects invalid argument shape %j', (argv, expected) => {
    expect(() => parseStrictArguments(argv, contract)).toThrow(expected);
  });

  it('never reflects undeclared argument values into diagnostics', () => {
    expect(() => parseStrictArguments(['--token=private-value'], contract)).toThrow(
      /Unknown argument for qa:sample: --token\n/u
    );
    expect(() => parseStrictArguments(['private-positional-value'], contract)).toThrow(
      /Unknown argument for qa:sample: <positional>/u
    );
  });

  it('provides deterministic help as a built-in option', () => {
    const parsed = parseStrictArguments(['--help'], contract);
    expect(parsed.values).toEqual({ help: true });
    expect(parsed.help).toBe(formatCommandHelp(contract));
    expect(parsed.help).toContain('Usage: npm run qa:sample -- [options]');
    expect(parsed.help).toContain('--help, -h');
  });
});

describe('explicit and staged file resolution', () => {
  it('prefers explicit files over staged or default collections', () => {
    expect(
      resolveExplicitOrStagedFiles(['--files', 'src/a.ts', 'src/b.ts', '--staged'], {
        collectDefaultFiles: () => ['.'],
        collectStagedFiles: vi.fn(() => ['src/staged.ts']),
      })
    ).toEqual({
      explicitFiles: ['src/a.ts', 'src/b.ts'],
      files: ['src/a.ts', 'src/b.ts'],
      useStagedFiles: false,
    });
  });

  it('falls back to staged files or default collection when explicit files are absent', () => {
    const collectStagedFiles = vi.fn(() => ['src/staged.ts']);
    const collectDefaultFiles = vi.fn(() => ['src/default.ts']);

    expect(
      resolveExplicitOrStagedFiles(['--staged'], {
        collectDefaultFiles,
        collectStagedFiles,
      })
    ).toEqual({
      explicitFiles: [],
      files: ['src/staged.ts'],
      useStagedFiles: true,
    });
    expect(
      resolveExplicitOrStagedFiles([], {
        collectDefaultFiles,
        collectStagedFiles,
      })
    ).toEqual({
      explicitFiles: [],
      files: ['src/default.ts'],
      useStagedFiles: false,
    });
  });
});
