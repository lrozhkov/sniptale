import { expect, it } from 'vitest';
import { getTransitionEasingOptions } from './transition-options';

it('retains the two shared timing choices independently of shader style and parameters', () => {
  const options = getTransitionEasingOptions();
  expect(options.map((option) => option.value)).toEqual(['LINEAR', 'EASE_IN_OUT']);
  expect(
    options.every((option) => typeof option.label === 'string' && option.label.length > 0)
  ).toBe(true);
});
