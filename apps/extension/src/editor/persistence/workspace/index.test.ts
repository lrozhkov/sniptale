import { beforeEach, expect, it, vi } from 'vitest';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      set: browserStorageLocalSetMock,
    },
  },
}));

import {
  DEFAULT_EDITOR_WORKSPACE_DEFAULTS,
  loadEditorWorkspaceDefaults,
  patchEditorWorkspaceDefaults,
} from './index';

async function flushWorkspaceStorageMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
});

it('loads valid defaults and falls back from malformed storage payloads', async () => {
  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_editor_workspace_defaults: { backgroundColor: '#ABCDEF' },
    })
    .mockResolvedValueOnce({
      sniptale_editor_workspace_defaults: { backgroundColor: 'bad' },
    })
    .mockResolvedValueOnce({
      sniptale_editor_workspace_defaults: 'bad',
    });

  await expect(loadEditorWorkspaceDefaults()).resolves.toEqual({
    backgroundColor: '#abcdef',
    hideSelectionWhileDragging: true,
  });
  await expect(loadEditorWorkspaceDefaults()).resolves.toEqual(DEFAULT_EDITOR_WORKSPACE_DEFAULTS);
  await expect(loadEditorWorkspaceDefaults()).resolves.toEqual(DEFAULT_EDITOR_WORKSPACE_DEFAULTS);
});

it('preserves an explicit visibility choice and rejects malformed values', async () => {
  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_editor_workspace_defaults: {
        backgroundColor: '#ABCDEF',
        hideSelectionWhileDragging: false,
      },
    })
    .mockResolvedValueOnce({
      sniptale_editor_workspace_defaults: {
        backgroundColor: '#ABCDEF',
        hideSelectionWhileDragging: 'false',
      },
    });
  await expect(loadEditorWorkspaceDefaults()).resolves.toMatchObject({
    hideSelectionWhileDragging: false,
  });
  await expect(loadEditorWorkspaceDefaults()).resolves.toMatchObject({
    hideSelectionWhileDragging: true,
  });
});

it('persists patched defaults and rejects failed writes', async () => {
  browserStorageLocalGetMock.mockResolvedValue({
    sniptale_editor_workspace_defaults: { backgroundColor: '#f2f4f7' },
  });

  await expect(patchEditorWorkspaceDefaults({ backgroundColor: '#111111' })).resolves.toEqual({
    backgroundColor: '#111111',
    hideSelectionWhileDragging: true,
  });
  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    sniptale_editor_workspace_defaults: {
      backgroundColor: '#111111',
      hideSelectionWhileDragging: true,
    },
  });

  browserStorageLocalSetMock.mockRejectedValueOnce(new Error('write failed'));

  await expect(patchEditorWorkspaceDefaults({ backgroundColor: '#222222' })).rejects.toThrow(
    'write failed'
  );
});

it('serializes default writes so older updates cannot finish after newer writes', async () => {
  let storedColor = '#f2f4f7';
  const releaseWrites: Array<() => void> = [];
  browserStorageLocalGetMock.mockImplementation(async () => ({
    sniptale_editor_workspace_defaults: { backgroundColor: storedColor },
  }));
  browserStorageLocalSetMock.mockImplementation(
    (items: { sniptale_editor_workspace_defaults: { backgroundColor: string } }) =>
      new Promise<void>((resolve) => {
        releaseWrites.push(() => {
          storedColor = items.sniptale_editor_workspace_defaults.backgroundColor;
          resolve();
        });
      })
  );

  const first = patchEditorWorkspaceDefaults({ backgroundColor: '#111111' });
  const second = patchEditorWorkspaceDefaults({ backgroundColor: '#222222' });
  await flushWorkspaceStorageMicrotasks();

  expect(browserStorageLocalSetMock).toHaveBeenCalledTimes(1);
  releaseWrites.shift()?.();
  await first;
  await flushWorkspaceStorageMicrotasks();

  expect(browserStorageLocalSetMock).toHaveBeenCalledTimes(2);
  releaseWrites.shift()?.();
  await expect(second).resolves.toEqual({
    backgroundColor: '#222222',
    hideSelectionWhileDragging: true,
  });
  expect(storedColor).toBe('#222222');
});
