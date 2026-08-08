import { expect, it, vi } from 'vitest';

import type { QuickAction } from '../../../../contracts/settings';

const persistQuickActions = vi.hoisted(() => vi.fn(async () => true));
vi.mock('./crud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crud')>()),
  persistQuickActions,
}));

import { createQuickActionsOrdering } from './ordering';

function action(id: string): QuickAction {
  return {
    afterCapture: 'download_default',
    bundledId: null,
    delay: null,
    exitAfterCapture: false,
    hotkey: null,
    icon: 'Camera',
    id,
    imageFormat: null,
    imageQuality: null,
    name: id,
    origin: 'user',
    screenshotMode: 'visible',
    status: true,
    viewportPresetId: null,
  };
}

it('persists valid insertion intents and ignores invalid item ids', async () => {
  const setActions = vi.fn();
  const ordering = createQuickActionsOrdering({
    actions: [action('one'), action('two')],
    setActions,
  });

  await ordering.handleMoveBefore('one', null);
  expect(persistQuickActions).toHaveBeenCalledWith(
    [expect.objectContaining({ id: 'two' }), expect.objectContaining({ id: 'one' })],
    setActions
  );

  await ordering.handleMoveBefore('missing', null);
  expect(persistQuickActions).toHaveBeenCalledTimes(1);
});
