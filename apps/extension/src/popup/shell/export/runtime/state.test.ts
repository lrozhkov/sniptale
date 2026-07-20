import { expect, it } from 'vitest';

import { createPopupExportControllerFixture } from '../pages/controller.test-support';
import { createPopupExportRuntimeState } from './state';

it('flattens grouped popup export state for the runtime adapter boundary', () => {
  const controller = createPopupExportControllerFixture({
    preferences: {
      includeJson: false,
      includeMarkdown: true,
    },
    session: {
      copiedFormat: 'markdown',
      progress: {
        activeStepKey: 'markdown',
        current: 1,
        errors: [],
        message: 'Copying markdown',
        phase: 'downloading',
        total: 2,
      },
      result: null,
    },
  });

  const runtimeState = createPopupExportRuntimeState(controller.state);

  expect(runtimeState).toEqual(
    expect.objectContaining({
      copiedFormat: 'markdown',
      includeJson: false,
      includeMarkdown: true,
      progress: expect.objectContaining({ activeStepKey: 'markdown' }),
      result: null,
      selectedCount: 1,
    })
  );
  expect(runtimeState).not.toHaveProperty('copy');
  expect(runtimeState).not.toHaveProperty('transfer');
  expect(runtimeState).not.toHaveProperty('values');
});
