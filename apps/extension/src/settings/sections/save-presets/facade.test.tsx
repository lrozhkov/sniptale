import { expect, it } from 'vitest';

import * as canonical from '.';
import * as facade from '.';

it('keeps the save-presets section root as a thin facade', () => {
  expect(facade.SavePresetsSection).toBe(canonical.SavePresetsSection);
});
