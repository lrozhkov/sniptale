import { beforeEach, expect, it, vi } from 'vitest';
import { saveWebSnapshotFromPopup } from './';
import type { PopupExportRuntimeDeps, PopupExportRuntimeContract } from '../types';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createState(
  overrides: Partial<PopupExportRuntimeContract> = {}
): PopupExportRuntimeContract {
  return {
    availableTabs: [],
    exportDisabledReason: null,
    isExporting: false,
    progress: { current: 0, errors: [], message: '', phase: 'idle', total: 0 },
    requestIdRef: { current: null },
    selectedTabIds: [],
    selectedTabIdsInOrder: [],
    setProgress: vi.fn(),
    setResult: vi.fn(),
    ...overrides,
  } as PopupExportRuntimeContract;
}

function createDeps(overrides: Partial<PopupExportRuntimeDeps> = {}): PopupExportRuntimeDeps {
  return {
    createRequestId: () => 'req-1',
    getActiveTabId: vi.fn(async () => 7),
    sendSaveWebSnapshotMessage: vi.fn(async () => ({
      assetId: 'snapshot-1',
      success: true,
      warnings: [],
    })),
    ...overrides,
  } as PopupExportRuntimeDeps;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('saves each selected page as a separate snapshot', async () => {
  const state = createState({
    availableTabs: [
      { disabledReason: null, isCurrent: true, tabId: 7, title: 'One', url: 'https://one.test' },
      { disabledReason: null, isCurrent: false, tabId: 9, title: 'Two', url: 'https://two.test' },
    ],
    selectedTabIds: [7, 9],
    selectedTabIdsInOrder: [7, 9],
  } as Partial<PopupExportRuntimeContract>);
  const deps = createDeps({
    sendSaveWebSnapshotMessage: vi
      .fn()
      .mockResolvedValueOnce({ assetId: 'snapshot-1', success: true, warnings: [] })
      .mockResolvedValueOnce({ assetId: 'snapshot-2', success: true, warnings: ['missing'] }),
  });

  await saveWebSnapshotFromPopup(state, deps);

  expect(deps.sendSaveWebSnapshotMessage).toHaveBeenCalledTimes(2);
  expect(deps.sendSaveWebSnapshotMessage).toHaveBeenNthCalledWith(
    1,
    7,
    expect.objectContaining({ requestId: 'req-1' })
  );
  expect(deps.sendSaveWebSnapshotMessage).toHaveBeenNthCalledWith(
    2,
    9,
    expect.objectContaining({ requestId: 'req-1' })
  );
  expect(state.setResult).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'webSnapshot',
      snapshotIds: ['snapshot-1', 'snapshot-2'],
      warnings: ['missing'],
    })
  );
});

it('keeps saved batch snapshots visible when another selected page fails', async () => {
  const state = createState({
    availableTabs: [
      { disabledReason: null, isCurrent: true, tabId: 7, title: 'One', url: 'https://one.test' },
      { disabledReason: null, isCurrent: false, tabId: 9, title: 'Two', url: 'https://two.test' },
    ],
    selectedTabIds: [7, 9],
    selectedTabIdsInOrder: [7, 9],
  } as Partial<PopupExportRuntimeContract>);
  const deps = createDeps({
    sendSaveWebSnapshotMessage: vi
      .fn()
      .mockResolvedValueOnce({ assetId: 'snapshot-1', success: true, warnings: [] })
      .mockRejectedValueOnce(new Error('listener missing')),
  });

  await saveWebSnapshotFromPopup(state, deps);

  expect(state.setResult).toHaveBeenCalledWith(
    expect.objectContaining({
      errors: [],
      filename: 'popup.export.webSnapshotSavedWithWarnings',
      snapshotBatchSize: 2,
      snapshotIds: ['snapshot-1'],
      success: true,
      warnings: ['Two: listener missing'],
    })
  );
});

it('reports a failed batch when none of the selected pages can be saved', async () => {
  const state = createState({
    availableTabs: [
      { disabledReason: null, isCurrent: true, tabId: 7, title: 'One', url: 'https://one.test' },
    ],
    selectedTabIds: [7, 9],
    selectedTabIdsInOrder: [7, 9],
  } as Partial<PopupExportRuntimeContract>);
  const deps = createDeps({
    sendSaveWebSnapshotMessage: vi.fn(async () => ({
      error: 'denied',
      success: false,
      warnings: [],
    })),
  });

  await saveWebSnapshotFromPopup(state, deps);

  expect(state.setResult).toHaveBeenCalledWith(
    expect.objectContaining({
      errors: ['One: denied', 'Tab 9: denied'],
      snapshotIds: [],
      success: false,
    })
  );
  expect(state.setProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }));
});

it('treats batch responses without asset ids as failed snapshot saves', async () => {
  const state = createState({
    availableTabs: [
      { disabledReason: null, isCurrent: true, tabId: 7, title: 'One', url: 'https://one.test' },
    ],
    selectedTabIds: [7, 9],
    selectedTabIdsInOrder: [7, 9],
  } as Partial<PopupExportRuntimeContract>);
  const deps = createDeps({
    sendSaveWebSnapshotMessage: vi.fn(async () => ({ success: true, warnings: [] })),
  });

  await saveWebSnapshotFromPopup(state, deps);

  expect(state.setResult).toHaveBeenCalledWith(
    expect.objectContaining({
      errors: [
        'One: popup.export.webSnapshotMissingAssetId',
        'Tab 9: popup.export.webSnapshotMissingAssetId',
      ],
      snapshotIds: [],
      success: false,
    })
  );
});

it('sends a snapshot request for the active tab', async () => {
  const state = createState();
  const deps = createDeps();

  await saveWebSnapshotFromPopup(state, deps);

  expect(deps.sendSaveWebSnapshotMessage).toHaveBeenCalledWith(7, {
    requestId: 'req-1',
    type: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
  });
  expect(state.setResult).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it('surfaces unavailable state before sending a snapshot request', async () => {
  const state = createState({ exportDisabledReason: 'restricted' });
  const deps = createDeps();

  await saveWebSnapshotFromPopup(state, deps);

  expect(deps.sendSaveWebSnapshotMessage).not.toHaveBeenCalled();
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      errors: ['popup.export.startExportError'],
      phase: 'error',
    })
  );
});

it('does not overwrite request errors that already updated progress', async () => {
  const state = createState();
  vi.mocked(state.setProgress).mockImplementation((nextProgress) => {
    state.progress =
      typeof nextProgress === 'function' ? nextProgress(state.progress) : nextProgress;
  });
  const deps = createDeps({
    sendSaveWebSnapshotMessage: vi.fn(async () => ({
      error: 'denied',
      success: false,
      warnings: [],
    })),
  });

  await saveWebSnapshotFromPopup(state, deps);

  expect(state.setProgress).toHaveBeenCalledTimes(1);
  expect(state.setProgress).toHaveBeenCalledWith(expect.objectContaining({ message: 'denied' }));
});
