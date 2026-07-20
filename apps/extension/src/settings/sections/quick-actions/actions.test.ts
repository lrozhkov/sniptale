import { expect, it, vi } from 'vitest';

const ownerMocks = vi.hoisted(() => ({
  beginEditQuickActionMock: vi.fn(),
  beginNewQuickActionMock: vi.fn(),
  deleteQuickActionMock: vi.fn(),
  loadQuickActionsStateMock: vi.fn(),
  persistDisplayModeMock: vi.fn(),
  persistQuickActionsMock: vi.fn(),
  reorderAndSaveQuickActionsMock: vi.fn(),
  saveEditedQuickActionMock: vi.fn(),
  toggleQuickActionStatusMock: vi.fn(),
  updateQuickActionFieldMock: vi.fn(),
}));

vi.mock('./crud', async (importOriginal) => ({
  ...(await importOriginal()),
  beginEditQuickAction: ownerMocks.beginEditQuickActionMock,
  beginNewQuickAction: ownerMocks.beginNewQuickActionMock,
  deleteQuickAction: ownerMocks.deleteQuickActionMock,
  persistQuickActions: ownerMocks.persistQuickActionsMock,
  reorderAndSaveQuickActions: ownerMocks.reorderAndSaveQuickActionsMock,
  saveEditedQuickAction: ownerMocks.saveEditedQuickActionMock,
  toggleQuickActionStatus: ownerMocks.toggleQuickActionStatusMock,
  updateQuickActionField: ownerMocks.updateQuickActionFieldMock,
}));

vi.mock('./loader', async (importOriginal) => ({
  ...(await importOriginal()),
  loadQuickActionsState: ownerMocks.loadQuickActionsStateMock,
}));

vi.mock('./display-mode', async (importOriginal) => ({
  ...(await importOriginal()),
  persistDisplayMode: ownerMocks.persistDisplayModeMock,
}));

import {
  beginEditQuickAction,
  beginNewQuickAction,
  deleteQuickAction,
  loadQuickActionsState,
  persistDisplayMode,
  persistQuickActions,
  reorderAndSaveQuickActions,
  saveEditedQuickAction,
  toggleQuickActionStatus,
  updateQuickActionField,
} from './actions';

it('re-exports the quick-actions controller actions from owner-local modules', () => {
  expect(beginEditQuickAction).toBe(ownerMocks.beginEditQuickActionMock);
  expect(beginNewQuickAction).toBe(ownerMocks.beginNewQuickActionMock);
  expect(deleteQuickAction).toBe(ownerMocks.deleteQuickActionMock);
  expect(loadQuickActionsState).toBe(ownerMocks.loadQuickActionsStateMock);
  expect(persistDisplayMode).toBe(ownerMocks.persistDisplayModeMock);
  expect(persistQuickActions).toBe(ownerMocks.persistQuickActionsMock);
  expect(reorderAndSaveQuickActions).toBe(ownerMocks.reorderAndSaveQuickActionsMock);
  expect(saveEditedQuickAction).toBe(ownerMocks.saveEditedQuickActionMock);
  expect(toggleQuickActionStatus).toBe(ownerMocks.toggleQuickActionStatusMock);
  expect(updateQuickActionField).toBe(ownerMocks.updateQuickActionFieldMock);
});
