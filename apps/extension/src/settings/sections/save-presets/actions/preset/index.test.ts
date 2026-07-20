import { expect, it } from 'vitest';

import * as rootExports from '.';
import * as folderExports from '.';

it('re-exports the preset action helpers from the owner folder', () => {
  expect(rootExports.createConfirmDeletePresetAction).toBe(
    folderExports.createConfirmDeletePresetAction
  );
  expect(rootExports.createDeletePresetGuard).toBe(folderExports.createDeletePresetGuard);
  expect(rootExports.createDropPresetAction).toBe(folderExports.createDropPresetAction);
  expect(rootExports.createSavePresetAction).toBe(folderExports.createSavePresetAction);
  expect(rootExports.createTogglePresetEnabledAction).toBe(
    folderExports.createTogglePresetEnabledAction
  );
});
