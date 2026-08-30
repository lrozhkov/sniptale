import { expect, it, vi } from 'vitest';

import { resolveAstGrepAuditResult } from './steps.mjs';
import { runUnifiedAstGrepReceipt } from '../../../audits/ast-grep/unified-ast-grep.mjs';

it('projects the product syntax receipt into audit without a duplicate scan', () => {
  const receipt = runUnifiedAstGrepReceipt({
    files: ['apps/extension/src/example.ts'],
    runner: () => ({ files: ['apps/extension/src/example.ts'], skipped: false, violations: [] }),
  });
  const scanner = vi.fn();

  expect(resolveAstGrepAuditResult({ scanner })).toBe(receipt);
  expect(scanner).not.toHaveBeenCalled();
});

it('runs the canonical scanner when audit has no preceding product receipt', () => {
  const scanner = vi.fn(() => ({ files: [], skipped: false, violations: [] }));
  expect(resolveAstGrepAuditResult({ scanner })).toMatchObject({ skipped: false });
  expect(scanner).toHaveBeenCalledOnce();
});
