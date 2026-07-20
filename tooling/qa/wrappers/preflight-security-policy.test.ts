import { expect, it } from 'vitest';

import { collectPreflightReport } from './preflight.mjs';

it('routes security/dependency policy work to compact guard fixtures and risk-based review', () => {
  const result = collectPreflightReport({
    files: ['tooling/qa/guards/security/verify-dependency-admission.mjs'],
  });

  expect(result.relevantDocs).toContain('docs/security/threat-model.md');
  expect(result.proofHints).toContain(
    'security/dependency policy changes require compact admission and guard fixtures; route review by changed seam'
  );
});
