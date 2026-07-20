import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTempRoot, initGitRepo } from '../../core/test-helpers';
import { resolveObservabilityRoot } from './root.mjs';

describe('resolveObservabilityRoot', () => {
  it('accepts only an absolute existing Git top-level from the allowlisted variable', () => {
    const root = createTempRoot('qa-observability-root-');
    initGitRepo(root);

    expect(
      resolveObservabilityRoot({
        cwd: root,
        environment: { SNIPTALE_QA_OBSERVABILITY_ROOT: root },
      })
    ).toBe(root);
    expect(() =>
      resolveObservabilityRoot({
        cwd: root,
        environment: { SNIPTALE_QA_OBSERVABILITY_ROOT: 'relative/path' },
      })
    ).toThrow(/absolute Git worktree root/u);
    expect(() =>
      resolveObservabilityRoot({
        cwd: root,
        environment: { SNIPTALE_QA_OBSERVABILITY_ROOT: path.dirname(root) },
      })
    ).toThrow(/existing Git worktree root/u);
  });
});
