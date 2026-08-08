import { expect, it, vi } from 'vitest';
import type { QuickAction } from '../../../../../contracts/settings';
import { toggleQuickActionStatus } from './ordering';

function createQuickAction(id: string): QuickAction {
  return {
    afterCapture: 'download_default',
    bundledId: null,
    delay: null,
    viewportPresetId: 'native',
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
  };
}

it('toggles status through the canonical persistence callback', async () => {
  const onPersist = vi.fn().mockResolvedValue(undefined);
  const actions = [createQuickAction('one'), createQuickAction('two')];

  await toggleQuickActionStatus(actions, 'one', onPersist);

  expect(onPersist).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'one', status: false }),
    expect.objectContaining({ id: 'two', status: true }),
  ]);
});
