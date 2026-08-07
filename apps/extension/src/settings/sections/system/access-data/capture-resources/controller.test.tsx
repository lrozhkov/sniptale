// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const updateSettings = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../runtime/store/useSettingsStore')>()),
  useSettingsStore: () => ({
    settings: {
      anonymousCrossOriginSnapshotAssetsEnabled: false,
      authenticatedSnapshotAssetsEnabled: true,
    },
    updateSettings,
  }),
}));
import { useCaptureResourcesController } from './controller';

it('projects and updates only capture resource settings', async () => {
  let state: ReturnType<typeof useCaptureResourcesController> | null = null;
  function Harness() {
    state = useCaptureResourcesController();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  await act(async () => state?.updateAnonymousCrossOriginSnapshotAssetsEnabled(true));
  expect(updateSettings).toHaveBeenCalledWith({ anonymousCrossOriginSnapshotAssetsEnabled: true });
  act(() => root.unmount());
});
