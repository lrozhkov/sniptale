// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { createController } from './controller';

it('provides inert saved-view actions to Gallery action tests', async () => {
  const { controller } = createController();

  await expect(controller.actions.filters.createSavedView('View')).rejects.toThrow(
    'Not implemented in test controller.'
  );
  await expect(controller.actions.filters.deleteSavedView('view-1')).resolves.toBeUndefined();
  await expect(controller.actions.filters.moveSavedView('view-1', 'up')).resolves.toBeUndefined();
  expect(controller.actions.filters.selectSavedView('view-1')).toBeUndefined();
  await expect(controller.actions.filters.updateSavedView()).rejects.toThrow(
    'Not implemented in test controller.'
  );
});
