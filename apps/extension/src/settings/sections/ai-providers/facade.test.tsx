import { expect, it } from 'vitest';

import * as canonical from '.';
import * as facade from '.';

it('keeps the ai-providers section root as a thin facade', () => {
  expect(facade.AIProvidersSection).toBe(canonical.AIProvidersSection);
});
