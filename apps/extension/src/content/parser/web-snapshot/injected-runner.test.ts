import { expect, it } from 'vitest';
import { INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY } from '../../../features/web-snapshot/injected-runner-contract';

it('returns a stage-prefixed failure without ambient document/window', async () => {
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY);

  try {
    const { runInjectedWebSnapshotSave } = await import('./injected-runner');
    await expect(
      runInjectedWebSnapshotSave({
        allowAnonymousCrossOriginAssets: false,
        allowAuthenticatedSameOriginAssets: false,
        requestId: 'req-web',
      })
    ).resolves.toEqual({
      error: 'build web snapshot package: Cannot build web snapshot without a document.',
      success: false,
      warnings: [],
    });
  } finally {
    if (originalDocumentDescriptor) {
      Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
    }
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    }
    Reflect.deleteProperty(globalThis, INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY);
  }
});
