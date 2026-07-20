import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));
vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import {
  loadEditorDocumentActionsDisclosureState,
  saveEditorDocumentActionsDisclosureState,
} from './document-disclosure';

beforeEach(() => vi.clearAllMocks());

it('owns editor disclosure preference reads and writes', async () => {
  getMock.mockResolvedValue({ disclosure: true });
  setMock.mockResolvedValue(undefined);

  await expect(loadEditorDocumentActionsDisclosureState('disclosure')).resolves.toBe(true);
  await expect(
    saveEditorDocumentActionsDisclosureState('disclosure', false)
  ).resolves.toBeUndefined();
  expect(setMock).toHaveBeenCalledWith({ disclosure: false });
});
