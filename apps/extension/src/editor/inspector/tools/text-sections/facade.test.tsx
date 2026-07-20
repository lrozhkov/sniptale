import { expect, it } from 'vitest';

import * as textSections from '.';

it('exports the canonical text-sections owner surface', () => {
  expect(textSections.renderTextControlsSection).toBeTypeOf('function');
});
