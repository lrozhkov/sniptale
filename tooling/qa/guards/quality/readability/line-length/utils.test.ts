import { describe, expect, it } from 'vitest';

import { buildLongLine } from './test.helpers';
import { collectLineLengthViolations } from './utils.mjs';

function expectChangedLineViolations() {
  const violations = collectLineLengthViolations(
    'src/example.ts',
    ['const stable = 1;', buildLongLine(121), buildLongLine(130), buildLongLine(125)],
    {
      changedLineNumbers: [2, 4],
    }
  );

  expect(violations).toEqual([
    {
      rule: 'max-line-length',
      file: 'src/example.ts',
      line: 2,
      message: 'has 121 characters on a changed line (limit 120)',
    },
    {
      rule: 'max-line-length',
      file: 'src/example.ts',
      line: 4,
      message: 'has 125 characters on a changed line (limit 120)',
    },
  ]);
}

describe('collectLineLengthViolations changed-line scope', () => {
  it('reports only touched long lines and ignores untouched legacy long lines', () => {
    expectChangedLineViolations();
  });

  it('treats untracked files as fully changed', () => {
    const violations = collectLineLengthViolations(
      'tooling/new-check.ts',
      ['const ok = true;', buildLongLine(124)],
      {
        changedLineNumbers: null,
      }
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: 'tooling/new-check.ts',
      line: 2,
      rule: 'max-line-length',
    });
  });
});

describe('collectLineLengthViolations module specifier policy', () => {
  it('allows module specifiers up to 200 and still checks executable strings at 120', () => {
    const longModulePath = `../../../${'nested-owner/'.repeat(10)}module`;
    const violations = collectLineLengthViolations(
      'tooling/test/support/example.ts',
      [
        `import { example } from '${longModulePath}';`,
        `export { example } from '${longModulePath}';`,
        `const value = '${longModulePath}';`,
      ],
      { changedLineNumbers: null }
    );

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'tooling/test/support/example.ts',
        line: 3,
        rule: 'max-line-length',
      }),
    ]);
  });

  it('reports module specifiers beyond 200', () => {
    const specifier = `../../${'long-owner/'.repeat(20)}module`;
    expect(
      collectLineLengthViolations('tooling/example.ts', [`import value from '${specifier}';`])
    ).toEqual([expect.objectContaining({ message: expect.stringContaining('limit 200') })]);
  });

  it('applies the module-specifier limit to dynamic imports', () => {
    const modulePath = `@sniptale/${'owner/'.repeat(20)}entrypoint`;
    const line = `const owner = await import('${modulePath}');`;
    expect(line.length).toBeGreaterThan(120);
    expect(line.length).toBeLessThanOrEqual(200);
    expect(collectLineLengthViolations('apps/extension/src/example.ts', [line])).toEqual([]);
  });
});

describe('collectLineLengthViolations file policies', () => {
  it('checks changed css lines the same way as code files', () => {
    const violations = collectLineLengthViolations(
      'apps/extension/src/content/components/test-surface.css',
      ['.ok { color: red; }', `${'.very-long-selector'.repeat(8)} { color: red; }`],
      {
        changedLineNumbers: [2],
      }
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: 'apps/extension/src/content/components/test-surface.css',
      line: 2,
      rule: 'max-line-length',
    });
  });

  it('allows classified data carriers up to 1000', () => {
    const violations = collectLineLengthViolations(
      'apps/extension/src/platform/i18n/messages/content/runtime.data.ts',
      [buildLongLine(160)],
      {
        changedLineNumbers: null,
      }
    );

    expect(violations).toEqual([]);
  });

  it('reports classified data carrier lines beyond 1000', () => {
    const violations = collectLineLengthViolations('tooling/test/fixtures/catalog.data.ts', [
      buildLongLine(1001),
    ]);
    expect(violations[0]).toEqual(
      expect.objectContaining({ message: expect.stringContaining('limit 1000') })
    );
  });

  it('allows URL, regex, hash, protocol, and snapshot literals only up to 240', () => {
    const lines = [
      `const url = 'https://example.test/${'x'.repeat(190)}';`,
      `const hash = '${'a'.repeat(250)}'; // sha256 digest`,
    ];
    expect(collectLineLengthViolations('src/example.ts', lines)).toEqual([
      expect.objectContaining({ line: 2, message: expect.stringContaining('limit 240') }),
    ]);
  });
});
