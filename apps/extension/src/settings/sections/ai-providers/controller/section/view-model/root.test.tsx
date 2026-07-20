import { expect, it } from 'vitest';

import { useAiProvidersSectionController } from '.';
import { useAiProvidersSectionController as useAiProvidersSectionControllerImpl } from '.';

it('keeps the view-model facade thin', () => {
  expect(useAiProvidersSectionController).toBe(useAiProvidersSectionControllerImpl);
});
