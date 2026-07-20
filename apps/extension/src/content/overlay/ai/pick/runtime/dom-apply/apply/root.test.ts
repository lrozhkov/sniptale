// @vitest-environment jsdom

import { expect, it } from 'vitest';

import * as canonical from '.';
import * as facade from '.';

it('keeps the dom-apply apply root as a thin facade', () => {
  expect(facade.applyAIChanges).toBe(canonical.applyAIChanges);
});
