import { expect, it } from 'vitest';

import { validateDependencyLegalClosureSync } from './dependency-legal-validation-adapter.mjs';

it('reads the installed dependency legal closure through file-backed process output', () => {
  expect(validateDependencyLegalClosureSync()).toEqual([]);
});
