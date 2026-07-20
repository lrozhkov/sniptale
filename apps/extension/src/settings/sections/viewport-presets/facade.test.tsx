import { expect, it } from 'vitest';

import * as canonical from '.';
import * as facade from '.';

it('keeps the presets section root as a thin facade', () => {
  expect(facade.PresetsSection).toBe(canonical.PresetsSection);
});
