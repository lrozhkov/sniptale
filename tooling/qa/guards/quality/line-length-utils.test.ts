import { describe, expect, it } from 'vitest';

import { buildLongLine } from '../../core/line-length-utils.test.helpers';
import { collectLineLengthViolations } from './line-length-utils.mjs';

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
  it('ignores unbreakable static module specifiers but still checks executable strings', () => {
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

  it('ignores data-carrier files even when changed lines are long', () => {
    const violations = collectLineLengthViolations(
      'apps/extension/src/platform/i18n/messages/content/runtime.data.ts',
      [buildLongLine(160)],
      {
        changedLineNumbers: null,
      }
    );

    expect(violations).toEqual([]);
  });
});
