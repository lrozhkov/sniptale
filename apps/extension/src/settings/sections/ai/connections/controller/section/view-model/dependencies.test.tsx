import { expect, it } from 'vitest';

import { useAiProvidersSectionControllerDependencies } from './dependencies';
import * as dependenciesController from './dependencies';

it('keeps the dependencies facade thin', () => {
  expect(useAiProvidersSectionControllerDependencies).toBe(
    dependenciesController.useAiProvidersSectionControllerDependencies
  );
});
